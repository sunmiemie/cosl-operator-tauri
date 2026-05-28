from flojoy import flojoy, DataContainer, VisaConnection
from typing import Optional
import time


@flojoy(inject_connection=True)
def STEP_POWER_ON_ITECH6723G(
        connection: VisaConnection,
        voltage: float,
        current: float,
        voltage_step: int = 1,
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    """按步进值 voltage_step 从0V开始缓慢升压至目标值

    Parameters
    ----------
    voltage : float
        电压目标值
    current : float
        电流值
    voltage_step: int
        电压步进值

    Returns
    -------
    Optional[DataContainer]
        Returns the input if one was passed in.
    """
    scope = connection.get_handle()
    scope.write('VOLT 0')
    scope.write(f'CURR {current}')
    scope.write('OUTP ON')
    for v in range(0, int(voltage), voltage_step):
        time.sleep(0.03)
        scope.write(f'VOLT {v}')
    scope.write(f'VOLT {voltage}')

    return None
