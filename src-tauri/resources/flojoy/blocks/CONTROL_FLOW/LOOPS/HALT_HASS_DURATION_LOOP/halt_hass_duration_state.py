import math
from typing import Any, Mapping


def evaluate_duration_state(
    previous_state: Mapping[str, Any] | None,
    duration_seconds: float,
    now_monotonic: float,
) -> tuple[dict[str, float], bool]:
    """计算 HALT-HASS 时长循环的状态，不依赖 Flojoy 运行环境。"""
    duration = float(duration_seconds)
    now = float(now_monotonic)

    if not math.isfinite(duration) or duration < 0:
        raise ValueError("duration_seconds 必须是大于等于 0 的有限数值")
    if not math.isfinite(now):
        raise ValueError("now_monotonic 必须是有限数值")

    state = dict(previous_state or {})
    stored_duration = state.get("duration_seconds")
    started_at = state.get("started_at_monotonic")

    if (
        not isinstance(started_at, (int, float))
        or not math.isfinite(float(started_at))
        or not isinstance(stored_duration, (int, float))
        or float(stored_duration) != duration
    ):
        started_at = now

    elapsed = max(0.0, now - float(started_at))
    remaining = max(0.0, duration - elapsed)
    is_finished = duration == 0 or elapsed >= duration

    return {
        "duration_seconds": duration,
        "started_at_monotonic": float(started_at),
        "elapsed_seconds": elapsed,
        "remaining_seconds": remaining,
    }, is_finished
