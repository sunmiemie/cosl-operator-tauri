from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer
from time import sleep


@flojoy(inject_connection=True)
def READ_COMM(
        connection: SerialConnection,
        default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "4F80D10080C220BFEC"
    data_bytes = bytes.fromhex(hex_data)
    ser.write(data_bytes)
    sleep(1)
    response = ser.read(21)
    ser_response = response.hex()
    return String(s=ser_response)
