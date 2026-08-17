from __future__ import annotations

import logging
import subprocess
import threading
from collections.abc import Sequence

import numpy as np

from ..config import CaptureConfig
from ..domain import Frame, SourceSnapshot, SourceState
from .base import FrameSource, LatestFrameBuffer
from .status import MutableSourceStatus

logger = logging.getLogger(__name__)


class FFmpegAvFoundationSource(FrameSource):
    """Local macOS capture-card source used for hardware validation."""

    def __init__(
        self, config: CaptureConfig, buffer: LatestFrameBuffer | None = None
    ) -> None:
        super().__init__(buffer)
        self._config = config
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._process: subprocess.Popen[bytes] | None = None
        self._status = MutableSourceStatus()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="avfoundation-source", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        process = self._process
        if process is not None and process.poll() is None:
            process.terminate()
        if self._thread:
            self._thread.join(timeout=10)
        self._status.set_state(SourceState.STOPPED)

    def snapshot(self) -> SourceSnapshot:
        return self._status.snapshot()

    def _command(self) -> Sequence[str]:
        return (
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "avfoundation",
            "-framerate",
            str(self._config.fps),
            "-video_size",
            f"{self._config.width}x{self._config.height}",
            "-i",
            f"{self._config.device}:none",
            "-an",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "pipe:1",
        )

    def _run(self) -> None:
        frame_bytes = self._config.width * self._config.height * 3
        backoffs = self._config.reconnect_backoff_seconds
        attempt = 0
        while not self._stop.is_set():
            received_frame = False
            try:
                self._status.set_state(SourceState.CONNECTING)
                process = subprocess.Popen(
                    self._command(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    bufsize=frame_bytes * 2,
                )
                self._process = process
                assert process.stdout is not None
                while not self._stop.is_set():
                    payload = process.stdout.read(frame_bytes)
                    if len(payload) != frame_bytes:
                        if self._stop.is_set():
                            break
                        raise RuntimeError(
                            f"AVFoundation stream ended after {len(payload)} frame bytes"
                        )
                    received_frame = True
                    attempt = 0
                    image = np.frombuffer(payload, dtype=np.uint8).reshape(
                        (self._config.height, self._config.width, 3)
                    )
                    sequence, captured_at, monotonic_seconds = self._status.mark_frame(
                        self._config.width, self._config.height
                    )
                    self.buffer.publish(
                        Frame(
                            sequence=sequence,
                            captured_at=captured_at,
                            monotonic_seconds=monotonic_seconds,
                            image=image.copy(),
                        )
                    )
            except Exception as exc:
                error = str(exc)
                self._status.set_state(SourceState.ERROR, error)
                logger.error("AVFoundation capture failed", extra={"error": error})
            finally:
                process = self._process
                self._process = None
                if process is not None:
                    if process.poll() is None:
                        process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=3)
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
