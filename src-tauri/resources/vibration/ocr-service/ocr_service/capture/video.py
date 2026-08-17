from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

import cv2
import numpy as np

from ..domain import Frame, SourceSnapshot, SourceState
from .base import FrameSource, LatestFrameBuffer
from .status import MutableSourceStatus

logger = logging.getLogger(__name__)


class VideoFileSource(FrameSource):
    def __init__(
        self,
        path: Path,
        loop: bool = True,
        fallback_fps: float = 30.0,
        buffer: LatestFrameBuffer | None = None,
    ) -> None:
        super().__init__(buffer)
        self._path = path
        self._loop = loop
        self._fallback_fps = fallback_fps
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._status = MutableSourceStatus()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="video-file-source", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        self._status.set_state(SourceState.STOPPED)

    def snapshot(self) -> SourceSnapshot:
        return self._status.snapshot()

    def _run(self) -> None:
        self._status.set_state(SourceState.CONNECTING)
        image = cv2.imread(str(self._path), cv2.IMREAD_COLOR)
        if image is not None:
            self._run_still_image(image)
            return
        while not self._stop.is_set():
            capture = cv2.VideoCapture(str(self._path))
            if not capture.isOpened():
                error = f"cannot open video source: {self._path}"
                self._status.set_state(SourceState.ERROR, error)
                logger.error(error)
                return

            fps = capture.get(cv2.CAP_PROP_FPS)
            if not fps or fps <= 0 or fps > 240:
                fps = self._fallback_fps
            interval = 1.0 / fps

            while not self._stop.is_set():
                started = time.monotonic()
                ok, image = capture.read()
                if not ok:
                    if self._loop:
                        capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    self._status.set_state(SourceState.EOS)
                    capture.release()
                    return
                source_timestamp_ms = float(capture.get(cv2.CAP_PROP_POS_MSEC))
                height, width = image.shape[:2]
                sequence, captured_at, monotonic_seconds = self._status.mark_frame(
                    width, height
                )
                self.buffer.publish(
                    Frame(
                        sequence=sequence,
                        captured_at=captured_at,
                        monotonic_seconds=monotonic_seconds,
                        image=image,
                        source_timestamp_ms=source_timestamp_ms,
                    )
                )
                self._stop.wait(max(0.0, interval - (time.monotonic() - started)))
            capture.release()
        self._status.set_state(SourceState.STOPPED)

    def _run_still_image(self, image: np.ndarray) -> None:
        interval = 1.0 / self._fallback_fps
        while not self._stop.is_set():
            started = time.monotonic()
            height, width = image.shape[:2]
            sequence, captured_at, monotonic_seconds = self._status.mark_frame(
                width, height
            )
            self.buffer.publish(
                Frame(
                    sequence=sequence,
                    captured_at=captured_at,
                    monotonic_seconds=monotonic_seconds,
                    image=image.copy(),
                    source_timestamp_ms=0.0,
                )
            )
            self._stop.wait(max(0.0, interval - (time.monotonic() - started)))
        self._status.set_state(SourceState.STOPPED)
