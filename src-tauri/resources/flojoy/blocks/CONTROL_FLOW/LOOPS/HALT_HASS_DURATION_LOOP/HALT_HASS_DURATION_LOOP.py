from typing import Any, Optional, TypedDict

from flojoy import (
    DataContainer,
    DefaultParams,
    JobResultBuilder,
    flojoy,
)


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
) -> DurationLoopOutput:
    """持续执行 HALT-HASS 采集循环。

    Returns
    -------
    body : DataContainer
        始终进入采集分支，直到客户端根据工作台 MQTT 状态停止流程。
    end : DataContainer
        保留控制流输出以兼容已保存工艺，不再由本节点按时间触发。
    """
    _ = default_params
    return _build_result(default, False)
