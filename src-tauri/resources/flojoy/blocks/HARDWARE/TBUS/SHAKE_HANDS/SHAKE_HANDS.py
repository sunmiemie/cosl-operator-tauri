from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer

from blocks.HARDWARE.TBUS.tbus_polling import logged_serial_exchange


@flojoy(inject_connection=True)
def SHAKE_HANDS(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "4098D10080C30080E92FA7C4"
    response = logged_serial_exchange(
        ser,
        operation_name="SHAKE_HANDS",
        command_hex=hex_data,
        expected_length=9,
    )
    response_str = response.hex()
    return String(s=response_str)
