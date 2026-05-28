from typing import Optional
from flojoy import flojoy, Boolean


@flojoy
def TEST_RESULT(
        results: Optional[list[Boolean]],
) -> Boolean:
    for i in range(len(results)):
        result = results[i].b
        if not result:
            return Boolean(b=False)
    return Boolean(b=True)
