from __future__ import annotations

import logging
import threading
import time
from typing import Any

from flojoy.execution_log import record_execution_event


MEASUREMENT_LOCK_ATTRIBUTE = "_halt_hass_itech_measurement_lock"
MEASUREMENT_CACHE_ATTRIBUTE = "_halt_hass_itech_measurement_cache"
WARNING_STATE_ATTRIBUTE = "_halt_hass_itech_warning_state"
DEFAULT_QUERY_TIMEOUT_MS = 350
WARNING_INTERVAL_SECONDS = 5


def logged_itech_write(
    instrument: Any,
    *,
    operation_name: str,
    command: str,
) -> Any:
    """记录 ITECH SCPI 写指令及本地写入结果；设备本身无独立回执。"""
    record_execution_event(
        "device-command",
        f"{operation_name}：发送 ITECH 指令",
        direction="send",
        data={"transport": "VISA/SCPI", "command": command},
    )
    try:
        result = instrument.write(command)
    except Exception as exc:
        record_execution_event(
            "device-response",
            f"{operation_name}：ITECH 指令发送失败",
            level="error",
            direction="receive",
            data={
                "transport": "VISA/SCPI",
                "command": command,
                "error": str(exc),
            },
        )
        raise
    record_execution_event(
        "device-response",
        f"{operation_name}：指令已写入（设备无独立回执）",
        direction="receive",
        data={
            "transport": "VISA/SCPI",
            "command": command,
            "writeResult": result,
        },
    )
    return result


def logged_itech_query(
    instrument: Any,
    *,
    operation_name: str,
    command: str,
) -> Any:
    """记录 ITECH SCPI 查询指令和设备返回的原始文本。"""
    record_execution_event(
        "device-command",
        f"{operation_name}：发送 ITECH 查询",
        direction="send",
        data={"transport": "VISA/SCPI", "command": command},
    )
    try:
        response = instrument.query(command)
    except Exception as exc:
        record_execution_event(
            "device-response",
            f"{operation_name}：ITECH 查询失败",
            level="error",
            direction="receive",
            data={
                "transport": "VISA/SCPI",
                "command": command,
                "error": str(exc),
            },
        )
        raise
    record_execution_event(
        "device-response",
        f"{operation_name}：收到 ITECH 查询回执",
        direction="receive",
        data={
            "transport": "VISA/SCPI",
            "command": command,
            "response": str(response).strip(),
        },
    )
    return response


def _get_lock(instrument: Any) -> threading.Lock:
    lock = getattr(instrument, MEASUREMENT_LOCK_ATTRIBUTE, None)
    if lock is None:
        lock = threading.Lock()
        setattr(instrument, MEASUREMENT_LOCK_ATTRIBUTE, lock)
    return lock


def _get_cache(instrument: Any) -> dict[str, tuple[float, int]]:
    cache = getattr(instrument, MEASUREMENT_CACHE_ATTRIBUTE, None)
    if not isinstance(cache, dict):
        cache = {}
        setattr(instrument, MEASUREMENT_CACHE_ATTRIBUTE, cache)
    return cache


def _warn_throttled(
    instrument: Any,
    measurement_name: str,
    message: str,
) -> None:
    now = time.monotonic()
    state = getattr(instrument, WARNING_STATE_ATTRIBUTE, None)
    if not isinstance(state, dict):
        state = {}
        setattr(instrument, WARNING_STATE_ATTRIBUTE, state)

    last_warning_at = float(state.get(measurement_name, 0))
    if now - last_warning_at < WARNING_INTERVAL_SECONDS:
        return

    state[measurement_name] = now
    logging.warning("%s: %s", measurement_name, message)


def bounded_itech_measurement(
    instrument: Any,
    *,
    measurement_name: str,
    command: str,
    cache_key: str,
    timeout_ms: int = DEFAULT_QUERY_TIMEOUT_MS,
) -> tuple[float, dict[str, Any]]:
    """执行有截止时间的 ITECH 查询，失败时返回最近有效值及新鲜度。"""
    if timeout_ms <= 0:
        raise ValueError("timeout_ms 必须大于 0")

    with _get_lock(instrument):
        cache = _get_cache(instrument)
        previous_timeout = getattr(instrument, "timeout", None)
        timeout_changed = False
        try:
            try:
                instrument.timeout = int(timeout_ms)
                timeout_changed = True
            except (AttributeError, TypeError, ValueError):
                pass

            response = logged_itech_query(
                instrument,
                operation_name=measurement_name,
                command=command,
            )
            value = float(response)
            measured_at_ms = int(time.time() * 1000)
            cache[cache_key] = (value, measured_at_ms)
            return value, {
                "valid": True,
                "fresh": True,
                "last_value_at_ms": measured_at_ms,
                "error": "",
            }
        except Exception as exc:
            _warn_throttled(instrument, measurement_name, str(exc))
            record_execution_event(
                "device-response",
                f"{measurement_name}：测量失败，尝试使用最近有效值",
                level="error",
                direction="receive",
                data={
                    "transport": "VISA/SCPI",
                    "command": command,
                    "error": str(exc),
                    "cacheKey": cache_key,
                },
            )
            cached = cache.get(cache_key)
            if cached is None:
                return 0.0, {
                    "valid": False,
                    "fresh": False,
                    "last_value_at_ms": 0,
                    "error": str(exc),
                }

            cached_value, measured_at_ms = cached
            return cached_value, {
                "valid": True,
                "fresh": False,
                "last_value_at_ms": measured_at_ms,
                "error": str(exc),
            }
        finally:
            if timeout_changed:
                try:
                    instrument.timeout = previous_timeout
                except (AttributeError, TypeError, ValueError):
                    pass
