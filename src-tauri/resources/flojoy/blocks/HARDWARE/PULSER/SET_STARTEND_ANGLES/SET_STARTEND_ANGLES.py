from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer
import logging

from blocks.HARDWARE.PULSER.command_protocol import exchange_pulser_command

@flojoy(inject_connection=True)
def SET_STARTEND_ANGLES(
    connection: SerialConnection,
    default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()

    hex_data = "55AB000853001841"
    logging.info(f"set startend angles command: {hex_data}")
    response_str = exchange_pulser_command(
        ser,
        hex_data,
        "写入脉冲器起止角",
        4,
    )
    logging.info("set startend angles response: %s", response_str)
    return String(s=response_str)
