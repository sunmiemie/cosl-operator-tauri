import logging
import time
from typing import Callable

import pyvisa
import serial
import serial.tools.list_ports
import paho.mqtt.client as mqtt

from captain.types.devices import (
    HaltHassHardwareBinding,
    HaltHassPreflightRequest,
    HaltHassPreflightResponse,
    HaltHassPreflightResult,
    HaltHassShutdownRequest,
    HaltHassShutdownResponse,
    HaltHassShutdownResult,
)


logger = logging.getLogger(__name__)

ROLE_USB_IDENTITIES = {
    "pulser": (0x0403, 0x6001, "B003PLDPA"),
    "itech3123": (0x2EC7, 0x0666, None),
    "ifbox": (0x2E3C, 0x7543, None),
    "storage": (0x2E3C, 0x7543, None),
}
ROLE_INTERFACE_MARKERS = {
    # 新 IFBOX 是一个包含 TBus/HS/EXT 三个串口的复合 USB 设备。
    # 三个接口的 VID/PID 相同，只有 TBus Port 承载当前工艺通信。
    "ifbox": "TBUS PORT",
    "storage": "EXT PORT",
}
ROLE_DISPLAY_NAMES = {
    "pulser": "脉冲器",
    "itech3123": "ITECH 3123（工艺节点名为 3124）",
    "ifbox": "IFBOX",
    "storage": "存储板",
}
ROLE_RESOURCE_TYPES = {
    "pulser": "serial",
    "itech3123": "visa",
    "ifbox": "serial",
    "storage": "serial",
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


def _restore_local(instrument) -> None:
    if instrument is None:
        return
    try:
        instrument.write("SYST:LOC")
    except Exception:
        logger.exception("Failed to restore ITECH 6723G local control")


def _prepare_halt_hass_power(
    resource_manager,
    binding: HaltHassHardwareBinding,
    voltage: float,
    current: float,
):
    instrument = _connect_visa(resource_manager, binding.resource)
    try:
        identity = instrument.query("*IDN?").strip()
        if "6723" not in identity.upper():
            raise RuntimeError(f"设备身份不匹配：{identity}")

        instrument.write("SYST:REM")
        instrument.write(f"VOLT {voltage}")
        instrument.write(f"CURR {current}")
        instrument.write("OUTP ON")
        time.sleep(0.6)

        measured_voltage = _parse_number(instrument.query("MEAS:VOLT?"))
        measured_current = _parse_number(instrument.query("MEAS:CURR?"))
        if measured_voltage < voltage * 0.9 or measured_voltage > voltage * 1.1:
            raise RuntimeError(
                f"6723G 输出电压异常：{measured_voltage:.3f} V"
            )

        return instrument, identity, measured_voltage, measured_current
    except Exception:
        try:
            instrument.write("OUTP OFF")
        except Exception:
            logger.exception("Failed to turn off ITECH 6723G after preflight error")
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
    vid: int,
    pid: int,
    serial_number: str | None,
) -> bool:
    actual_vid = getattr(port, "vid", None)
    actual_pid = getattr(port, "pid", None)
    actual_serial = str(getattr(port, "serial_number", "") or "").upper()
    if actual_vid == vid and actual_pid == pid:
        return (
            serial_number is None
            or not actual_serial
            or actual_serial == serial_number
        )

    hwid = str(getattr(port, "hwid", "") or "").upper()
    if f"VID:PID={vid:04X}:{pid:04X}" not in hwid:
        return False
    return (
        serial_number is None
        or f"SER={serial_number}" in hwid
        or "SER=" not in hwid
    )


def _to_visa_resource(port: str) -> str:
    upper_port = port.upper()
    if upper_port.startswith("COM") and upper_port[3:].isdigit():
        return f"ASRL{upper_port[3:]}::INSTR"
    return f"ASRL{port}::INSTR"


