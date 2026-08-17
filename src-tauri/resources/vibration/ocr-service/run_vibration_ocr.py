from __future__ import annotations

import argparse
import csv
import json
import os
import platform
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Any, Iterable

import cv2

RESOURCE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(RESOURCE_DIR))

from ocr_service.config import RegionConfig, load_config  # noqa: E402
from ocr_service.factory import build_runtime  # noqa: E402


JOURNAL_FILE_NAME = "ocr_records.ndjson"
RESULT_FILE_NAME = "ocr_readings_0.5s.json"
CSV_FILE_NAME = "ocr_readings.csv"
SUMMARY_FILE_NAME = "experiment_summary.json"
PROGRESS_FILE_NAME = "ocr_progress.json"
CONTROL_FILE_NAME = "ocr_control.json"
ACCEPTANCE_THRESHOLD = 0.9995
RETRYABLE_WINDOWS_ERRORS = {5, 32, 33}


def emit_event(event: str, **payload: Any) -> None:
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


def temporary_path_for(path: Path) -> Path:
    suffix = f".{os.getpid()}.{threading.get_ident()}.{time.time_ns()}.tmp"
    return path.with_name(path.name + suffix)


def replace_with_retry(temporary: Path, path: Path, attempts: int = 8) -> None:
    for attempt in range(attempts):
        try:
            os.replace(temporary, path)
            return
        except OSError as exc:
            retryable = isinstance(exc, PermissionError) or getattr(
                exc, "winerror", None
            ) in RETRYABLE_WINDOWS_ERRORS
            if not retryable or attempt == attempts - 1:
                raise
            time.sleep(min(0.02 * (2**attempt), 0.5))


def atomic_write_text(path: Path, text: str) -> None:
    temporary = temporary_path_for(path)
    try:
        with temporary.open("w", encoding="utf-8", newline="") as handle:
            handle.write(text)
            handle.flush()
        replace_with_retry(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class RecordJournal:
    def __init__(self, output_dir: Path) -> None:
        self.path = output_dir / JOURNAL_FILE_NAME
        self._handle = self.path.open(
            "w", encoding="utf-8", newline="\n", buffering=1
        )
        self.count = 0
        self.screen_detected_count = 0
        self.accepted_record_count = 0
        self.latest_record: dict[str, Any] | None = None

    def append(self, record: dict[str, Any]) -> dict[str, Any]:
        indexed = {**record, "record_index": self.count + 1}
        self._handle.write(
            json.dumps(indexed, ensure_ascii=False, separators=(",", ":")) + "\n"
        )
        self._handle.flush()
        self.count += 1
        if indexed.get("screen_detected"):
            self.screen_detected_count += 1
        if any(
            measurement.get("status") == "accepted"
            and float(measurement.get("confidence") or 0) >= ACCEPTANCE_THRESHOLD
            for measurement in indexed.get("measurements", [])
            if isinstance(measurement, dict)
        ):
            self.accepted_record_count += 1
        self.latest_record = indexed
        return indexed

    def close(self) -> None:
        if not self._handle.closed:
            self._handle.flush()
            self._handle.close()

    def records(self) -> Iterable[dict[str, Any]]:
        if not self._handle.closed:
            self._handle.flush()
        with self.path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                text = line.strip()
                if not text:
                    continue
                try:
                    value = json.loads(text)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"OCR 增量记录第 {line_number} 行损坏: {exc}"
                    ) from exc
                if isinstance(value, dict):
                    yield value


def field_definitions(regions: list[RegionConfig]) -> list[dict[str, str]]:
    return [
        {"id": region.id, "label": region.label}
        for region in regions
        if region.enabled
    ]


