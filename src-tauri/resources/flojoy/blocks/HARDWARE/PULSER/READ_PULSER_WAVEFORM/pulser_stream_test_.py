import sys
import threading
import time
from pathlib import Path


FLOJOY_ROOT = Path(__file__).parents[4]
if str(FLOJOY_ROOT) not in sys.path:
    sys.path.insert(0, str(FLOJOY_ROOT))

from blocks.HARDWARE.PULSER.READ_PULSER_WAVEFORM.pulser_stream import (
    get_or_start_pulser_reader,
)


def make_frame(actual_raw: int, target_raw: int = 0) -> bytes:
    payload = bytearray(12)
    payload[6:8] = target_raw.to_bytes(2, "big")
    payload[8:10] = actual_raw.to_bytes(2, "big")
    return b"\xAA\xFF" + bytes(payload)


class FakeSerial:
    def __init__(self) -> None:
        self.port = "COM_TEST"
        self.timeout = 1
        self.is_open = True
        self._buffer = bytearray()
        self._lock = threading.Lock()

    @property
    def in_waiting(self) -> int:
        with self._lock:
            return len(self._buffer)

    def feed(self, value: bytes) -> None:
        with self._lock:
            self._buffer.extend(value)

    def read(self, size: int) -> bytes:
        deadline = time.monotonic() + float(self.timeout or 0)
        while self.is_open:
            with self._lock:
                if self._buffer:
                    read_size = min(size, len(self._buffer))
                    value = bytes(self._buffer[:read_size])
                    del self._buffer[:read_size]
                    return value
            if time.monotonic() >= deadline:
                return b""
            time.sleep(0.001)
        return b""


def test_background_reader_keeps_latest_samples_without_node_blocking():
    serial_handle = FakeSerial()
    reader = get_or_start_pulser_reader(serial_handle)
    serial_handle.feed(make_frame(100, 10) + make_frame(200, 20))
    reader.wait_for_first_sample(0.2)

    samples, status = reader.snapshot(250)
    assert samples == [(10, 100), (20, 200)]
    assert status["streaming"] is True
    assert status["fresh"] is True
    assert status["sequence"] == 2

    cached_samples, cached_status = reader.snapshot(250)
    assert cached_samples == [(10, 100), (20, 200)]
    assert cached_status["fresh"] is False

    reader.stop()
    assert reader.is_alive is False
    assert serial_handle.timeout == 1
