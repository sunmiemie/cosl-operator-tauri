from __future__ import annotations

import atexit
import json
import os
import queue
import threading
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator


LOG_FILE_NAME = "flojoy-execution.jsonl"
MAX_LOG_BYTES = 20 * 1024 * 1024
MAX_TEXT_LENGTH = 2_000
MAX_COLLECTION_ITEMS = 20
LOG_WRITE_BATCH_SIZE = 100
LOG_WRITE_BATCH_WAIT_SECONDS = 0.2
LOG_WRITE_QUEUE_SIZE = 5_000
LOG_READ_CHUNK_BYTES = 64 * 1024
SENSITIVE_KEY_PARTS = ("password", "passwd", "token", "secret", "credential")

_context: ContextVar[dict[str, str]] = ContextVar(
    "flojoy_execution_log_context",
    default={},
)
_process_lock = threading.Lock()
_writer_start_lock = threading.Lock()
_write_queue: queue.Queue[tuple[Path, str] | object] = queue.Queue(
    maxsize=LOG_WRITE_QUEUE_SIZE
)
_writer_thread: threading.Thread | None = None
_writer_stop = object()
_writer_stopping = False
_last_persistence_error = ""


def current_execution_context() -> dict[str, str]:
    return dict(_context.get())


def execution_log_path() -> Path:
    configured_dir = os.environ.get("FLOJOY_EXECUTION_LOG_DIR", "").strip()
    if configured_dir:
        log_dir = Path(configured_dir)
    elif os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        log_dir = Path(os.environ["LOCALAPPDATA"]) / "COSL-Operator" / "logs"
    else:
        state_home = os.environ.get("XDG_STATE_HOME", "").strip()
        base_dir = Path(state_home) if state_home else Path.home() / ".local" / "state"
        log_dir = base_dir / "cosl-operator" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / LOG_FILE_NAME


def _short_text(value: Any, limit: int = MAX_TEXT_LENGTH) -> str:
    text = str(value)
    return text if len(text) <= limit else f"{text[:limit]}…"


def summarize_execution_value(value: Any, depth: int = 0) -> Any:
    """把节点参数和结果压缩成适合写入 JSONL 的可读摘要。"""
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _short_text(value)
    if isinstance(value, bytes):
        return {
            "type": "bytes",
            "length": len(value),
            "hex": value[:64].hex().upper(),
        }
    if depth >= 3:
        return _short_text(value, 300)

    shape = getattr(value, "shape", None)
    dtype = getattr(value, "dtype", None)
    if shape is not None:
        return {
            "type": type(value).__name__,
            "shape": list(shape),
            "dtype": str(dtype or ""),
        }

    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= MAX_COLLECTION_ITEMS:
                result["…"] = f"其余 {len(value) - MAX_COLLECTION_ITEMS} 项已省略"
                break
            key_text = str(key)
            if any(part in key_text.lower() for part in SENSITIVE_KEY_PARTS):
                result[key_text] = "***"
            else:
                result[key_text] = summarize_execution_value(item, depth + 1)
        return result

    if isinstance(value, (list, tuple, set)):
        items = list(value)
        result = [
            summarize_execution_value(item, depth + 1)
            for item in items[:MAX_COLLECTION_ITEMS]
        ]
        if len(items) > MAX_COLLECTION_ITEMS:
            result.append(f"其余 {len(items) - MAX_COLLECTION_ITEMS} 项已省略")
        return result

    if hasattr(value, "items"):
        try:
            return summarize_execution_value(dict(value.items()), depth + 1)
        except Exception:
            pass

    safe_attrs: dict[str, Any] = {}
    for attr in ("type", "s", "c", "b", "extra"):
        try:
            if hasattr(value, attr):
                safe_attrs[attr] = summarize_execution_value(
                    getattr(value, attr),
                    depth + 1,
                )
        except Exception:
            continue
    if safe_attrs:
        return {"type": type(value).__name__, **safe_attrs}

    return {"type": type(value).__name__, "value": _short_text(value, 300)}