def current_cycle_record(runtime: Any, started_at: float) -> dict[str, Any] | None:
    realtime = runtime.realtime_series()
    cycle = realtime.get("last_cycle") or {}
    cycle_id = str(cycle.get("id") or "")
    if not cycle_id:
        return None

    measurements: list[dict[str, Any]] = []
    for field in realtime.get("fields", []):
        if not isinstance(field, dict):
            continue
        points = field.get("points") or []
        if not points:
            continue
        point = points[-1]
        if str(point.get("cycle_id") or "") != cycle_id:
            continue
        status = str(point.get("status") or "no_data")
        accepted = status == "accepted"
        captured_at = point.get("captured_at")
        raw = point.get("text") if accepted else point.get("candidate_text")
        measurements.append(
            {
                "id": str(field.get("field_id") or ""),
                "raw": raw,
                "value": point.get("value") if accepted else None,
                "confidence": point.get("confidence"),
                "status": status,
                "reason": point.get("reason"),
                "accepted_at": captured_at if accepted else None,
            }
        )

    unavailable_statuses = {"screen_mismatch", "capture_stale"}
    statuses = {str(item.get("status") or "") for item in measurements}
    screen_detected = bool(measurements) and not statuses.issubset(unavailable_statuses)
    return {
        "time_sec": round(time.monotonic() - started_at, 3),
        "captured_at": cycle.get("completed_at"),
        "screen_detected": screen_detected,
        "measurements": measurements,
    }


