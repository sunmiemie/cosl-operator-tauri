from __future__ import annotations

from .capture import OpenCVCameraSource
from .config import ServiceConfig
from .incidents import IncidentStore
from .metrics import ServiceMetrics
from .ocr import PaddleTextRecognitionEngine
from .runtime import OcrServiceRuntime
from .storage import OcrRepository


def build_runtime(config: ServiceConfig) -> OcrServiceRuntime:
    source = OpenCVCameraSource(config.capture)
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
