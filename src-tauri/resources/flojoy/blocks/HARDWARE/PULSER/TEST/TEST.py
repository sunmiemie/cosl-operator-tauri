from typing import Optional
import serial
from flojoy import String, SerialDevice, flojoy, DataContainer


@flojoy
def TEST(
        device: SerialDevice,
        default: Optional[DataContainer] = None,
) -> String:
    ser = serial.Serial(
        port=device.get_port(),
        baudrate=115200,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
        timeout=0.1,
    )

    hex_data = "55AA00003F"
    data_bytes = bytes.fromhex(hex_data)
    ser.write(data_bytes)
    # response = ser.read(8)
    # response_str = response.hex()
    return String(s=hex_data)
