import sys
import time
from pathlib import Path


FLOJOY_ROOT = Path(__file__).parents[3]
if str(FLOJOY_ROOT) not in sys.path:
    sys.path.insert(0, str(FLOJOY_ROOT))

from blocks.HARDWARE.TBUS.tbus_polling import bounded_tbus_query
from blocks.HARDWARE.TBUS.tbus_decoder import decode_tbus_payload, decrypt


class FakeSerial:
    def __init__(self, response: bytes) -> None:
        self.timeout = 1
        self.is_open = True
        self.response = response
        self.buffer = bytearray()
        self.written = b""

    @property
    def in_waiting(self) -> int:
        return len(self.buffer)

    def reset_input_buffer(self) -> None:
        self.buffer.clear()

    def write(self, value: bytes) -> None:
        self.written = value
        self.buffer.extend(self.response)

    def flush(self) -> None:
        return None

    def read(self, size: int) -> bytes:
        if not self.buffer:
            time.sleep(float(self.timeout or 0))
            return b""
        read_size = min(size, len(self.buffer))
        value = bytes(self.buffer[:read_size])
        del self.buffer[:read_size]
        return value


def test_bounded_query_returns_complete_frame_and_restores_timeout():
    serial_handle = FakeSerial(bytes(range(21)))
    result = bounded_tbus_query(
        serial_handle,
        query_name="READ_TEST",
        command_hex="0102",
        expected_length=21,
        response_timeout=0.05,
    )

    assert result == bytes(range(21))
    assert serial_handle.written == b"\x01\x02"
    assert serial_handle.timeout == 1


def test_bounded_query_times_out_without_raising():
    serial_handle = FakeSerial(b"")
    started_at = time.monotonic()
    result = bounded_tbus_query(
        serial_handle,
        query_name="READ_TEST_TIMEOUT",
        command_hex="0102",
        expected_length=21,
        response_timeout=0.04,
    )

    assert result == b""
    assert time.monotonic() - started_at < 0.15
    assert serial_handle.timeout == 1


def _encode_tbus_bytes(decoded: bytes) -> bytes:
    encoded = bytearray()
    for offset in range(0, len(decoded), 2):
        value = int.from_bytes(decoded[offset:offset + 2], "big")
        encoded.extend(
            (
                (value >> 12) & 0x0F,
                (value >> 6) & 0x3F,
                value & 0x3F,
            )
        )
    return bytes(encoded)


def test_tbus_decoder_extracts_ascii_board_information():
    decoded = bytes.fromhex("AA55") + b"INTERFACE1" + bytes.fromhex("1234")
    encoded = _encode_tbus_bytes(decoded)

    assert decrypt(encoded.hex()) == decoded.hex().upper()
    decoded_hex, payload = decode_tbus_payload(encoded)
    assert decoded_hex == decoded.hex().upper()
    assert payload == "INTERFACE1"
