from typing import Literal, Optional

from pydantic import BaseModel, Field


HaltHassHardwareRole = Literal[
    "pulser",
    "itech3123_48v",
    "itech3123",
    "itech3123_input",
    "itech8513_48v_load",
    "itech8513_90v_load",
    "ifbox",
    "storage",
]


class CameraDevice(BaseModel):
    name: str
    # either the index or the port (e.g /dev/video0)
    id: str | int


class SerialDevice(BaseModel):
    port: str
    description: str
    manufacturer: Optional[str]
    hwid: str
    vid: Optional[int] = None
    pid: Optional[int] = None
    serialNumber: Optional[str] = None
    interfaceName: Optional[str] = None
    location: Optional[str] = None


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


class HaltHassHardwareMatcher(BaseModel):
    preferredPort: Optional[str] = None
    vid: Optional[int] = None
    pid: Optional[int] = None
    serialNumber: Optional[str] = None
    interfaceMarker: Optional[str] = None
    instrumentSerial: Optional[str] = None


class HaltHassHardwareProfile(BaseModel):
    role: HaltHassHardwareRole
    displayName: str
    resourceType: Literal["serial", "visa"]
    baudrate: Optional[int] = None
    matcher: HaltHassHardwareMatcher = Field(default_factory=HaltHassHardwareMatcher)


class HaltHassHardwareBinding(BaseModel):
    role: HaltHassHardwareRole
    displayName: str
    port: str
    resource: str
    hwid: str
    baudrate: Optional[int] = None
    persistentPort: Optional[str] = None
    vid: Optional[int] = None
    pid: Optional[int] = None
    serialNumber: Optional[str] = None
    interfaceName: Optional[str] = None
    instrumentIdentity: Optional[str] = None
    instrumentSerial: Optional[str] = None


class HaltHassResolveBindingsRequest(BaseModel):
    roles: list[HaltHassHardwareRole]
    baudrates: dict[str, int] = Field(default_factory=dict)
    profiles: list[HaltHassHardwareProfile] = Field(default_factory=list)


class HaltHassResolveBindingsResponse(BaseModel):
    bindings: list[HaltHassHardwareBinding]
    errors: dict[str, str] = Field(default_factory=dict)


class HaltHassPreflightRequest(BaseModel):
    bindings: list[HaltHassHardwareBinding]
    requiredRoles: list[HaltHassHardwareRole] = Field(
        default_factory=lambda: ["pulser", "ifbox", "itech3123", "storage"]
    )
    baudrates: dict[str, int] = Field(default_factory=dict)
    profiles: list[HaltHassHardwareProfile] = Field(default_factory=list)
    supplyVoltage: float = 48.0
    supplyCurrentLimit: float = 1.0
    powerStabilizationSeconds: float = 20.0
    reportType: Literal["drive_control", "rectifier_regulator"] = "drive_control"


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
    role: Literal[
        "itech3123_48v",
        "itech3123",
        "itech3123_input",
        "itech8513_48v_load",
        "itech8513_90v_load",
    ] = "itech3123_48v"
    instrumentSerial: Optional[str] = None


class HaltHassShutdownRequest(BaseModel):
    bindings: list[HaltHassHardwareBinding]
    requiredPowerRoles: list[
        Literal["itech3123_48v", "itech3123"]
    ] = Field(default_factory=lambda: ["itech3123_48v", "itech3123"])
    brokerIp: str = "127.0.0.1"
    jobsetId: str = ""


class HaltHassRectifierCommandRequest(BaseModel):
    action: Literal["initialize", "set_input", "set_loads", "measure", "shutdown"]
    bindings: list[HaltHassHardwareBinding]
    inputVoltage: Optional[float] = None
    sourceCurrentLimitA: float = 5.0
    load48Ohm: Optional[float] = None
    load90Ohm: Optional[float] = None
    jobsetId: str = ""


class HaltHassRectifierMeasurement(BaseModel):
    output48Voltage: float
    output48CurrentA: float
    output90Voltage: float
    output90CurrentA: float


class HaltHassRectifierCommandResponse(BaseModel):
    success: bool
    action: str
    message: str
    measurement: Optional[HaltHassRectifierMeasurement] = None


class HaltHassShutdownResult(BaseModel):
    role: str
    displayName: str
    success: bool
    message: str


class HaltHassShutdownResponse(BaseModel):
    success: bool
    results: list[HaltHassShutdownResult]
    message: str
