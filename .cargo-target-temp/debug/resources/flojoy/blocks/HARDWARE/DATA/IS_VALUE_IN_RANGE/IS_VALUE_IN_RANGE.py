from flojoy import flojoy, Scalar, Boolean


@flojoy
def IS_VALUE_IN_RANGE(
        min: float,
        value: Scalar,
        max: float,
) -> Boolean:
    return Boolean(b=min <= value.c <= max)
