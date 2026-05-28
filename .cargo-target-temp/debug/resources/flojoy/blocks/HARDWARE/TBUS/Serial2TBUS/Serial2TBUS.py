from typing import TypedDict
from flojoy import String, flojoy
import logging


def split_and_organize(en_str: str):
    """将字符串按6个一组分割，返回头部和尾部"""
    split_list = [en_str[i:i + 6] for i in range(0, len(en_str), 6)]
    if not split_list:
        return [], []
    return split_list[:-1], [split_list[-1]]


def binary_to_hex_with_padding(binary_str: str):
    """将二进制字符串转换为十六进制并补齐4位倍数"""
    padding = (4 - (len(binary_str) % 4)) % 4
    padded = '0' * padding + binary_str
    num_hex = len(padded) // 4
    return '0x' + format(int(padded, 2), f'0{num_hex}x')


def decryption_fun(data):
    """解密函数核心处理逻辑"""
    try:
        result = []
        for value in data:
            # 将十六进制转换为24位二进制
            binary = format(int(value, 16), '024b')
            # 分段处理并拼接有效位
            combined = binary[:8][4:] + binary[8:16][2:] + binary[16:][2:]
            hex_str = binary_to_hex_with_padding(combined)
            result.append(hex_str[2:].upper())
        return ''.join(result)
    except Exception as e:
        print(f"解密错误: {e}")
        return False


def get_decryption_str(en_str: str):
    """主解密流程控制"""
    heads, tails = split_and_organize(en_str)
    return decryption_fun(heads) + decryption_fun(tails)


class TBUSOutput(TypedDict):
    original: String
    processed: String


@flojoy
def Serial2TBUS(
        default: String,
) -> TBUSOutput:
    ser_response = default.s
    logging.info(f"serial response: {ser_response}")
    tbus_response = get_decryption_str(ser_response)
    logging.info(f"tbus response: {tbus_response}")
    tbus_response_bytes = bytes.fromhex(tbus_response[4:-4])
    response_str = tbus_response_bytes.decode('ascii')
    return TBUSOutput(original=String(s=tbus_response), processed=String(s=response_str))
