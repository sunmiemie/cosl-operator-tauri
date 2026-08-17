from flojoy import flojoy, DataContainer, VisaConnection, Scalar
from typing import Optional

from blocks.HARDWARE.ITECH.itech_polling import bounded_itech_measurement


@flojoy(inject_connection=True)
def MEASURE_VOLTAGE_ITECH6723G(
        connection: VisaConnection,
        default: Optional[DataContainer] = None,
) -> Scalar:
    scope = connection.get_handle()
    voltage, status = bounded_itech_measurement(
        scope,
        measurement_name="MEASURE_VOLTAGE_ITECH6723G",
        command="MEAS:VOLT?",
        cache_key="voltage",
    )
    return Scalar(voltage, extra=status)
