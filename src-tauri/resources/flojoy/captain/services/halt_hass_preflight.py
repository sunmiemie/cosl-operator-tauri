import logging
import time
from typing import Callable

import pyvisa
import serial
import serial.tools.list_ports
import paho.mqtt.client as mqtt
from flojoy.execution_log import record_execution_event

from captain.services.hardware import _get_persistent_serial_port

from captain.types.devices import (
    HaltHassHardwareBinding,
    HaltHassHardwareProfile,
    HaltHassPreflightRequest,
    HaltHassPreflightResponse,
    HaltHassPreflightResult,
    HaltHassResolveBindingsRequest,
    HaltHassResolveBindingsResponse,
    HaltHassShutdownRequest,
    HaltHassShutdownResponse,
    HaltHassShutdownResult,
)


logger = logging.getLogger(__name__)

ROLE_DISPLAY_NAMES = {
    "pulser": "脉冲器",
    "itech3123_48v": "ITECH 3123（48 V）",
    "itech3123": "ITECH 3123（90 V）",
    "itech3123_input": "ITECH 3123（整流稳压输入源）",
    "itech8513_48v_load": "ITECH 8513（48 V 负载）",
    "itech8513_90v_load": "ITECH 8513（90 V 负载）",
    "ifbox": "IFBOX",
    "storage": "存储板",
}
ROLE_DEFAULT_BAUDRATES = {
    "pulser": 9600,
    "ifbox": 115200,
    "storage": 9600,
}


def _result(
    binding: HaltHassHardwareBinding,
    success: bool,
    message: str,
    details: dict[str, str | float] | None = None,
) -> HaltHassPreflightResult:
    return HaltHassPreflightResult(
        role=binding.role,
        displayName=binding.displayName,
        success=success,
        message=message,
        details=details or {},
    )


def _find_binding(
    request: HaltHassPreflightRequest,
    role: str,
) -> HaltHassHardwareBinding | None:
    return next((binding for binding in request.bindings if binding.role == role), None)


def _parse_number(value: str) -> float:
    return float(value.strip())


def _connect_visa(resource_manager, resource: str):
    instrument = resource_manager.open_resource(resource)
    instrument.timeout = 3000
    return instrument


def _query_visa_identity(resource_manager, resource: str) -> str:
    instrument = None
    try:
        instrument = _connect_visa(resource_manager, resource)
        return instrument.query("*IDN?").strip()
    finally:
        if instrument is not None:
            instrument.close()


def _identity_has_serial(identity: str, serial_number: str) -> bool:
    return serial_number.upper() in {
        field.strip().upper() for field in identity.split(",")
    }


def _assert_expected_itech_identity(
    binding: HaltHassHardwareBinding,
    identity: str,
) -> None:
    expected_serial = binding.instrumentSerial
    expected_model = (
        "8513" if binding.role.startswith("itech8513_") else "3123"
    )
    if expected_model not in identity.upper():
        raise RuntimeError(
            f"设备型号不匹配，期望 {expected_model}，实际返回 {identity}"
        )
    if expected_serial and not _identity_has_serial(identity, expected_serial):
        raise RuntimeError(
            f"设备序列号不匹配，期望 {expected_serial}，实际返回 {identity}"
        )


def _restore_local(instrument) -> None:
    if instrument is None:
        return
    try:
        instrument.write("SYST:LOC")
    except Exception:
        logger.exception("Failed to restore ITECH 3123 local control")


def _prepare_halt_hass_power(
    resource_manager,
    binding: HaltHassHardwareBinding,
    voltage: float,
    current: float,
):
    instrument = _connect_visa(resource_manager, binding.resource)
    try:
        identity = instrument.query("*IDN?").strip()
        _assert_expected_itech_identity(binding, identity)

        instrument.write("SYST:REM")
        instrument.write("INST:SEL CH1")
        instrument.write(f"VOLT:LEV {voltage}")
        instrument.write(f"CURR:LEV {current}")
        instrument.write("OUTP ON")
        time.sleep(0.6)

        measured_voltage = _parse_number(instrument.query("MEAS:VOLT?"))
        measured_current = _parse_number(instrument.query("MEAS:CURR?"))
        if measured_voltage < voltage * 0.9 or measured_voltage > voltage * 1.1:
            raise RuntimeError(
                f"3123（48 V）输出电压异常：{measured_voltage:.3f} V"
            )

        return instrument, identity, measured_voltage, measured_current
    except Exception:
        try:
            instrument.write("OUTP OFF")
        except Exception:
            logger.exception("Failed to turn off ITECH 3123 after preflight error")
        _restore_local(instrument)
        instrument.close()
        raise


