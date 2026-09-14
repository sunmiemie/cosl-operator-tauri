from fastapi import APIRouter
from captain.services.hardware import get_device_finder
from captain.services.halt_hass_preflight import (
    resolve_halt_hass_bindings,
    run_halt_hass_shutdown,
    run_halt_hass_preflight,
    turn_off_halt_hass_power,
)
from captain.services.halt_hass_rectifier import run_rectifier_command
from captain.types.devices import (
    DeviceInfo,
    HaltHassPowerOffRequest,
    HaltHassPreflightRequest,
    HaltHassPreflightResponse,
    HaltHassResolveBindingsRequest,
    HaltHassResolveBindingsResponse,
    HaltHassRectifierCommandRequest,
    HaltHassRectifierCommandResponse,
    HaltHassShutdownRequest,
    HaltHassShutdownResponse,
)

router = APIRouter(tags=["devices"])


@router.get("/devices")
async def get_devices(
    include_nidaqmx_drivers: bool = False,
    include_nidmm_drivers: bool = False,
    include_visa_devices: bool = True,
    include_camera_devices: bool = True,
) -> dict[str, str] | DeviceInfo:
    device_finder = get_device_finder()
    return DeviceInfo(
        cameras=device_finder.get_cameras() if include_camera_devices else [],
        serialDevices=device_finder.get_serial_devices(),
        visaDevices=device_finder.get_visa_devices() if include_visa_devices else [],
        nidaqmxDevices=device_finder.get_nidaqmx_devices()
        if include_nidaqmx_drivers
        else [],
        nidmmDevices=device_finder.get_nidmm_devices() if include_nidmm_drivers else [],
    )


@router.post("/devices/halt-hass/resolve-bindings")
def halt_hass_resolve_bindings(
    request: HaltHassResolveBindingsRequest,
) -> HaltHassResolveBindingsResponse:
    """按客户端工作台配置解析本次运行实际使用的串口资源。"""
    return resolve_halt_hass_bindings(request)


@router.post("/devices/halt-hass/preflight")
def halt_hass_preflight(
    request: HaltHassPreflightRequest,
) -> HaltHassPreflightResponse:
    """固定 48 V 3123 上电并稳定等待后，检查整套 HALT-HASS 台架设备通信。"""
    return run_halt_hass_preflight(request)


@router.post("/devices/halt-hass/power-off")
def halt_hass_power_off(request: HaltHassPowerOffRequest) -> dict[str, bool]:
    """流程未启动或预检失败时，安全关闭 HALT-HASS 台架供电。"""
    turn_off_halt_hass_power(
        request.resource,
        request.role,
        request.instrumentSerial,
    )
    return {"success": True}


@router.post("/devices/halt-hass/shutdown")
def halt_hass_shutdown(
    request: HaltHassShutdownRequest,
) -> HaltHassShutdownResponse:
    """循环流超时或异常滞留时，独立停止工作台并关闭两路电源输出。"""
    return run_halt_hass_shutdown(request)


@router.post("/devices/halt-hass/rectifier/command")
def halt_hass_rectifier_command(
    request: HaltHassRectifierCommandRequest,
) -> HaltHassRectifierCommandResponse:
    """执行客户端编排的整流稳压输入源和电子负载原子操作。"""
    return run_rectifier_command(request)
