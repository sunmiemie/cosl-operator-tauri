from flojoy import File, flojoy, DataContainer, SerialDevice
from typing import Optional
import subprocess
import threading
import logging
import serial
import os


@flojoy
def EXEC_COMMAND(
        device: SerialDevice,
        file_path: File,
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    """
    非阻塞执行命令（如 `python 123.py`），启动后立即返回。
    """
    logging.info(f"OPEN SERIAL PORT:{device.get_port()}")
    ser = serial.Serial(
        port=device.get_port(),  # 存储板串口设备
        baudrate=9600,  # 波特率
        bytesize=serial.EIGHTBITS,  # 8位数据位
        parity=serial.PARITY_NONE,  # 无校验
        stopbits=serial.STOPBITS_ONE,  # 1位停止位
        timeout=1  # 超时时间(秒)
    )
    hex_data = "AA560007A1000400000000AB"
    data_bytes = bytes.fromhex(hex_data)
    ser.write(data_bytes)
    logging.info(f"已发送数据: {hex_data}")

    logging.info(f"ref:{file_path.ref}")
    current_dir = os.path.dirname(os.path.abspath(__file__))
    data_file = os.path.join(current_dir, "test_bo.py")
    logging.info(f"当前路径:{data_file}")
    command = f"C:/Users/Admin/.conda/envs/python311/python.exe {data_file}"

    def run_command(cmd):
        # 启动子进程（不等待完成）
        subprocess.Popen(cmd, shell=True, start_new_session=True)

    # 在子线程中执行命令（可选，但更安全）
    thread = threading.Thread(target=run_command, args=(command,))
    thread.daemon = True  # 主线程退出时自动终止子线程
    thread.start()

    return None
