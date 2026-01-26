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
    client.connect(broker_ip, 1883)
    client.publish("EDM/App/Test/Command", "Stop", qos=1)
    client.loop(timeout=2.0)
    client.disconnect()

    return None
