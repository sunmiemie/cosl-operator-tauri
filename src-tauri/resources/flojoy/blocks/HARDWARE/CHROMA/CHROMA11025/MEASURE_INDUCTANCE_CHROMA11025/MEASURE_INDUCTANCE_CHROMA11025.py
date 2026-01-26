from flojoy import flojoy, DataContainer, VisaConnection, Scalar
from typing import Optional
import logging
from time import sleep


@flojoy(inject_connection=True)
def MEASURE_INDUCTANCE_CHROMA11025(
    connection: VisaConnection,
    default: Optional[DataContainer] = None,
) -> Scalar:
    scope = connection.get_handle()

    def write_command(_scope, command):
        _scope.write(command)
        sleep(0.1)

    write_command(scope, "SENS:FUNC:CONC ON")
    write_command(scope, "SENS:FUNC 'FIMP','FRES'")
    write_command(scope, "TRIG:SOUR EXT")
    write_command(scope, "TRIG")
    data = scope.query_ascii_values("FETCh?")
    logging.info(f"Measure Data: {data}")
    status, v1, v2 = data[0], data[1], data[2]
    return Scalar(float(v1))
