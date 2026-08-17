import sys
from pathlib import Path


FLOJOY_ROOT = Path(__file__).parents[3]
if str(FLOJOY_ROOT) not in sys.path:
    sys.path.insert(0, str(FLOJOY_ROOT))

from blocks.HARDWARE.ITECH.itech_polling import bounded_itech_measurement


class FakeInstrument:
    def __init__(self) -> None:
        self.timeout = 2000
        self.response = "48.1"
        self.error: Exception | None = None

    def query(self, command: str) -> str:
        assert command == "MEAS:VOLT?"
        if self.error:
            raise self.error
        return self.response


def test_measurement_caches_last_valid_value_and_restores_timeout():
    instrument = FakeInstrument()
    value, status = bounded_itech_measurement(
        instrument,
        measurement_name="MEASURE_TEST",
        command="MEAS:VOLT?",
        cache_key="voltage",
        timeout_ms=350,
    )

    assert value == 48.1
    assert status["valid"] is True
    assert status["fresh"] is True
    assert instrument.timeout == 2000

    instrument.error = TimeoutError("timed out")
    cached_value, cached_status = bounded_itech_measurement(
        instrument,
        measurement_name="MEASURE_TEST",
        command="MEAS:VOLT?",
        cache_key="voltage",
        timeout_ms=350,
    )

    assert cached_value == 48.1
    assert cached_status["valid"] is True
    assert cached_status["fresh"] is False
    assert "timed out" in cached_status["error"]


def test_first_failure_returns_invalid_snapshot_without_raising():
    instrument = FakeInstrument()
    instrument.error = OSError("offline")
    value, status = bounded_itech_measurement(
        instrument,
        measurement_name="MEASURE_TEST_OFFLINE",
        command="MEAS:VOLT?",
        cache_key="voltage",
    )

    assert value == 0
    assert status["valid"] is False
    assert status["fresh"] is False
