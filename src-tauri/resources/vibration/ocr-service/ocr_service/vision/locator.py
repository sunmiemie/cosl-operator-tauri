from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from ..config import AnchorConfig
from .geometry import GeometryError, ScreenGeometry


@dataclass(frozen=True, slots=True)
class LocationResult:
    valid: bool
    score: float | None
    offset_x: int = 0
    offset_y: int = 0
    reason: str | None = None


class AnchorLocator:
    def __init__(self, config: AnchorConfig) -> None:
        self._config = config
        self._template: np.ndarray | None = None
        if config.enabled:
            assert config.template_path is not None
            reference = cv2.imread(str(config.template_path), cv2.IMREAD_GRAYSCALE)
            if reference is None:
                raise FileNotFoundError(
                    f"cannot load anchor reference: {config.template_path}"
                )
            rect = config.template_rect
            template = reference[
                rect.y : rect.y + rect.height, rect.x : rect.x + rect.width
            ]
            if template.size == 0:
                raise ValueError("anchor template_rect is empty")
            self._template = template

    def locate(self, frame: np.ndarray, geometry: ScreenGeometry) -> LocationResult:
        if not self._config.enabled:
            return LocationResult(valid=True, score=None)
        assert self._template is not None
        try:
            expected = geometry.map_rect(self._config.template_rect)
        except GeometryError as exc:
            return LocationResult(valid=False, score=None, reason=str(exc))

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        scaled_template = cv2.resize(
            self._template,
            (expected.width, expected.height),
            interpolation=cv2.INTER_AREA,
        )
        margin = self._config.search_margin
        x1 = max(0, expected.x - margin)
        y1 = max(0, expected.y - margin)
        x2 = min(frame.shape[1], expected.x + expected.width + margin)
        y2 = min(frame.shape[0], expected.y + expected.height + margin)
        search = gray[y1:y2, x1:x2]
        if search.shape[0] < expected.height or search.shape[1] < expected.width:
            return LocationResult(
                valid=False, score=None, reason="anchor search area is too small"
            )
        scores = cv2.matchTemplate(search, scaled_template, cv2.TM_CCOEFF_NORMED)
        _, score, _, location = cv2.minMaxLoc(scores)
        found_x = x1 + location[0]
        found_y = y1 + location[1]
        if not np.isfinite(score) or score < self._config.minimum_score:
            return LocationResult(
                valid=False,
                score=float(score) if np.isfinite(score) else None,
                reason=f"anchor score below threshold: {score:.4f}",
            )
        return LocationResult(
            valid=True,
            score=float(score),
            offset_x=found_x - expected.x,
            offset_y=found_y - expected.y,
        )
