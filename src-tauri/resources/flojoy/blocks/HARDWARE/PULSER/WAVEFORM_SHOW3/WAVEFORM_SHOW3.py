from flojoy import flojoy, DataContainer, SerialDevice
from typing import Optional
import subprocess
import threading
import logging
import os
import sys


@flojoy
def WAVEFORM_SHOW3(
        device: SerialDevice,
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    """
    非阻塞展示脉冲器波形，启动后立即返回。
    """
    logging.info(f"OPEN SERIAL PORT:{device.get_port()}")
    current_dir = os.path.dirname(os.path.abspath(__file__))
    run_file = os.path.join(current_dir, "my_bo2.py")
    logging.info(f"脚本路径:{run_file}")
    command = f"{sys.executable} {run_file} {device.get_port()}"
    logging.info(f"command:{command}")

    def run_command(cmd):
        # 启动子进程（不等待完成）
        subprocess.Popen(cmd, shell=True, start_new_session=True)

    thread = threading.Thread(target=run_command, args=(command,))
    thread.daemon = True  # 主线程退出时自动终止子线程
    thread.start()

    return None
