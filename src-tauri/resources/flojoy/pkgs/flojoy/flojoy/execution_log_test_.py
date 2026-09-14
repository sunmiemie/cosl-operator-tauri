from flojoy.execution_log import (
    execution_log_context,
    record_execution_event,
    read_execution_events,
)


def test_execution_log_is_persisted_filtered_and_masks_secrets(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOJOY_EXECUTION_LOG_DIR", str(tmp_path))

    with execution_log_context(
        jobset_id="job-1",
        node_id="node-1",
        function_name="TEST_NODE",
    ):
        entry = record_execution_event(
            "device-command",
            "发送测试指令",
            direction="send",
            data={"payload": "Run", "password": "do-not-write"},
        )
    record_execution_event(
        "node-success",
        "其它任务",
        jobset_id="job-2",
    )

    assert entry["persisted"] is True
    events = read_execution_events(jobset_id="job-1", limit=20)
    assert len(events) == 1
    assert events[0]["nodeId"] == "node-1"
    assert events[0]["function"] == "TEST_NODE"
    assert events[0]["data"]["password"] == "***"


def test_execution_log_failure_does_not_break_node(monkeypatch):
    def raise_disk_error():
        raise OSError("disk unavailable")

    monkeypatch.setattr(
        "flojoy.execution_log.execution_log_path",
        raise_disk_error,
    )

    entry = record_execution_event("node-start", "开始")

    assert entry["persisted"] is False
    assert "disk unavailable" in entry["persistenceError"]


def test_execution_log_history_uses_cursor_pages(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOJOY_EXECUTION_LOG_DIR", str(tmp_path))

    for index in range(5):
        record_execution_event(
            "device-response",
            f"回执 {index}",
            jobset_id="cursor-job",
        )

    latest = read_execution_events(jobset_id="cursor-job", limit=3)
    assert [entry["message"] for entry in latest] == ["回执 2", "回执 3", "回执 4"]

    earlier = read_execution_events(
        jobset_id="cursor-job",
        limit=3,
        before_event_id=latest[0]["id"],
    )
    assert [entry["message"] for entry in earlier] == ["回执 0", "回执 1"]
