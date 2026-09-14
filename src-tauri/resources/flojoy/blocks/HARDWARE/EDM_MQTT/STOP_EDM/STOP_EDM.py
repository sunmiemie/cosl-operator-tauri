from flojoy import flojoy, DataContainer
from typing import Optional
import paho.mqtt.client as mqtt
from flojoy.execution_log import record_execution_event


@flojoy
def STOP_EDM(
        broker_ip: str = "192.168.1.54",
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.username_pw_set("Admin", "123456")
    client.connect(broker_ip, 1883, keepalive=15)
    client.loop_start()

    try:
        record_execution_event(
            "device-command",
            "MQTT EDM/App/Test/Command 发送 Stop",
            direction="send",
            data={
                "transport": "MQTT",
                "broker": broker_ip,
                "topic": "EDM/App/Test/Command",
                "payload": "Stop",
                "qos": 1,
            },
        )
        message_info = client.publish("EDM/App/Test/Command", "Stop", qos=1)
        message_info.wait_for_publish(timeout=3.0)
        if not message_info.is_published():
            raise RuntimeError("EDM MQTT 停止指令发送超时")
        record_execution_event(
            "device-response",
            "MQTT Stop 指令已由代理确认发布",
            direction="receive",
            data={
                "transport": "MQTT",
                "topic": "EDM/App/Test/Command",
                "payload": "Stop",
                "published": True,
            },
        )
    except Exception as exc:
        record_execution_event(
            "device-response",
            "MQTT Stop 指令执行失败",
            level="error",
            direction="receive",
            data={
                "transport": "MQTT",
                "broker": broker_ip,
                "topic": "EDM/App/Test/Command",
                "payload": "Stop",
                "error": str(exc),
            },
        )
        raise
    finally:
        client.loop_stop()
        client.disconnect()

    return default
