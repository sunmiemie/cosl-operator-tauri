from __future__ import annotations

import logging
import sys
import threading
import time

import cv2

from ..config import CaptureConfig
from ..domain import Frame, SourceSnapshot, SourceState
from .base import FrameSource, LatestFrameBuffer
from .status import MutableSourceStatus

logger = logging.getLogger(__name__)


class OpenCVCameraSource(FrameSource):
    """Cross-platform live capture source used by the Tauri OCR module."""

    def __init__(
        self, config: CaptureConfig, buffer: LatestFrameBuffer | None = None
    ) -> None:
        super().__init__(buffer)
        self._config = config
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._status = MutableSourceStatus()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="opencv-camera-source", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        self._status.set_state(SourceState.STOPPED)

    def snapshot(self) -> SourceSnapshot:
        return self._status.snapshot()

    def _capture_target(self) -> int | str:
        device = self._config.device.strip()
        if device.lstrip("-").isdigit():
            return int(device)
        return device

    @staticmethod
    def _backend() -> int:
        if sys.platform == "win32":
            return cv2.CAP_DSHOW
        if sys.platform == "darwin":
            return cv2.CAP_AVFOUNDATION
        return cv2.CAP_V4L2

    def _open_capture(self) -> cv2.VideoCapture:
        target = self._capture_target()
        capture = cv2.VideoCapture(target, self._backend())
        if not capture.isOpened():
            capture.release()
            capture = cv2.VideoCapture(target)
        if not capture.isOpened():
            raise RuntimeError(f"cannot open live capture device: {target}")

        capture.set(cv2.CAP_PROP_FRAME_WIDTH, self._config.width)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self._config.height)
        capture.set(cv2.CAP_PROP_FPS, self._config.fps)
        if self._config.pixel_format == "MJPG":
            capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        return capture

    def _run(self) -> None:
        backoffs = self._config.reconnect_backoff_seconds
        attempt = 0
        while not self._stop.is_set():
            capture: cv2.VideoCapture | None = None
            received_frame = False
            try:
                self._status.set_state(SourceState.CONNECTING)
                capture = self._open_capture()
                while not self._stop.is_set():
                    ok, image = capture.read()
                    if not ok or image is None:
                        raise RuntimeError("live capture returned an empty frame")
                    received_frame = True
                    attempt = 0
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
                            source_timestamp_ms=monotonic_seconds * 1000.0,
                        )
                    )
            except Exception as exc:
                error = str(exc)
                self._status.set_state(SourceState.ERROR, error)
                logger.error("live capture failed", extra={"error": error})
            finally:
                if capture is not None:
                    capture.release()
                self.buffer.clear()

            if self._stop.is_set():
                break
            if received_frame:
                attempt = 0
            delay = backoffs[min(attempt, len(backoffs) - 1)]
            attempt += 1
            self._status.mark_reconnect()
            self._stop.wait(delay)
        self._status.set_state(SourceState.STOPPED)
