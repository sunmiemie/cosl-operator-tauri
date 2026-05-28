from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer
import logging


@flojoy(inject_connection=True)
def SET_STARTEND_ANGLES(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "55AB000853001841"
    logging.info(f"set startend angles command: {hex_data}")
    data_bytes = bytes.fromhex(hex_data)
    ser.write(data_bytes)
    response = ser.read(4)
    response_str = response.hex()
    return String(s=response_str)
