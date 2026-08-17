from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer

from blocks.HARDWARE.TBUS.tbus_polling import bounded_tbus_query


@flojoy(inject_connection=True)
def READ_STATUS(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()
    response = bounded_tbus_query(
        ser,
        query_name="READ_STATUS",
        command_hex="40A8D10080C22F97EC",
        expected_length=33,
    )
    return String(s=response.hex())