def _check_serial_online(
    binding: HaltHassHardwareBinding,
    default_baudrate: int,
) -> HaltHassPreflightResult:
    """只验证 USB 串口已枚举且当前可打开，不执行任何工艺协议。"""
    baudrate = binding.baudrate or default_baudrate
    try:
        with serial.Serial(
            port=binding.port,
            baudrate=baudrate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=0.2,
            write_timeout=0.2,
        ):
            return _result(
                binding,
                True,
                "设备在线，串口可用",
                {
                    "port": binding.port,
                    "baudrate": float(baudrate),
                },
            )
    except Exception as exc:
        return _result(binding, False, f"设备已枚举，但串口无法打开：{exc}")


def _check_ifbox(binding: HaltHassHardwareBinding) -> HaltHassPreflightResult:
    return _check_serial_online(binding, 115200)


def _matches_usb_identity(
    port,
    vid: int | None,
    pid: int | None,
    serial_number: str | None,
) -> bool:
    actual_vid = getattr(port, "vid", None)
    actual_pid = getattr(port, "pid", None)
    actual_serial = str(getattr(port, "serial_number", "") or "").upper()
    expected_serial = str(serial_number or "").upper()
    if vid is not None and actual_vid != vid:
        return False
    if pid is not None and actual_pid != pid:
        return False
    if expected_serial and actual_serial:
        return actual_serial == expected_serial
    if expected_serial and not actual_serial:
        hwid = str(getattr(port, "hwid", "") or "").upper()
        return f"SER={expected_serial}" in hwid
    if vid is not None or pid is not None:
        return True

    return False


def _profile_for_role(
    profiles: list[HaltHassHardwareProfile],
    role: str,
) -> HaltHassHardwareProfile | None:
    return next((profile for profile in profiles if profile.role == role), None)


def _matches_preferred_port(port, profile: HaltHassHardwareProfile) -> bool:
    preferred = str(profile.matcher.preferredPort or "").strip()
    if not preferred:
        return False
    device = str(getattr(port, "device", "") or "")
    persistent = _get_persistent_serial_port(device)
    candidates = {
        device,
        persistent,
        _to_visa_resource(device),
        _to_visa_resource(persistent),
    }
    return preferred in candidates


def _to_visa_resource(port: str) -> str:
    upper_port = port.upper()
    if upper_port.startswith("COM") and upper_port[3:].isdigit():
        return f"ASRL{upper_port[3:]}::INSTR"
    return f"ASRL{port}::INSTR"


