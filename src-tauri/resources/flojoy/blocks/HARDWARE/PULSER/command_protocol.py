from __future__ import annotations

import time
from typing import Protocol

from flojoy.execution_log import record_execution_event


PULSER_OPERATION_TIMEOUT_SECONDS = 180.0
PULSER_READ_POLL_INTERVAL_SECONDS = 0.05


class PulserSerialHandle(Protocol):
    def write(self, data: bytes) -> int | None: ...

    def read(self, size: int) -> bytes: ...


def crc8_bytes(data: bytes) -> int:
    """计算脉冲器协议使用的 CRC-8（poly=0x31）。"""
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ 0x31) & 0xFF
            else:
                crc = (crc << 1) & 0xFF
    return crc


def crc8_hex(data_hex: str) -> str:
    return f"{crc8_bytes(bytes.fromhex(data_hex)):02X}"


def validate_pulser_response(
    response: bytes,
    operation: str,
    expected_length: int,
) -> str:
    """校验脉冲器回执长度、帧头和 CRC，并返回大写十六进制文本。"""
    response_hex = response.hex().upper()
    if len(response) != expected_length:
        raise RuntimeError(
            f"{operation}失败：回执长度应为 {expected_length} 字节，"
            f"实际 {len(response)} 字节，报文 {response_hex or '<empty>'}"
        )
    if response[0] != 0x55:
        raise RuntimeError(
            f"{operation}失败：回执帧头无效，报文 {response_hex}"
        )
    expected_crc = crc8_bytes(response[:-1])
    if response[-1] != expected_crc:
        raise RuntimeError(
            f"{operation}失败：回执 CRC 错误，"
            f"期望 {expected_crc:02X}，实际 {response[-1]:02X}，"
            f"报文 {response_hex}"
        )
    return response_hex


def extract_zero_position_payload(response_hex: str) -> str:
    """再次校验零位读取帧，并提取写入指令所需的 5 字节参数。"""
    if not isinstance(response_hex, str) or not response_hex.strip():
        raise RuntimeError("写入脉冲器零位失败：未取得有效零位读取报文")
    try:
        response = bytes.fromhex(response_hex)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("写入脉冲器零位失败：未取得有效零位读取报文") from exc

    normalized = validate_pulser_response(response, "读取脉冲器零位", 8)
    payload = normalized[4:14]
    if len(payload) != 10:
        raise RuntimeError("写入脉冲器零位失败：零位参数长度不足 5 字节")
    return payload


def exchange_pulser_command(
    serial_handle: PulserSerialHandle,
    command_hex: str,
    operation: str,
    expected_response_length: int,
) -> str:
    """指令只发送一次，并按串口配置等待、拼接完整设备回执。"""
    normalized_command = command_hex.replace(" ", "").upper()
    command = bytes.fromhex(normalized_command)
    wait_forever = getattr(serial_handle, "timeout", None) is None
    deadline = (
        None
        if wait_forever
        else time.monotonic() + PULSER_OPERATION_TIMEOUT_SECONDS
    )
    record_execution_event(
        "device-command",
        f"{operation}：发送串口指令",
        direction="send",
        data={
            "transport": "serial",
            "commandHex": normalized_command,
            "expectedResponseLength": expected_response_length,
            "waitMode": "infinite" if wait_forever else "up-to-180-seconds",
        },
    )
    serial_handle.write(command)

    response = bytearray()
    while len(response) < expected_response_length and (
        deadline is None or time.monotonic() < deadline
    ):
        if getattr(serial_handle, "is_open", True) is False:
            message = f"{operation}失败：串口连接已关闭，已阻止后续测试"
            record_execution_event(
                "device-response",
                f"{operation}：串口连接在等待回执时被关闭",
                level="error",
                direction="receive",
                data={
                    "responseHex": response.hex().upper() or "<empty>",
                    "responseLength": len(response),
                    "expectedResponseLength": expected_response_length,
                },
            )
            raise RuntimeError(message)
        try:
            chunk = serial_handle.read(expected_response_length - len(response))
        except (AttributeError, OSError) as exc:
            # Windows pyserial 在句柄被其它线程/进程清理时可能抛出
            # "NoneType has no attribute hEvent"。将底层异常转换为业务失败，
            # 避免原始驱动异常继续扩散。
            record_execution_event(
                "device-response",
                f"{operation}：读取串口回执失败",
                level="error",
                direction="receive",
                data={
                    "responseHex": response.hex().upper() or "<empty>",
                    "responseLength": len(response),
                    "expectedResponseLength": expected_response_length,
                    "error": str(exc),
                },
            )
            raise RuntimeError(
                f"{operation}失败：串口连接异常，已阻止后续测试"
            ) from exc
        if chunk:
            response.extend(chunk)
        else:
            # timeout=-1 会映射为 None，真实串口会一直阻塞到收到数据；
            # 测试桩或有限超时串口返回空字节时，仅等待，不重复发送指令。
            if deadline is None:
                time.sleep(PULSER_READ_POLL_INTERVAL_SECONDS)
            else:
                remaining = deadline - time.monotonic()
                if remaining > 0:
                    time.sleep(min(PULSER_READ_POLL_INTERVAL_SECONDS, remaining))

    response_bytes = bytes(response)
    response_hex = response_bytes.hex().upper()
    if len(response_bytes) != expected_response_length:
        record_execution_event(
            "device-response",
            f"{operation}：等待 3 分钟仍未收到完整回执",
            level="error",
            direction="receive",
            data={
                "responseHex": response_hex or "<empty>",
                "responseLength": len(response_bytes),
                "expectedResponseLength": expected_response_length,
            },
        )
        raise RuntimeError(
            f"{operation}失败：3 分钟内未收到完整回执，"
            f"实际 {len(response_bytes)}/{expected_response_length} 字节，"
            "已阻止后续测试"
        )

    try:
        validated = validate_pulser_response(
            response_bytes,
            operation,
            expected_response_length,
        )
    except RuntimeError as exc:
        record_execution_event(
            "device-response",
            f"{operation}：收到无效串口回执",
            level="error",
            direction="receive",
            data={
                "responseHex": response_hex,
                "responseLength": len(response_bytes),
                "expectedResponseLength": expected_response_length,
                "error": str(exc),
            },
        )
        raise
    record_execution_event(
        "device-response",
        f"{operation}：收到有效串口回执",
        direction="receive",
        data={
            "responseHex": validated,
            "responseLength": len(response_bytes),
            "expectedResponseLength": expected_response_length,
        },
    )
    return validated
