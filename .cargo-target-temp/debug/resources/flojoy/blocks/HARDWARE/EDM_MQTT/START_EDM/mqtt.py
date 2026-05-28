import threading
from paho.mqtt import client as mqtt_client
from app_topics import *
import json


# This class defines the mqtt client interface that we will use to interact with EDM's broker.
class EDMMQTTClient:
    def _loop_client(self):
        self.internal_client.loop_forever()

    def __init__(self, client_id, topic_prefix, debug=False, verbose=True, auto_connect=False, broker="192.168.1.20",
                 port=1883,
                 username='Admin', password='123456'):
        """
        Initialize method
        Set up variables and client
        """
        # Setup variables that are common to client
        self.client_id = client_id
        self.topic_prefix = topic_prefix
        self.debug = debug
        self.verbose = verbose
        self.broker = broker
        self.port = port
        self.username = username
        self.password = password
        self.internal_client = None
        self.connected = False
        self.sys_status = ""
        self.test_status = ""
        self.vib_status_list = []
        self.th_status_list = []
        self.timeout = 5
        self.subscribe_topics = [app_topics.TOPIC_APP_SYSTEM_STATUS,
                                 app_topics.TOPIC_APP_TEST_STATUS,
                                 app_topics.TOPIC_APP_TEST_LIST,
                                 thv_topics.TOPIC_THV_TEST_VIB_STATUS,
                                 thv_topics.TOPIC_THV_TEST_TH_STATUS]

    def load_schedule(self, schedule_file):
        # This functionality may not be implemented yet
        with open(schedule_file, 'r') as schedule:
            schedule_as_string = ""
            lines = schedule.readlines()
            for line in lines:
                schedule_as_string += line
            self.publish(vcs_topics.TOPIC_VCS_TEST_COMMAND, command_key.SetSchedule + f";{schedule_as_string}")

    def connect_mqtt(self):
        """
        Connects MQTT broker/client
        """
        # Set Connecting Client ID
        client = mqtt_client.Client(client_id=self.client_id,
                                    callback_api_version=mqtt_client.CallbackAPIVersion.VERSION2)
        client.username_pw_set(self.username, self.password)
        client.on_connect = self.on_connect
        client.on_message = self.on_message
        self.internal_client = client
        client.connect(self.broker, self.port)
        client_thread = threading.Thread(target=self._loop_client, args=(), daemon=True)
        client_thread.start()

    def publish(self, pubtopic, msg):
        """
        Publishes a topic to EDM broker
        """
        # msg = f"messages: {msg_count}"
        result = self.internal_client.publish(self.add_topic_prefix(pubtopic), msg, qos=1)
        # result: [0, 1]
        status = result[0]
        if status == 0:
            if self.verbose:
                print(f"Sending '{msg}' to topic '{pubtopic}'")
        else:
            print(f"Failed to send message to topic {pubtopic}")

    def on_connect(self, client, userdata, flags, rc, properties):
        """
        Informs the user about a successful or unsuccessful connection
        """
        if rc == 0:
            if self.verbose:
                print("Connected to MQTT Broker!")
            for topic in self.subscribe_topics:
                self.subscribe(topic)
            self.connected = True
        else:
            print("Failed to connect, return code %d\n", rc)

    def on_message(self, client, userdata, msg):
        """
        Handles receiving a message from EDM
        """
        # print(f"Received `{msg.payload.decode()}` from `{msg.topic}` topic")
        if self.verbose:
            print(f"Received message from '{msg.topic}' topic")
        try:
            if msg.topic == self.add_topic_prefix(app_topics.TOPIC_APP_SYSTEM_STATUS):
                data = json.loads(msg.payload.decode())
                self.sys_status = data['Status']
            elif msg.topic == self.add_topic_prefix(app_topics.TOPIC_APP_TEST_STATUS):
                data = json.loads(msg.payload.decode())
                self.test_status = data['Status']
                # print(f"[Status Update] Current test_status: {self.test_status}")
            elif msg.topic == self.add_topic_prefix(thv_topics.TOPIC_THV_TEST_VIB_STATUS):
                data = json.loads(msg.payload.decode())
                self.vib_status_list.append(data)
            elif msg.topic == self.add_topic_prefix(thv_topics.TOPIC_THV_TEST_TH_STATUS):
                data = json.loads(msg.payload.decode())
                self.th_status_list.append(data)
        except Exception as exception:
            print(exception)

    def subscribe(self, topic):
        """
        Subscribe to EDM topics
        """
        self.internal_client.subscribe(self.add_topic_prefix(topic))

    def add_topic_prefix(self, value: str):
        if self.topic_prefix == "":
            return value
        return self.topic_prefix + '/' + value

    def run_test(self):
        self.publish(app_topics.TOPIC_APP_TEST_COMMAND, command_key.Connect)
        self.publish(app_topics.TOPIC_APP_TEST_COMMAND, command_key.Run)

    def stop_test(self):
        self.publish(app_topics.TOPIC_APP_TEST_COMMAND, command_key.Stop)

    def request_test_status(self):
        self.publish(app_topics.TOPIC_APP_TEST_COMMAND, command_key.RequestTestStatus)
        return self.test_status

    def request_detail_status(self):
        self.publish(thv_topics.TOPIC_THV_TEST_COMMAND, command_key.RequestDetailStatus)