def _discover_binding(
    role: str,
    ports: list,
    baudrate: int | None = None,
) -> HaltHassHardwareBinding | None:
    """使用上电并稳定等待后的 USB 快照生成最新设备绑定。"""
    identity = ROLE_USB_IDENTITIES.get(role)
    if identity is None:
        raise RuntimeError(f"暂不支持设备角色：{role}")

    interface_marker = ROLE_INTERFACE_MARKERS.get(role)
    candidates = []
    for port in ports:
        if not _matches_usb_identity(port, *identity):
            continue
        if interface_marker:
            interface_identity = " ".join(
                str(getattr(port, field, "") or "")
                for field in ("description", "product", "interface")
            ).upper()
            if interface_marker not in interface_identity:
                continue
        candidates.append(port)
    display_name = ROLE_DISPLAY_NAMES[role]
    if len(candidates) > 1:
        port_names = "、".join(str(port.device) for port in candidates)
        raise RuntimeError(
            f"{display_name} 匹配到多个设备（{port_names}），无法唯一绑定"
        )
    if not candidates:
        return None

    port = candidates[0]
    device = str(port.device)
    resource = (
        _to_visa_resource(device)
        if ROLE_RESOURCE_TYPES[role] == "visa"
        else device
    )
    return HaltHassHardwareBinding(
        role=role,
        displayName=display_name,
        port=device,
        resource=resource,
        hwid=str(getattr(port, "hwid", "") or ""),
        baudrate=baudrate,
    )


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
        return _result(
            binding,
            True,
            "设备在线，串口可用",
            {
                "port": binding.port,
                "resource": binding.resource,
            },
        )
    except Exception as exc:
        return _result(binding, False, f"设备已枚举，但串口无法打开：{exc}")
    finally:
        if instrument is not None:
            instrument.close()


def _check_pulser(binding: HaltHassHardwareBinding) -> HaltHassPreflightResult:
    return _check_serial_online(binding, 9600)


def run_halt_hass_preflight(
    request: HaltHassPreflightRequest,
) -> HaltHassPreflightResponse:
    results: list[HaltHassPreflightResult] = []
    resource_manager = pyvisa.ResourceManager("@py")
    power_instrument = None

    try:
        power_binding = _find_binding(request, "itech6723")
        if power_binding is None:
            return HaltHassPreflightResponse(
                ready=False,
                powerMaintained=False,
                results=[],
                message="未找到 ITECH 6723G，无法给台架设备供电",
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
                message="ITECH 6723G 供电准备失败",
            )

        stabilization_seconds = max(0.0, request.powerStabilizationSeconds)
        logger.info(
            "ITECH 6723G output enabled; waiting %.1f seconds before device checks",
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
            if role == "itech6723" or role in checked_roles:
                continue
            checked_roles.add(role)
            baudrate = request.baudrates.get(
                role,
                ROLE_DEFAULT_BAUDRATES.get(role),
            )
            try:
                binding = _discover_binding(role, ports, baudrate)
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
                            f"6723G 上电并等待 {stabilization_seconds:g} 秒后"
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
            # 预检测只判断设备通信状态。6723G 成功上电后保持 48 V，
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


def turn_off_halt_hass_power(resource: str) -> None:
    resource_manager = pyvisa.ResourceManager("@py")
    instrument = None
    try:
        instrument = _connect_visa(resource_manager, resource)
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

    本接口不等待工艺图 end 分支，也不依赖 Flojoy DeviceManager 中的旧连接。
    """
    results: list[HaltHassShutdownResult] = []

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

    binding_by_role = {
        binding.role: binding
        for binding in request.bindings
        if binding.role in request.requiredPowerRoles
    }
    for role in request.requiredPowerRoles:
        display_name = (
            "ITECH 6723G"
            if role == "itech6723"
            else "ITECH 3123/3124"
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
            continue

        try:
            turn_off_halt_hass_power(binding.resource)
            results.append(
                HaltHassShutdownResult(
                    role=role,
                    displayName=display_name,
                    success=True,
                    message=f"已关闭输出并释放 {binding.resource}",
                )
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

    success = bool(results) and all(result.success for result in results)
    return HaltHassShutdownResponse(
        success=success,
        results=results,
        message=(
            "HALT-HASS 安全收尾完成"
            if success
            else "HALT-HASS 安全收尾存在失败项"
        ),
    )
