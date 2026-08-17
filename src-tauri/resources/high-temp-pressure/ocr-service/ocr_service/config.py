from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Rect(StrictModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class CaptureConfig(StrictModel):
    source: Literal["camera"] = "camera"
    device: str = "0"
    width: int = Field(default=1280, gt=0)
    height: int = Field(default=960, gt=0)
    fps: int = Field(default=30, gt=0, le=120)
    pixel_format: Literal["MJPG", "YUY2", "NV12"] = "MJPG"
    reconnect_backoff_seconds: list[float] = Field(
        default_factory=lambda: [1.0, 2.0, 5.0, 10.0, 30.0]
    )

    @model_validator(mode="after")
    def validate_source(self) -> CaptureConfig:
        if not self.reconnect_backoff_seconds or any(
            delay <= 0 for delay in self.reconnect_backoff_seconds
        ):
            raise ValueError("reconnect backoff values must be positive")
        return self


class AnchorConfig(StrictModel):
    enabled: bool = True
    template_path: Path | None = None
    template_rect: Rect = Rect(x=395, y=35, width=560, height=65)
    search_margin: int = Field(default=24, ge=0)
    minimum_score: float = Field(default=0.88, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_template(self) -> AnchorConfig:
        if self.enabled and self.template_path is None:
            raise ValueError("screen.anchor.template_path is required when enabled")
        return self


class ScreenConfig(StrictModel):
    canonical_width: int = Field(default=1280, gt=0)
    canonical_height: int = Field(default=960, gt=0)
    content_rect: Rect | None = None
    aspect_ratio_tolerance: float = Field(default=0.01, ge=0.0, le=0.1)
    anchor: AnchorConfig = AnchorConfig(enabled=False)


class SamplingConfig(StrictModel):
    interval_seconds: float = Field(default=2.5, gt=0.0)
    burst_milliseconds: int = Field(default=500, gt=0, le=5000)
    maximum_frames: int = Field(default=12, ge=3, le=120)
    stable_streak: int = Field(default=3, ge=2, le=12)
    pixel_delta: int = Field(default=12, ge=1, le=255)
    changed_pixel_ratio: float = Field(default=0.02, ge=0.0, le=1.0)
    maximum_frame_age_seconds: float = Field(default=2.0, gt=0.0)
    realtime_interval_seconds: float = Field(default=0.5, ge=0.25)
    realtime_window_milliseconds: int = Field(default=200, ge=100, le=1000)
    realtime_maximum_frames: int = Field(default=8, ge=3, le=30)
    realtime_stable_streak: int = Field(default=6, ge=2, le=12)
    realtime_regions: list[str] = Field(default_factory=list)
    realtime_history_points: int = Field(default=240, ge=20, le=3600)

    @model_validator(mode="after")
    def validate_streak(self) -> SamplingConfig:
        if self.stable_streak > self.maximum_frames:
            raise ValueError("stable_streak cannot exceed maximum_frames")
        if self.realtime_stable_streak > self.realtime_maximum_frames:
            raise ValueError(
                "realtime_stable_streak cannot exceed realtime_maximum_frames"
            )
        return self


class OcrConfig(StrictModel):
    model_name: str = "PP-OCRv6_small_rec"
    model_dir: Path | None = None
    require_local_model: bool = True
    engine: Literal["onnxruntime", "paddle_static"] = "onnxruntime"
    device: str = "cpu"
    batch_size: int = Field(default=64, ge=1, le=256)
    target_height: int = Field(default=64, ge=24, le=256)
    padding: int = Field(default=4, ge=0, le=32)
    default_confidence_threshold: float = Field(default=0.85, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_local_model(self) -> OcrConfig:
        if self.require_local_model and self.model_dir is None:
            raise ValueError(
                "ocr.model_dir is required when require_local_model is true"
            )
        return self


class RegionConfig(StrictModel):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    label: str
    rect: Rect
    value_type: Literal["integer", "decimal"] = "integer"
    decimal_places: int = Field(default=0, ge=0, le=8)
    allow_negative: bool = False
    fixed_width: int | None = Field(default=None, ge=1, le=32)
    crop_margin: int = Field(default=0, ge=0, le=20)
    confidence_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    minimum: Decimal | None = None
    maximum: Decimal | None = None
    maximum_change_per_second: Decimal | None = Field(default=None, gt=0)
    pixel_delta: int | None = Field(default=None, ge=1, le=255)
    changed_pixel_ratio: float | None = Field(default=None, ge=0.0, le=1.0)
    enabled: bool = True

    @model_validator(mode="after")
    def validate_number_contract(self) -> RegionConfig:
        if self.value_type == "integer" and self.decimal_places != 0:
            raise ValueError("integer regions must use decimal_places=0")
        if self.value_type == "decimal" and self.decimal_places == 0:
            raise ValueError("decimal regions must declare decimal_places > 0")
        if self.minimum is not None and self.maximum is not None:
            if self.minimum > self.maximum:
                raise ValueError("minimum cannot exceed maximum")
        return self


class StorageConfig(StrictModel):
    database_path: Path = Path("data/ocr.sqlite3")
    incidents_dir: Path = Path("data/incidents")
    retention_hours: int = Field(default=72, ge=1)
    incident_minimum_interval_seconds: int = Field(default=60, ge=0)
    incident_maximum_bytes: int = Field(default=5 * 1024**3, ge=1024**2)


class ApiConfig(StrictModel):
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)


class LoggingConfig(StrictModel):
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    json_output: bool = Field(default=True, alias="json")


class ServiceConfig(StrictModel):
    capture: CaptureConfig
    screen: ScreenConfig
    sampling: SamplingConfig = SamplingConfig()
    ocr: OcrConfig
    storage: StorageConfig = StorageConfig()
    api: ApiConfig = ApiConfig()
    logging: LoggingConfig = LoggingConfig()
    regions: list[RegionConfig]

    @model_validator(mode="after")
    def validate_regions(self) -> ServiceConfig:
        ids = [region.id for region in self.regions]
        if not ids:
            raise ValueError("at least one region is required")
        if len(ids) != len(set(ids)):
            raise ValueError("region ids must be unique")
        unknown_realtime = set(self.sampling.realtime_regions) - set(ids)
        if unknown_realtime:
            raise ValueError(f"unknown realtime regions: {sorted(unknown_realtime)}")
        for region in self.regions:
            if region.rect.x + region.rect.width > self.screen.canonical_width:
                raise ValueError(f"region {region.id} exceeds canonical width")
            if region.rect.y + region.rect.height > self.screen.canonical_height:
                raise ValueError(f"region {region.id} exceeds canonical height")
        return self


def _resolve_path(value: Path | None, base: Path) -> Path | None:
    if value is None or value.is_absolute():
        return value
    return (base / value).resolve()


def load_config(path: str | Path) -> ServiceConfig:
    config_path = Path(path).expanduser().resolve()
    with config_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    if not isinstance(raw, dict):
        raise ValueError("configuration root must be a mapping")

    config = ServiceConfig.model_validate(raw)
    base = config_path.parent
    config.screen.anchor.template_path = _resolve_path(
        config.screen.anchor.template_path, base
    )
    config.ocr.model_dir = _resolve_path(config.ocr.model_dir, base)
    config.storage.database_path = _resolve_path(config.storage.database_path, base)  # type: ignore[assignment]
    config.storage.incidents_dir = _resolve_path(config.storage.incidents_dir, base)  # type: ignore[assignment]
    return config
