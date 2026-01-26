from flojoy import flojoy, DataContainer, VisaConnection, Scalar
from typing import Optional
import time


@flojoy(inject_connection=True)
def MEASURE_VOLTAGE_ITECH8513C(
    connection: VisaConnection,
    default: Optional[DataContainer] = None,
) -> Scalar:
    scope = connection.get_handle()
    time.sleep(0.5)
    voltage = scope.query('MEAS:VOLT?')
    return Scalar(float(voltage))