def _discover_binding(
    role: str,
    ports: list,
    profile: HaltHassHardwareProfile | None,
    baudrate: int | None = None,
    resource_manager=None,
    visa_identity_cache: dict[str, str] | None = None,
    excluded_ports: set[str] | None = None,
) -> HaltHassHardwareBinding | None:
    """按客户端工作台配置和当前 USB 快照生成本次运行的端口绑定。"""
    if profile is None:
        raise RuntimeError(
            f"客户端未配置 {ROLE_DISPLAY_NAMES.get(role, role)} 的设备绑定"
        )

    matcher = profile.matcher
    has_matcher = any(
        (
            matcher.preferredPort,
            matcher.vid is not None,
            matcher.pid is not None,
            matcher.serialNumber,
            matcher.interfaceMarker,
            matcher.instrumentSerial,
        )
    )
    if not has_matcher:
        raise RuntimeError(f"{profile.displayName} 尚未选择或识别设备")

    candidates = []
    candidate_identities: dict[str, str] = {}
    for port in ports:
        device_name = str(getattr(port, "device", ""))
        persistent_name = _get_persistent_serial_port(device_name)
        if excluded_ports and (
            device_name.upper() in excluded_ports
            or persistent_name.upper() in excluded_ports
        ):
            continue
        preferred_match = _matches_preferred_port(port, profile)
        has_usb_identity = (
            matcher.vid is not None
            or matcher.pid is not None
            or bool(matcher.serialNumber)
        )
        identity_match = has_usb_identity and _matches_usb_identity(
            port,
            matcher.vid,
            matcher.pid,
            matcher.serialNumber,
        )
        if not preferred_match and not identity_match:
            continue
        # Linux 的 by-id/by-path 是稳定入口，但路径也可能在设备替换后仍存在。
        # 只要配置同时记录了 USB 身份，就必须继续校验，不能仅凭路径放行。
        if preferred_match and has_usb_identity and not identity_match:
            continue
        if matcher.interfaceMarker:
            interface_identity = " ".join(
                str(getattr(port, field, "") or "")
                for field in ("description", "product", "interface")
            ).upper()
            if matcher.interfaceMarker.upper() not in interface_identity:
                continue
        if matcher.instrumentSerial:
            if resource_manager is None:
                raise RuntimeError(f"{profile.displayName} 缺少 VISA 识别环境")
            resource = _to_visa_resource(device_name)
            cache = visa_identity_cache if visa_identity_cache is not None else {}
            try:
                instrument_identity = cache.get(resource)
                if instrument_identity is None:
                    instrument_identity = _query_visa_identity(
                        resource_manager,
                        resource,
                    )
                    cache[resource] = instrument_identity
            except Exception as exc:
                logger.warning(
                    "Failed to identify HALT-HASS ITECH candidate %s: %s",
                    resource,
                    exc,
                )
                continue
            if not _identity_has_serial(
                instrument_identity,
                matcher.instrumentSerial,
            ):
                continue
            candidate_identities[device_name] = instrument_identity
        candidates.append(port)
    display_name = profile.displayName
    if len(candidates) > 1:
        port_names = "、".join(str(port.device) for port in candidates)
        raise RuntimeError(
            f"{display_name} 匹配到多个设备（{port_names}），无法唯一绑定"
        )
    if not candidates:
        return None

    port = candidates[0]
    device = str(port.device)
    persistent_port = _get_persistent_serial_port(device)
    resource = (
        _to_visa_resource(persistent_port)
        if profile.resourceType == "visa"
        else persistent_port
    )
    return HaltHassHardwareBinding(
        role=role,
        displayName=display_name,
        port=persistent_port,
        resource=resource,
        hwid=str(getattr(port, "hwid", "") or ""),
        baudrate=baudrate,
        persistentPort=persistent_port,
        vid=getattr(port, "vid", None),
        pid=getattr(port, "pid", None),
        serialNumber=getattr(port, "serial_number", None),
        interfaceName=getattr(port, "interface", None),
        instrumentIdentity=candidate_identities.get(device),
        instrumentSerial=matcher.instrumentSerial,
    )


def resolve_halt_hass_bindings(
    request: HaltHassResolveBindingsRequest,
) -> HaltHassResolveBindingsResponse:
    """按客户端固化的工作台身份解析角色，不使用工艺内历史端口。"""
    bindings: list[HaltHassHardwareBinding] = []
    errors: dict[str, str] = {}
    ports = list(serial.tools.list_ports.comports())
    resource_manager = pyvisa.ResourceManager("@py")
    visa_identity_cache: dict[str, str] = {}
    try:
        for role in dict.fromkeys(request.roles):
            profile = _profile_for_role(request.profiles, role)
            baudrate = request.baudrates.get(
                role,
                profile.baudrate if profile and profile.baudrate else ROLE_DEFAULT_BAUDRATES.get(role),
            )
            try:
                binding = _discover_binding(
                    role,
                    ports,
                    profile,
                    baudrate,
                    resource_manager,
                    visa_identity_cache,
                )
                if binding is None:
                    errors[role] = (
                        f"未检测到已固化的 {ROLE_DISPLAY_NAMES.get(role, role)}"
                    )
                else:
                    bindings.append(binding)
            except Exception as exc:
                errors[role] = str(exc)
    finally:
        resource_manager.close()

    return HaltHassResolveBindingsResponse(bindings=bindings, errors=errors)


def _missing_binding(role: str, baudrate: int | None) -> HaltHassHardwareBinding:
    return HaltHassHardwareBinding(
        role=role,
        displayName=ROLE_DISPLAY_NAMES.get(role, role),
        port="",
        resource="",
        hwid="",
        baudrate=baudrate,
    )


