from flojoy import flojoy, DataContainer, VisaConnection
from typing import Optional, Literal
from time import sleep

@flojoy(inject_connection=True)
def SET_VOLTAGE_CHROMA11025(
    connection: VisaConnection,
    voltage_value: int = 1,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:

    scope = connection.get_handle()
    scope.write(f"SOUR:VOLT {voltage_value}")
    sleep(0.1)
    return None
