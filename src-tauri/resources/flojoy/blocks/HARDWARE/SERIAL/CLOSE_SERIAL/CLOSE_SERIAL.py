from typing import Optional
from flojoy import SerialConnection, flojoy, DataContainer
from flojoy.connection_manager import DeviceConnectionManager


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

    if not DeviceConnectionManager.remove_connection(port):
        raise ValueError(f"Serial connection {port} does not exist")

    return default
