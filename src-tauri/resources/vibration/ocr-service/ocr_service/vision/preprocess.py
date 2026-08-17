from __future__ import annotations

import cv2
import numpy as np


def _background_color(image: np.ndarray) -> tuple[int, int, int]:
    corners = np.array(
        [image[0, 0], image[0, -1], image[-1, 0], image[-1, -1]], dtype=np.uint8
    )
    median = np.median(corners, axis=0).astype(np.uint8)
    return int(median[0]), int(median[1]), int(median[2])


def prepare_ocr_image(
    image: np.ndarray, *, target_height: int = 64, padding: int = 4
) -> np.ndarray:
    if image.size == 0:
        raise ValueError("cannot preprocess an empty ROI")
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    content_height = target_height - padding * 2
    if content_height <= 0:
        raise ValueError("padding leaves no OCR image content")
    scale = content_height / image.shape[0]
    width = max(1, round(image.shape[1] * scale))
    resized = cv2.resize(image, (width, content_height), interpolation=cv2.INTER_CUBIC)
    color = _background_color(image)
    return cv2.copyMakeBorder(
        resized,
        padding,
        padding,
        padding,
        padding,
        cv2.BORDER_CONSTANT,
        value=color,
    )
