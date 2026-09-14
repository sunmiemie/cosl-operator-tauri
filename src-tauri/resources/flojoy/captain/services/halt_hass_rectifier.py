import logging
from collections.abc import Callable

import pyvisa
from flojoy.execution_log import record_execution_event

from captain.types.devices import (
    HaltHassHardwareBinding,
    HaltHassRectifierCommandRequest,
    HaltHassRectifierCommandResponse,
    HaltHassRectifierMeasurement,
)


logger = logging.getLogger(__name__)

INPUT_SOURCE_ROLE = "itech3123_input"
LOAD_48_ROLE = "itech8513_48v_load"
LOAD_90_ROLE = "itech8513_90v_load"

ROLE_NAMES = {
    INPUT_SOURCE_ROLE: "ITECH 3123（整流稳压输入源）",
    LOAD_48_ROLE: "ITECH 8513（48 V 负载）",
    LOAD_90_ROLE: "ITECH 8513（90 V 负载）",
}


def _binding(
    request: HaltHassRectifierCommandRequest,
    role: str,
) -> HaltHassHardwareBinding:
    matched = next((item for item in request.bindings if item.role == role), None)
    if matched is None:
        raise RuntimeError(f"缺少{ROLE_NAMES[role]}绑定")
    return matched


def _identity_has_serial(identity: str, expected_serial: str) -> bool:
    return expected_serial.upper() in {
        item.strip().upper() for item in identity.split(",")
    }


def _assert_identity(binding: HaltHassHardwareBinding, identity: str) -> None:
    expected_model = "3123" if binding.role == INPUT_SOURCE_ROLE else "8513"
    if expected_model not in identity.upper():
        raise RuntimeError(
            f"{ROLE_NAMES[binding.role]}型号不匹配，实际返回 {identity}"
        )
    if binding.instrumentSerial and not _identity_has_serial(
        identity,
        binding.instrumentSerial,
    ):
        raise RuntimeError(
            f"{ROLE_NAMES[binding.role]}序列号不匹配，"
            f"期望 {binding.instrumentSerial}，实际返回 {identity}"
        )


def _open_instrument(resource_manager, binding: HaltHassHardwareBinding):
    instrument = resource_manager.open_resource(binding.resource)
    instrument.timeout = 3000
    identity = instrument.query("*IDN?").strip()
    _assert_identity(binding, identity)
    instrument.write("SYST:REM")
    return instrument, identity


def _restore_local_and_close(instrument) -> None:
    if instrument is None:
        return
    try:
        instrument.write("SYST:LOC")
    except Exception:
        logger.exception("Failed to restore rectifier instrument local control")
    finally:
        instrument.close()


def _record_command(
    request: HaltHassRectifierCommandRequest,
    message: str,
    data: dict,
) -> None:
    record_execution_event(
        "device-command",
        message,
        direction="send",
        jobset_id=request.jobsetId,
        function_name="HALT_HASS_RECTIFIER_CONTROL",
        data=data,
    )


def _record_response(
    request: HaltHassRectifierCommandRequest,
    message: str,
    data: dict,
    level: str = "info",
) -> None:
    record_execution_event(
        "device-response",
        message,
        level=level,
        direction="receive",
        jobset_id=request.jobsetId,
        function_name="HALT_HASS_RECTIFIER_CONTROL",
        data=data,
    )


def _initialize(request: HaltHassRectifierCommandRequest, resource_manager) -> None:
    source = load_48 = load_90 = None
    try:
        source_binding = _binding(request, INPUT_SOURCE_ROLE)
        load_48_binding = _binding(request, LOAD_48_ROLE)
        load_90_binding = _binding(request, LOAD_90_ROLE)
        source, source_id = _open_instrument(resource_manager, source_binding)
        load_48, load_48_id = _open_instrument(resource_manager, load_48_binding)
        load_90, load_90_id = _open_instrument(resource_manager, load_90_binding)

        _record_command(
            request,
            "初始化整流稳压输入源和两路负载",
            {
                "inputVoltage": 0,
                "sourceCurrentLimitA": request.sourceCurrentLimitA,
                "loadInputs": "OFF",
            },
        )
        source.write("INST:SEL CH1")
        source.write("VOLT:LEV 0")
        source.write(f"CURR:LEV {request.sourceCurrentLimitA:g}")
        source.write("OUTP ON")
        for load in (load_48, load_90):
            load.write("INP OFF")
            load.write("MODE RES")
        _record_response(
            request,
            "整流稳压设备初始化完成",
            {
                "sourceIdentity": source_id,
                "load48Identity": load_48_id,
                "load90Identity": load_90_id,
            },
        )
    except Exception:
        for instrument, command in (
            (load_48, "INP OFF"),
            (load_90, "INP OFF"),
            (source, "OUTP OFF"),
        ):
            if instrument is None:
                continue
            try:
                instrument.write(command)
            except Exception:
                logger.exception("Failed to disable rectifier hardware after init error")
        raise
    finally:
        _restore_local_and_close(load_90)
        _restore_local_and_close(load_48)
        _restore_local_and_close(source)


def _set_input(request: HaltHassRectifierCommandRequest, resource_manager) -> None:
    if request.inputVoltage is None or request.inputVoltage < 0:
        raise ValueError("输入电压必须为大于或等于 0 的数值")
    source = None
    try:
        binding = _binding(request, INPUT_SOURCE_ROLE)
        source, _ = _open_instrument(resource_manager, binding)
        _record_command(
            request,
            f"设置整流稳压输入电压 {request.inputVoltage:g} V",
            {
                "role": INPUT_SOURCE_ROLE,
                "voltage": request.inputVoltage,
                "currentLimitA": request.sourceCurrentLimitA,
            },
        )
        source.write("INST:SEL CH1")
        source.write(f"CURR:LEV {request.sourceCurrentLimitA:g}")
        source.write(f"VOLT:LEV {request.inputVoltage:g}")
        source.write("OUTP ON")
        _record_response(
            request,
            f"输入电压已设置为 {request.inputVoltage:g} V",
            {"role": INPUT_SOURCE_ROLE, "voltage": request.inputVoltage},
        )
    finally:
        _restore_local_and_close(source)


