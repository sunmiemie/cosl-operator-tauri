from __future__ import annotations

from blocks.HARDWARE.DATA.tbus_command_transform import TbusCommandUtils
from blocks.HARDWARE.TBUS.tbus_decoder import decrypt


def normalize_hex(value: str, *, field_name: str) -> str:
    normalized = "".join(str(value).split()).upper()
    if not normalized:
        raise ValueError(f"{field_name} 不能为空")
    if len(normalized) % 2:
        raise ValueError(f"{field_name} 必须包含完整字节")
    try:
        bytes.fromhex(normalized)
    except ValueError as exc:
        raise ValueError(f"{field_name} 不是有效十六进制") from exc
    return normalized


def build_sds_echo_request(protocol_command: str) -> str:
    command = normalize_hex(protocol_command, field_name="TBUS 指令")
    serial_command = TbusCommandUtils.tbus2serial(command)
    if not serial_command:
        raise ValueError("TBUS 指令转换失败")
    return serial_command


def parse_sds_echo_response(
    serial_response: bytes,
    expected_value: str,
) -> tuple[str, bool]:
    if not serial_response:
        return "", False
    expected = normalize_hex(expected_value, field_name="期望返回值")
    decoded = decrypt(serial_response.hex())
    return decoded, expected in decoded
