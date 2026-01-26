from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer


@flojoy(inject_connection=True)
def CLOSE_IFB(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "4588C30FBFDF0FBFDF2588C3"
    data_bytes = bytes.fromhex(hex_data)
    ser.write(data_bytes)
    response = ser.read(3)
    response_str = response.hex()
    return String(s=response_str)
