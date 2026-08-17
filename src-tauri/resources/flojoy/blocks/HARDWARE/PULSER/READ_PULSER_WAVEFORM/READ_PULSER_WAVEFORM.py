from typing import Optional

import numpy as np
from flojoy import (
    DataContainer,
    OrderedPair,
    SerialConnection,
    flojoy,
)

from blocks.HARDWARE.PULSER.READ_PULSER_WAVEFORM.pulser_protocol import (
    scale_samples,
)
from blocks.HARDWARE.PULSER.READ_PULSER_WAVEFORM.pulser_stream import (
    get_or_start_pulser_reader,
)


@flojoy(deps={"pyserial": "3.5"}, inject_connection=True)
def READ_PULSER_WAVEFORM(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
    sample_count: int = 250,
    read_timeout: float = 1,
    wave_scale: float = 1,
) -> OrderedPair:
    """读取脉冲器后台自动上报缓存，不创建任何 Qt/PyGraph 窗口。

    Parameters
    ----------
    connection : SerialConnection
        已由 OPEN_SERIAL 以 115200 波特率打开的脉冲器串口。
    sample_count : int
        本轮返回的最新目标/实际曲线点数。
    read_timeout : float
        后台接收器首次启动时的等待时间；为避免阻塞流程，最多等待 50 ms。
    wave_scale : float
        与原 WAVEFORM_SHOW2 相同的波形缩放系数。

    Returns
    -------
    OrderedPair
        x 为本批次采样序号，y 为换算后的脉冲器实际曲线。
        extra.target_y 为同一批次的目标曲线，并包含自动上报接收器的
        streaming、fresh、sample_age_ms 等状态。
    """
    if sample_count <= 0:
        raise ValueError("sample_count 必须大于 0")
    if read_timeout <= 0:
        raise ValueError("read_timeout 必须大于 0")

    serial_handle = connection.get_handle()
    reader = get_or_start_pulser_reader(serial_handle)
    reader.wait_for_first_sample(min(float(read_timeout), 0.05))
    waveform_samples, stream_status = reader.snapshot(int(sample_count))
    target_raw = [sample[0] for sample in waveform_samples]
    actual_raw = [sample[1] for sample in waveform_samples]
    target_values = np.asarray(
        scale_samples(target_raw, wave_scale),
        dtype=np.float32,
    )
    actual_values = np.asarray(
        scale_samples(actual_raw, wave_scale),
        dtype=np.float32,
    )
    sample_indexes = np.arange(actual_values.size, dtype=np.float32)
    stream_status["target_y"] = target_values.tolist()
    return OrderedPair(
        x=sample_indexes,
        y=actual_values,
        extra=stream_status,
    )
