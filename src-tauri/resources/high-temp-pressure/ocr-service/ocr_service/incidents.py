from __future__ import annotations

import threading
import time
from datetime import UTC, datetime

import cv2
import numpy as np

from .config import StorageConfig
from .domain import ReadingStatus


class IncidentStore:
    def __init__(self, config: StorageConfig) -> None:
        self._config = config
        self._lock = threading.Lock()
        self._last_saved: dict[tuple[str, str], float] = {}

    def save(
        self,
        *,
        field_id: str,
        status: ReadingStatus,
        cycle_id: str,
        image: np.ndarray,
    ) -> str | None:
        key = (field_id, status.value)
        now_mono = time.monotonic()
        with self._lock:
            previous = self._last_saved.get(key)
            if previous is not None:
                elapsed = now_mono - previous
                if elapsed < self._config.incident_minimum_interval_seconds:
                    return None
            directory = self._config.incidents_dir / field_id
            directory.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
            path = directory / f"{timestamp}_{status.value}_{cycle_id}.png"
            if not cv2.imwrite(str(path), image):
                return None
            self._last_saved[key] = now_mono
            self._enforce_limit()
            return str(path)

    def _enforce_limit(self) -> None:
        files = sorted(
            (
                path
                for path in self._config.incidents_dir.rglob("*.png")
                if path.is_file()
            ),
            key=lambda path: path.stat().st_mtime,
        )
        total = sum(path.stat().st_size for path in files)
        for path in files:
            if total <= self._config.incident_maximum_bytes:
                break
            try:
                size = path.stat().st_size
                path.unlink()
                total -= size
            except FileNotFoundError:
                continue
