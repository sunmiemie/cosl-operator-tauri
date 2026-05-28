from flojoy import flojoy, String
from ..tbus_command_transform import TbusCommandUtils


@flojoy
def TEST_TRANSFORM(
        params: str,
) -> String:
    serial_request = TbusCommandUtils.tbus2serial(params)
    return String(s=serial_request)
