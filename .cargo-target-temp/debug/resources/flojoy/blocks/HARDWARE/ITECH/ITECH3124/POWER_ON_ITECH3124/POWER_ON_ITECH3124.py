from flojoy import flojoy, DataContainer, VisaConnection
from typing import Optional


@flojoy(inject_connection=True)
def POWER_ON_ITECH3124(
    connection: VisaConnection,
    voltage: float,
    current: float,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    scope = connection.get_handle()
    scope.write('INST:SEL CH1')
    scope.write(f'VOLT:LEV {voltage}')
    scope.write(f'CURR:LEV {current}')
    scope.write('OUTP ON')

    return None
