from typing import Optional
from flojoy import SerialConnection, flojoy, DataContainer


@flojoy(inject_connection=True)
def CLOSE_SERIAL(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    ser = connection.get_handle()
    ser.close()
    return None
