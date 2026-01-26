from flojoy import flojoy, DataContainer
from typing import Optional
import subprocess
import threading
import logging
import os
import sys


@flojoy
def START_EDM(
        broker_ip: str = "localhost",
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    """
    非阻塞展示HASS振动台温度和振动数据
    """
    logging.info(f"EDM BROKER IP:{broker_ip}")
    current_dir = os.path.dirname(os.path.abspath(__file__))
    run_file = os.path.join(current_dir, "mqtt_signal_chart.py")
    logging.info(f"脚本路径:{run_file}")
    command = f"{sys.executable} {run_file} {broker_ip}"
    logging.info(f"command:{command}")

    def run_command(cmd):
        # 启动子进程（不等待完成）
        subprocess.Popen(cmd, shell=True, start_new_session=True)

    thread = threading.Thread(target=run_command, args=(command,))
    thread.daemon = True
    thread.start()

    try:
        os.remove('status.txt')
        logging.info("运行前重置EDM状态记录文件")
    except FileNotFoundError:
        logging.info("status.txt 文件不存在")
        pass

    return None