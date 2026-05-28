from flojoy import flojoy, DataContainer, VisaConnection, Scalar
from typing import Optional


@flojoy(inject_connection=True)
def MEASURE_VOLTAGE_ITECH6723G(
        connection: VisaConnection,
        default: Optional[DataContainer] = None,
) -> Scalar:
    scope = connection.get_handle()
    voltage = scope.query('MEAS:VOLT?')
    return Scalar(float(voltage))
