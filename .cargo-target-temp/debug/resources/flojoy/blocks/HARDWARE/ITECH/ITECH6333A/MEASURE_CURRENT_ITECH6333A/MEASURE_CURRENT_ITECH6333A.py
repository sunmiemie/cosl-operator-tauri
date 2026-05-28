from flojoy import flojoy, DataContainer, VisaConnection, Scalar
from typing import Optional


@flojoy(inject_connection=True)
def MEASURE_CURRENT_ITECH6333A(
        connection: VisaConnection,
        default: Optional[DataContainer] = None,
) -> Scalar:
    scope = connection.get_handle()
    current = scope.query('MEAS:CURR?')
    return Scalar(float(current))
