from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer

from blocks.HARDWARE.TBUS.tbus_polling import bounded_serial_query


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
    return String(
        s=response.hex().upper(),
        extra={
            "online": bool(response),
            "response_length": len(response),
        },
    )
