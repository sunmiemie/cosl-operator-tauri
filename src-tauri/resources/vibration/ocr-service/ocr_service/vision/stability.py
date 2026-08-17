from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True, slots=True)
class StabilityResult:
    stable: bool
    images: list[np.ndarray]
    maximum_change_ratio: float | None


def stability_image(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    return cv2.GaussianBlur(gray, (3, 3), 0)


def changed_pixel_ratio(
    previous: np.ndarray, current: np.ndarray, pixel_delta: int
) -> float:
    difference = cv2.absdiff(previous, current)
    return float(np.count_nonzero(difference > pixel_delta) / difference.size)


def find_final_stable_streak(
    images: list[np.ndarray],
    *,
    streak_length: int,
    pixel_delta: int,
    maximum_changed_ratio: float,
) -> StabilityResult:
    if len(images) < streak_length:
        return StabilityResult(False, [], None)

    prepared = [stability_image(image) for image in images]
    streak_start = len(images) - 1
    ratios: list[float] = []
    for index in range(len(images) - 1, 0, -1):
        ratio = changed_pixel_ratio(prepared[index - 1], prepared[index], pixel_delta)
        if ratio > maximum_changed_ratio:
            break
        ratios.append(ratio)
        streak_start = index - 1
        if len(images) - streak_start >= streak_length:
            selected = images[-streak_length:]
            relevant = ratios[: streak_length - 1]
            return StabilityResult(True, selected, max(relevant, default=0.0))
    return StabilityResult(False, [], max(ratios, default=None))
