from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer

from blocks.HARDWARE.PULSER.command_protocol import exchange_pulser_command


@flojoy(inject_connection=True)
def READ_ZERO_POSITION(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "55AA00003F"
    response_str = exchange_pulser_command(
        ser,
        hex_data,
        "读取脉冲器零位",
        8,
    )
    return String(s=response_str)