@contextmanager
def execution_log_context(
    *,
    jobset_id: str,
    node_id: str,
    function_name: str,
) -> Iterator[None]:
    token = _context.set(
        {
            "jobsetId": str(jobset_id or ""),
            "nodeId": str(node_id or ""),
            "function": str(function_name or ""),
        }
    )
    try:
        yield
    finally:
        _context.reset(token)


def _rotate_if_needed(path: Path, incoming_bytes: int = 0) -> None:
    try:
        current_size = path.stat().st_size if path.exists() else 0
        if current_size + incoming_bytes < MAX_LOG_BYTES:
            return
        archived_path = path.with_suffix(path.suffix + ".1")
        if archived_path.exists():
            archived_path.unlink()
        path.replace(archived_path)
    except OSError:
        # 日志轮转失败不能影响测试节点执行，继续向现有文件追加。
        return


def _write_serialized_batch(items: list[tuple[Path, str]]) -> None:
    """Write a batch without making device nodes wait on disk I/O."""
    if not items:
        return

    # A test or runtime configuration may change the target directory. Preserve
    # queue order while still opening each consecutive target only once.
    groups: list[tuple[Path, list[str]]] = []
    for path, serialized in items:
        if groups and groups[-1][0] == path:
            groups[-1][1].append(serialized)
        else:
            groups.append((path, [serialized]))

    with _process_lock:
        for path, serialized_entries in groups:
            path.parent.mkdir(parents=True, exist_ok=True)
            payload = "".join(f"{entry}\n" for entry in serialized_entries)
            _rotate_if_needed(path, len(payload.encode("utf-8")))
            with path.open("a", encoding="utf-8", newline="\n") as file:
                file.write(payload)
                file.flush()


def _execution_log_writer() -> None:
    global _last_persistence_error

    should_stop = False
    while not should_stop:
        item = _write_queue.get()
        if item is _writer_stop:
            _write_queue.task_done()
            break

        batch = [item]
        deadline = time.monotonic() + LOG_WRITE_BATCH_WAIT_SECONDS
        while len(batch) < LOG_WRITE_BATCH_SIZE:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                next_item = _write_queue.get(timeout=remaining)
            except queue.Empty:
                break
            if next_item is _writer_stop:
                _write_queue.task_done()
                should_stop = True
                break
            batch.append(next_item)

        try:
            _write_serialized_batch(batch)  # type: ignore[arg-type]
            _last_persistence_error = ""
        except Exception as exc:
            # Logging is diagnostic only. A disk failure must never stop the
            # active test flow.
            _last_persistence_error = _short_text(exc, 500)
        finally:
            for _ in batch:
                _write_queue.task_done()


def _ensure_writer_started() -> None:
    global _writer_thread
    if _writer_thread is not None and _writer_thread.is_alive():
        return
    with _writer_start_lock:
        if _writer_thread is not None and _writer_thread.is_alive():
            return
        _writer_thread = threading.Thread(
            target=_execution_log_writer,
            name="flojoy-execution-log-writer",
            daemon=True,
        )
        _writer_thread.start()


def flush_execution_logs(timeout: float = 2.0) -> bool:
    """Wait briefly for queued records; used before history reads and exit."""
    deadline = time.monotonic() + max(0.0, timeout)
    while _write_queue.unfinished_tasks:
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.01)
    return True


def execution_log_persistence_status() -> dict[str, Any]:
    return {
        "queued": _write_queue.qsize(),
        "lastError": _last_persistence_error,
    }


def _shutdown_execution_log_writer() -> None:
    global _writer_stopping
    if _writer_stopping:
        return
    _writer_stopping = True
    flush_execution_logs(2.0)
    thread = _writer_thread
    if thread is None or not thread.is_alive():
        return
    try:
        _write_queue.put_nowait(_writer_stop)
    except queue.Full:
        return
    thread.join(timeout=1.0)


