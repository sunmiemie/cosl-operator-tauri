import importlib.util
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).with_name("halt_hass_duration_state.py")
SPEC = importlib.util.spec_from_file_location("halt_hass_duration_state", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
evaluate_duration_state = MODULE.evaluate_duration_state


def test_duration_loop_starts_and_tracks_remaining_time():
    state, finished = evaluate_duration_state(None, 10, 100)
    assert finished is False
    assert state["started_at_monotonic"] == 100
    assert state["remaining_seconds"] == 10

    state, finished = evaluate_duration_state(state, 10, 104.5)
    assert finished is False
    assert state["elapsed_seconds"] == 4.5
    assert state["remaining_seconds"] == 5.5


def test_duration_loop_finishes_at_deadline():
    state, _ = evaluate_duration_state(None, 10, 100)
    state, finished = evaluate_duration_state(state, 10, 110)
    assert finished is True
    assert state["remaining_seconds"] == 0


def test_duration_loop_rejects_negative_duration():
    with pytest.raises(ValueError):
        evaluate_duration_state(None, -1, 100)
