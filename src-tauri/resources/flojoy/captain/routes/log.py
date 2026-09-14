import logging
from typing import Any

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel, Field
from flojoy.execution_log import (
    execution_log_persistence_status,
    execution_log_path,
    read_execution_events,
    record_execution_event,
)

from captain.types.log import LogLevel
from captain.utils.blocks_path import get_flojoy_dir
import os
import yaml

router = APIRouter(tags=["log_level"])


class ExecutionLogEvent(BaseModel):
    eventType: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=2000)
    level: str = Field(default="info", max_length=20)
    direction: str = Field(default="", max_length=20)
    data: Any = None
    jobsetId: str = Field(default="", max_length=200)
    nodeId: str = Field(default="", max_length=200)
    function: str = Field(default="HALT_HASS_CLIENT", max_length=200)


@router.get("/execution_logs")
async def get_execution_logs(
    jobset_id: str = Query(default="", max_length=200),
    limit: int = Query(default=200, ge=1, le=500),
    before_event_id: str | None = Query(default=None, max_length=200),
    before_timestamp_ms: int | None = Query(default=None, ge=0),
):
    """Cursor-page Flojoy logs without rescanning and returning prior pages."""
    path = execution_log_path()
    page = read_execution_events(
        jobset_id=jobset_id.strip(),
        limit=limit + 1,
        before_event_id=before_event_id,
        before_timestamp_ms=before_timestamp_ms,
    )
    has_more = len(page) > limit
    events = page[-limit:]
    persistence = execution_log_persistence_status()
    return {
        "persisted": path.exists() and not persistence["lastError"],
        "path": str(path.resolve()),
        "events": events,
        "hasMore": has_more,
        "nextBeforeTimestampMs": (
            int(events[0].get("timestampMs") or 0) if has_more and events else None
        ),
        "nextBeforeEventId": (
            str(events[0].get("id") or "") if has_more and events else None
        ),
        "queued": persistence["queued"],
        "persistenceError": persistence["lastError"],
    }


@router.post("/execution_logs")
async def append_execution_log(event: ExecutionLogEvent):
    """接收客户端通信事件，写入与 Flojoy 节点相同的结构化日志。"""
    entry = record_execution_event(
        event.eventType,
        event.message,
        level=event.level,
        direction=event.direction,
        data=event.data,
        jobset_id=event.jobsetId,
        node_id=event.nodeId,
        function_name=event.function,
    )
    return {
        "persisted": bool(entry.get("persisted")),
        "event": entry,
    }


@router.get("/log_level")
async def get_log_level() -> LogLevel:
    return LogLevel(level=logging.getLevelName(logging.getLogger().level))


@router.post("/log_level")
async def set_log_level(log_level: LogLevel):
    level = log_level.level
    logging.getLogger().setLevel(level)
    logging.getLogger("uvicorn").setLevel(level)

    flojoy_config_path = os.path.join(get_flojoy_dir(), "flojoy.yaml")
    # Persist log level to disk
    with open(flojoy_config_path) as f:
        data = yaml.safe_load(f)

    data["LOG_LEVEL"] = level
    with open(flojoy_config_path, "w+") as f:
        yaml.safe_dump(data, f)

    return Response(status_code=200)
