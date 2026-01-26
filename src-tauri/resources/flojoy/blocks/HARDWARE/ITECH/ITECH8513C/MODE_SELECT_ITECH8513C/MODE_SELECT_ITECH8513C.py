from flojoy import flojoy, DataContainer, VisaConnection
from typing import Optional, Literal


@flojoy(inject_connection=True)
def MODE_SELECT_ITECH8513C(
    connection: VisaConnection,
    value: float,
    mode_unit: Literal["RES", "CURR", "VOLT", "POW", "DYN", "LED", "IMP"] = "RES",
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    scope = connection.get_handle()
    scope.write(f'MODE {mode_unit}')
    scope.write(f'{mode_unit} {value}')
    scope.write('INP ON')

    return None
