from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..config import Rect, ScreenConfig


class GeometryError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ScreenGeometry:
    config: ScreenConfig
    frame_width: int
    frame_height: int

    def __post_init__(self) -> None:
        content = self.content_rect
        if content.x + content.width > self.frame_width:
            raise GeometryError("content_rect exceeds frame width")
        if content.y + content.height > self.frame_height:
            raise GeometryError("content_rect exceeds frame height")
        expected = self.config.canonical_width / self.config.canonical_height
        actual = content.width / content.height
        relative_error = abs(actual - expected) / expected
        if relative_error > self.config.aspect_ratio_tolerance:
            raise GeometryError(
                f"content aspect ratio mismatch: canonical={expected:.6f}, "
                f"actual={actual:.6f}"
            )

    @property
    def content_rect(self) -> Rect:
        return self.config.content_rect or Rect(
            x=0, y=0, width=self.frame_width, height=self.frame_height
        )

    def map_rect(self, rect: Rect, offset_x: int = 0, offset_y: int = 0) -> Rect:
        content = self.content_rect
        scale_x = content.width / self.config.canonical_width
        scale_y = content.height / self.config.canonical_height
        x1 = round(content.x + rect.x * scale_x) + offset_x
        y1 = round(content.y + rect.y * scale_y) + offset_y
        x2 = round(content.x + (rect.x + rect.width) * scale_x) + offset_x
        y2 = round(content.y + (rect.y + rect.height) * scale_y) + offset_y
        mapped = Rect(x=x1, y=y1, width=max(1, x2 - x1), height=max(1, y2 - y1))
        if mapped.x + mapped.width > self.frame_width:
            raise GeometryError("mapped region exceeds frame width")
        if mapped.y + mapped.height > self.frame_height:
            raise GeometryError("mapped region exceeds frame height")
        return mapped

    @staticmethod
    def crop(image: np.ndarray, rect: Rect) -> np.ndarray:
        return image[rect.y : rect.y + rect.height, rect.x : rect.x + rect.width]