def _check_itech(
    resource_manager,
    binding: HaltHassHardwareBinding,
) -> HaltHassPreflightResult:
    instrument = None
    try:
        instrument = _connect_visa(resource_manager, binding.resource)
        identity = instrument.query("*IDN?").strip()
        _assert_expected_itech_identity(binding, identity)
        return _result(
            binding,
            True,
            "设备在线，串口可用",
            {
                "port": binding.port,
                "resource": binding.resource,
                "identity": identity,
            },
        )
    except Exception as exc:
        return _result(binding, False, f"设备已枚举，但串口无法打开：{exc}")
    finally:
        if instrument is not None:
            instrument.close()


def _check_pulser(binding: HaltHassHardwareBinding) -> HaltHassPreflightResult:
    return _check_serial_online(binding, 9600)


def _run_rectifier_preflight(
    request: HaltHassPreflightRequest,
    resource_manager,
) -> HaltHassPreflightResponse:
    results: list[HaltHassPreflightResult] = []
    ports = list(serial.tools.list_ports.comports())
    resolved_resources: set[str] = set()
    for role in dict.fromkeys(request.requiredRoles):
        profile = _profile_for_role(request.profiles, role)
        try:
            binding = _discover_binding(
                role,
                ports,
                profile,
                resource_manager=resource_manager,
            )
        except Exception as exc:
            results.append(_result(_missing_binding(role, None), False, str(exc)))
            continue
        if binding is None:
            results.append(
                _result(
                    _missing_binding(role, None),
                    False,
                    f"未检测到已固化的 {ROLE_DISPLAY_NAMES.get(role, role)}",
                )
            )
            continue
        if binding.resource in resolved_resources:
            results.append(
                _result(binding, False, "该仪器已绑定到另一个整流稳压设备角色")
            )
            continue
        resolved_resources.add(binding.resource)
        results.append(_check_itech(resource_manager, binding))

    ready = bool(results) and len(results) == len(set(request.requiredRoles)) and all(
        result.success for result in results
    )
    return HaltHassPreflightResponse(
        ready=ready,
        powerMaintained=False,
        results=results,
        message=(
            "整流稳压输入源和两路负载通信正常"
            if ready
            else "整流稳压设备绑定或通信检测失败"
        ),
    )


