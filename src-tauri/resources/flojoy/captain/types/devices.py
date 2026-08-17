from typing import Literal, Optional

from pydantic import BaseModel, Field


class CameraDevice(BaseModel):
    name: str
    # either the index or the port (e.g /dev/video0)
    id: str | int


class SerialDevice(BaseModel):
    port: str
    description: str
    manufacturer: Optional[str]
    hwid: str


class VISADevice(BaseModel):
    name: str
    address: str
    description: str


class NIDAQmxDevice(BaseModel):
    name: str
    address: str
    description: str


class NIDMMDevice(BaseModel):
    name: str
    address: str
    description: str


class DeviceInfo(BaseModel):
    cameras: list[CameraDevice]
    serialDevices: list[SerialDevice]
    visaDevices: list[VISADevice]
    nidaqmxDevices: list[NIDAQmxDevice]
    nidmmDevices: list[NIDMMDevice]


class HaltHassHardwareBinding(BaseModel):
    role: Literal["pulser", "itech6723", "itech3123", "ifbox", "storage"]
    displayName: str
    port: str
    resource: str
    hwid: str
    baudrate: Optional[int] = None


class HaltHassPreflightRequest(BaseModel):
    bindings: list[HaltHassHardwareBinding]
    requiredRoles: list[
        Literal["pulser", "itech6723", "itech3123", "ifbox", "storage"]
    ] = Field(
        default_factory=lambda: ["pulser", "ifbox", "itech3123", "storage"]
    )
    baudrates: dict[str, int] = Field(default_factory=dict)
    supplyVoltage: float = 48.0
    supplyCurrentLimit: float = 1.0
    powerStabilizationSeconds: float = 20.0


class HaltHassPreflightResult(BaseModel):
    role: str
    displayName: str
    success: bool
    message: str
    details: dict[str, str | float]


class HaltHassPreflightResponse(BaseModel):
    ready: bool
    powerMaintained: bool
    results: list[HaltHassPreflightResult]
    message: str


class HaltHassPowerOffRequest(BaseModel):
    resource: str


class HaltHassShutdownRequest(BaseModel):
    bindings: list[HaltHassHardwareBinding]
    requiredPowerRoles: list[
        Literal["itech6723", "itech3123"]
    ] = Field(default_factory=lambda: ["itech6723", "itech3123"])
    brokerIp: str = "127.0.0.1"


class HaltHassShutdownResult(BaseModel):
    role: str
    displayName: str
    success: bool
    message: str


class HaltHassShutdownResponse(BaseModel):
    success: bool
    results: list[HaltHassShutdownResult]
    message: str
