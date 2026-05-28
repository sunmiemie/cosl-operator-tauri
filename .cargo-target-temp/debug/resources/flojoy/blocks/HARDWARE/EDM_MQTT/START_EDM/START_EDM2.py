from flojoy import flojoy, DataContainer
from typing import Optional
import logging
from mqtt import EDMMQTTClient


@flojoy
def START_EDM2(
        broker_ip: str = "localhost",
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    # 连接MQTT Broker
    mqtt_client = EDMMQTTClient(client_id="python client", topic_prefix="EDM", broker=broker_ip)
    mqtt_client.connect_mqtt()
    while not mqtt_client.connected:
        pass
    mqtt_client.run_test()
    logging.info("EDM START RUN...")
    while mqtt_client.test_status != 'Running':
        pass
    logging.info("EDM TEST RUNNING...")
    mqtt_client.request_detail_status()

    return None