def write_json_output(
    path: Path,
    journal: RecordJournal,
    fields: list[dict[str, str]],
) -> None:
    temporary = temporary_path_for(path)
    header = {
        "schema_version": 1,
        "source": "vibration_live_ocr",
        "sample_interval_seconds": 0.5,
        "confidence_threshold": ACCEPTANCE_THRESHOLD,
        "field_count": len(fields),
        "fields": fields,
        "record_count": journal.count,
        "accepted_record_count": journal.accepted_record_count,
    }
    try:
        with temporary.open("w", encoding="utf-8", newline="") as handle:
            encoded = json.dumps(header, ensure_ascii=False, separators=(",", ":"))
            handle.write(encoded[:-1])
            handle.write(',"records":[')
            first = True
            for record in journal.records():
                if not first:
                    handle.write(",")
                handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
                first = False
            handle.write("]}")
            handle.flush()
        replace_with_retry(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def accepted_value(record: dict[str, Any], field_id: str) -> Any:
    for measurement in record.get("measurements", []):
        if not isinstance(measurement, dict) or measurement.get("id") != field_id:
            continue
        if (
            measurement.get("status") == "accepted"
            and float(measurement.get("confidence") or 0) >= ACCEPTANCE_THRESHOLD
        ):
            return measurement.get("value")
    return ""


def write_csv_output(path: Path, journal: RecordJournal, fields: list[str]) -> None:
    temporary = temporary_path_for(path)
    try:
        with temporary.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["time_sec", "captured_at", "screen_detected", *fields])
            for record in journal.records():
                writer.writerow(
                    [
                        record.get("time_sec", ""),
                        record.get("captured_at", ""),
                        1 if record.get("screen_detected") else 0,
                        *[accepted_value(record, field_id) for field_id in fields],
                    ]
                )
            handle.flush()
        replace_with_retry(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def latest_accepted(journal: RecordJournal, field_id: str) -> Any:
    latest: Any = None
    for record in journal.records():
        value = accepted_value(record, field_id)
        if value != "":
            latest = value
    return latest


def write_outputs(
    output_dir: Path,
    journal: RecordJournal,
    regions: list[RegionConfig],
) -> dict[str, Any]:
    fields = field_definitions(regions)
    field_ids = [field["id"] for field in fields]
    latest = journal.latest_record
    summary = {
        "schema_version": 1,
        "source": "vibration_live_ocr",
        "sample_interval_seconds": 0.5,
        "confidence_threshold": ACCEPTANCE_THRESHOLD,
        "record_count": journal.count,
        "screen_detected_count": journal.screen_detected_count,
        "accepted_record_count": journal.accepted_record_count,
        "duration_seconds": latest.get("time_sec") if latest else 0,
        "last_elapsed_time": latest_accepted(journal, "elapsed"),
        "last_remaining_time": latest_accepted(journal, "remaining"),
        "latest_measurements": latest.get("measurements") if latest else [],
    }
    write_json_output(output_dir / RESULT_FILE_NAME, journal, fields)
    write_csv_output(output_dir / CSV_FILE_NAME, journal, field_ids)
    atomic_write_text(
        output_dir / SUMMARY_FILE_NAME,
        json.dumps(summary, ensure_ascii=False, indent=2),
    )
    return summary


def readiness_percent(status: dict[str, Any]) -> int:
    checks = status.get("readiness", {}).get("checks", {})
    return round(sum(bool(value) for value in checks.values()) / len(checks) * 100) if checks else 0


def write_progress(
    output_dir: Path,
    runtime: Any,
    journal: RecordJournal,
    *,
    paused: bool,
    complete: bool,
    latest_frame: Path | None,
    error: str | None = None,
) -> None:
    status = runtime.status()
    latest = journal.latest_record or {}
    payload = {
        "exists": True,
        "source": "vibration_live_ocr",
        "current": journal.count,
        "accepted_current": journal.accepted_record_count,
        "ready_pct": readiness_percent(status),
        "latest_time_sec": latest.get("time_sec", 0),
        "latest_record": latest or None,
        "latest_frame": str(latest_frame) if latest_frame and latest_frame.exists() else "",
        "complete": complete,
        "paused": paused,
        "error": error,
        "output_dir": str(output_dir),
        "service": status,
    }
    atomic_write_text(
        output_dir / PROGRESS_FILE_NAME,
        json.dumps(payload, ensure_ascii=False, indent=2),
    )


def read_control_action(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        action = str(payload.get("action") or "")
    except (OSError, ValueError, TypeError):
        return ""
    path.unlink(missing_ok=True)
    return action


def save_latest_frame(runtime: Any, output_dir: Path, last_sequence: int) -> tuple[Path | None, int]:
    frame = runtime.source.buffer.latest()
    if frame is None or frame.sequence == last_sequence:
        return None, last_sequence
    path = output_dir / "latest_frame.jpg"
    temporary = output_dir / f"latest_frame.{os.getpid()}.{time.time_ns()}.tmp.jpg"
    try:
        if not cv2.imwrite(str(temporary), frame.image, [int(cv2.IMWRITE_JPEG_QUALITY), 86]):
            return None, last_sequence
        replace_with_retry(temporary, path)
        return path, frame.sequence
    finally:
        temporary.unlink(missing_ok=True)


def configure_runtime(
    output_dir: Path,
    device: str,
    model_dir: Path,
    interval: float,
) -> Any:
    config = load_config(RESOURCE_DIR / "config.yaml")
    system = platform.system().lower()
    if system == "windows":
        config.capture.source = "dshow"
        config.capture.device = device or "AFN_cap video"
    elif system == "linux":
        config.capture.source = "v4l2"
        config.capture.device = device if device.startswith("/dev/") else "/dev/video0"
    else:
        raise RuntimeError(f"振动台 OCR 暂不支持当前操作系统: {platform.system()}")
    config.ocr.model_dir = model_dir.resolve()
    config.sampling.realtime_interval_seconds = max(0.25, interval)
    config.storage.database_path = output_dir / "ocr.sqlite3"
    config.storage.incidents_dir = output_dir / "incidents"
    return build_runtime(config)


def run(
    device: str,
    model_dir: Path,
    output_dir: Path,
    interval: float,
) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    runtime = configure_runtime(output_dir, device, model_dir, interval)
    stop_requested = threading.Event()

    def request_stop(*_: Any) -> None:
        stop_requested.set()

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    started_at = time.monotonic()
    journal = RecordJournal(output_dir)
    control_path = output_dir / CONTROL_FILE_NAME
    last_cycle_id = ""
    last_frame_sequence = -1
    latest_frame: Path | None = None
    paused = False
    ready_emitted = False
    failure_message: str | None = None
    return_code = 0

    emit_event(
        "start",
        captured_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        device=device,
        interval=max(0.25, interval),
        platform=platform.system().lower(),
    )

    try:
        runtime.start()
        write_progress(
            output_dir,
            runtime,
            journal,
            paused=False,
            complete=False,
            latest_frame=None,
        )
        while not stop_requested.wait(0.1):
            action = read_control_action(control_path)
            if action == "stop":
                break
            if action == "pause":
                paused = True
            elif action == "resume":
                paused = False

            status = runtime.status()
            model_error = status.get("readiness", {}).get("model_error")
            if model_error:
                raise RuntimeError(f"OCR 模型不可用: {model_error}")
            if status.get("ready") and not ready_emitted:
                ready_emitted = True
                emit_event(
                    "ready",
                    captured_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    screen_detected=True,
                    message="振动台采集卡与 OCR 已就绪",
                )

            realtime = runtime.realtime_series()
            cycle_id = str((realtime.get("last_cycle") or {}).get("id") or "")
            if cycle_id and cycle_id != last_cycle_id:
                last_cycle_id = cycle_id
                saved, last_frame_sequence = save_latest_frame(
                    runtime, output_dir, last_frame_sequence
                )
                if saved is not None:
                    latest_frame = saved
                if not paused:
                    record = current_cycle_record(runtime, started_at)
                    if record is not None:
                        indexed = journal.append(record)
                        write_progress(
                            output_dir,
                            runtime,
                            journal,
                            paused=False,
                            complete=False,
                            latest_frame=latest_frame,
                        )
                        emit_event(
                            "sample",
                            captured_at=indexed.get("captured_at"),
                            screen_detected=indexed.get("screen_detected", False),
                            measurements=indexed.get("measurements", []),
                            record=indexed,
                            current=journal.count,
                            accepted_current=journal.accepted_record_count,
                            preview_path=str(latest_frame) if latest_frame else "",
                        )
    except Exception as exc:
        failure_message = str(exc)
        return_code = 1
        emit_event("error", message=failure_message)
    finally:
        try:
            runtime.stop()
        except Exception as exc:
            stop_error = f"停止 OCR 运行时失败: {exc}"
            failure_message = f"{failure_message}；{stop_error}" if failure_message else stop_error
            return_code = 1
            emit_event("error", message=stop_error)
        journal.close()
        summary: dict[str, Any] = {}
        try:
            summary = write_outputs(output_dir, journal, runtime.config.regions)
        except Exception as exc:
            output_error = f"生成振动台 OCR 结果失败: {exc}"
            failure_message = f"{failure_message}；{output_error}" if failure_message else output_error
            return_code = 1
            emit_event("error", message=output_error)
        write_progress(
            output_dir,
            runtime,
            journal,
            paused=False,
            complete=return_code == 0,
            latest_frame=latest_frame,
            error=failure_message,
        )
        if return_code == 0:
            emit_event(
                "complete",
                output_dir=str(output_dir),
                json_path=str(output_dir / RESULT_FILE_NAME),
                csv_path=str(output_dir / CSV_FILE_NAME),
                summary_path=str(output_dir / SUMMARY_FILE_NAME),
                latest_frame=str(latest_frame) if latest_frame else "",
                record_count=journal.count,
                accepted_record_count=journal.accepted_record_count,
                summary=summary,
            )
    return return_code


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Live capture-card OCR for the vibration-table module"
    )
    parser.add_argument("--device", default="")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--interval", type=float, default=0.5)
    args = parser.parse_args()
    return run(
        args.device,
        Path(args.model_dir).resolve(),
        Path(args.output_dir).resolve(),
        args.interval,
    )


if __name__ == "__main__":
    raise SystemExit(main())
