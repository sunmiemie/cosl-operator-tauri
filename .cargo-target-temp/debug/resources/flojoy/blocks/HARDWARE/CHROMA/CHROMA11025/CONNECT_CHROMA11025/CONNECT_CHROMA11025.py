from flojoy import flojoy, DataContainer, VisaDevice
from flojoy.connection_manager import DeviceConnectionManager
from typing import Optional
import pyvisa
import logging


@flojoy
def CONNECT_CHROMA11025(
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

    if "CHROMA ATE INC.,11025" not in scope_name:
        raise RuntimeError(
            f"The instrument you provided does not seem to be a Chroma Model 11025, its name is {scope_name}."
        )

    return None
