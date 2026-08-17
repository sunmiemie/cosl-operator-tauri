import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("pulser_protocol.py")
SPEC = importlib.util.spec_from_file_location("pulser_protocol", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
extract_actual_samples = MODULE.extract_actual_samples
extract_waveform_samples = MODULE.extract_waveform_samples
scale_actual_samples = MODULE.scale_actual_samples
scale_samples = MODULE.scale_samples


def make_frame(actual_raw: int, target_raw: int = 0) -> bytes:
    payload = bytearray(12)
    payload[6:8] = target_raw.to_bytes(2, "big")
    payload[8:10] = actual_raw.to_bytes(2, "big")
    return b"\xAA\xFF" + bytes(payload)


def test_extract_actual_samples_handles_noise_and_multiple_frames():
    buffer = bytearray(b"\x01\x02" + make_frame(100) + make_frame(200))
    assert extract_actual_samples(buffer) == [100, 200]
    assert buffer == bytearray()


def test_extract_waveform_samples_returns_target_and_actual_values():
    buffer = bytearray(make_frame(100, 10) + make_frame(200, 20))
    assert extract_waveform_samples(buffer) == [(10, 100), (20, 200)]
    assert buffer == bytearray()


def test_extract_actual_samples_preserves_partial_frame():
    frame = make_frame(1234)
    buffer = bytearray(frame[:8])
    assert extract_actual_samples(buffer) == []
    assert buffer == bytearray(frame[:8])

    buffer.extend(frame[8:])
    assert extract_actual_samples(buffer) == [1234]
    assert buffer == bytearray()


def test_extract_actual_samples_respects_batch_limit():
    buffer = bytearray(make_frame(10) + make_frame(20))
    assert extract_actual_samples(buffer, max_samples=1) == [10]
    assert extract_actual_samples(buffer, max_samples=1) == [20]


def test_scale_actual_samples_uses_original_waveform_conversion():
    scaled = scale_actual_samples([0, 65535])
    assert scaled == [4.0, 20.0]


def test_scale_samples_applies_same_conversion_to_target_values():
    scaled = scale_samples([0, 65535])
    assert scaled == [4.0, 20.0]
