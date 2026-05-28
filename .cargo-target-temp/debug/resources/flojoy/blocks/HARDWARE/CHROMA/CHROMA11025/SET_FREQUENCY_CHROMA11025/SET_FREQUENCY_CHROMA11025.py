from flojoy import flojoy, DataContainer, VisaConnection
from typing import Optional, Literal
from time import sleep


@flojoy(inject_connection=True)
def SET_FREQUENCY_CHROMA11025(
    connection: VisaConnection,
    frequency_value: int = 10,
    frequency_unit: Literal["Hz", "KHz"] = "KHz",
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:

    scope = connection.get_handle()
    scope.write(f"SOUR:FREQ {frequency_value}{frequency_unit}")
    sleep(0.1)
    return None
