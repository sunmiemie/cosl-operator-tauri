from threading import Lock

from tm_devices.drivers.pi.pi_device import PIDevice

from flojoy.parameter_types import (
    HardwareConnection,
    HardwareDevice,
    CameraDevice,
    CameraConnection,
    SerialDevice,
    SerialConnection,
    VisaDevice,
    VisaConnection,
    NIConnection,
    NIDMMDevice,
)
from tm_devices import DeviceManager
from tm_devices.helpers import PYVISA_PY_BACKEND
from typing import Any, Callable
from .config import logger

_connection_lock = Lock()


class DeviceConnectionManager:
    handles: dict[str | int, HardwareConnection] = {}
    tm = DeviceManager(verbose=False)
    tm.visa_library = PYVISA_PY_BACKEND

    @staticmethod
    def _connection_is_closed(connection: HardwareConnection) -> bool:
        if connection.is_closed():
            return True

        # pyserial may have been closed directly by an older CLOSE_SERIAL block.
        is_open = getattr(connection.get_handle(), "is_open", None)
        return is_open is False

    @classmethod
    def register_connection(
        cls,
        device: HardwareDevice,
        connection: Any,
        cleanup: Callable[[Any], Any] | None = None,
    ):
        with _connection_lock:
            id = device.get_id()
            existing = cls.handles.get(id)
            if existing is not None:
                if cls._connection_is_closed(existing):
                    existing.close()
                    del cls.handles[id]
                else:
                    raise ValueError(f"Connection with id {id} already exists")

            # Let tm_devices take care of any devices it created
            if isinstance(connection, PIDevice) and cleanup is None:
                cleanup = noop

            match device:
                case CameraDevice():
                    cls.handles[id] = CameraConnection(connection, cleanup=cleanup)
                case SerialDevice():
                    cls.handles[id] = SerialConnection(connection, cleanup=cleanup)
                case VisaDevice():
                    cls.handles[id] = VisaConnection(connection, cleanup=cleanup)
                case NIDMMDevice():
                    cls.handles[id] = NIConnection(connection, cleanup=cleanup)
                case HardwareDevice():
                    cls.handles[id] = HardwareConnection(connection, cleanup=cleanup)

    @classmethod
    def get_connection(cls, id: str | int) -> HardwareConnection:
        with _connection_lock:
            return cls.handles[id]

    @classmethod
    def remove_connection(cls, id: str | int) -> bool:
        """Close and unregister one connection without affecting other devices."""
        with _connection_lock:
            connection = cls.handles.get(id)
            if connection is None:
                return False

            connection.close()
            del cls.handles[id]
            return True

    @classmethod
    def clear(cls):
        cls.tm.remove_all_devices()
        logger.info("Cleaned up tm_devices DeviceManager")

        with _connection_lock:
            logger.info(f"Connections closed: {cls.handles}")
            for connection in cls.handles.values():
                try:
                    connection.close()
                except Exception:
                    logger.exception("Failed to close a hardware connection")
            cls.handles.clear()


def noop(_):
    return None
