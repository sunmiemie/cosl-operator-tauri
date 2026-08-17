from typing import Iterable


SYNC_BYTES = b"\xAA\xFF"
PAYLOAD_SIZE = 12
FRAME_SIZE = len(SYNC_BYTES) + PAYLOAD_SIZE
TARGET_VALUE_OFFSET = 6
ACTUAL_VALUE_OFFSET = 8
RAW_VALUE_MAX = 65535


def extract_waveform_samples(
    buffer: bytearray,
    max_samples: int | None = None,
) -> list[tuple[int, int]]:
    """提取每帧的目标值和实际值，并保留不完整帧供下次继续。"""
    if max_samples is not None and max_samples <= 0:
        return []

    samples: list[tuple[int, int]] = []
    while max_samples is None or len(samples) < max_samples:
        sync_index = buffer.find(SYNC_BYTES)
        if sync_index < 0:
            # 末尾单独的 0xAA 可能是下一帧同步头的第一个字节。
            keep_sync_prefix = bool(buffer) and buffer[-1] == SYNC_BYTES[0]
            buffer[:] = SYNC_BYTES[:1] if keep_sync_prefix else b""
            break

        if sync_index:
            del buffer[:sync_index]

        if len(buffer) < FRAME_SIZE:
            break

        payload = buffer[len(SYNC_BYTES):FRAME_SIZE]
        target_raw = int.from_bytes(
            payload[TARGET_VALUE_OFFSET:TARGET_VALUE_OFFSET + 2],
            byteorder="big",
            signed=False,
        )
        actual_raw = int.from_bytes(
            payload[ACTUAL_VALUE_OFFSET:ACTUAL_VALUE_OFFSET + 2],
            byteorder="big",
            signed=False,
        )
        samples.append((target_raw, actual_raw))
        del buffer[:FRAME_SIZE]

    return samples


def extract_actual_samples(
    buffer: bytearray,
    max_samples: int | None = None,
) -> list[int]:
    """兼容旧调用方，只返回实际值。"""
    return [
        actual_raw
        for _, actual_raw in extract_waveform_samples(buffer, max_samples)
    ]


def scale_samples(
    raw_samples: Iterable[int],
    wave_scale: float = 1,
) -> list[float]:
    """沿用原 WAVEFORM_SHOW2 的 4~20 mA 曲线换算规则。"""
    scale = float(wave_scale)
    return [
        float(raw_value) * scale * 16 / RAW_VALUE_MAX + 4
        for raw_value in raw_samples
    ]


def scale_actual_samples(
    raw_samples: Iterable[int],
    wave_scale: float = 1,
) -> list[float]:
    """兼容旧调用方的实际值换算函数。"""
    return scale_samples(raw_samples, wave_scale)
