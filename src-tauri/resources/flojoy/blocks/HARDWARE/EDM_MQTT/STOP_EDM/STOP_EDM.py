from flojoy import flojoy, DataContainer
from typing import Optional
import paho.mqtt.client as mqtt


@flojoy
def STOP_EDM(
        broker_ip: str = "localhost",
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.username_pw_set("Admin", "123456")
    client.connect(broker_ip, 1883, keepalive=15)
    client.loop_start()

    try:
        message_info = client.publish("EDM/App/Test/Command", "Stop", qos=1)
        message_info.wait_for_publish(timeout=3.0)
        if not message_info.is_published():
            raise RuntimeError("EDM MQTT 停止指令发送超时")
    finally:
        client.loop_stop()
        client.disconnect()

    return default
