from typing import Optional
from flojoy import SerialConnection, flojoy, DataContainer
from flojoy.connection_manager import DeviceConnectionManager
from flojoy.execution_log import record_execution_event


@flojoy(inject_connection=True)
def CLOSE_SERIAL(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    ser = connection.get_handle()
    port = ser.port

    # READ_PULSER_WAVEFORM 会在已打开的串口上挂载后台接收器。
    # 先通知接收器退出，再关闭和注销串口，避免关闭阶段仍有 read 调用。
    reader = getattr(ser, "_halt_hass_pulser_reader_state", None)
    stop_reader = getattr(reader, "stop", None)
    if callable(stop_reader):
        stop_reader()

    record_execution_event(
        "device-command",
        f"关闭串口 {port}",
        direction="send",
        data={"transport": "serial", "port": port},
    )
    if not DeviceConnectionManager.remove_connection(port):
        record_execution_event(
            "device-response",
            f"关闭串口 {port} 失败：连接不存在",
            level="error",
            direction="receive",
            data={"transport": "serial", "port": port},
        )
        raise ValueError(f"Serial connection {port} does not exist")

    record_execution_event(
        "device-response",
        f"串口 {port} 已关闭",
        direction="receive",
        data={"transport": "serial", "port": port},
    )

    return default
