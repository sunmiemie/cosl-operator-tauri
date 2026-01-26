from flojoy import flojoy, DataContainer, VisaConnection, Scalar
from typing import Optional
import time


@flojoy(inject_connection=True)
def MEASURE_CURRENT_ITECH8513C(
    connection: VisaConnection,
    default: Optional[DataContainer] = None,
) -> Scalar:
    scope = connection.get_handle()
    time.sleep(0.5)
    current = scope.query('MEAS:CURR?')
    return Scalar(float(current))
