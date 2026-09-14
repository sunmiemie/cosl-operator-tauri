from typing import Optional

from flojoy import DataContainer, VisaConnection, flojoy

from blocks.HARDWARE.ITECH.itech_polling import logged_itech_write


@flojoy(inject_connection=True)
def POWER_ON_ITECH3123_48V(
    connection: VisaConnection,
    voltage: float,
    current: float,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    instrument = connection.get_handle()
    for command in (
        "INST:SEL CH1",
        f"VOLT:LEV {voltage}",
        f"CURR:LEV {current}",
        "OUTP ON",
    ):
        logged_itech_write(
            instrument,
            operation_name="POWER_ON_ITECH3123_48V",
            command=command,
        )
    return None
