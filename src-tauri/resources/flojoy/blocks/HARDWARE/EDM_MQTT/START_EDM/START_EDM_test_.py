import sys
from pathlib import Path

FLOJOY_ROOT = Path(__file__).parents[4]
if str(FLOJOY_ROOT) not in sys.path:
    sys.path.insert(0, str(FLOJOY_ROOT))

from blocks.HARDWARE.EDM_MQTT.START_EDM.START_EDM import _EdmStartState


class FakeClient:
    def __init__(self) -> None:
        self.subscriptions = []

    def subscribe(self, topic: str, qos: int):
        self.subscriptions.append((topic, qos))


class FakeMessage:
    topic = "EDM/App/Test/Status"

    def __init__(self, payload: bytes) -> None:
        self.payload = payload


def test_waits_for_running_status_before_detail_request_stage(monkeypatch):
    monkeypatch.setattr(
        "blocks.HARDWARE.EDM_MQTT.START_EDM.START_EDM.record_execution_event",
        lambda *_args, **_kwargs: None,
    )
    state = _EdmStartState()
    client = FakeClient()
    state.on_connect(client, None, None, 0, None)
    assert state.connected.is_set()
    assert client.subscriptions == [("EDM/App/Test/Status", 1)]

    state.on_message(client, None, FakeMessage(b'{"Status":"Stopped"}'))
    assert state.running.is_set() is False

    state.on_message(client, None, FakeMessage(b'{"Status":"Running"}'))
    assert state.running.is_set()
    assert state.last_test_status == "Running"
