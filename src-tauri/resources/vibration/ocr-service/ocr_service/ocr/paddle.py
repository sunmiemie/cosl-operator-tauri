from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from typing import Any

import numpy as np

from ..config import OcrConfig
from ..domain import OcrPrediction

logger = logging.getLogger(__name__)


class PaddleTextRecognitionEngine:
    def __init__(self, config: OcrConfig) -> None:
        self._config = config
        self._model: Any | None = None
        self._error: str | None = None

    @property
    def ready(self) -> bool:
        return self._model is not None and self._error is None

    @property
    def error(self) -> str | None:
        return self._error

    def load(self) -> None:
        if self.ready:
            return
        if self._config.require_local_model:
            model_dir = self._config.model_dir
            if model_dir is None or not model_dir.is_dir():
                self._error = f"local OCR model directory is missing: {model_dir}"
                raise FileNotFoundError(self._error)
        try:
            from paddleocr import TextRecognition

            arguments: dict[str, Any] = {
                "model_name": self._config.model_name,
                "device": self._config.device,
                "engine": self._config.engine,
            }
            if self._config.model_dir is not None:
                arguments["model_dir"] = str(self._config.model_dir)
            self._model = TextRecognition(**arguments)
            self._error = None
            logger.info(
                "OCR model loaded",
                extra={
                    "model": self._config.model_name,
                    "engine": self._config.engine,
                    "device": self._config.device,
                },
            )
        except Exception as exc:
            self._model = None
            self._error = str(exc)
            raise

    def recognize(self, images: list[np.ndarray]) -> list[OcrPrediction]:
        if not images:
            return []
        if not self.ready:
            self.load()
        assert self._model is not None
        try:
            results = list(
                self._model.predict(
                    input=images,
                    batch_size=min(self._config.batch_size, len(images)),
                )
            )
            predictions = [self._extract_prediction(result) for result in results]
            if len(predictions) != len(images):
                raise RuntimeError(
                    f"OCR result count mismatch: {len(predictions)} != {len(images)}"
                )
            return predictions
        except Exception as exc:
            self._error = str(exc)
            raise

    @classmethod
    def _extract_prediction(cls, result: Any) -> OcrPrediction:
        payload = cls._to_mapping(result)
        if "res" in payload and isinstance(payload["res"], Mapping):
            payload = payload["res"]
        text = payload.get("rec_text")
        score = payload.get("rec_score")
        if text is None or score is None:
            raise RuntimeError(f"unexpected PaddleOCR result: {payload!r}")
        return OcrPrediction(text=str(text), confidence=float(score))

    @staticmethod
    def _to_mapping(result: Any) -> Mapping[str, Any]:
        if isinstance(result, Mapping):
            return result
        for attribute in ("json", "to_dict"):
            value = getattr(result, attribute, None)
            if value is None:
                continue
            value = value() if callable(value) else value
            if isinstance(value, str):
                value = json.loads(value)
            if isinstance(value, Mapping):
                return value
        try:
            return dict(result)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(
                f"cannot decode PaddleOCR result {type(result)!r}"
            ) from exc
