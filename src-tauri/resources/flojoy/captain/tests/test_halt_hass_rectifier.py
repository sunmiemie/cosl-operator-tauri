import sys
import types
from unittest.mock import patch

if "flojoy.execution_log" not in sys.modules:
    flojoy_module = types.ModuleType("flojoy")
    execution_log_module = types.ModuleType("flojoy.execution_log")
    execution_log_module.record_execution_event = lambda *args, **kwargs: None
    flojoy_module.execution_log = execution_log_module
    sys.modules["flojoy"] = flojoy_module
    sys.modules["flojoy.execution_log"] = execution_log_module

from captain.services.halt_hass_rectifier import run_rectifier_command
from captain.types.devices import (
    HaltHassHardwareBinding,
    HaltHassRectifierCommandRequest,
)


class FakeInstrument:
    def __init__(self, identity: str, voltage: float = 0, current: float = 0):
        self.identity = identity
        self.voltage = voltage
        self.current = current
        self.commands: list[str] = []
        self.timeout = 0
        self.closed = False

    def write(self, command: str):
        self.commands.append(command)

    def query(self, command: str) -> str:
        if command == "*IDN?":
            return self.identity
        if command == "MEAS:VOLT?":
            return str(self.voltage)
        if command == "MEAS:CURR?":
            return str(self.current)
        raise AssertionError(f"unexpected query: {command}")

    def close(self):
        self.closed = True


class FakeResourceManager:
    def __init__(self):
        self.instruments = {
            "SOURCE": FakeInstrument("ITECH,IT-M3123,SOURCE-SN,1.0"),
            "LOAD48": FakeInstrument("ITECH,IT8513,LOAD48-SN,1.0", 48.2, 3.14),
            "LOAD90": FakeInstrument("ITECH,IT8513,LOAD90-SN,1.0", 90.4, 1.62),
        }
        self.closed = False

    def open_resource(self, resource: str):
        return self.instruments[resource]

    def close(self):
        self.closed = True


def binding(role: str, resource: str, serial: str) -> HaltHassHardwareBinding:
    return HaltHassHardwareBinding(
        role=role,
        displayName=role,
        port=resource,
        resource=resource,
        hwid="",
        instrumentSerial=serial,
    )


def request(action: str, **kwargs) -> HaltHassRectifierCommandRequest:
    return HaltHassRectifierCommandRequest(
        action=action,
        bindings=[
            binding("itech3123_input", "SOURCE", "SOURCE-SN"),
            binding("itech8513_48v_load", "LOAD48", "LOAD48-SN"),
            binding("itech8513_90v_load", "LOAD90", "LOAD90-SN"),
        ],
        **kwargs,
    )


@patch("captain.services.halt_hass_rectifier.record_execution_event")
def test_initialize_sets_zero_volts_and_disables_loads(_record):
    manager = FakeResourceManager()
    response = run_rectifier_command(
        request("initialize", sourceCurrentLimitA=5),
        resource_manager_factory=lambda: manager,
    )

    assert response.success
    assert manager.instruments["SOURCE"].commands[:5] == [
        "SYST:REM",
        "INST:SEL CH1",
        "VOLT:LEV 0",
        "CURR:LEV 5",
        "OUTP ON",
    ]
    assert "INP OFF" in manager.instruments["LOAD48"].commands
    assert "MODE RES" in manager.instruments["LOAD90"].commands


@patch("captain.services.halt_hass_rectifier.record_execution_event")
def test_load_switch_and_measurement_keep_current_in_amperes(_record):
    load_manager = FakeResourceManager()
    load_response = run_rectifier_command(
        request("set_loads", load48Ohm=15.36, load90Ohm=56),
        resource_manager_factory=lambda: load_manager,
    )
    assert load_response.success
    assert "RES 15.36" in load_manager.instruments["LOAD48"].commands
    assert "RES 56" in load_manager.instruments["LOAD90"].commands

    measure_manager = FakeResourceManager()
    measure_response = run_rectifier_command(
        request("measure"),
        resource_manager_factory=lambda: measure_manager,
    )
    assert measure_response.success
    assert measure_response.measurement is not None
    assert measure_response.measurement.output48CurrentA == 3.14
    assert measure_response.measurement.output90CurrentA == 1.62


@patch("captain.services.halt_hass_rectifier.record_execution_event")
def test_model_mismatch_is_rejected(_record):
    manager = FakeResourceManager()
    manager.instruments["LOAD90"].identity = "ITECH,IT-M3123,LOAD90-SN,1.0"
    response = run_rectifier_command(
        request("measure"),
        resource_manager_factory=lambda: manager,
    )
    assert not response.success
    assert "型号不匹配" in response.message


@patch("captain.services.halt_hass_rectifier.record_execution_event")
def test_shutdown_disables_loads_before_source(_record):
    manager = FakeResourceManager()
    response = run_rectifier_command(
        request("shutdown"),
        resource_manager_factory=lambda: manager,
    )
    assert response.success
    assert "INP OFF" in manager.instruments["LOAD48"].commands
    assert "INP OFF" in manager.instruments["LOAD90"].commands
    assert "OUTP OFF" in manager.instruments["SOURCE"].commands


if __name__ == "__main__":
    test_initialize_sets_zero_volts_and_disables_loads()
    test_load_switch_and_measurement_keep_current_in_amperes()
    test_model_mismatch_is_rejected()
    test_shutdown_disables_loads_before_source()
    print("4 rectifier hardware tests passed")
