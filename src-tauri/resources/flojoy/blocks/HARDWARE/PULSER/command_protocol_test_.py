import sys
from pathlib import Path

import pytest

FLOJOY_ROOT = Path(__file__).parents[3]
if str(FLOJOY_ROOT) not in sys.path:
    sys.path.insert(0, str(FLOJOY_ROOT))

from blocks.HARDWARE.PULSER.command_protocol import (
    crc8_bytes,
    exchange_pulser_command,
    extract_zero_position_payload,
    validate_pulser_response,
)


def response_frame(payload: bytes) -> bytes:
    return payload + bytes([crc8_bytes(payload)])


def test_validates_command_response_length_header_and_crc():
    response = response_frame(bytes.fromhex("55AB00"))
    assert validate_pulser_response(response, "测试写入", 4) == response.hex().upper()


def test_rejects_missing_command_response():
    with pytest.raises(RuntimeError, match="回执长度"):
        validate_pulser_response(b"", "测试写入", 4)


def test_rejects_bad_command_response_crc():
    with pytest.raises(RuntimeError, match="CRC 错误"):
        validate_pulser_response(bytes.fromhex("55AB0000"), "测试写入", 4)


def test_extracts_zero_position_only_from_valid_read_frame():
    response = response_frame(bytes.fromhex("55AA0102030405"))
    assert extract_zero_position_payload(response.hex()) == "0102030405"


def test_rejects_missing_zero_position_before_write():
    with pytest.raises(RuntimeError, match="未取得有效零位读取报文"):
        extract_zero_position_payload("")


def test_exchange_logs_raw_command_and_response(monkeypatch):
    response = response_frame(bytes.fromhex("55AB00"))
    events = []

    class FakeSerial:
        def __init__(self):
            self.written = b""

        def write(self, data: bytes):
            self.written = data
            return len(data)

        def read(self, size: int):
            assert size == 4
            return response

    monkeypatch.setattr(
        "blocks.HARDWARE.PULSER.command_protocol.record_execution_event",
        lambda event_type, message, **kwargs: events.append(
            {"eventType": event_type, "message": message, **kwargs}
        ),
    )
    serial_handle = FakeSerial()

    result = exchange_pulser_command(
        serial_handle,
        "55 AB 00 08",
        "测试写入",
        4,
    )

    assert serial_handle.written == bytes.fromhex("55AB0008")
    assert result == response.hex().upper()
    assert [event["direction"] for event in events] == ["send", "receive"]
    assert events[0]["data"]["commandHex"] == "55AB0008"
    assert events[1]["data"]["responseHex"] == response.hex().upper()


def test_exchange_sends_once_and_joins_partial_response(monkeypatch):
    response = response_frame(bytes.fromhex("55AB00"))
    chunks = [response[:2], response[2:]]

    class PartialSerial:
        def __init__(self):
            self.write_count = 0

        def write(self, _data: bytes):
            self.write_count += 1

        def read(self, _size: int):
            return chunks.pop(0)

    monkeypatch.setattr(
        "blocks.HARDWARE.PULSER.command_protocol.record_execution_event",
        lambda *_args, **_kwargs: None,
    )
    serial_handle = PartialSerial()

    assert exchange_pulser_command(
        serial_handle,
        "55AB0008",
        "测试写入",
        4,
    ) == response.hex().upper()
    assert serial_handle.write_count == 1
    assert chunks == []
