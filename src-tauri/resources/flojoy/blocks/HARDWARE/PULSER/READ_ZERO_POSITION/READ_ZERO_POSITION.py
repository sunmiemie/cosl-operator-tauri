from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer


@flojoy(inject_connection=True)
def READ_ZERO_POSITION(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "55AA00003F"
    data_bytes = bytes.fromhex(hex_data)
    ser.write(data_bytes)
    response = ser.read(8)
    response_str = response.hex()
    return String(s=response_str)