def _set_loads(request: HaltHassRectifierCommandRequest, resource_manager) -> None:
    if request.load48Ohm is None or request.load48Ohm <= 0:
        raise ValueError("48 V 负载电阻必须大于 0")
    if request.load90Ohm is None or request.load90Ohm <= 0:
        raise ValueError("90 V 负载电阻必须大于 0")

    load_48 = load_90 = None
    try:
        load_48, _ = _open_instrument(
            resource_manager,
            _binding(request, LOAD_48_ROLE),
        )
        load_90, _ = _open_instrument(
            resource_manager,
            _binding(request, LOAD_90_ROLE),
        )
        _record_command(
            request,
            "切换整流稳压两路电子负载",
            {
                "load48Ohm": request.load48Ohm,
                "load90Ohm": request.load90Ohm,
            },
        )
        load_48.write("MODE RES")
        load_48.write(f"RES {request.load48Ohm:g}")
        load_48.write("INP ON")
        load_90.write("MODE RES")
        load_90.write(f"RES {request.load90Ohm:g}")
        load_90.write("INP ON")
        _record_response(
            request,
            "两路电子负载切换完成",
            {
                "load48Ohm": request.load48Ohm,
                "load90Ohm": request.load90Ohm,
            },
        )
    except Exception:
        for load in (load_48, load_90):
            if load is None:
                continue
            try:
                load.write("INP OFF")
            except Exception:
                logger.exception("Failed to disable load after set-load error")
        raise
    finally:
        _restore_local_and_close(load_90)
        _restore_local_and_close(load_48)


def _measure(
    request: HaltHassRectifierCommandRequest,
    resource_manager,
) -> HaltHassRectifierMeasurement:
    load_48 = load_90 = None
    try:
        load_48, _ = _open_instrument(
            resource_manager,
            _binding(request, LOAD_48_ROLE),
        )
        load_90, _ = _open_instrument(
            resource_manager,
            _binding(request, LOAD_90_ROLE),
        )
        _record_command(
            request,
            "读取整流稳压两路负载电压和电流",
            {"roles": [LOAD_48_ROLE, LOAD_90_ROLE]},
        )
        measurement = HaltHassRectifierMeasurement(
            output48Voltage=float(load_48.query("MEAS:VOLT?").strip()),
            output48CurrentA=float(load_48.query("MEAS:CURR?").strip()),
            output90Voltage=float(load_90.query("MEAS:VOLT?").strip()),
            output90CurrentA=float(load_90.query("MEAS:CURR?").strip()),
        )
        _record_response(
            request,
            "整流稳压两路负载测量完成",
            measurement.model_dump(),
        )
        return measurement
    finally:
        _restore_local_and_close(load_90)
        _restore_local_and_close(load_48)


def _shutdown(request: HaltHassRectifierCommandRequest, resource_manager) -> None:
    failures: list[str] = []
    for role, command in (
        (LOAD_48_ROLE, "INP OFF"),
        (LOAD_90_ROLE, "INP OFF"),
        (INPUT_SOURCE_ROLE, "OUTP OFF"),
    ):
        instrument = None
        try:
            binding = _binding(request, role)
            instrument, _ = _open_instrument(resource_manager, binding)
            _record_command(
                request,
                f"关闭{ROLE_NAMES[role]}",
                {"role": role, "command": command},
            )
            instrument.write(command)
            _record_response(
                request,
                f"{ROLE_NAMES[role]}已关闭",
                {"role": role},
            )
        except Exception as exc:
            failures.append(f"{ROLE_NAMES[role]}：{exc}")
            _record_response(
                request,
                f"{ROLE_NAMES[role]}关闭失败",
                {"role": role, "error": str(exc)},
                level="error",
            )
        finally:
            _restore_local_and_close(instrument)
    if failures:
        raise RuntimeError("；".join(failures))


def run_rectifier_command(
    request: HaltHassRectifierCommandRequest,
    resource_manager_factory: Callable = lambda: pyvisa.ResourceManager("@py"),
) -> HaltHassRectifierCommandResponse:
    resource_manager = resource_manager_factory()
    try:
        measurement = None
        if request.action == "initialize":
            _initialize(request, resource_manager)
        elif request.action == "set_input":
            _set_input(request, resource_manager)
        elif request.action == "set_loads":
            _set_loads(request, resource_manager)
        elif request.action == "measure":
            measurement = _measure(request, resource_manager)
        elif request.action == "shutdown":
            _shutdown(request, resource_manager)
        else:
            raise ValueError(f"不支持的整流稳压操作：{request.action}")
        return HaltHassRectifierCommandResponse(
            success=True,
            action=request.action,
            message="操作完成",
            measurement=measurement,
        )
    except Exception as exc:
        logger.exception("HALT-HASS rectifier command failed: %s", request.action)
        _record_response(
            request,
            f"整流稳压操作失败：{exc}",
            {"action": request.action, "error": str(exc)},
            level="error",
        )
        return HaltHassRectifierCommandResponse(
            success=False,
            action=request.action,
            message=str(exc),
        )
    finally:
        resource_manager.close()
