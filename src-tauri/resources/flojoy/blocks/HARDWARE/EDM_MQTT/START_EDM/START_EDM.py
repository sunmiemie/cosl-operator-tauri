import logging
import threading
import time
from typing import Optional

import paho.mqtt.client as mqtt
from flojoy import DataContainer, flojoy
from flojoy.execution_log import (
    current_execution_context,
    record_execution_event,
)


MQTT_CONNECT_TIMEOUT_SECONDS = 5.0
WORKBENCH_RUNNING_TIMEOUT_SECONDS = 10.0
STATUS_REQUEST_INTERVAL_SECONDS = 1.0


class _EdmStartState:
    def __init__(self, execution_context: dict[str, str] | None = None) -> None:
        self.connected = threading.Event()
        self.running = threading.Event()
        self.last_test_status = ""
        self.execution_context = execution_context or {}

    def record_response(self, message: str, data, level: str = "info") -> None:
        record_execution_event(
            "device-response",
            message,
            level=level,
            direction="receive",
            data=data,
            jobset_id=self.execution_context.get("jobsetId"),
            node_id=self.execution_context.get("nodeId"),
            function_name=self.execution_context.get("function"),
        )

    def on_connect(self, client, _userdata, _flags, reason_code, _properties):
        if reason_code != 0:
            logging.error("EDM MQTT connect failed: %s", reason_code)
            self.record_response(
                "MQTT 连接失败",
                {"transport": "MQTT", "reasonCode": str(reason_code)},
                level="error",
            )
            return
        client.subscribe("EDM/App/Test/Status", qos=1)
        self.record_response(
            "MQTT 已连接并订阅状态主题",
            {
                "transport": "MQTT",
                "topic": "EDM/App/Test/Status",
                "qos": 1,
            },
        )
        self.connected.set()

    def on_message(self, _client, _userdata, message):
        if message.topic != "EDM/App/Test/Status":
            return
        try:
            import json

            payload = json.loads(message.payload.decode("utf-8"))
            status = str(payload.get("Status", "")).strip()
        except Exception as exc:
            logging.warning("invalid EDM test status payload: %s", exc)
            self.record_response(
                f"MQTT {message.topic} 回执解析失败",
                {
                    "transport": "MQTT",
                    "topic": message.topic,
                    "payload": message.payload,
                    "error": str(exc),
                },
                level="error",
            )
            return

        self.last_test_status = status
        logging.info("EDM test status: %s", status or "<empty>")
        self.record_response(
            f"MQTT {message.topic} 上报状态 {status or '<empty>'}",
            payload,
        )
        if status.lower() == "running":
            self.running.set()


def _publish_command(client, topic: str, command: str) -> None:
    record_execution_event(
        "device-command",
        f"MQTT {topic} 发送 {command}",
        direction="send",
        data={"transport": "MQTT", "topic": topic, "payload": command},
    )
    message_info = client.publish(topic, command, qos=1)
    message_info.wait_for_publish(timeout=3.0)
    if not message_info.is_published():
        raise RuntimeError(f"EDM MQTT 指令发送超时: {command}")
    logging.info("EDM MQTT command sent: %s", command)


@flojoy
def START_EDM(
        broker_ip: str = "192.168.1.54",
        default: Optional[DataContainer] = None,
) -> Optional[DataContainer]:
    """启动 EDM 工作台测试，不在 Flojoy Worker 内创建图形窗口。"""
    logging.info(f"EDM BROKER IP:{broker_ip}")
    state = _EdmStartState(current_execution_context())
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.username_pw_set("Admin", "123456")
    client.on_connect = state.on_connect
    client.on_message = state.on_message
    client.connect(broker_ip, 1883, keepalive=15)
    client.loop_start()

    try:
        if not state.connected.wait(MQTT_CONNECT_TIMEOUT_SECONDS):
            raise RuntimeError("EDM MQTT 连接超时，未开始工作台测试")

        _publish_command(client, "EDM/App/Test/Command", "Connect")
        # Connect 由工作台异步处理，稍作等待后再发送 Run，避免 Run 被忽略。
        time.sleep(0.5)
        _publish_command(client, "EDM/App/Test/Command", "Run")

        deadline = time.monotonic() + WORKBENCH_RUNNING_TIMEOUT_SECONDS
        while not state.running.is_set() and time.monotonic() < deadline:
            _publish_command(
                client,
                "EDM/App/Test/Command",
                "RequestTestStatus",
            )
            state.running.wait(STATUS_REQUEST_INTERVAL_SECONDS)

        if not state.running.is_set():
            try:
                _publish_command(client, "EDM/App/Test/Command", "Stop")
            except Exception as stop_error:
                logging.error(
                    "failed to stop EDM after running timeout: %s",
                    stop_error,
                )
            status = state.last_test_status or "未上报"
            raise RuntimeError(
                "EDM 工作台启动失败：10 秒内未确认 Running，"
                f"当前状态 {status}"
            )

        # 只有确认 Running 后才请求温度、振动明细，否则工作台不会上报。
        _publish_command(
            client,
            "EDM/THV/Test/Command",
            "RequestDetailStatus",
        )
    finally:
        client.loop_stop()
        client.disconnect()

    return default
