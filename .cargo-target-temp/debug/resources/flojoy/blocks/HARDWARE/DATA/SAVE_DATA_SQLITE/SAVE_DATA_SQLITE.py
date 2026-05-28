from flojoy import DataContainer, Boolean, String, Scalar, flojoy, DefaultParams
from typing import Optional, Literal
from datetime import datetime
import logging
import sqlite3


@flojoy(inject_node_metadata=True)
def SAVE_DATA_SQLITE(
        default_params: DefaultParams,
        dc: DataContainer,
        table_name: Literal[
            "read_status", "read_mast", "read_comm", "read_memory",
            "measure_itech3124_curr", "measure_itech6333A_curr"],
        # table_name: str,
) -> Optional[DataContainer]:
    job_id = default_params.job_id
    node_id = default_params.node_id
    current_time = datetime.now()
    local_time = current_time.strftime("%Y-%m-%d %H:%M:%S")
    logging.info(f"job_id: {job_id}, node_id: {node_id}, current time: {local_time}")

    conn = sqlite3.connect('hass.db')
    cursor = conn.cursor()

    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY,
            job_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            data_value TEXT,
            cur_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()

    container_value = ''
    if isinstance(dc, Scalar):
        container_value = dc.c
    elif isinstance(dc, String):
        container_value = dc.s
    elif isinstance(dc, Boolean):
        container_value = dc.b

    # 修复参数传递错误：使用元组代替集合
    cursor.execute(f'''
        INSERT INTO {table_name} (job_id, node_id, data_value, cur_time) VALUES (?,?,?,?)''',
                   (job_id, node_id, str(container_value), local_time))

    conn.commit()
    conn.close()  # 关闭数据库连接

    return None
