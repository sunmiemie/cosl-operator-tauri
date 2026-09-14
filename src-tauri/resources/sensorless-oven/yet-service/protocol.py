"""YET customer protocol encoding and real-time data parsing.

The protocol document calls multi-byte fields "big endian", but both its byte
example and the connected device use least-significant-byte first.  The
two-byte checksum is CRC-16/XMODEM over ``cmd`` through the payload, also
stored little endian.

Framed command/response layout::

    '*' + crc16(2) + cmd(1) + address(4) + length(4) + param1(4) + payload(N)

After ``CMD_SET_REALTIME_READY`` succeeds, the device sends unframed
little-endian float32 values, one value per channel for every sample.
"""

from __future__ import annotations

import binascii
import math
import struct
from dataclasses import dataclass, field
from typing import Any, Literal


FRAME_START = ord("*")
BASE_FRAME_LENGTH = 16
MAX_PAYLOAD_LENGTH = 512

CMD_GET_CHANNEL_NOS = 0x00
CMD_GET_DATA_TYPE = 0x02
CMD_GET_DATA_DECIMALS = 0x08
CMD_GET_MODEL_NO = 0x0E
CMD_GET_FW_VER = 0x0F
CMD_GET_SN = 0x10
CMD_GET_REALTIMEDATA = 0x15
CMD_SET_REALTIMEREADY = 0x17
CMD_SET_REALTIMESTOP = 0x18

DATA_TYPE_FLOAT32 = 5

MetricProfile = Literal["temperature"]


class ProtocolError(ValueError):
    """Raised when YET protocol data is malformed or unsupported."""


def checksum(data: bytes | bytearray) -> int:
    """Return the CRC-16/XMODEM value used by the device."""

    return binascii.crc_hqx(bytes(data), 0)


def validate_checksum(frame: bytes) -> bool:
    if len(frame) < BASE_FRAME_LENGTH or frame[0] != FRAME_START:
        return False
    expected = struct.unpack_from("<H", frame, 1)[0]
    return expected == checksum(frame[3:])


def command_code(frame: bytes) -> str:
    if len(frame) < BASE_FRAME_LENGTH or frame[0] != FRAME_START:
        raise ProtocolError("frame too short to contain a YET command")
    return f"{frame[3]:02X}"


def build_command(
    command: int,
    *,
    address: int = 0,
    param1: int = 0,
    payload: bytes = b"",
) -> bytes:
    if not 0 <= command <= 0xFF:
        raise ProtocolError("command must fit in one byte")
    if not 0 <= address <= 0xFFFFFFFF:
        raise ProtocolError("address must fit in an unsigned 32-bit integer")
    if not 0 <= param1 <= 0xFFFFFFFF:
        raise ProtocolError("param1 must fit in an unsigned 32-bit integer")
    if len(payload) > MAX_PAYLOAD_LENGTH:
        raise ProtocolError("payload exceeds the YET 512-byte limit")

    frame = bytearray(BASE_FRAME_LENGTH + len(payload))
    frame[0] = FRAME_START
    frame[3] = command
    struct.pack_into("<I", frame, 4, address)
    struct.pack_into("<I", frame, 8, len(payload))
    struct.pack_into("<I", frame, 12, param1)
    frame[BASE_FRAME_LENGTH:] = payload
    struct.pack_into("<H", frame, 1, checksum(frame[3:]))
    return bytes(frame)


def extract_frames(buffer: bytearray) -> list[bytes]:
    """Extract complete framed YET responses from a mutable serial buffer."""

    frames: list[bytes] = []
    while True:
        try:
            start = buffer.index(FRAME_START)
        except ValueError:
            buffer.clear()
            return frames

        if start:
            del buffer[:start]
        if len(buffer) < BASE_FRAME_LENGTH:
            return frames

        payload_length = struct.unpack_from("<I", buffer, 8)[0]
        if payload_length > MAX_PAYLOAD_LENGTH:
            del buffer[0]
            continue

        frame_length = BASE_FRAME_LENGTH + payload_length
        if len(buffer) < frame_length:
            return frames

        frames.append(bytes(buffer[:frame_length]))
        del buffer[:frame_length]


@dataclass(frozen=True)
class YetPacket:
    command: int
    address: int
    param1: int
    payload: bytes = field(repr=False)
    raw_frame: bytes = field(repr=False)

    @property
    def payload_length(self) -> int:
        return len(self.payload)

    def to_dict(self) -> dict[str, Any]:
        return {
            "command": f"{self.command:02X}",
            "address": self.address,
            "length": self.payload_length,
            "param1": self.param1,
            "payload_hex": self.payload.hex().upper(),
            "raw_hex": self.raw_frame.hex().upper(),
        }


def parse_packet(frame: bytes, *, strict_checksum: bool = True) -> YetPacket:
    if len(frame) < BASE_FRAME_LENGTH or frame[0] != FRAME_START:
        raise ProtocolError("invalid YET frame boundary")

    payload_length = struct.unpack_from("<I", frame, 8)[0]
    if payload_length > MAX_PAYLOAD_LENGTH:
        raise ProtocolError("declared payload exceeds the YET 512-byte limit")
    if len(frame) != BASE_FRAME_LENGTH + payload_length:
        raise ProtocolError("YET frame length does not match its payload length")
    if strict_checksum and not validate_checksum(frame):
        raise ProtocolError("invalid YET CRC-16/XMODEM checksum")

    return YetPacket(
        command=frame[3],
        address=struct.unpack_from("<I", frame, 4)[0],
        param1=struct.unpack_from("<I", frame, 12)[0],
        payload=frame[BASE_FRAME_LENGTH:],
        raw_frame=frame,
    )


