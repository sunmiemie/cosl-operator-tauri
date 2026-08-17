from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any

from blocks.HARDWARE.PULSER.READ_PULSER_WAVEFORM.pulser_protocol import (
    extract_waveform_samples,
)


READER_STATE_ATTRIBUTE = "_halt_hass_pulser_reader_state"
DEFAULT_BUFFER_CAPACITY = 10_000
SERIAL_READ_TIMEOUT_SECONDS = 0.05


class PulserStreamReader:
    """持续消费脉冲器自动上报帧，并提供无阻塞的最新数据快照。"""

    def __init__(
        self,
        serial_handle: Any,
        capacity: int = DEFAULT_BUFFER_CAPACITY,
    ) -> None:
        self.serial_handle = serial_handle
        self._samples: deque[tuple[int, int]] = deque(
            maxlen=max(int(capacity), 1)
        )
        self._rx_buffer = bytearray()
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._sample_event = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            name=f"halt-hass-pulser-{getattr(serial_handle, 'port', 'serial')}",
            daemon=True,
        )
        self._sequence = 0
        self._last_reported_sequence = 0
        self._last_sample_at_ms = 0
        self._last_error = ""

    @property
    def is_alive(self) -> bool:
        return self._thread.is_alive()

    def start(self) -> None:
        if not self._thread.is_alive():
            self._thread.start()

    def stop(self, join_timeout: float = 0.25) -> None:
        self._stop_event.set()
        if (
            self._thread.is_alive()
            and threading.current_thread() is not self._thread
        ):
            self._thread.join(timeout=max(float(join_timeout), 0))

    def wait_for_first_sample(self, timeout: float) -> None:
        if self._sample_event.is_set():
            return
        self._sample_event.wait(timeout=max(float(timeout), 0))

    def snapshot(
        self,
        sample_count: int,
    ) -> tuple[list[tuple[int, int]], dict[str, Any]]:
        count = max(int(sample_count), 0)
        now_ms = int(time.time() * 1000)
        with self._lock:
            samples = list(self._samples)[-count:] if count else []
            sequence = self._sequence
            fresh = sequence > self._last_reported_sequence
            self._last_reported_sequence = sequence
            last_sample_at_ms = self._last_sample_at_ms
            last_error = self._last_error

        return samples, {
            "streaming": self.is_alive and not self._stop_event.is_set(),
            "fresh": fresh,
            "sequence": sequence,
            "sample_count": len(samples),
            "last_sample_at_ms": last_sample_at_ms,
            "sample_age_ms": (
                max(now_ms - last_sample_at_ms, 0)
                if last_sample_at_ms
                else None
            ),
            "error": last_error,
        }

    def _run(self) -> None:
        previous_timeout = getattr(self.serial_handle, "timeout", None)
        timeout_changed = False
        try:
            try:
                self.serial_handle.timeout = SERIAL_READ_TIMEOUT_SECONDS
                timeout_changed = True
            except (AttributeError, TypeError, ValueError):
                pass

            while (
                not self._stop_event.is_set()
                and getattr(self.serial_handle, "is_open", True)
            ):
                try:
                    waiting = int(
                        getattr(self.serial_handle, "in_waiting", 0) or 0
                    )
                    read_size = min(max(waiting, 1), 4096)
                    chunk = self.serial_handle.read(read_size)
                    if not chunk:
                        continue

                    self._rx_buffer.extend(chunk)
                    samples = extract_waveform_samples(self._rx_buffer)
                    if not samples:
                        continue

                    with self._lock:
                        self._samples.extend(samples)
                        self._sequence += len(samples)
                        self._last_sample_at_ms = int(time.time() * 1000)
                        self._last_error = ""
                    self._sample_event.set()
                except Exception as exc:
                    with self._lock:
                        self._last_error = str(exc)
                    if not getattr(self.serial_handle, "is_open", False):
                        break
                    self._stop_event.wait(SERIAL_READ_TIMEOUT_SECONDS)
        finally:
            if timeout_changed and getattr(self.serial_handle, "is_open", False):
                try:
                    self.serial_handle.timeout = previous_timeout
                except (AttributeError, TypeError, ValueError):
                    pass


def get_or_start_pulser_reader(serial_handle: Any) -> PulserStreamReader:
    existing = getattr(serial_handle, READER_STATE_ATTRIBUTE, None)
    if isinstance(existing, PulserStreamReader) and existing.is_alive:
        return existing

    reader = PulserStreamReader(serial_handle)
    setattr(serial_handle, READER_STATE_ATTRIBUTE, reader)
    reader.start()
    return reader
