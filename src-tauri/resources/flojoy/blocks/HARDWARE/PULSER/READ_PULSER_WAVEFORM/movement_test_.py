import sys
from pathlib import Path

import pytest

FLOJOY_ROOT = Path(__file__).parents[4]
if str(FLOJOY_ROOT) not in sys.path:
    sys.path.insert(0, str(FLOJOY_ROOT))

from blocks.HARDWARE.PULSER.READ_PULSER_WAVEFORM.READ_PULSER_WAVEFORM import (
    evaluate_pulser_movement,
)


def test_confirms_motion_when_actual_curve_span_is_large_enough():
    status = {
        "reader_started_at_ms": 1_000,
        "actual_span_raw": 4_096,
    }
    evaluate_pulser_movement(status, 1, 10, 0.5, now_ms=2_000)
    assert status["movement_confirmed"] is True
    assert status["movement_actual_span"] >= 0.5


def test_blocks_flow_when_pulser_does_not_move_before_timeout():
    status = {
        "reader_started_at_ms": 1_000,
        "actual_span_raw": 100,
    }
    with pytest.raises(RuntimeError, match="脉冲器未运动"):
        evaluate_pulser_movement(status, 1, 10, 0.5, now_ms=11_000)
