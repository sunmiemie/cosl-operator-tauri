from flojoy import flojoy, DataContainer, VisaConnection, Scalar
from typing import Optional

from blocks.HARDWARE.ITECH.itech_polling import bounded_itech_measurement


@flojoy(inject_connection=True)
def MEASURE_CURRENT_ITECH3124(
        connection: VisaConnection,
        default: Optional[DataContainer] = None,
) -> Scalar:
    scope = connection.get_handle()
    current, status = bounded_itech_measurement(
        scope,
        measurement_name="MEASURE_CURRENT_ITECH3124",
        command="MEAS:CURR?",
        cache_key="current",
    )
    return Scalar(current, extra=status)
