import sys
from pathlib import Path


FLOJOY_ROOT = Path(__file__).parents[3]
if str(FLOJOY_ROOT) not in sys.path:
    sys.path.insert(0, str(FLOJOY_ROOT))

from blocks.HARDWARE.TBUS.sds_echo import (
    build_sds_echo_request,
    parse_sds_echo_response,
)


def _encode_tbus_bytes(decoded: bytes) -> bytes:
    encoded = bytearray()
    for offset in range(0, len(decoded), 2):
        value = int.from_bytes(decoded[offset:offset + 2], "big")
        encoded.extend(
            (
                (value >> 12) & 0x0F,
                (value >> 6) & 0x3F,
                value & 0x3F,
            )
        )
    return bytes(encoded)


def test_known_sds_echo_commands_are_transformed_to_serial_frames():
    assert build_sds_echo_request("F9810002067C") == "4FA6C10080C22099FC"
    assert build_sds_echo_request("D8810002267C") == "4DA2C10080C22299FC"
    assert build_sds_echo_request("D9810002257C") == "4DA6C10080C22295FC"


def test_sds_echo_response_matches_expected_protocol_value():
    response = _encode_tbus_bytes(bytes.fromhex("AA55005C1234"))
    decoded, matched = parse_sds_echo_response(response, "005C")

    assert decoded == "AA55005C1234"
    assert matched is True


def test_sds_echo_response_reports_mismatch():
    response = _encode_tbus_bytes(bytes.fromhex("AA5500621234"))
    decoded, matched = parse_sds_echo_response(response, "005C")

    assert decoded == "AA5500621234"
    assert matched is False
