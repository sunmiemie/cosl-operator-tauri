from typing import Optional

from flojoy import DataContainer, VisaConnection, flojoy

from blocks.HARDWARE.ITECH.itech_polling import logged_itech_write


@flojoy(inject_connection=True)
def DISCONNECT_ITECH3123(
    connection: VisaConnection,
    default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    scope = connection.get_handle()
    logged_itech_write(
        scope,
        operation_name="DISCONNECT_ITECH3123",
        command="SYST:LOC",
    )
    scope.close()
    return None
