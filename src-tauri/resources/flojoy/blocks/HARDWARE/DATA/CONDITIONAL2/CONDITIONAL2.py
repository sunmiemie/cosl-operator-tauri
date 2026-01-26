from typing import Any, Literal, TypedDict
from flojoy import JobResultBuilder, Boolean, flojoy, DataContainer


class ConditionalOutput(TypedDict):
    true: DataContainer
    false: DataContainer


@flojoy
def CONDITIONAL2(
        flag: Boolean,
) -> ConditionalOutput:
    bool_ = flag.b
    data = Boolean(b=True) if bool_ else Boolean(b=False)

    next_direction = str(bool_).lower()
    # Create the output DataContainers
    true_output = JobResultBuilder().from_data(data).flow_to_directions([next_direction]).build()
    false_output = JobResultBuilder().from_data(data).flow_to_directions([next_direction]).build()

    return ConditionalOutput(true=true_output, false=false_output)
