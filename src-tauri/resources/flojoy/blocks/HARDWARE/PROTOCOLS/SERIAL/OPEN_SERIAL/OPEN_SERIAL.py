import json
import logging
import serial
from flojoy import DataContainer, SerialDevice, flojoy, String
from flojoy.connection_manager import DeviceConnectionManager
from flojoy.execution_log import record_execution_event
from time import sleep
from typing import Literal, Optional


@flojoy(deps={"pyserial": "3.5"})
def OPEN_SERIAL(
    device: SerialDevice,
    baudrate: Literal[9600, 19200, 115200] = 9600,
    connection_time: float = 0,
    default: Optional[DataContainer] = None,
) -> String:
    """Open a serial connection through your computer's USB or RS-232 port.

    Parameters
    ----------
    device: Serial
        The connected serial device.

    Returns
    -------
    String
    """

    port = device.get_port()
    # 这里只设置单次 read() 的阻塞切片，避免一次读取长期占用执行线程。
    # 脉冲器指令只发送一次；后续节点会反复读取并拼接回执，累计等待上限固定为 3 分钟。
    serial_read_slice_timeout = 1
    record_execution_event(
        "device-command",
        f"打开串口 {port}",
        direction="send",
        data={
            "transport": "serial",
            "port": port,
            "baudrate": baudrate,
            "readSliceTimeoutSeconds": serial_read_slice_timeout,
            "pulserOperationTimeoutSeconds": 180,
            "connectionTime": connection_time,
        },
    )

    ser = None
    try:
        ser = serial.Serial(
            port=port,
            baudrate=baudrate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=serial_read_slice_timeout,
        )
        DeviceConnectionManager.register_connection(device, ser)
    except Exception as exc:
        if ser is not None and ser.is_open:
            ser.close()
        record_execution_event(
            "device-response",
            f"串口 {port} 打开失败：{exc}",
            level="error",
            direction="receive",
            data={"transport": "serial", "port": port},
        )
        raise

    if connection_time > 0:
        sleep(connection_time)

    settings = ser.get_settings()
    logging.info("Open serial port: %s, settings: %s", port, settings)
    record_execution_event(
        "device-response",
        f"串口 {port} 打开成功",
        direction="receive",
        data={"transport": "serial", "port": port, "settings": settings},
    )
    return String(s=json.dumps(settings))
