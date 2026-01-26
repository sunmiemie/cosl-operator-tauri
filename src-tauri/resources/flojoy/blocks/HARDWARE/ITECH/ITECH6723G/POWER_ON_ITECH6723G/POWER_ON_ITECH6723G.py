from flojoy import flojoy, DataContainer, VisaConnection
from typing import Optional


@flojoy(inject_connection=True)
def POWER_ON_ITECH6723G(
    connection: VisaConnection,
    voltage: float,
    current: float,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    scope = connection.get_handle()
    scope.write(f'VOLT {voltage}')
    scope.write(f'CURR {current}')
    scope.write('OUTP ON')

    return None