atexit.register(_shutdown_execution_log_writer)


def record_execution_event(
    event_type: str,
    message: str,
    *,
    level: str = "info",
    direction: str = "",
    data: Any = None,
    jobset_id: str | None = None,
    node_id: str | None = None,
    function_name: str | None = None,
) -> dict[str, Any]:
    context = _context.get()
    now = time.time()
    entry: dict[str, Any] = {
        "id": f"{time.time_ns()}-{os.getpid()}-{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.fromtimestamp(now).astimezone().isoformat(
            timespec="milliseconds"
        ),
        "timestampMs": int(now * 1000),
        "level": str(level or "info").lower(),
        "eventType": str(event_type),
        "direction": str(direction or ""),
        "jobsetId": str(jobset_id if jobset_id is not None else context.get("jobsetId", "")),
        "nodeId": str(node_id if node_id is not None else context.get("nodeId", "")),
        "function": str(
            function_name if function_name is not None else context.get("function", "")
        ),
        "message": _short_text(message),
        "data": summarize_execution_value(data),
    }
    # 日志是诊断旁路：测试节点只负责入队，不等待文件打开、轮转和刷新。
    try:
        path = execution_log_path()
        entry["persisted"] = True
        entry["persistenceMode"] = "buffered"
        serialized = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
        _ensure_writer_started()
        try:
            _write_queue.put_nowait((path, serialized))
        except queue.Full:
            # Preserve rare error records even under sustained overload. Routine
            # information may be dropped rather than delaying hardware control.
            if entry["level"] == "error":
                _write_serialized_batch([(path, serialized)])
            else:
                entry["persisted"] = False
                entry["persistenceError"] = "execution log queue is full"
    except Exception as exc:
        entry["persisted"] = False
        entry["persistenceError"] = _short_text(exc, 500)
    return entry


def _iter_lines_reverse(path: Path) -> Iterator[bytes]:
    """Yield complete JSONL records newest-first without loading the file."""
    if not path.exists():
        return
    with path.open("rb") as file:
        file.seek(0, os.SEEK_END)
        position = file.tell()
        remainder = b""
        while position > 0:
            read_size = min(LOG_READ_CHUNK_BYTES, position)
            position -= read_size
            file.seek(position)
            payload = file.read(read_size) + remainder
            parts = payload.split(b"\n")
            remainder = parts[0]
            for line in reversed(parts[1:]):
                if line.strip():
                    yield line
        if remainder.strip():
            yield remainder


def read_execution_events(
    *,
    jobset_id: str = "",
    limit: int = 200,
    before_event_id: str | None = None,
    before_timestamp_ms: int | None = None,
    max_tail_bytes: int | None = None,
) -> list[dict[str, Any]]:
    del max_tail_bytes  # Kept for compatibility with earlier callers.
    flush_execution_logs(1.0)
    path = execution_log_path()
    archived_path = path.with_suffix(path.suffix + ".1")
    if not path.exists() and not archived_path.exists():
        return []

    requested_limit = max(1, min(int(limit), 5_000))
    events: list[dict[str, Any]] = []
    cursor_found = before_event_id is None
    for candidate_path in (path, archived_path):
        for raw_line in _iter_lines_reverse(candidate_path):
            try:
                entry = json.loads(raw_line.decode("utf-8", errors="replace"))
            except json.JSONDecodeError:
                continue
            if not cursor_found:
                if str(entry.get("id", "")) == before_event_id:
                    cursor_found = True
                continue
            if jobset_id and str(entry.get("jobsetId", "")) != jobset_id:
                continue
            timestamp_ms = int(entry.get("timestampMs") or 0)
            if (
                before_event_id is None
                and before_timestamp_ms is not None
                and timestamp_ms >= before_timestamp_ms
            ):
                continue
            events.append(entry)
            if len(events) >= requested_limit:
                return list(reversed(events))
    return list(reversed(events))