def run_halt_hass_preflight(
    request: HaltHassPreflightRequest,
) -> HaltHassPreflightResponse:
    results: list[HaltHassPreflightResult] = []
    resource_manager = pyvisa.ResourceManager("@py")
    power_instrument = None

    try:
        if request.reportType == "rectifier_regulator":
            return _run_rectifier_preflight(request, resource_manager)

        power_binding = _find_binding(request, "itech3123_48v")
        if power_binding is None:
            return HaltHassPreflightResponse(
                ready=False,
                powerMaintained=False,
                results=[],
                message="未找到已固化的 ITECH 3123（48 V），无法给台架设备供电",
            )

        try:
            (
                power_instrument,
                identity,
                measured_voltage,
                measured_current,
            ) = _prepare_halt_hass_power(
                resource_manager,
                power_binding,
                request.supplyVoltage,
                request.supplyCurrentLimit,
            )
            results.append(
                _result(
                    power_binding,
                    True,
                    (
                        f"通信正常，已输出 {request.supplyVoltage:g} V，"
                        f"限流 {request.supplyCurrentLimit:g} A"
                    ),
                    {
                        "identity": identity,
                        "voltage": measured_voltage,
                        "current": measured_current,
                    },
                )
            )
        except Exception as exc:
            results.append(_result(power_binding, False, f"供电准备失败：{exc}"))
            return HaltHassPreflightResponse(
                ready=False,
                powerMaintained=False,
                results=results,
                message="ITECH 3123（48 V）供电准备失败",
            )

        stabilization_seconds = max(0.0, request.powerStabilizationSeconds)
        logger.info(
            "ITECH 3123 48V output enabled; waiting %.1f seconds before device checks",
            stabilization_seconds,
        )
        time.sleep(stabilization_seconds)

        # 脉冲器和 IFBOX 都依赖 48 V。稳定等待结束后统一获取新的串口快照，
        # 以当前 USB 映射检测全部设备，不沿用上电前可能不存在或过期的 COM 号。
        ports = list(serial.tools.list_ports.comports())
        checkers: dict[
            str,
            Callable[[HaltHassHardwareBinding], HaltHassPreflightResult],
        ] = {
            "pulser": _check_pulser,
            "ifbox": _check_ifbox,
            "storage": lambda binding: _check_serial_online(binding, 9600),
            "itech3123": lambda binding: _check_itech(resource_manager, binding),
        }
        checked_roles: set[str] = set()
        for role in request.requiredRoles:
            if role == "itech3123_48v" or role in checked_roles:
                continue
            checked_roles.add(role)
            profile = _profile_for_role(request.profiles, role)
            baudrate = request.baudrates.get(
                role,
                profile.baudrate if profile and profile.baudrate else ROLE_DEFAULT_BAUDRATES.get(role),
            )
            try:
                binding = _discover_binding(
                    role,
                    ports,
                    profile,
                    baudrate,
                    resource_manager,
                    excluded_ports=(
                        {power_binding.port.upper()}
                        if role == "itech3123"
                        else None
                    ),
                )
            except Exception as exc:
                results.append(
                    _result(_missing_binding(role, baudrate), False, str(exc))
                )
                continue

            if binding is None:
                results.append(
                    _result(
                        _missing_binding(role, baudrate),
                        False,
                        (
                            f"3123（48 V）上电并等待 {stabilization_seconds:g} 秒后"
                            "仍未检测到设备"
                        ),
                    )
                )
                continue

            checker = checkers.get(role)
            if checker is None:
                results.append(_result(binding, False, "暂不支持该设备的通信预检"))
                continue
            results.append(checker(binding))

        ready = bool(results) and all(result.success for result in results)

        return HaltHassPreflightResponse(
            ready=ready,
            # 预检测只判断设备通信状态。48 V 3123 成功上电后保持输出，
            # 其它设备握手失败也不改变输出状态，由工艺或显式下电操作接管。
            powerMaintained=power_instrument is not None,
            results=results,
            message=(
                "全部设备在线且端口可用"
                if ready
                else "存在未枚举或端口无法打开的设备"
            ),
        )
    finally:
        if power_instrument is not None:
            try:
                # 48 V 可以继续保持输出，但串口释放前必须归还面板本控。
                _restore_local(power_instrument)
            finally:
                power_instrument.close()
        resource_manager.close()


def turn_off_halt_hass_power(
    resource: str,
    role: str = "itech3123_48v",
    instrument_serial: str | None = None,
) -> None:
    resource_manager = pyvisa.ResourceManager("@py")
    instrument = None
    try:
        instrument = _connect_visa(resource_manager, resource)
        identity = instrument.query("*IDN?").strip()
        binding = HaltHassHardwareBinding(
            role=role,
            displayName=ROLE_DISPLAY_NAMES.get(role, role),
            port=resource,
            resource=resource,
            hwid="",
            instrumentSerial=instrument_serial,
        )
        _assert_expected_itech_identity(binding, identity)
        instrument.write("SYST:REM")
        instrument.write("OUTP OFF")
    finally:
        if instrument is not None:
            try:
                _restore_local(instrument)
            finally:
                instrument.close()
        resource_manager.close()


def _stop_halt_hass_edm(broker_ip: str) -> None:
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.username_pw_set("Admin", "123456")
    client.connect(broker_ip, 1883, keepalive=15)
    client.loop_start()
    try:
        message_info = client.publish(
            "EDM/App/Test/Command",
            "Stop",
            qos=1,
        )
        message_info.wait_for_publish(timeout=3.0)
        if not message_info.is_published():
            raise RuntimeError("EDM MQTT 停止指令发送超时")
    finally:
        client.loop_stop()
        client.disconnect()


