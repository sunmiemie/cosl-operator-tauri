import logging
from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer

from blocks.HARDWARE.TBUS.tbus_polling import bounded_serial_query


logger = logging.getLogger(__name__)


@flojoy(inject_connection=True)
def READ_MEMORY_ADDRESS(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()
    response = bounded_serial_query(
        ser,
        query_name="READ_MEMORY_ADDRESS",
        command_hex="AA560007A1000400000000AB",
        expected_length=7,
    )
    serial_hex = response.hex().upper()
    if response:
        logger.info("READ_MEMORY_ADDRESS serial response: %s", serial_hex)
    else:
        logger.error("READ_MEMORY_ADDRESS 未收到完整的 7 字节响应")
    return String(s=serial_hex)
