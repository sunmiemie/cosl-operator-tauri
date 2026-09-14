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
def CONNECT_ITECH3123(
    device: VisaDevice,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    device_addr = device.get_address()
    logging.info("Connecting to ITECH 3123 at %s ...", device_addr)
    resource_manager = pyvisa.ResourceManager("@py")
    scope = resource_manager.open_resource(device_addr)

    DeviceConnectionManager.register_connection(device, scope)

    scope_name = logged_itech_query(
        scope,
        operation_name="CONNECT_ITECH3123",
        command="*IDN?",
    )
    logging.info("Connected to %s", scope_name.strip())
    logged_itech_write(
        scope,
        operation_name="CONNECT_ITECH3123",
        command="SYST:REM",
    )
    return None
