import json
import logging
from time import sleep
from typing import Optional

from flojoy import String, SerialConnection, flojoy, DataContainer


@flojoy(inject_connection=True)
def REOPEN_SERIAL(
        connection: SerialConnection,
        baudrate: int = 9600,
        timeout: int = 1,
        reopen_delay: float = 0,
        default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    # 保留 DeviceConnectionManager 中的同一个连接对象，只重开底层串口。
    # 如果先执行 CLOSE_SERIAL，连接会被注销，后续节点将无法注入该连接；
    # 如果再次执行 OPEN_SERIAL，则会因相同端口已注册而报 already exists。
    if ser.is_open:
        ser.close()

    if reopen_delay > 0:
        sleep(reopen_delay)

    ser.baudrate = baudrate
    ser.timeout = timeout
    ser.open()

    logging.info(
        "REOPEN SERIAL PORT:%s, BAUDRATE:%s",
        ser.port,
        baudrate,
    )

    return String(s=json.dumps(ser.get_settings()))
