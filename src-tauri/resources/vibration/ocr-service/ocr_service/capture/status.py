from __future__ import annotations

import threading
import time
from collections import deque
from datetime import UTC, datetime

from ..domain import SourceSnapshot, SourceState


class MutableSourceStatus:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state = SourceState.STOPPED
        self._sequence = 0
        self._width: int | None = None
        self._height: int | None = None
        self._last_frame_at: datetime | None = None
        self._last_error: str | None = None
        self._reconnect_count = 0
        self._frame_times: deque[float] = deque(maxlen=60)

    def set_state(self, state: SourceState, error: str | None = None) -> None:
        with self._lock:
            self._state = state
            self._last_error = error

    def mark_reconnect(self) -> None:
        with self._lock:
            self._reconnect_count += 1

    def mark_frame(self, width: int, height: int) -> tuple[int, datetime, float]:
        now_wall = datetime.now(UTC)
        now_mono = time.monotonic()
        with self._lock:
            self._sequence += 1
            self._width = width
            self._height = height
            self._last_frame_at = now_wall
            self._last_error = None
            self._state = SourceState.RUNNING
            self._frame_times.append(now_mono)
            sequence = self._sequence
        return sequence, now_wall, now_mono

    def snapshot(self) -> SourceSnapshot:
        with self._lock:
            measured_fps = 0.0
            if len(self._frame_times) >= 2:
                elapsed = self._frame_times[-1] - self._frame_times[0]
                if elapsed > 0:
                    measured_fps = (len(self._frame_times) - 1) / elapsed
            return SourceSnapshot(
                state=self._state,
                sequence=self._sequence,
                frame_width=self._width,
                frame_height=self._height,
                measured_fps=measured_fps,
                last_frame_at=self._last_frame_at,
                last_error=self._last_error,
                reconnect_count=self._reconnect_count,
            )
