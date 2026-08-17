from __future__ import annotations

import logging
import threading
from typing import Any

import numpy as np

from ..config import CaptureConfig
from ..domain import Frame, SourceSnapshot, SourceState
from .base import FrameSource, LatestFrameBuffer
from .status import MutableSourceStatus

logger = logging.getLogger(__name__)


class GStreamerUnavailableError(RuntimeError):
    pass


class GStreamerV4L2Source(FrameSource):
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
        self._load_gstreamer()
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="gstreamer-v4l2-source", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        self._status.set_state(SourceState.STOPPED)

    def snapshot(self) -> SourceSnapshot:
        return self._status.snapshot()

    @staticmethod
    def _load_gstreamer() -> tuple[Any, Any]:
        try:
            import gi  # pyright: ignore[reportMissingImports]

            gi.require_version("Gst", "1.0")
            from gi.repository import Gst, GstApp  # pyright: ignore[reportMissingImports]
        except (ImportError, ValueError) as exc:
            raise GStreamerUnavailableError(
                "PyGObject and GStreamer introspection packages are required for V4L2"
            ) from exc
        Gst.init(None)
        return Gst, GstApp

    def _build_pipeline(self) -> str:
        if self._config.pipeline_override:
            pipeline = self._config.pipeline_override
            if "appsink" not in pipeline or "name=sink" not in pipeline:
                raise ValueError(
                    "pipeline_override must contain an appsink named 'sink'"
                )
            return pipeline

        caps_common = (
            f"width={self._config.width},height={self._config.height},"
            f"framerate={self._config.fps}/1"
        )
        if self._config.pixel_format == "MJPG":
            source_caps = f"image/jpeg,{caps_common} ! jpegdec"
        else:
            source_caps = (
                f"video/x-raw,format={self._config.pixel_format},{caps_common}"
            )
        return (
            f"v4l2src device={self._config.device} ! {source_caps} ! "
            "videoconvert ! video/x-raw,format=BGR ! "
            "appsink name=sink max-buffers=1 drop=true sync=false"
        )

    def _run(self) -> None:
        Gst, _ = self._load_gstreamer()
        backoffs = self._config.reconnect_backoff_seconds
        attempt = 0
        while not self._stop.is_set():
            pipeline = None
            received_frame = False
            try:
                self._status.set_state(SourceState.CONNECTING)
                pipeline = Gst.parse_launch(self._build_pipeline())
                sink = pipeline.get_by_name("sink")
                if sink is None:
                    raise RuntimeError("GStreamer pipeline has no appsink named 'sink'")
                pipeline.set_state(Gst.State.PLAYING)
                bus = pipeline.get_bus()

                while not self._stop.is_set():
                    sample = sink.emit("try-pull-sample", Gst.SECOND)
                    if sample is None:
                        message = bus.pop_filtered(
                            Gst.MessageType.ERROR | Gst.MessageType.EOS
                        )
                        if message and message.type == Gst.MessageType.ERROR:
                            error, debug = message.parse_error()
                            raise RuntimeError(f"{error}: {debug or ''}".strip())
                        if message and message.type == Gst.MessageType.EOS:
                            raise RuntimeError("GStreamer stream reached EOS")
                        continue
                    received_frame = True
                    attempt = 0
                    image = self._sample_to_bgr(sample, Gst)
                    sample_buffer = sample.get_buffer()
                    source_timestamp_ms = (
                        float(sample_buffer.pts / Gst.MSECOND)
                        if sample_buffer.pts != Gst.CLOCK_TIME_NONE
                        else None
                    )
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
            except Exception as exc:
                error = str(exc)
                self._status.set_state(SourceState.ERROR, error)
                logger.error("capture pipeline failed", extra={"error": error})
            finally:
                if pipeline is not None:
                    pipeline.set_state(Gst.State.NULL)
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

    @staticmethod
    def _sample_to_bgr(sample: Any, Gst: Any) -> np.ndarray:
        caps = sample.get_caps()
        structure = caps.get_structure(0)
        width = structure.get_value("width")
        height = structure.get_value("height")
        buffer = sample.get_buffer()
        ok, mapping = buffer.map(Gst.MapFlags.READ)
        if not ok:
            raise RuntimeError("failed to map GStreamer sample")
        try:
            expected = width * height * 3
            array = np.frombuffer(mapping.data, dtype=np.uint8)
            if array.size < expected:
                raise RuntimeError(
                    f"short BGR frame: expected {expected} bytes, got {array.size}"
                )
            return array[:expected].reshape((height, width, 3)).copy()
        finally:
            buffer.unmap(mapping)
