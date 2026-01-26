from flojoy import flojoy, DataContainer, VisaDevice
from flojoy.connection_manager import DeviceConnectionManager
from typing import Optional
import pyvisa
import logging


@flojoy
def CONNECT_ITECH6723G(
        device: VisaDevice,
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    device_addr = device.get_address()
    logging.info(f"Connecting to {device_addr} ...")
    rm = pyvisa.ResourceManager("@py")
    scope = rm.open_resource(device_addr)

    DeviceConnectionManager.register_connection(device, scope)

    scope_name = scope.query("*IDN?")
    logging.info(f"Connected to {scope_name}")
    scope.write('SYST:REM')

    return None
