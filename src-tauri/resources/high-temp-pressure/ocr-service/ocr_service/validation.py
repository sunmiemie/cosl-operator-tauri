from __future__ import annotations

import re
import threading
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation

from .config import OcrConfig, RegionConfig
from .domain import OcrPrediction, ReadingStatus


@dataclass(frozen=True, slots=True)
class ConsensusResult:
    status: ReadingStatus
    text: str | None
    value: Decimal | None
    confidence: float | None
    reason: str | None


@dataclass(slots=True)
class ValidationState:
    text: str
    value: Decimal
    accepted_at: datetime
    pending_jump_text: str | None = None
    pending_jump_count: int = 0


def normalize_ocr_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    return "".join(normalized.split())


def number_pattern(region: RegionConfig) -> re.Pattern[str]:
    sign = r"-?" if region.allow_negative else ""
    if region.value_type == "integer":
        digits = rf"\d{{{region.fixed_width}}}" if region.fixed_width else r"\d+"
        return re.compile(rf"^{sign}{digits}$")
    return re.compile(rf"^{sign}\d+\.\d{{{region.decimal_places}}}$")


def build_consensus(
    predictions: list[OcrPrediction],
    region: RegionConfig,
    ocr_config: OcrConfig,
) -> ConsensusResult:
    threshold = (
        region.confidence_threshold
        if region.confidence_threshold is not None
        else ocr_config.default_confidence_threshold
    )
    pattern = number_pattern(region)
    valid_by_text: dict[str, list[float]] = defaultdict(list)
    had_format_candidate = False
    had_low_confidence = False

    for prediction in predictions:
        text = normalize_ocr_text(prediction.text)
        if not pattern.fullmatch(text):
            continue
        had_format_candidate = True
        if prediction.confidence < threshold:
            had_low_confidence = True
            continue
        valid_by_text[text].append(prediction.confidence)

    if not valid_by_text:
        if had_low_confidence:
            return ConsensusResult(
                ReadingStatus.LOW_CONFIDENCE,
                None,
                None,
                None,
                f"no candidate met confidence threshold {threshold:.3f}",
            )
        return ConsensusResult(
            ReadingStatus.INVALID_FORMAT,
            None,
            None,
            None,
            "OCR output did not match the numeric field format"
            if not had_format_candidate
            else "no usable OCR candidate",
        )

    winner, scores = max(
        valid_by_text.items(), key=lambda item: (len(item[1]), sum(item[1]))
    )
    if len(scores) < 2:
        all_candidates = ", ".join(
            f"{text}:{len(values)}" for text, values in sorted(valid_by_text.items())
        )
        return ConsensusResult(
            ReadingStatus.NO_CONSENSUS,
            winner,
            None,
            sum(scores) / len(scores),
            f"fewer than two matching OCR results ({all_candidates})",
        )
    try:
        value = Decimal(winner)
    except InvalidOperation:
        return ConsensusResult(
            ReadingStatus.INVALID_FORMAT,
            winner,
            None,
            None,
            "numeric value could not be parsed",
        )
    return ConsensusResult(
        ReadingStatus.ACCEPTED,
        winner,
        value,
        sum(scores) / len(scores),
        None,
    )


class BusinessValidator:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._states: dict[str, ValidationState] = {}

    def restore(
        self, field_id: str, text: str, value: Decimal, accepted_at: datetime
    ) -> None:
        with self._lock:
            self._states[field_id] = ValidationState(text, value, accepted_at)

    def validate(
        self,
        region: RegionConfig,
        consensus: ConsensusResult,
        captured_at: datetime,
    ) -> ConsensusResult:
        if consensus.status is not ReadingStatus.ACCEPTED:
            with self._lock:
                previous = self._states.get(region.id)
                if previous is not None:
                    previous.pending_jump_text = None
                    previous.pending_jump_count = 0
            return consensus
        assert consensus.text is not None and consensus.value is not None
        value = consensus.value
        if region.minimum is not None and value < region.minimum:
            self._clear_pending(region.id)
            return ConsensusResult(
                ReadingStatus.OUT_OF_RANGE,
                consensus.text,
                value,
                consensus.confidence,
                f"value {value} is below minimum {region.minimum}",
            )
        if region.maximum is not None and value > region.maximum:
            self._clear_pending(region.id)
            return ConsensusResult(
                ReadingStatus.OUT_OF_RANGE,
                consensus.text,
                value,
                consensus.confidence,
                f"value {value} is above maximum {region.maximum}",
            )

        with self._lock:
            previous = self._states.get(region.id)
            if previous is not None and region.maximum_change_per_second is not None:
                elapsed = max(
                    0.001, (captured_at - previous.accepted_at).total_seconds()
                )
                allowed = region.maximum_change_per_second * Decimal(str(elapsed))
                change = abs(value - previous.value)
                if change > allowed:
                    if previous.pending_jump_text == consensus.text:
                        previous.pending_jump_count += 1
                    else:
                        previous.pending_jump_text = consensus.text
                        previous.pending_jump_count = 1
                    return ConsensusResult(
                        ReadingStatus.PENDING_JUMP,
                        consensus.text,
                        value,
                        consensus.confidence,
                        f"change {change} exceeds allowed {allowed}; keeping last accepted value",
                    )

            self._states[region.id] = ValidationState(
                consensus.text, value, captured_at
            )
            return consensus

    def _clear_pending(self, field_id: str) -> None:
        with self._lock:
            previous = self._states.get(field_id)
            if previous is not None:
                previous.pending_jump_text = None
                previous.pending_jump_count = 0

    def snapshot(self) -> dict[str, ValidationState]:
        with self._lock:
            return {
                key: ValidationState(
                    value.text,
                    value.value,
                    value.accepted_at,
                    value.pending_jump_text,
                    value.pending_jump_count,
                )
                for key, value in self._states.items()
            }
