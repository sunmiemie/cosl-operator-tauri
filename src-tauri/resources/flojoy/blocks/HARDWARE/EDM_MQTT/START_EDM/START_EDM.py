import logging
import time
from typing import Optional

import paho.mqtt.client as mqtt
from flojoy import DataContainer, flojoy


@flojoy
def START_EDM(
        broker_ip: str = "localhost",
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    """启动 EDM 工作台测试，不在 Flojoy Worker 内创建图形窗口。"""
    logging.info(f"EDM BROKER IP:{broker_ip}")
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.username_pw_set("Admin", "123456")
    client.connect(broker_ip, 1883, keepalive=15)
    client.loop_start()

    try:
        commands = (
            ("EDM/App/Test/Command", "Connect"),
            ("EDM/App/Test/Command", "Run"),
            ("EDM/THV/Test/Command", "RequestDetailStatus"),
        )
        for topic, command in commands:
            message_info = client.publish(topic, command, qos=1)
            message_info.wait_for_publish(timeout=3.0)
            if not message_info.is_published():
                raise RuntimeError(f"EDM MQTT 指令发送超时: {command}")
            logging.info("EDM MQTT command sent: %s", command)
            time.sleep(0.1)
    finally:
        client.loop_stop()
        client.disconnect()

    return default
