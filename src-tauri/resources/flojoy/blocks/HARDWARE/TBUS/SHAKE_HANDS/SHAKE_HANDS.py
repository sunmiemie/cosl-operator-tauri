from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer


@flojoy(inject_connection=True)
def SHAKE_HANDS(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "4098D10080C30080E92FA7C4"
    data_bytes = bytes.fromhex(hex_data)
    ser.write(data_bytes)
    response = ser.read(9)
    response_str = response.hex()
    return String(s=response_str)
