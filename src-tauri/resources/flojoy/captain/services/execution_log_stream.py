from __future__ import annotations

import asyncio
import json

from captain.utils.config import manager
from captain.utils.logger import logger
from flojoy.execution_log import execution_log_path

MAX_LOG_EVENTS_PER_BATCH = 100


async def _broadcast_batches(events: list[dict]) -> None:
    for start in range(0, len(events), MAX_LOG_EVENTS_PER_BATCH):
        await manager.log_ws.broadcast(
            {
                "type": "execution_log_batch",
                "events": events[start : start + MAX_LOG_EVENTS_PER_BATCH],
            }
        )


async def stream_execution_log_events(poll_interval: float = 0.2) -> None:
    """Tail JSONL and batch logs onto their isolated best-effort socket."""
    path = execution_log_path()
    offset = path.stat().st_size if path.exists() else 0
    remainder = b""
    while True:
        await asyncio.sleep(poll_interval)
        try:
            if not path.exists():
                offset = 0
                remainder = b""
                continue
            size = path.stat().st_size
            if size < offset:
                offset = 0
                remainder = b""
            if size == offset:
                continue
            with path.open("rb") as source:
                source.seek(offset)
                chunk = source.read()
                offset = source.tell()
            payload = remainder + chunk
            lines = payload.split(b"\n")
            remainder = lines.pop() if lines else b""
            events: list[dict] = []
            for raw_line in lines:
                if not raw_line.strip():
                    continue
                try:
                    event = json.loads(raw_line.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    continue
                events.append(event)
            if events:
                await _broadcast_batches(events)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("HALT-HASS execution log stream failed: %s", exc)
