from typing import Optional
import time

import numpy as np
from flojoy import (
    DataContainer,
    OrderedPair,
    SerialConnection,
    flojoy,
)

from blocks.HARDWARE.PULSER.READ_PULSER_WAVEFORM.pulser_protocol import (
    RAW_VALUE_MAX,
    scale_samples,
)
from flojoy.execution_log import record_execution_event
from blocks.HARDWARE.PULSER.READ_PULSER_WAVEFORM.pulser_stream import (
    get_or_start_pulser_reader,
)


def evaluate_pulser_movement(
    stream_status: dict,
    wave_scale: float,
    movement_timeout: float,
    movement_min_span: float,
    now_ms: int | None = None,
) -> None:
    """补充运动状态；超时仍无有效变化时抛错以阻断循环流。"""
    current_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
    movement_started_at_ms = int(
        stream_status.get("reader_started_at_ms") or current_ms
    )
    movement_elapsed_ms = max(current_ms - movement_started_at_ms, 0)
    actual_span = (
        float(stream_status.get("actual_span_raw", 0))
        * abs(float(wave_scale))
        * 16
        / RAW_VALUE_MAX
    )
    movement_confirmed = actual_span >= float(movement_min_span)
    stream_status["movement_confirmed"] = movement_confirmed
    stream_status["movement_elapsed_ms"] = movement_elapsed_ms
    stream_status["movement_actual_span"] = actual_span
    stream_status["movement_min_span"] = float(movement_min_span)

    if (
        not movement_confirmed
        and movement_elapsed_ms >= float(movement_timeout) * 1000
    ):
        raise RuntimeError(
            "脉冲器未运动：启动后 "
            f"{float(movement_timeout):g} 秒内实际曲线峰峰值仅 "
            f"{actual_span:.3f} mA，要求至少 "
            f"{float(movement_min_span):.3f} mA"
        )


@flojoy(deps={"pyserial": "3.5"}, inject_connection=True)
def READ_PULSER_WAVEFORM(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
    sample_count: int = 250,
    read_timeout: float = 1,
    wave_scale: float = 1,
    movement_timeout: float = 10,
    movement_min_span: float = 0.5,
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
    movement_timeout : float
        启动后确认脉冲器实际曲线发生有效变化的最长等待时间，单位秒。
    movement_min_span : float
        判定脉冲器已运动所需的实际曲线最小峰峰值，单位 mA。

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
    if movement_timeout <= 0:
        raise ValueError("movement_timeout 必须大于 0")
    if movement_min_span <= 0:
        raise ValueError("movement_min_span 必须大于 0")

    serial_handle = connection.get_handle()
    reader = get_or_start_pulser_reader(serial_handle)
    reader.wait_for_first_sample(min(float(read_timeout), 0.05))
    waveform_samples, stream_status = reader.snapshot(int(sample_count))
    record_execution_event(
        "device-response",
        "脉冲器自动上报波形数据",
        level=("info" if waveform_samples else "warning"),
        direction="receive",
        data={
            "transport": "serial-stream",
            "port": getattr(serial_handle, "port", ""),
            "sequence": stream_status.get("sequence", 0),
            "fresh": stream_status.get("fresh", False),
            "sampleCount": len(waveform_samples),
            "sampleAgeMs": stream_status.get("sample_age_ms"),
            "firstSamples": waveform_samples[:3],
            "lastSamples": waveform_samples[-3:],
            "readerError": stream_status.get("error", ""),
        },
    )
    try:
        evaluate_pulser_movement(
            stream_status,
            wave_scale,
            movement_timeout,
            movement_min_span,
        )
    except RuntimeError as exc:
        record_execution_event(
            "device-response",
            "脉冲器运动反馈校验失败",
            level="error",
            direction="receive",
            data={
                "transport": "serial-stream",
                "port": getattr(serial_handle, "port", ""),
                "error": str(exc),
                "streamStatus": stream_status,
            },
        )
        raise

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
