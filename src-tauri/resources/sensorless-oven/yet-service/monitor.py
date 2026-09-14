"""Synchronous YET USB serial client for one temperature device."""

from __future__ import annotations

import time
from typing import Any

import serial

from protocol import (
    CMD_GET_CHANNEL_NOS,
    CMD_GET_DATA_DECIMALS,
    CMD_GET_DATA_TYPE,
    CMD_GET_FW_VER,
    CMD_GET_MODEL_NO,
    CMD_GET_SN,
    CMD_SET_REALTIMEREADY,
    CMD_SET_REALTIMESTOP,
    DATA_TYPE_FLOAT32,
    ProtocolError,
    YetPacket,
    build_command,
    decode_device_text,
    decode_float32,
    decode_u16,
    decode_u32,
    extract_frames,
    parse_packet,
    parse_realtime_payload,
)


class YetTemperatureMonitor:
    """Handshake, poll channel-1 temperature, and pause/resume the live stream."""

    def __init__(
        self,
        port: str,
        *,
        baudrate: int = 115200,
        channel_index: int = 0,
        command_timeout: float = 2.0,
        strict_checksum: bool = True,
    ) -> None:
        if not port:
            raise serial.SerialException("serial port is required")
        self.port = port
        self.baudrate = baudrate
        self.channel_index = max(0, channel_index)
        self.command_timeout = command_timeout
        self.strict_checksum = strict_checksum
        self.channel_count = 0
        self.decimal_places: list[int] = []
        self.metadata: dict[str, Any] = {}
        self.device_id: int | str = 0
        self._serial: serial.Serial | None = None
        self._receive_buffer = bytearray()
        self._streaming = False

    @property
    def sample_size(self) -> int:
        return max(1, self.channel_count) * 4

    def connect(self) -> dict[str, Any]:
        self.close()
        self._serial = serial.Serial(
            self.port,
            self.baudrate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=0,
            write_timeout=1,
        )
        self._serial.reset_input_buffer()
        self._serial.reset_output_buffer()
        self._receive_buffer.clear()
        self._initialize_device()
        return self.metadata

    def poll_once(self) -> float | None:
        if not self._serial or not self._streaming:
            return None
        chunk = self._read_available()
        if chunk:
            self._receive_buffer.extend(chunk)
        if len(self._receive_buffer) < self.sample_size:
            return None
        raw = bytes(self._receive_buffer[: self.sample_size])
        del self._receive_buffer[: self.sample_size]
        event = parse_realtime_payload(
            raw,
            channel_count=self.channel_count,
            device_id=int(self.device_id) if str(self.device_id).isdigit() else 0,
            command=CMD_SET_REALTIMEREADY,
            decimal_places=self.decimal_places,
        )
        if not event.realtime or not event.realtime.nodes:
            return None
        index = min(self.channel_index, len(event.realtime.nodes) - 1)
        return float(event.realtime.nodes[index].tem)

    def drain_samples(self) -> list[float]:
        values: list[float] = []
        while True:
            value = self.poll_once()
            if value is None:
                break
            values.append(value)
        return values

    def pause_stream(self) -> None:
        if not self._serial:
            return
        self._send_status_command(CMD_SET_REALTIMESTOP)
        self._streaming = False
        self._receive_buffer.clear()
        try:
            self._serial.reset_input_buffer()
        except (OSError, serial.SerialException):
            pass

    def resume_stream(self) -> None:
        if not self._serial:
            raise serial.SerialException(f"serial port is not open: {self.port}")
        self._receive_buffer.clear()
        try:
            self._serial.reset_input_buffer()
        except (OSError, serial.SerialException):
            pass
        self._send_status_command(CMD_SET_REALTIMEREADY)
        self._streaming = True

    def close(self) -> None:
        device = self._serial
        self._serial = None
        self._streaming = False
        self._receive_buffer.clear()
        if not device:
            return
        try:
            if getattr(device, "is_open", True):
                device.write(build_command(CMD_SET_REALTIMESTOP))
                device.flush()
                time.sleep(0.05)
        except (OSError, serial.SerialException):
            pass
        finally:
            try:
                device.close()
            except (OSError, serial.SerialException):
                pass

    def _initialize_device(self) -> None:
        self._send_status_command(CMD_SET_REALTIMESTOP)

        channel_packet = self._query(CMD_GET_CHANNEL_NOS)
        self.channel_count = decode_u16(channel_packet.payload)
        if not 1 <= self.channel_count <= 128:
            raise ProtocolError(f"unsupported YET channel count: {self.channel_count}")
        if self.channel_index >= self.channel_count:
            raise ProtocolError(
                f"{self.port} only has {self.channel_count} channel(s); cannot use index {self.channel_index}"
            )

        type_packet = self._query(CMD_GET_DATA_TYPE)
        if len(type_packet.payload) != 1:
            raise ProtocolError("YET data type response must be one byte")
        data_type = type_packet.payload[0]
        if data_type != DATA_TYPE_FLOAT32:
            raise ProtocolError(f"unsupported YET real-time data type: {data_type}")

        self.decimal_places = []
        for channel in range(1, self.channel_count + 1):
            decimal_packet = self._query(CMD_GET_DATA_DECIMALS, param1=channel)
            places = decode_u32(decimal_packet.payload)
            if places > 9:
                raise ProtocolError(
                    f"unsupported decimal-place value for channel {channel}: {places}"
                )
            self.decimal_places.append(places)

        model_packet = self._query(CMD_GET_MODEL_NO)
        firmware_packet = self._query(CMD_GET_FW_VER)
        serial_packet = self._query(CMD_GET_SN)

        model = decode_device_text(model_packet.payload)
        firmware = decode_float32(firmware_packet.payload)
        serial_number = decode_device_text(serial_packet.payload)
        self.device_id = int(serial_number) if serial_number.isdigit() else serial_number or 0

        self.metadata = {
            "port": self.port,
            "baudrate": self.baudrate,
            "channel_count": self.channel_count,
            "channel_index": self.channel_index,
            "data_type": "float32",
            "decimal_places": self.decimal_places,
            "model": model,
            "firmware": firmware,
            "serial_number": serial_number,
            "device_id": self.device_id,
        }
        self.resume_stream()

    def _query(self, command: int, *, param1: int = 0, payload: bytes = b"") -> YetPacket:
        self._receive_buffer.clear()
        self._write(build_command(command, param1=param1, payload=payload))
        deadline = time.monotonic() + self.command_timeout
        while time.monotonic() < deadline:
            chunk = self._read_available()
            if chunk:
                self._receive_buffer.extend(chunk)
                frames = extract_frames(self._receive_buffer)
                for frame in frames:
                    packet = parse_packet(frame, strict_checksum=self.strict_checksum)
                    if packet.command != command:
                        raise ProtocolError(
                            f"YET response command {packet.command:02X} does not match {command:02X}"
                        )
                    return packet
            time.sleep(0.01)
        raise TimeoutError(f"timed out waiting for YET command {command:02X} on {self.port}")

    def _send_status_command(self, command: int) -> None:
        self._receive_buffer.clear()
        self._write(build_command(command))
        deadline = time.monotonic() + self.command_timeout
        while time.monotonic() < deadline:
            chunk = self._read_available()
            if chunk:
                self._receive_buffer.extend(chunk)
            lower = bytes(self._receive_buffer).lower()
            ok_at = lower.find(b"ok")
            if ok_at >= 0:
                del self._receive_buffer[: ok_at + 2]
                return
            error_at = lower.find(b"er")
            if error_at >= 0:
                error = bytes(self._receive_buffer[error_at:]).decode("ascii", errors="replace")
                self._receive_buffer.clear()
                raise ProtocolError(f"YET command {command:02X} failed on {self.port}: {error}")
            time.sleep(0.01)
        raise TimeoutError(f"timed out waiting for YET status command {command:02X} on {self.port}")

    def _read_available(self) -> bytes:
        if not self._serial:
            return b""
        waiting = int(getattr(self._serial, "in_waiting", 0))
        return self._serial.read(waiting or 1)

    def _write(self, data: bytes) -> None:
        if not self._serial:
            raise serial.SerialException(f"serial port is not open: {self.port}")
        written = self._serial.write(data)
        if written != len(data):
            raise serial.SerialTimeoutException(f"incomplete serial write on {self.port}")
        self._serial.flush()
