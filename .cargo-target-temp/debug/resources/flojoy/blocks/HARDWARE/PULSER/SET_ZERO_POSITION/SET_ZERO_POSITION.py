from flojoy import String, SerialConnection, flojoy
import logging


def crc8(data_hex: str) -> str:
    poly = 0x31
    init = 0x00
    xorout = 0x00
    data = bytes.fromhex(data_hex)
    # 初始化CRC寄存器
    crc = init
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ poly) & 0xFF
            else:
                crc = (crc << 1) & 0xFF

    crc ^= xorout
    return f"{crc:02X}"


@flojoy(inject_connection=True)
def SET_ZERO_POSITION(
        connection: SerialConnection,
        default: String,
) -> String:
    ser = connection.get_handle()
    hex_base = f"55AB000B52{default.s[4:14]}"
    crc = crc8(hex_base)
    hex_data = f"{hex_base}{crc}"
    logging.info(f"set zero position command: {hex_data.upper()}")
    data_bytes = bytes.fromhex(hex_data)
    ser.write(data_bytes)
    response = ser.read(4)
    response_str = response.hex()
    return String(s=response_str)
