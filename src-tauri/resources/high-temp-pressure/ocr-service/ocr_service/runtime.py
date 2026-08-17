from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from datetime import UTC, datetime
from typing import Any

import numpy as np

from .capture.base import FrameSource
from .config import Rect, RegionConfig, ServiceConfig
from .domain import CycleRecord, FieldResult, Frame, ReadingStatus, SourceState
from .incidents import IncidentStore
from .metrics import ServiceMetrics
from .ocr.base import OcrEngine
from .storage import OcrRepository
from .validation import BusinessValidator, ConsensusResult, build_consensus
from .vision.geometry import GeometryError, ScreenGeometry
from .vision.locator import AnchorLocator
from .vision.preprocess import prepare_ocr_image
from .vision.stability import find_final_stable_streak

logger = logging.getLogger(__name__)


class OcrServiceRuntime:
    def __init__(
        self,
        *,
        config: ServiceConfig,
        source: FrameSource,
        engine: OcrEngine,
        repository: OcrRepository,
        realtime_engine: OcrEngine | None = None,
        incidents: IncidentStore | None = None,
        metrics: ServiceMetrics | None = None,
    ) -> None:
        self.config = config
        self.source = source
        self.engine = engine
        self.realtime_engine = realtime_engine
        self.repository = repository
        self.incidents = incidents or IncidentStore(config.storage)
        self.metrics = metrics or ServiceMetrics()
        self.validator = BusinessValidator()
        self.realtime_validator = BusinessValidator()
        self.locator = AnchorLocator(config.screen.anchor)
        self._regions = {
            region.id: region for region in config.regions if region.enabled
        }
        self._realtime_regions = {
            field_id: self._regions[field_id]
            for field_id in config.sampling.realtime_regions
        }
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._realtime_thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._started = False
        self._database_ready = False
        self._model_error: str | None = None
        self._runtime_error: str | None = None
        self._last_cycle: dict[str, Any] | None = None
        self._last_realtime_cycle: dict[str, Any] | None = None
        self._realtime_series: dict[str, deque[dict[str, Any]]] = {
            field_id: deque(maxlen=config.sampling.realtime_history_points)
            for field_id in self._realtime_regions
        }
        self._review_frame: np.ndarray | None = None
        self._review_cycle_id: str | None = None
        self._review_offset = (0, 0)
        self._review_results: list[dict[str, Any]] = []
        self._review_truth: dict[str, str] | None = None
        self._last_screen_valid = False
        self._last_screen_score: float | None = None
        self._cleanup_at = time.monotonic()

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            self._started = True
        try:
            self.repository.initialize()
            self._database_ready = self.repository.writable()
            for state in self.repository.restore_latest():
                self.validator.restore(
                    state["field_id"],
                    state["text"],
                    state["value"],
                    state["captured_at"],
                )
                self.realtime_validator.restore(
                    state["field_id"],
                    state["text"],
                    state["value"],
                    state["captured_at"],
                )
        except Exception as exc:
            self._database_ready = False
            self._runtime_error = f"database initialization failed: {exc}"
            logger.exception("database initialization failed")

        try:
            self.engine.load()
            self._model_error = None
        except Exception as exc:
            self._model_error = str(exc)
            logger.exception("OCR model initialization failed")

        if self.realtime_engine is not None:
            try:
                self.realtime_engine.load()
            except Exception as exc:
                self._runtime_error = f"realtime OCR model initialization failed: {exc}"
                logger.exception("realtime OCR model initialization failed")

        try:
            self.source.start()
        except Exception as exc:
            self._runtime_error = f"capture source failed to start: {exc}"
            logger.exception("capture source failed to start")

        self._stop.clear()
        self._thread = threading.Thread(
            target=self._scheduler_loop, name="ocr-scheduler", daemon=True
        )
        self._thread.start()
        if self.realtime_engine is not None and self._realtime_regions:
            self._realtime_thread = threading.Thread(
                target=self._realtime_scheduler_loop,
                name="ocr-realtime-scheduler",
                daemon=True,
            )
            self._realtime_thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        if self._realtime_thread:
            self._realtime_thread.join(timeout=10)
        self.source.stop()
        with self._lock:
            self._started = False

    def _scheduler_loop(self) -> None:
        interval = self.config.sampling.interval_seconds
        next_deadline = time.monotonic()
        while not self._stop.is_set():
            if self._stop.wait(max(0.0, next_deadline - time.monotonic())):
                break
            scheduled_at = datetime.now(UTC)
            try:
                self.run_cycle(scheduled_at)
            except Exception as exc:
                self._runtime_error = str(exc)
                logger.exception("unhandled OCR cycle failure")

            next_deadline += interval
            now = time.monotonic()
            if now > next_deadline:
                missed = int((now - next_deadline) // interval) + 1
                next_deadline += missed * interval
                self.metrics.skipped_cycles.inc(missed)

            if now - self._cleanup_at >= 3600:
                try:
                    removed = self.repository.cleanup(
                        self.config.storage.retention_hours
                    )
                    logger.info("expired OCR cycles removed", extra={"count": removed})
                except Exception:
                    logger.exception("OCR retention cleanup failed")
                self._cleanup_at = now

    def _collect_burst(self) -> list[Frame]:
        sampling = self.config.sampling
        return self._collect_frame_window(
            sampling.burst_milliseconds,
            sampling.maximum_frames,
        )

    def _collect_frame_window(
        self, burst_milliseconds: int, maximum_frames: int
    ) -> list[Frame]:
        sampling = self.config.sampling
        deadline = time.monotonic() + burst_milliseconds / 1000.0
        frames: list[Frame] = []
        current = self.source.buffer.latest(sampling.maximum_frame_age_seconds)
        if current is not None:
            frames.append(current)
            sequence = current.sequence
        else:
            sequence = -1

        while len(frames) < maximum_frames:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            frame = self.source.buffer.wait_after(sequence, remaining)
            if frame is None:
                break
            sequence = frame.sequence
            frames.append(frame)
        return frames

    def _realtime_scheduler_loop(self) -> None:
        interval = self.config.sampling.realtime_interval_seconds
        next_deadline = time.monotonic()
        while not self._stop.is_set():
            if self._stop.wait(max(0.0, next_deadline - time.monotonic())):
                break
            try:
                self._run_realtime_cycle()
            except Exception as exc:
                self._runtime_error = f"realtime OCR cycle failed: {exc}"
                logger.exception("realtime OCR cycle failed")
            next_deadline += interval
            now = time.monotonic()
            if now > next_deadline:
                missed = int((now - next_deadline) // interval) + 1
                next_deadline += missed * interval

    def _run_realtime_cycle(self) -> None:
        assert self.realtime_engine is not None
        sampling = self.config.sampling
        cycle_id = f"rt-{uuid.uuid4().hex}"
        started_at = datetime.now(UTC)
        started_mono = time.monotonic()
        frames = self._collect_frame_window(
            sampling.realtime_window_milliseconds,
            sampling.realtime_maximum_frames,
        )
        results: list[FieldResult] = []
        screen_score: float | None = None

        if not frames:
            results = [
                FieldResult(
                    cycle_id=cycle_id,
                    field_id=region.id,
                    status=ReadingStatus.CAPTURE_STALE,
                    captured_at=started_at,
                    reason="no fresh capture frame was available",
                )
                for region in self._realtime_regions.values()
            ]
            self._persist_realtime_cycle(
                cycle_id, started_at, started_mono, frames, results, None
            )
            return

        latest = frames[-1]
        try:
            geometry = ScreenGeometry(
                self.config.screen,
                frame_width=latest.image.shape[1],
                frame_height=latest.image.shape[0],
            )
            location = self.locator.locate(latest.image, geometry)
            screen_score = location.score
            if not location.valid:
                raise GeometryError(location.reason or "screen anchor did not match")
        except (GeometryError, ValueError) as exc:
            results = [
                FieldResult(
                    cycle_id=cycle_id,
                    field_id=region.id,
                    status=ReadingStatus.SCREEN_MISMATCH,
                    captured_at=latest.captured_at,
                    reason=str(exc),
                )
                for region in self._realtime_regions.values()
            ]
            self._persist_realtime_cycle(
                cycle_id, started_at, started_mono, frames, results, screen_score
            )
            return

        stable_images: dict[str, list[np.ndarray]] = {}
        result_by_field: dict[str, FieldResult] = {}
        for region in self._realtime_regions.values():
            mapped = geometry.map_rect(
                self._expanded_region_rect(region),
                location.offset_x,
                location.offset_y,
            )
            crops = [
                np.ascontiguousarray(geometry.crop(frame.image, mapped))
                for frame in frames
            ]
            stability = find_final_stable_streak(
                crops,
                streak_length=sampling.realtime_stable_streak,
                pixel_delta=region.pixel_delta or sampling.pixel_delta,
                maximum_changed_ratio=region.changed_pixel_ratio
                if region.changed_pixel_ratio is not None
                else sampling.changed_pixel_ratio,
            )
            if not stability.stable:
                result_by_field[region.id] = FieldResult(
                    cycle_id=cycle_id,
                    field_id=region.id,
                    status=ReadingStatus.UNSTABLE,
                    captured_at=latest.captured_at,
                    change_score=stability.maximum_change_ratio,
                    reason="no stable streak in realtime sampling window",
                )
                continue
            stable_images[region.id] = stability.images[-3:]

        inference_images: list[np.ndarray] = []
        inference_keys: list[str] = []
        for field_id, images in stable_images.items():
            for image in images:
                inference_images.append(
                    prepare_ocr_image(
                        image,
                        target_height=self.config.ocr.target_height,
                        padding=self.config.ocr.padding,
                    )
                )
                inference_keys.append(field_id)

        predictions_by_field: dict[str, list[Any]] = {
            field_id: [] for field_id in stable_images
        }
        try:
            predictions = self.realtime_engine.recognize(inference_images)
            for field_id, prediction in zip(inference_keys, predictions, strict=True):
                predictions_by_field[field_id].append(prediction)
        except Exception as exc:
            for field_id in stable_images:
                result_by_field[field_id] = FieldResult(
                    cycle_id=cycle_id,
                    field_id=field_id,
                    status=ReadingStatus.INFERENCE_ERROR,
                    captured_at=latest.captured_at,
                    reason=str(exc),
                )

        for field_id, predictions in predictions_by_field.items():
            if field_id in result_by_field:
                continue
            region = self._realtime_regions[field_id]
            consensus = build_consensus(predictions, region, self.config.ocr)
            validated = self.realtime_validator.validate(
                region, consensus, latest.captured_at
            )
            result_by_field[field_id] = self._field_result_from_consensus(
                cycle_id,
                region,
                validated,
                latest.captured_at,
                latest.source_timestamp_ms,
            )

        results = [result_by_field[field_id] for field_id in self._realtime_regions]
        self._persist_realtime_cycle(
            cycle_id, started_at, started_mono, frames, results, screen_score
        )

    def _persist_realtime_cycle(
        self,
        cycle_id: str,
        started_at: datetime,
        started_mono: float,
        frames: list[Frame],
        results: list[FieldResult],
        screen_score: float | None,
    ) -> None:
        completed_at = datetime.now(UTC)
        duration_ms = (time.monotonic() - started_mono) * 1000.0
        cycle = CycleRecord(
            id=cycle_id,
            scheduled_at=started_at,
            started_at=started_at,
            completed_at=completed_at,
            status="realtime_completed",
            frame_count=len(frames),
            duration_ms=duration_ms,
            screen_score=screen_score,
        )
        try:
            self.repository.persist_cycle(cycle, results)
            self._database_ready = True
        except Exception as exc:
            self._database_ready = False
            self._runtime_error = f"failed to persist realtime OCR cycle: {exc}"
            logger.exception("failed to persist realtime OCR cycle")

        with self._lock:
            for result in results:
                self._realtime_series[result.field_id].append(
                    {
                        "cycle_id": cycle_id,
                        "captured_at": result.captured_at.isoformat(),
                        "status": result.status.value,
                        "text": result.accepted_text,
                        "value": float(result.numeric_value)
                        if result.numeric_value is not None
                        else None,
                        "candidate_text": result.candidate_text,
                        "confidence": result.confidence,
                    }
                )
            self._last_realtime_cycle = {
                "id": cycle_id,
                "completed_at": completed_at.isoformat(),
                "duration_ms": duration_ms,
                "accepted": sum(
                    result.status is ReadingStatus.ACCEPTED for result in results
                ),
                "total": len(results),
            }

    def run_cycle(self, scheduled_at: datetime | None = None) -> list[FieldResult]:
        cycle_id = uuid.uuid4().hex
        scheduled_at = scheduled_at or datetime.now(UTC)
        started_at = datetime.now(UTC)
        started_mono = time.monotonic()
        frames = self._collect_burst()
        if not frames:
            self._last_screen_valid = False
            results = self._make_results(
                cycle_id,
                ReadingStatus.CAPTURE_STALE,
                started_at,
                "no fresh capture frame was available",
            )
            self._complete_cycle(
                cycle_id,
                scheduled_at,
                started_at,
                started_mono,
                "capture_stale",
                frames,
                results,
                None,
                None,
                None,
                (0, 0),
                None,
            )
            return results

        latest = frames[-1]
        location_score: float | None = None
        try:
            geometry = ScreenGeometry(
                self.config.screen,
                frame_width=latest.image.shape[1],
                frame_height=latest.image.shape[0],
            )
            location = self.locator.locate(latest.image, geometry)
            location_score = location.score
            if not location.valid:
                raise GeometryError(location.reason or "screen anchor did not match")
        except (GeometryError, ValueError) as exc:
            self._last_screen_valid = False
            score = location_score
            self._last_screen_score = score
            results = self._make_results(
                cycle_id,
                ReadingStatus.SCREEN_MISMATCH,
                latest.captured_at,
                str(exc),
                latest.source_timestamp_ms,
            )
            if results:
                results[0].incident_path = self.incidents.save(
                    field_id="_screen",
                    status=ReadingStatus.SCREEN_MISMATCH,
                    cycle_id=cycle_id,
                    image=latest.image,
                )
            self._complete_cycle(
                cycle_id,
                scheduled_at,
                started_at,
                started_mono,
                "screen_mismatch",
                frames,
                results,
                score,
                str(exc),
                latest.image,
                (0, 0),
                latest.ground_truth,
            )
            return results

        self._last_screen_valid = True
        self._last_screen_score = location.score
        if location.score is not None:
            self.metrics.screen_score.set(location.score)

        stable_by_field: dict[str, list[np.ndarray]] = {}
        raw_latest: dict[str, np.ndarray] = {}
        results_by_field: dict[str, FieldResult] = {}
        for region in self._regions.values():
            try:
                canonical_rect = self._expanded_region_rect(region)
                mapped = geometry.map_rect(
                    canonical_rect, location.offset_x, location.offset_y
                )
                crops = [
                    np.ascontiguousarray(geometry.crop(frame.image, mapped))
                    for frame in frames
                ]
                raw_latest[region.id] = crops[-1]
                stability = find_final_stable_streak(
                    crops,
                    streak_length=self.config.sampling.stable_streak,
                    pixel_delta=region.pixel_delta or self.config.sampling.pixel_delta,
                    maximum_changed_ratio=region.changed_pixel_ratio
                    if region.changed_pixel_ratio is not None
                    else self.config.sampling.changed_pixel_ratio,
                )
            except (GeometryError, ValueError) as exc:
                results_by_field[region.id] = FieldResult(
                    cycle_id=cycle_id,
                    field_id=region.id,
                    status=ReadingStatus.SCREEN_MISMATCH,
                    captured_at=latest.captured_at,
                    reason=str(exc),
                    source_timestamp_ms=latest.source_timestamp_ms,
                )
                continue
            if not stability.stable:
                result = FieldResult(
                    cycle_id=cycle_id,
                    field_id=region.id,
                    status=ReadingStatus.UNSTABLE,
                    captured_at=latest.captured_at,
                    change_score=stability.maximum_change_ratio,
                    reason="no stable streak at the end of the sampling window",
                    source_timestamp_ms=latest.source_timestamp_ms,
                )
                result.incident_path = self.incidents.save(
                    field_id=region.id,
                    status=result.status,
                    cycle_id=cycle_id,
                    image=crops[-1],
                )
                results_by_field[region.id] = result
                continue
            # A longer stability streak should not multiply inference work.
            stable_by_field[region.id] = stability.images[-3:]

        inference_images: list[np.ndarray] = []
        inference_keys: list[tuple[str, int]] = []
        for field_id, images in stable_by_field.items():
            for index, image in enumerate(images):
                inference_images.append(
                    prepare_ocr_image(
                        image,
                        target_height=self.config.ocr.target_height,
                        padding=self.config.ocr.padding,
                    )
                )
                inference_keys.append((field_id, index))

        predictions_by_field: dict[str, list[Any]] = {
            field_id: [] for field_id in stable_by_field
        }
        if inference_images:
            if not self.engine.ready:
                error = (
                    self.engine.error or self._model_error or "OCR model is unavailable"
                )
                for field_id in stable_by_field:
                    results_by_field[field_id] = FieldResult(
                        cycle_id=cycle_id,
                        field_id=field_id,
                        status=ReadingStatus.INFERENCE_ERROR,
                        captured_at=latest.captured_at,
                        reason=error,
                        source_timestamp_ms=latest.source_timestamp_ms,
                    )
            else:
                try:
                    predictions = self.engine.recognize(inference_images)
                    for key, prediction in zip(
                        inference_keys, predictions, strict=True
                    ):
                        predictions_by_field[key[0]].append(prediction)
                except Exception as exc:
                    self._model_error = str(exc)
                    logger.exception("OCR batch inference failed")
                    for field_id in stable_by_field:
                        results_by_field[field_id] = FieldResult(
                            cycle_id=cycle_id,
                            field_id=field_id,
                            status=ReadingStatus.INFERENCE_ERROR,
                            captured_at=latest.captured_at,
                            reason=str(exc),
                            source_timestamp_ms=latest.source_timestamp_ms,
                        )

        for field_id, predictions in predictions_by_field.items():
            if field_id in results_by_field:
                continue
            region = self._regions[field_id]
            consensus = build_consensus(predictions, region, self.config.ocr)
            validated = self.validator.validate(region, consensus, latest.captured_at)
            result = self._field_result_from_consensus(
                cycle_id,
                region,
                validated,
                latest.captured_at,
                latest.source_timestamp_ms,
            )
            if result.status is not ReadingStatus.ACCEPTED:
                result.incident_path = self.incidents.save(
                    field_id=field_id,
                    status=result.status,
                    cycle_id=cycle_id,
                    image=raw_latest[field_id],
                )
            results_by_field[field_id] = result

        results = [results_by_field[field_id] for field_id in self._regions]
        cycle_status = (
            "inference_error"
            if results
            and all(
                result.status is ReadingStatus.INFERENCE_ERROR for result in results
            )
            else "completed"
        )
        self._complete_cycle(
            cycle_id,
            scheduled_at,
            started_at,
            started_mono,
            cycle_status,
            frames,
            results,
            location.score,
            None,
            latest.image,
            (location.offset_x, location.offset_y),
            latest.ground_truth,
        )
        return results

    def _expanded_region_rect(self, region: RegionConfig) -> Rect:
        margin = region.crop_margin
        if margin == 0:
            return region.rect
        x = max(0, region.rect.x - margin)
        y = max(0, region.rect.y - margin)
        right = min(
            self.config.screen.canonical_width,
            region.rect.x + region.rect.width + margin,
        )
        bottom = min(
            self.config.screen.canonical_height,
            region.rect.y + region.rect.height + margin,
        )
        return Rect(x=x, y=y, width=right - x, height=bottom - y)

    def _field_result_from_consensus(
        self,
        cycle_id: str,
        region: RegionConfig,
        consensus: ConsensusResult,
        captured_at: datetime,
        source_timestamp_ms: float | None,
    ) -> FieldResult:
        accepted = consensus.status is ReadingStatus.ACCEPTED
        return FieldResult(
            cycle_id=cycle_id,
            field_id=region.id,
            status=consensus.status,
            captured_at=captured_at,
            accepted_text=consensus.text if accepted else None,
            numeric_value=consensus.value if accepted else None,
            candidate_text=consensus.text,
            confidence=consensus.confidence,
            reason=consensus.reason,
            source_timestamp_ms=source_timestamp_ms,
        )

    def _make_results(
        self,
        cycle_id: str,
        status: ReadingStatus,
        captured_at: datetime,
        reason: str,
        source_timestamp_ms: float | None = None,
    ) -> list[FieldResult]:
        return [
            FieldResult(
                cycle_id=cycle_id,
                field_id=region.id,
                status=status,
                captured_at=captured_at,
                reason=reason,
                source_timestamp_ms=source_timestamp_ms,
            )
            for region in self._regions.values()
        ]

    def _complete_cycle(
        self,
        cycle_id: str,
        scheduled_at: datetime,
        started_at: datetime,
        started_mono: float,
        status: str,
        frames: list[Frame],
        results: list[FieldResult],
        screen_score: float | None,
        error: str | None,
        review_frame: np.ndarray | None,
        review_offset: tuple[int, int],
        review_truth: dict[str, str] | None,
    ) -> None:
        completed_at = datetime.now(UTC)
        duration = time.monotonic() - started_mono
        cycle = CycleRecord(
            id=cycle_id,
            scheduled_at=scheduled_at,
            started_at=started_at,
            completed_at=completed_at,
            status=status,
            frame_count=len(frames),
            duration_ms=duration * 1000.0,
            screen_score=screen_score,
            error=error,
        )
        try:
            self.repository.persist_cycle(cycle, results)
            self._database_ready = True
        except Exception as exc:
            self._database_ready = False
            self._runtime_error = f"failed to persist OCR cycle: {exc}"
            logger.exception("failed to persist OCR cycle")
        self.metrics.cycles.labels(status=status).inc()
        self.metrics.cycle_duration.observe(duration)
        for result in results:
            self.metrics.readings.labels(status=result.status.value).inc()
        with self._lock:
            self._last_cycle = {
                "id": cycle_id,
                "status": status,
                "scheduled_at": scheduled_at.isoformat(),
                "started_at": started_at.isoformat(),
                "completed_at": completed_at.isoformat(),
                "duration_ms": duration * 1000.0,
                "frame_count": len(frames),
                "screen_score": screen_score,
                "accepted": sum(
                    result.status is ReadingStatus.ACCEPTED for result in results
                ),
                "total": len(results),
            }
            self._review_frame = (
                review_frame.copy() if review_frame is not None else None
            )
            self._review_cycle_id = cycle_id
            self._review_offset = review_offset
            self._review_results = [self._review_record(result) for result in results]
            self._review_truth = (
                dict(review_truth) if review_truth is not None else None
            )

    @staticmethod
    def _review_record(result: FieldResult) -> dict[str, Any]:
        return {
            "cycle_id": result.cycle_id,
            "field_id": result.field_id,
            "status": result.status.value,
            "captured_at": result.captured_at.isoformat(),
            "accepted_text": result.accepted_text,
            "numeric_value": str(result.numeric_value)
            if result.numeric_value is not None
            else None,
            "candidate_text": result.candidate_text,
            "confidence": result.confidence,
            "change_score": result.change_score,
            "reason": result.reason,
        }

    def review_snapshot(self) -> dict[str, Any] | None:
        with self._lock:
            if self._review_frame is None or self._review_cycle_id is None:
                return None
            return {
                "cycle_id": self._review_cycle_id,
                "image": self._review_frame.copy(),
                "offset_x": self._review_offset[0],
                "offset_y": self._review_offset[1],
                "results": [dict(result) for result in self._review_results],
                "ground_truth": dict(self._review_truth)
                if self._review_truth is not None
                else None,
                "cycle": dict(self._last_cycle)
                if self._last_cycle is not None
                else None,
            }

    def readiness(self) -> tuple[bool, dict[str, Any]]:
        latest = self.source.buffer.latest()
        frame_age = (
            time.monotonic() - latest.monotonic_seconds if latest is not None else None
        )
        if frame_age is not None:
            self.metrics.frame_age.set(frame_age)
        source = self.source.snapshot()
        self.metrics.capture_fps.set(source.measured_fps)
        checks = {
            "database": self._database_ready,
            "model": self.engine.ready,
            "realtime_model": self.realtime_engine is None
            or self.realtime_engine.ready,
            "capture": latest is not None
            and frame_age is not None
            and frame_age <= self.config.sampling.maximum_frame_age_seconds
            and source.state is SourceState.RUNNING,
            "screen": self._last_screen_valid,
        }
        return all(checks.values()), {
            "checks": checks,
            "frame_age_seconds": frame_age,
            "model_error": self.engine.error or self._model_error,
            "runtime_error": self._runtime_error,
        }

    def status(self) -> dict[str, Any]:
        source = self.source.snapshot()
        ready, readiness = self.readiness()
        with self._lock:
            last_cycle = dict(self._last_cycle) if self._last_cycle else None
            last_realtime_cycle = (
                dict(self._last_realtime_cycle) if self._last_realtime_cycle else None
            )
        return {
            "started": self._started,
            "ready": ready,
            "readiness": readiness,
            "source": {
                "state": source.state.value,
                "sequence": source.sequence,
                "frame_width": source.frame_width,
                "frame_height": source.frame_height,
                "measured_fps": source.measured_fps,
                "last_frame_at": source.last_frame_at.isoformat()
                if source.last_frame_at
                else None,
                "last_error": source.last_error,
                "reconnect_count": source.reconnect_count,
            },
            "model": {
                "name": self.config.ocr.model_name,
                "engine": self.config.ocr.engine,
                "device": self.config.ocr.device,
                "ready": self.engine.ready,
                "error": self.engine.error or self._model_error,
            },
            "last_cycle": last_cycle,
            "realtime": {
                "interval_seconds": self.config.sampling.realtime_interval_seconds,
                "regions": list(self._realtime_regions),
                "last_cycle": last_realtime_cycle,
            },
            "database": self.repository.counts() if self._database_ready else None,
        }

    def realtime_series(self) -> dict[str, Any]:
        with self._lock:
            fields = [
                {
                    "field_id": field_id,
                    "label": self._realtime_regions[field_id].label,
                    "points": [dict(point) for point in points],
                }
                for field_id, points in self._realtime_series.items()
            ]
            last_cycle = (
                dict(self._last_realtime_cycle)
                if self._last_realtime_cycle is not None
                else None
            )
        return {
            "interval_seconds": self.config.sampling.realtime_interval_seconds,
            "last_cycle": last_cycle,
            "fields": fields,
        }
