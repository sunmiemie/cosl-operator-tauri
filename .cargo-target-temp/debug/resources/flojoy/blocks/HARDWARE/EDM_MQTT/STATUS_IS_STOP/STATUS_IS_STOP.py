from flojoy import Boolean, flojoy, DataContainer
from typing import Optional
import logging
import os


@flojoy
def STATUS_IS_STOP(
        default: Optional[DataContainer] = None,
) -> Boolean:
    state_file = "status.txt"
    default_state = "Stopped"

    if not os.path.exists(state_file):
        return Boolean(False)
    try:
        with open(state_file, "r") as f:
            content = f.read().strip()
            if content == default_state:
                return Boolean(True)
            else:
                return Boolean(False)
    except Exception as e:
        logging.info(f"读取状态失败: {e}，使用默认状态")
        return Boolean(False)
