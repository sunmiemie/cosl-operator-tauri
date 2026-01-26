from flojoy import String, flojoy, DataContainer, DefaultParams, SmallMemory
from typing import Optional
from datetime import datetime
import logging


@flojoy(inject_node_metadata=True)
def PRINT(
        default_params: DefaultParams,
        _: Optional[DataContainer] = None,
) -> None:
    job_id = default_params.job_id
    node_id = default_params.node_id
    current_time = datetime.now()
    value = current_time.strftime("%Y-%m-%d %H:%M:%S")
    logging.info(f"job_id: {job_id}, node_id: {node_id}, current time: {value}")

    return None
