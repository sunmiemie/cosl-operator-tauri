from __future__ import annotations


def _decode_group(encoded_group: str) -> str:
    """Decode one three-byte TBUS transport group into two protocol bytes."""
    if len(encoded_group) != 6:
        raise ValueError(
            f"TBUS transport group must contain 3 bytes, got {len(encoded_group) // 2}"
        )

    bits = format(int(encoded_group, 16), "024b")
    decoded_bits = bits[4:8] + bits[10:16] + bits[18:24]
    return format(int(decoded_bits, 2), "04X")


def decrypt(encoded_hex: str) -> str:
    """Decode the serial transport frame used by the IFBOX TBUS port."""
    normalized = "".join(encoded_hex.split()).upper()
    if not normalized:
        return ""
    if len(normalized) % 6 != 0:
        raise ValueError(
            "TBUS serial frame length must be a multiple of three bytes"
        )

    return "".join(
        _decode_group(normalized[offset:offset + 6])
        for offset in range(0, len(normalized), 6)
    )


def decode_tbus_payload(serial_response: bytes) -> tuple[str, str]:
    """Return the decoded TBUS frame hex and its ASCII payload.

    The decoded protocol frame contains a two-byte header and a two-byte
    trailer. READ_COMM and READ_MAST carry their board information as ASCII
    between those fields.
    """
    if not serial_response:
        return "", ""

    decoded_hex = decrypt(serial_response.hex())
    if len(decoded_hex) < 8:
        raise ValueError("Decoded TBUS frame is shorter than header and trailer")

    payload_hex = decoded_hex[4:-4]
    payload = bytes.fromhex(payload_hex).decode("ascii")
    return decoded_hex, payload.rstrip("\x00 ")
