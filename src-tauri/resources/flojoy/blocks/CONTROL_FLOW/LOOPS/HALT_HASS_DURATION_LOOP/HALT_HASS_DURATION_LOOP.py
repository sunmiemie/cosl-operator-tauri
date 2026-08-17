import time
from typing import Any, Optional, TypedDict

from flojoy import (
    DataContainer,
    DefaultParams,
    JobResultBuilder,
    SmallMemory,
    flojoy,
)

from blocks.CONTROL_FLOW.LOOPS.HALT_HASS_DURATION_LOOP.halt_hass_duration_state import (
    evaluate_duration_state,
)


MEMORY_KEY = "halt-hass-duration-loop"


class DurationLoopOutput(TypedDict):
    body: Any
    end: Any


def _build_result(
    default: Optional[DataContainer],
    is_finished: bool,
) -> DurationLoopOutput:
    inputs = [default] if default is not None else []
    return DurationLoopOutput(
        body=(
            JobResultBuilder()
            .from_inputs(inputs)
            .flow_by_flag(
                flag=is_finished,
                false_direction=["body"],
                true_direction=["end"],
            )
            .build()
        ),
        end=(
            JobResultBuilder()
            .from_inputs(inputs)
            .flow_by_flag(
                flag=is_finished,
                false_direction=["body"],
                true_direction=["end"],
            )
            .build()
        ),
    )


@flojoy(inject_node_metadata=True)
def HALT_HASS_DURATION_LOOP(
    default_params: DefaultParams,
    default: Optional[DataContainer] = None,
    duration_seconds: float = 3600,
) -> DurationLoopOutput:
    """按工单剩余总时长执行 HALT-HASS 采集循环。

    Parameters
    ----------
    duration_seconds : float
        本次流程允许运行的剩余秒数。首次运行传总时长，暂存恢复传剩余时长。

    Returns
    -------
    body : DataContainer
        尚有剩余时长时进入采集分支。
    end : DataContainer
        达到剩余总时长后进入清理分支。
    """
    node_id = default_params.node_id
    memory = SmallMemory()
    previous_state: dict[str, Any] | None = memory.read_memory(node_id, MEMORY_KEY)
    state, is_finished = evaluate_duration_state(
        previous_state=previous_state,
        duration_seconds=duration_seconds,
        now_monotonic=time.monotonic(),
    )

    if is_finished:
        memory.delete_object(node_id, MEMORY_KEY)
    else:
        memory.write_to_memory(node_id, MEMORY_KEY, state)

    return _build_result(default, is_finished)
