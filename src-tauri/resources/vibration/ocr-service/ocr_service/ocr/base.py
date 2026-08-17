from __future__ import annotations

from typing import Protocol

import numpy as np

from ..domain import OcrPrediction


class OcrEngine(Protocol):
    @property
    def ready(self) -> bool: ...

    @property
    def error(self) -> str | None: ...

    def load(self) -> None: ...

    def recognize(self, images: list[np.ndarray]) -> list[OcrPrediction]: ...
