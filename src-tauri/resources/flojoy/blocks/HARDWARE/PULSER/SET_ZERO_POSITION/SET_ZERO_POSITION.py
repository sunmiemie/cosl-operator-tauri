from flojoy import String, SerialConnection, flojoy
import logging

from blocks.HARDWARE.PULSER.command_protocol import (
    crc8_hex,
    exchange_pulser_command,
    extract_zero_position_payload,
)


def crc8(data_hex: str) -> str:
    """保留旧入口，实际计算统一由脉冲器协议模块完成。"""
    return crc8_hex(data_hex)


@flojoy(inject_connection=True)
def SET_ZERO_POSITION(
        connection: SerialConnection,
        default: String,
) -> String:
    ser = connection.get_handle()
    if default is None or not getattr(default, "s", ""):
        raise RuntimeError("写入脉冲器零位失败：前置零位读取结果为空")
    zero_position_payload = extract_zero_position_payload(default.s)
    hex_base = f"55AB000B52{zero_position_payload}"
    crc = crc8(hex_base)
    hex_data = f"{hex_base}{crc}"
    logging.info(f"set zero position command: {hex_data.upper()}")
    response_str = exchange_pulser_command(
        ser,
        hex_data,
        "写入脉冲器零位",
        4,
    )
    logging.info("set zero position response: %s", response_str)
    return String(s=response_str)
