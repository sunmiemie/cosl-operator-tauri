from typing import Optional

from flojoy import DataContainer, VisaConnection, flojoy

from blocks.HARDWARE.ITECH.itech_polling import logged_itech_write


@flojoy(inject_connection=True)
def POWER_OFF_ITECH3123_48V(
    connection: VisaConnection,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    instrument = connection.get_handle()
    logged_itech_write(
        instrument,
        operation_name="POWER_OFF_ITECH3123_48V",
        command="OUTP OFF",
    )
    return None
