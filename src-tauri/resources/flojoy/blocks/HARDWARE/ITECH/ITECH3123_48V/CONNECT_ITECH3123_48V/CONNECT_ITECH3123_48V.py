import logging
from typing import Optional

import pyvisa
from flojoy import DataContainer, VisaDevice, flojoy
from flojoy.connection_manager import DeviceConnectionManager

from blocks.HARDWARE.ITECH.itech_polling import (
    logged_itech_query,
    logged_itech_write,
)


@flojoy
def CONNECT_ITECH3123_48V(
    device: VisaDevice,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    device_addr = device.get_address()
    logging.info("Connecting to ITECH 3123 48V supply at %s ...", device_addr)
    resource_manager = pyvisa.ResourceManager("@py")
    instrument = resource_manager.open_resource(device_addr)
    instrument.timeout = 3000

    identity = str(logged_itech_query(
        instrument,
        operation_name="CONNECT_ITECH3123_48V",
        command="*IDN?",
    )).strip()
    if "3123" not in identity.upper():
        instrument.close()
        resource_manager.close()
        raise RuntimeError(f"设备身份不匹配：{identity}")

    DeviceConnectionManager.register_connection(device, instrument)
    logging.info("Connected 48V supply to %s", identity)
    logged_itech_write(
        instrument,
        operation_name="CONNECT_ITECH3123_48V",
        command="SYST:REM",
    )
    return None
