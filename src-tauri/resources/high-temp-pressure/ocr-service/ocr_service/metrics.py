from __future__ import annotations

from prometheus_client import (
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)


class ServiceMetrics:
    def __init__(self) -> None:
        self.registry = CollectorRegistry()
        self.cycles = Counter(
            "ocr_cycles_total",
            "Completed OCR sample cycles",
            ["status"],
            registry=self.registry,
        )
        self.readings = Counter(
            "ocr_field_results_total",
            "OCR field results by status",
            ["status"],
            registry=self.registry,
        )
        self.cycle_duration = Histogram(
            "ocr_cycle_duration_seconds",
            "End-to-end sample cycle duration",
            buckets=(0.1, 0.25, 0.5, 1, 1.5, 2, 2.5, 5),
            registry=self.registry,
        )
        self.frame_age = Gauge(
            "ocr_latest_frame_age_seconds",
            "Age of the most recent capture frame",
            registry=self.registry,
        )
        self.capture_fps = Gauge(
            "ocr_capture_fps",
            "Measured capture frame rate",
            registry=self.registry,
        )
        self.screen_score = Gauge(
            "ocr_screen_anchor_score",
            "Most recent screen anchor match score",
            registry=self.registry,
        )
        self.skipped_cycles = Counter(
            "ocr_skipped_cycles_total",
            "Cycles skipped because processing overran the schedule",
            registry=self.registry,
        )

    def render(self) -> bytes:
        return generate_latest(self.registry)
