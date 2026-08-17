from __future__ import annotations

import logging
import threading
import time
from typing import Any


SERIAL_LOCK_ATTRIBUTE = "_halt_hass_tbus_query_lock"
WARNING_STATE_ATTRIBUTE = "_halt_hass_tbus_warning_state"
DEFAULT_RESPONSE_TIMEOUT_SECONDS = 0.35
SERIAL_READ_SLICE_SECONDS = 0.02
WARNING_INTERVAL_SECONDS = 5


def _get_query_lock(serial_handle: Any) -> threading.Lock:
    lock = getattr(serial_handle, SERIAL_LOCK_ATTRIBUTE, None)
    if lock is None:
        lock = threading.Lock()
        setattr(serial_handle, SERIAL_LOCK_ATTRIBUTE, lock)
    return lock


def _warn_throttled(
    serial_handle: Any,
    query_name: str,
    message: str,
) -> None:
    now = time.monotonic()
    warning_state = getattr(serial_handle, WARNING_STATE_ATTRIBUTE, None)
    if not isinstance(warning_state, dict):
        warning_state = {}
        setattr(serial_handle, WARNING_STATE_ATTRIBUTE, warning_state)

    last_warning_at = float(warning_state.get(query_name, 0))
    if now - last_warning_at < WARNING_INTERVAL_SECONDS:
        return

    warning_state[query_name] = now
    logging.warning("%s: %s", query_name, message)


def bounded_serial_query(
    serial_handle: Any,
    *,
    query_name: str,
    command_hex: str,
    expected_length: int,
    response_timeout: float = DEFAULT_RESPONSE_TIMEOUT_SECONDS,
) -> bytes:
    """发送一次串口查询，并在短截止时间内读取完整响应。

    遥测失败不应中断 HALT-HASS 长时间循环，所以串口异常、超时和
    不完整帧都返回空字节，同时按设备/命令限频记录警告。
    """
    if expected_length <= 0:
        raise ValueError("expected_length 必须大于 0")
    if response_timeout <= 0:
        raise ValueError("response_timeout 必须大于 0")

    lock = _get_query_lock(serial_handle)
    with lock:
        previous_timeout = getattr(serial_handle, "timeout", None)
        timeout_changed = False
        try:
            try:
                serial_handle.timeout = min(
                    float(response_timeout),
                    SERIAL_READ_SLICE_SECONDS,
                )
                timeout_changed = True
            except (AttributeError, TypeError, ValueError):
                pass

            # 上一轮不完整响应不能混入本轮固定长度协议帧。
            reset_input_buffer = getattr(serial_handle, "reset_input_buffer", None)
            if callable(reset_input_buffer):
                reset_input_buffer()

            serial_handle.write(bytes.fromhex(command_hex))
            flush = getattr(serial_handle, "flush", None)
            if callable(flush):
                flush()

            response = bytearray()
            deadline = time.monotonic() + float(response_timeout)
            while (
                len(response) < expected_length
                and time.monotonic() < deadline
            ):
                try:
                    waiting = int(
                        getattr(serial_handle, "in_waiting", 0) or 0
                    )
                except (OSError, TypeError, ValueError):
                    waiting = 0

                remaining = expected_length - len(response)
                read_size = min(max(waiting, 1), remaining)
                chunk = serial_handle.read(read_size)
                if chunk:
                    response.extend(chunk)

            if len(response) != expected_length:
                _warn_throttled(
                    serial_handle,
                    query_name,
                    (
                        f"响应超时或长度不完整，期望 {expected_length} 字节，"
                        f"实际 {len(response)} 字节"
                    ),
                )
                return b""

            return bytes(response)
        except Exception as exc:
            _warn_throttled(serial_handle, query_name, str(exc))
            return b""
        finally:
            if timeout_changed and getattr(serial_handle, "is_open", True):
                try:
                    serial_handle.timeout = previous_timeout
                except (AttributeError, TypeError, ValueError):
                    pass


def bounded_tbus_query(
    serial_handle: Any,
    *,
    query_name: str,
    command_hex: str,
    expected_length: int,
    response_timeout: float = DEFAULT_RESPONSE_TIMEOUT_SECONDS,
) -> bytes:
    """Backward-compatible TBUS wrapper around the shared bounded query."""
    return bounded_serial_query(
        serial_handle,
        query_name=query_name,
        command_hex=command_hex,
        expected_length=expected_length,
        response_timeout=response_timeout,
    )
