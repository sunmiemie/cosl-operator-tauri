from __future__ import annotations

from .capture import (
    BrowserPageSource,
    FFmpegAvFoundationSource,
    FFmpegDirectShowSource,
    GStreamerV4L2Source,
    VideoFileSource,
)
from .config import ServiceConfig
from .incidents import IncidentStore
from .metrics import ServiceMetrics
from .ocr import PaddleTextRecognitionEngine
from .runtime import OcrServiceRuntime
from .storage import OcrRepository


def build_runtime(config: ServiceConfig) -> OcrServiceRuntime:
    if config.capture.source == "v4l2":
        source = GStreamerV4L2Source(config.capture)
    elif config.capture.source == "avfoundation":
        source = FFmpegAvFoundationSource(config.capture)
    elif config.capture.source == "dshow":
        source = FFmpegDirectShowSource(config.capture)
    elif config.capture.source == "video":
        assert config.capture.path is not None
        source = VideoFileSource(
            config.capture.path,
            loop=config.capture.loop_video,
            fallback_fps=config.capture.fps,
        )
    else:
        source = BrowserPageSource(config.capture)
    repository = OcrRepository(config.storage.database_path)
    return OcrServiceRuntime(
        config=config,
        source=source,
        engine=PaddleTextRecognitionEngine(config.ocr),
        realtime_engine=PaddleTextRecognitionEngine(config.ocr)
        if config.sampling.realtime_regions
        else None,
        repository=repository,
        incidents=IncidentStore(config.storage),
        metrics=ServiceMetrics(),
    )
