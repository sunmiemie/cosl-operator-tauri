from flojoy import flojoy, DataContainer, VisaConnection
from typing import Optional



@flojoy(inject_connection=True)
def RESET_CHROMA11025(
    connection: VisaConnection,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    scope = connection.get_handle()
    scope.write("*RST")

    return None
