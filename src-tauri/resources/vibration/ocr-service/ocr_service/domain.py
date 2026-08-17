from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

import numpy as np


class SourceState(StrEnum):
    STOPPED = "stopped"
    CONNECTING = "connecting"
    RUNNING = "running"
    ERROR = "error"
    EOS = "eos"


class ReadingStatus(StrEnum):
    ACCEPTED = "accepted"
    UNSTABLE = "unstable"
    SCREEN_MISMATCH = "screen_mismatch"
    INVALID_FORMAT = "invalid_format"
    LOW_CONFIDENCE = "low_confidence"
    NO_CONSENSUS = "no_consensus"
    OUT_OF_RANGE = "out_of_range"
    PENDING_JUMP = "pending_jump"
    INFERENCE_ERROR = "inference_error"
    CAPTURE_STALE = "capture_stale"


@dataclass(frozen=True, slots=True)
class Frame:
    sequence: int
    captured_at: datetime
    monotonic_seconds: float
    image: np.ndarray
    source_timestamp_ms: float | None = None
    ground_truth: dict[str, str] | None = None


@dataclass(frozen=True, slots=True)
class SourceSnapshot:
    state: SourceState
    sequence: int
    frame_width: int | None
    frame_height: int | None
    measured_fps: float
    last_frame_at: datetime | None
    last_error: str | None
    reconnect_count: int


@dataclass(frozen=True, slots=True)
class OcrPrediction:
    text: str
    confidence: float


@dataclass(slots=True)
class FieldResult:
    cycle_id: str
    field_id: str
    status: ReadingStatus
    captured_at: datetime
    accepted_text: str | None = None
    numeric_value: Decimal | None = None
    candidate_text: str | None = None
    confidence: float | None = None
    change_score: float | None = None
    reason: str | None = None
    incident_path: str | None = None
    source_timestamp_ms: float | None = None

    def as_record(self) -> dict[str, Any]:
        return {
            "cycle_id": self.cycle_id,
            "field_id": self.field_id,
            "status": self.status.value,
            "captured_at": self.captured_at,
            "accepted_text": self.accepted_text,
            "numeric_value": self.numeric_value,
            "candidate_text": self.candidate_text,
            "confidence": self.confidence,
            "change_score": self.change_score,
            "reason": self.reason,
            "incident_path": self.incident_path,
            "source_timestamp_ms": self.source_timestamp_ms,
        }


@dataclass(frozen=True, slots=True)
class CycleRecord:
    id: str
    scheduled_at: datetime
    started_at: datetime
    completed_at: datetime
    status: str
    frame_count: int
    duration_ms: float
    screen_score: float | None
    error: str | None = None
