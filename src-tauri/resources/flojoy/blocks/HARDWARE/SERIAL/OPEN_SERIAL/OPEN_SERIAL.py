import json
import serial
from flojoy import SerialDevice, flojoy, String, DataContainer
from flojoy.connection_manager import DeviceConnectionManager
from typing import Optional
from time import sleep
import logging


@flojoy(deps={"pyserial": "3.5"})
def OPEN_SERIAL(
        device: SerialDevice,
        baudrate: int = 9600,
        timeout: int = 1,
        connection_time: float = 0,
        default: Optional[DataContainer] = None,
) -> String:
    # 与现场验证脚本保持一致：-1 表示不设置串口读取超时，
    # 后续读零节点只发送一次指令并持续等待设备回执。
    actual_timeout = None if timeout == -1 else timeout
    ser = serial.Serial(
        port=device.get_port(),
        baudrate=baudrate,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
        timeout=actual_timeout,
    )
    logging.info(f"OPEN SERIAL PORT:{device.get_port()}")
    DeviceConnectionManager.register_connection(device, ser)

    if connection_time > 0:
        sleep(connection_time)

    return String(s=json.dumps(ser.get_settings()))
