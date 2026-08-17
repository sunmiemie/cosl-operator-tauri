from __future__ import annotations

import re

import cv2
import numpy as np

from .domain import OcrPrediction
from .vision.preprocess import prepare_ocr_image

_TIME_PART_PATTERN = re.compile(r"^\d+$")


def prepare_time_ocr_images(image: np.ndarray) -> list[np.ndarray]:
    """Split a green HH:MM:SS display and prepare its three numeric parts."""
    if image.size == 0:
        raise ValueError("cannot split an empty time ROI")
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    blue, green, red = cv2.split(image)
    mask = (
        (green > 90)
        & (green > red.astype(np.float32) * 1.25)
        & (green > blue.astype(np.float32) * 1.15)
    ).astype(np.uint8) * 255

    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    dot_centers: list[int] = []
    for x, _, width, height, area in stats[1:count]:
        if width <= 4 and height <= 3 and area >= 4:
            dot_centers.append(int(round(x + width / 2)))

    colon_centers: list[int] = []
    for center in sorted(dot_centers):
        if not colon_centers or center - colon_centers[-1] > 2:
            colon_centers.append(center)
    if len(colon_centers) != 2:
        raise ValueError(f"expected two time separators, found {len(colon_centers)}")

    occupied_columns = np.where(mask.any(axis=0))[0]
    if occupied_columns.size == 0:
        raise ValueError("time ROI does not contain green digits")
    left = int(occupied_columns.min())
    right = int(occupied_columns.max()) + 1
    first_colon, second_colon = colon_centers
    bounds = (
        (max(0, left - 4), max(left + 1, first_colon - 2)),
        (
            min(image.shape[1] - 1, first_colon + 3),
            max(first_colon + 4, second_colon - 2),
        ),
        (
            min(image.shape[1] - 1, second_colon + 3),
            min(image.shape[1], right + 4),
        ),
    )

    prepared: list[np.ndarray] = []
    for start, end in bounds:
        part = np.ascontiguousarray(image[:, start:end])
        if part.shape[0] <= 6 or part.shape[1] == 0:
            raise ValueError("time segment is too small")
        part = part[3:-3]

        part_blue, part_green, part_red = cv2.split(part)
        part_mask = (
            (part_green > 90)
            & (part_green > part_red.astype(np.float32) * 1.25)
            & (part_green > part_blue.astype(np.float32) * 1.15)
        ).astype(np.uint8) * 255
        inverted = cv2.cvtColor(255 - part_mask, cv2.COLOR_GRAY2BGR)
        prepared.append(prepare_ocr_image(inverted, target_height=72, padding=4))
    return prepared


def combine_time_predictions(parts: list[OcrPrediction]) -> OcrPrediction:
    if len(parts) != 3:
        raise ValueError(f"expected three time predictions, got {len(parts)}")
    texts = [part.text.strip() for part in parts]
    if not all(_TIME_PART_PATTERN.fullmatch(text) for text in texts):
        raise ValueError(f"invalid time segment predictions: {texts!r}")
    if len(texts[1]) != 2 or len(texts[2]) != 2:
        raise ValueError(f"time minute/second segments must have two digits: {texts!r}")
    if int(texts[1]) > 59 or int(texts[2]) > 59:
        raise ValueError(f"time minute/second segments are out of range: {texts!r}")
    return OcrPrediction(
        text=":".join(texts),
        confidence=min(part.confidence for part in parts),
    )
