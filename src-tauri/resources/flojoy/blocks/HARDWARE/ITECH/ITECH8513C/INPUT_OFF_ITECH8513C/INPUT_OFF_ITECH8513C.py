from flojoy import flojoy, DataContainer, VisaConnection
from typing import Optional


@flojoy(inject_connection=True)
def INPUT_OFF_ITECH8513C(
    connection: VisaConnection,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    scope = connection.get_handle()
    scope.write('INP OFF')

    return None
