from __future__ import annotations

import threading
import time
from abc import ABC, abstractmethod

from ..domain import Frame, SourceSnapshot


class LatestFrameBuffer:
    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._latest: Frame | None = None

    def publish(self, frame: Frame) -> None:
        with self._condition:
            self._latest = frame
            self._condition.notify_all()

    def clear(self) -> None:
        with self._condition:
            self._latest = None
            self._condition.notify_all()

    def latest(self, maximum_age_seconds: float | None = None) -> Frame | None:
        with self._condition:
            frame = self._latest
        if frame is None:
            return None
        if maximum_age_seconds is not None:
            age = time.monotonic() - frame.monotonic_seconds
            if age > maximum_age_seconds:
                return None
        return frame

    def wait_after(self, sequence: int, timeout: float) -> Frame | None:
        deadline = time.monotonic() + timeout
        with self._condition:
            while self._latest is None or self._latest.sequence <= sequence:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                self._condition.wait(remaining)
            return self._latest


class FrameSource(ABC):
    def __init__(self, buffer: LatestFrameBuffer | None = None) -> None:
        self.buffer = buffer or LatestFrameBuffer()

    @abstractmethod
    def start(self) -> None: ...

    @abstractmethod
    def stop(self) -> None: ...

    @abstractmethod
    def snapshot(self) -> SourceSnapshot: ...
