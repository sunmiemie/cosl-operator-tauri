import json
import serial
from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer


@flojoy(inject_connection=True)
def REOPEN_SERIAL(
        connection: SerialConnection,
        baudrate: int = 9600,
        timeout: int = 1,
        default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()
    ser.baudrate = baudrate
    ser.timeout = timeout
    ser.open()
    return String(s=json.dumps(ser.get_settings()))
