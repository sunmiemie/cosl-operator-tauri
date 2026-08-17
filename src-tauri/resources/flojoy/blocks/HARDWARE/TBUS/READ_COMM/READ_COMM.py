from typing import Optional
from flojoy import String, SerialConnection, flojoy, DataContainer

from blocks.HARDWARE.TBUS.tbus_decoder import decode_tbus_payload
from blocks.HARDWARE.TBUS.tbus_polling import bounded_tbus_query


@flojoy(inject_connection=True)
def READ_COMM(
        connection: SerialConnection,
        default: Optional[DataContainer] = None,
) -> String:
    ser = connection.get_handle()
    response = bounded_tbus_query(
        ser,
        query_name="READ_COMM",
        command_hex="4F80D10080C220BFEC",
        expected_length=21,
    )
    if not response:
        return String(s="")

    try:
        tbus_hex, board_information = decode_tbus_payload(response)
    except (UnicodeDecodeError, ValueError):
        return String(
            s="",
            extra={
                "serial_hex": response.hex().upper(),
                "decoder_error": True,
            },
        )

    return String(
        s=board_information,
        extra={
            "serial_hex": response.hex().upper(),
            "tbus_hex": tbus_hex,
        },
    )
