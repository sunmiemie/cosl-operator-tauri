from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer

from blocks.HARDWARE.TBUS.tbus_polling import logged_serial_exchange


@flojoy(inject_connection=True)
def CLOSE_IFB(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "4588C30FBFDF0FBFDF2588C3"
    response = logged_serial_exchange(
        ser,
        operation_name="CLOSE_IFB",
        command_hex=hex_data,
        expected_length=3,
    )
    response_str = response.hex()
    return String(s=response_str)