def decode_u16(payload: bytes) -> int:
    if len(payload) != 2:
        raise ProtocolError("expected a 2-byte unsigned integer")
    return struct.unpack("<H", payload)[0]


def decode_u32(payload: bytes) -> int:
    if len(payload) != 4:
        raise ProtocolError("expected a 4-byte unsigned integer")
    return struct.unpack("<I", payload)[0]


def decode_float32(payload: bytes) -> float:
    if len(payload) != 4:
        raise ProtocolError("expected a 4-byte float")
    value = struct.unpack("<f", payload)[0]
    if not math.isfinite(value):
        raise ProtocolError("real-time value is not finite")
    return value


def decode_device_text(payload: bytes) -> str:
    """Decode the device's NUL/0xFF-padded ASCII identification fields."""

    terminator = len(payload)
    for marker in (b"\x00", b"\xff"):
        index = payload.find(marker)
        if index >= 0:
            terminator = min(terminator, index)
    return payload[:terminator].decode("ascii", errors="replace").strip()


@dataclass(frozen=True)
class NodeData:
    node_id: int
    tem: float
    hum: float
    raw: bytes = field(repr=False)

    @property
    def float_value(self) -> float:
        return decode_float32(self.raw)

    @property
    def signed_int32_value(self) -> int:
        if len(self.raw) != 4:
            raise ProtocolError("node raw value must be four bytes")
        return struct.unpack("<i", self.raw)[0]

    @property
    def unsigned_int32_value(self) -> int:
        if len(self.raw) != 4:
            raise ProtocolError("node raw value must be four bytes")
        return struct.unpack("<I", self.raw)[0]

    def to_dict(self) -> dict[str, Any]:
        return {
            "node_id": self.node_id,
            "temperature": self.tem,
            "second_value": self.hum,
            "float_value": self.float_value,
            "signed_int32_value": self.signed_int32_value,
            "unsigned_int32_value": self.unsigned_int32_value,
            "raw_hex": self.raw.hex().upper(),
        }


@dataclass(frozen=True)
class RealTimeData:
    device_id: int
    nodes: list[NodeData]
    lng: float = 0.0
    lat: float = 0.0
    coordinate_type: int = 0
    relay_status: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "nodes": [node.to_dict() for node in self.nodes],
            "lng": self.lng,
            "lat": self.lat,
            "coordinate_type": self.coordinate_type,
            "relay_status": self.relay_status,
        }


@dataclass(frozen=True)
class FrameEvent:
    event_type: str
    command: str
    device_id: int
    raw_frame: bytes = field(repr=False)
    realtime: RealTimeData | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "event_type": self.event_type,
            "command": self.command,
            "device_id": self.device_id,
            "raw_hex": self.raw_frame.hex().upper(),
        }
        if self.realtime:
            payload["realtime"] = self.realtime.to_dict()
        return payload


def parse_realtime_payload(
    payload: bytes,
    *,
    channel_count: int | None = None,
    device_id: int = 0,
    command: int = CMD_SET_REALTIMEREADY,
    decimal_places: list[int] | None = None,
) -> FrameEvent:
    if channel_count is None:
        if not payload or len(payload) % 4:
            raise ProtocolError("real-time payload must contain whole float32 values")
        channel_count = len(payload) // 4
    if not 1 <= channel_count <= MAX_PAYLOAD_LENGTH // 4:
        raise ProtocolError("invalid real-time channel count")
    if len(payload) != channel_count * 4:
        raise ProtocolError("real-time payload length does not match channel count")
    if decimal_places is not None and len(decimal_places) != channel_count:
        raise ProtocolError("decimal-place metadata does not match channel count")

    nodes: list[NodeData] = []
    for index in range(channel_count):
        raw = payload[index * 4 : index * 4 + 4]
        value = decode_float32(raw)
        if decimal_places is not None:
            value = round(value, decimal_places[index])
        nodes.append(NodeData(index + 1, value, 0.0, raw))

    realtime = RealTimeData(device_id=device_id, nodes=nodes)
    return FrameEvent(
        event_type="realtime",
        command=f"{command:02X}",
        device_id=device_id,
        raw_frame=payload,
        realtime=realtime,
    )


def parse_frame(
    frame: bytes,
    *,
    strict_checksum: bool = True,
    device_id: int = 0,
) -> FrameEvent:
    packet = parse_packet(frame, strict_checksum=strict_checksum)
    if packet.command == CMD_GET_REALTIMEDATA:
        return parse_realtime_payload(
            packet.payload,
            device_id=device_id,
            command=packet.command,
        )
    return FrameEvent(
        event_type="response",
        command=f"{packet.command:02X}",
        device_id=device_id,
        raw_frame=frame,
    )


def map_metrics(
    realtime: RealTimeData, profile: MetricProfile = "temperature"
) -> list[dict[str, Any]]:
    if profile != "temperature":
        raise ProtocolError(f"unsupported metric profile: {profile}")

    return [
        {
            "key": "TEMPERATURE",
            "param_id": -1000 + 2 * (node.node_id - 1) + 1,
            "node_id": node.node_id,
            "source": "temperature",
            "value": node.tem,
            "unit": "C",
        }
        for node in realtime.nodes
    ]
