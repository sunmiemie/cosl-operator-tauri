import logging
from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer
from flojoy.execution_log import record_execution_event

from blocks.HARDWARE.TBUS.tbus_decoder import decode_tbus_payload
from blocks.HARDWARE.TBUS.tbus_polling import bounded_tbus_query


logger = logging.getLogger(__name__)


@flojoy(inject_connection=True)
def READ_COMM(
        connection: SerialConnection,
        default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()
    response = bounded_tbus_query(
        ser,
        query_name="READ_COMM",
        command_hex="4F80D10080C220BFEC",
        expected_length=21,
    )
    if not response:
        logger.error("READ_COMM 未收到完整的 21 字节响应")
        return String(s="")

    serial_hex = response.hex().upper()
    logger.info("READ_COMM serial response: %s", serial_hex)
    try:
        tbus_hex, board_information = decode_tbus_payload(response)
    except (UnicodeDecodeError, ValueError) as exc:
        logger.error(
            "READ_COMM decode failed: serial_response=%s error=%s",
            serial_hex,
            exc,
        )
        record_execution_event(
            "device-response",
            "READ_COMM：串口回执解析失败",
            level="error",
            direction="receive",
            data={"responseHex": serial_hex, "error": str(exc)},
        )
        return String(s="")

    logger.info(
        "READ_COMM tbus response: %s; board information: %s",
        tbus_hex,
        board_information,
    )
    record_execution_event(
        "device-response",
        "READ_COMM：控制板信息解析完成",
        direction="receive",
        data={"tbusHex": tbus_hex, "boardInformation": board_information},
    )
    return String(s=board_information)