def run_halt_hass_shutdown(
    request: HaltHassShutdownRequest,
) -> HaltHassShutdownResponse:
    """在软件循环总时长到期后独立执行关闭流程。

    调用方先等待工艺图 end 分支或释放 Flojoy 连接；本接口再重新解析
    当前 USB 映射完成 MQTT 停止与两路电源下电，不复用旧连接对象。
    """
    results: list[HaltHassShutdownResult] = []
    record_execution_event(
        "hardware-shutdown-started",
        "Flojoy 节点已停止，开始执行工作台停止和两路电源下电",
        jobset_id=request.jobsetId,
        function_name="HALT_HASS_HARDWARE_SHUTDOWN",
        data={
            "brokerIp": request.brokerIp,
            "requiredPowerRoles": request.requiredPowerRoles,
        },
    )

    try:
        _stop_halt_hass_edm(request.brokerIp)
        results.append(
            HaltHassShutdownResult(
                role="edm",
                displayName="工作台 MQTT",
                success=True,
                message="已发送停止测试指令",
            )
        )
        record_execution_event(
            "device-response",
            "工作台 MQTT Stop 已发送",
            direction="receive",
            jobset_id=request.jobsetId,
            function_name="HALT_HASS_HARDWARE_SHUTDOWN",
            data={"role": "edm", "success": True},
        )
    except Exception as exc:
        logger.exception("Failed to stop HALT-HASS EDM")
        results.append(
            HaltHassShutdownResult(
                role="edm",
                displayName="工作台 MQTT",
                success=False,
                message=f"停止测试失败：{exc}",
            )
        )
        record_execution_event(
            "device-response",
            "工作台 MQTT Stop 失败",
            level="error",
            direction="receive",
            jobset_id=request.jobsetId,
            function_name="HALT_HASS_HARDWARE_SHUTDOWN",
            data={"role": "edm", "success": False, "error": str(exc)},
        )

    binding_by_role = {
        binding.role: binding
        for binding in request.bindings
        if binding.role in request.requiredPowerRoles
    }
    for role in request.requiredPowerRoles:
        display_name = (
            "ITECH 3123（48 V）"
            if role == "itech3123_48v"
            else "ITECH 3123（90 V）"
        )
        binding = binding_by_role.get(role)
        if binding is None:
            results.append(
                HaltHassShutdownResult(
                    role=role,
                    displayName=display_name,
                    success=False,
                    message="未找到当前 USB 绑定，无法确认输出已关闭",
                )
            )
            record_execution_event(
                "device-response",
                f"{display_name} 下电失败：未找到当前 USB 绑定",
                level="error",
                direction="receive",
                jobset_id=request.jobsetId,
                function_name="HALT_HASS_HARDWARE_SHUTDOWN",
                data={"role": role, "success": False},
            )
            continue

        try:
            turn_off_halt_hass_power(
                binding.resource,
                role,
                binding.instrumentSerial,
            )
            results.append(
                HaltHassShutdownResult(
                    role=role,
                    displayName=display_name,
                    success=True,
                    message=f"已关闭输出并释放 {binding.resource}",
                )
            )
            record_execution_event(
                "device-response",
                f"{display_name} 已关闭输出并释放连接",
                direction="receive",
                jobset_id=request.jobsetId,
                function_name="HALT_HASS_HARDWARE_SHUTDOWN",
                data={
                    "role": role,
                    "resource": binding.resource,
                    "success": True,
                },
            )
        except Exception as exc:
            logger.exception("Failed to turn off %s", display_name)
            results.append(
                HaltHassShutdownResult(
                    role=role,
                    displayName=display_name,
                    success=False,
                    message=f"下电失败：{exc}",
                )
            )
            record_execution_event(
                "device-response",
                f"{display_name} 下电失败",
                level="error",
                direction="receive",
                jobset_id=request.jobsetId,
                function_name="HALT_HASS_HARDWARE_SHUTDOWN",
                data={
                    "role": role,
                    "resource": binding.resource,
                    "success": False,
                    "error": str(exc),
                },
            )

    success = bool(results) and all(result.success for result in results)
    response = HaltHassShutdownResponse(
        success=success,
        results=results,
        message=(
            "HALT-HASS 安全收尾完成"
            if success
            else "HALT-HASS 安全收尾存在失败项"
        ),
    )
    record_execution_event(
        "hardware-shutdown-completed",
        response.message,
        level="info" if success else "error",
        jobset_id=request.jobsetId,
        function_name="HALT_HASS_HARDWARE_SHUTDOWN",
        data={
            "success": success,
            "results": [item.model_dump() for item in results],
        },
    )
    return response
