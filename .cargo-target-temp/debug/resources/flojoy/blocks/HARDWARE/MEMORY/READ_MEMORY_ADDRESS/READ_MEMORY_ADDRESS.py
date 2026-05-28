from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer


@flojoy(inject_connection=True)
def READ_MEMORY_ADDRESS(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "AA560007A1000400000000AB"
    data_bytes = bytes.fromhex(hex_data)
    ser.write(data_bytes)
    response = ser.read(7)
    response_str = response.hex()
    return String(s=response_str)
