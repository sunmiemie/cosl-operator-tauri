from __future__ import annotations

import logging
import shutil
import threading
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any

import cv2
import numpy as np

from ..config import CaptureConfig
from ..domain import Frame, SourceSnapshot, SourceState
from .base import FrameSource, LatestFrameBuffer
from .status import MutableSourceStatus

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from playwright.sync_api import FloatRect, Page


class BrowserCaptureUnavailableError(RuntimeError):
    pass


def find_system_chromium() -> Path | None:
    candidates = [
        shutil.which("google-chrome"),
        shutil.which("google-chrome-stable"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]
    for candidate in candidates:
        if candidate:
            path = Path(candidate)
            if path.is_file():
                return path
    return None


class BrowserPageSource(FrameSource):
    """Capture one DOM element as a BGR video source for local validation."""

    def __init__(
        self, config: CaptureConfig, buffer: LatestFrameBuffer | None = None
    ) -> None:
        super().__init__(buffer)
        self._config = config
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._status = MutableSourceStatus()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._load_playwright()
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="browser-page-source", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        self._status.set_state(SourceState.STOPPED)

    def snapshot(self) -> SourceSnapshot:
        return self._status.snapshot()

    @staticmethod
    def _load_playwright():
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise BrowserCaptureUnavailableError(
                "browser capture requires the 'browser' extra: uv sync --extra browser"
            ) from exc
        return sync_playwright

    def _run(self) -> None:
        sync_playwright = self._load_playwright()
        backoffs = self._config.reconnect_backoff_seconds
        attempt = 0
        while not self._stop.is_set():
            received_frame = False
            try:
                self._status.set_state(SourceState.CONNECTING)
                with sync_playwright() as playwright:
                    executable = (
                        self._config.browser_executable_path or find_system_chromium()
                    )
                    if executable is not None:
                        browser = playwright.chromium.launch(
                            headless=True, executable_path=str(executable)
                        )
                    else:
                        browser = playwright.chromium.launch(headless=True)
                    try:
                        page = browser.new_page(
                            viewport={
                                "width": self._config.browser_viewport_width,
                                "height": self._config.browser_viewport_height,
                            },
                            device_scale_factor=1,
                        )
                        page.set_default_timeout(
                            self._config.browser_navigation_timeout_ms
                        )
                        if self._config.browser_disable_websockets:
                            page.add_init_script("delete window.WebSocket")
                        url = self._config.url
                        assert url is not None
                        page.goto(
                            url,
                            wait_until="networkidle",
                            timeout=self._config.browser_navigation_timeout_ms,
                        )
                        target = page.locator(self._config.browser_selector).first
                        target.wait_for(state="visible")
                        bounds = target.bounding_box()
                        if bounds is None:
                            raise RuntimeError("browser target has no visible bounds")
                        self._capture_loop(page, bounds)
                        received_frame = self.snapshot().sequence > 0
                    finally:
                        browser.close()
            except Exception as exc:
                error = str(exc)
                self._status.set_state(SourceState.ERROR, error)
                logger.error("browser capture failed", extra={"error": error})
            finally:
                self.buffer.clear()

            if self._stop.is_set():
                break
            if received_frame:
                attempt = 0
            delay = backoffs[min(attempt, len(backoffs) - 1)]
            attempt += 1
            self._status.mark_reconnect()
            self._stop.wait(delay)
        self._status.set_state(SourceState.STOPPED)

    def _capture_loop(self, page: Page, bounds: FloatRect) -> None:
        interval = 1.0 / self._config.fps
        source_started = time.monotonic()
        left = round(bounds["x"])
        top = round(bounds["y"])
        right = round(bounds["x"] + bounds["width"])
        bottom = round(bounds["y"] + bounds["height"])
        while not self._stop.is_set():
            started = time.monotonic()
            truth_before = self._read_ground_truth(page)
            encoded = page.screenshot(type="png", animations="disabled")
            truth_after = self._read_ground_truth(page)
            viewport = cv2.imdecode(
                np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_COLOR
            )
            if viewport is None:
                raise RuntimeError("browser screenshot could not be decoded")
            image = np.ascontiguousarray(viewport[top:bottom, left:right])
            height, width = image.shape[:2]
            if width != self._config.width or height != self._config.height:
                raise RuntimeError(
                    "browser target size mismatch: "
                    f"expected {self._config.width}x{self._config.height}, "
                    f"got {width}x{height}"
                )
            sequence, captured_at, monotonic_seconds = self._status.mark_frame(
                width, height
            )
            self.buffer.publish(
                Frame(
                    sequence=sequence,
                    captured_at=captured_at,
                    monotonic_seconds=monotonic_seconds,
                    image=image,
                    source_timestamp_ms=(monotonic_seconds - source_started) * 1000.0,
                    ground_truth=truth_after if truth_before == truth_after else None,
                )
            )
            self._stop.wait(max(0.0, interval - (time.monotonic() - started)))

    def _read_ground_truth(self, page: Page) -> dict[str, str] | None:
        expression = self._config.browser_truth_expression
        if expression is None:
            return None
        value: Any = page.evaluate(expression)
        if value is None:
            return None
        if not isinstance(value, dict):
            raise RuntimeError("browser truth expression must return an object")
        return {str(key): str(item) for key, item in value.items()}
