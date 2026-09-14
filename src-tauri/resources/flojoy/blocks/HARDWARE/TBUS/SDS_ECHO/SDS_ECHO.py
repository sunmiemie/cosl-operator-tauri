import logging
from typing import Optional

from flojoy import DataContainer, SerialConnection, String, flojoy

from blocks.HARDWARE.TBUS.sds_echo import (
    build_sds_echo_request,
    parse_sds_echo_response,
)
from blocks.HARDWARE.TBUS.tbus_polling import bounded_tbus_query


logger = logging.getLogger(__name__)


@flojoy(inject_connection=True)
def SDS_ECHO(
    connection: SerialConnection,
    protocol_command: str = "F9810002067C",
    expected_value: str = "005C",
    expected_length: int = 9,
    response_timeout: float = 0.35,
    default: Optional[DataContainer] = None,
) -> String:
    """发送 SDS TBUS ECHO 并校验协议返回值。"""
    serial_command = build_sds_echo_request(protocol_command)
    ser = connection.get_handle()
    response = bounded_tbus_query(
        ser,
        query_name=f"SDS_ECHO_{expected_value}",
        command_hex=serial_command,
        expected_length=expected_length,
        response_timeout=response_timeout,
    )
    if not response:
        raise TimeoutError(
            f"SDS ECHO 未收到完整响应：{protocol_command}，期望 {expected_length} 字节"
        )

    logger.info(
        "SDS_ECHO serial command: %s; serial response: %s",
        serial_command,
        response.hex().upper(),
    )
    decoded, matched = parse_sds_echo_response(response, expected_value)
    if not matched:
        raise ValueError(
            f"SDS ECHO 返回不匹配：期望 {expected_value}，实际 {decoded or '空'}"
        )

    logger.info("SDS_ECHO decoded response: %s", decoded)
    return String(s=decoded)
