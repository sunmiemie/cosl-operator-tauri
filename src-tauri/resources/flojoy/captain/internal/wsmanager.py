import asyncio
import json
import traceback
from typing import Any, Union

from captain.types.test_sequence import TestSequenceMessage
from fastapi import WebSocket
from fastapi.websockets import WebSocketState
from flojoy.utils import PlotlyJSONEncoder
from captain.types.worker import WorkerJobResponse


class ConnectionManager:
    _instance = None

    @classmethod
    def get_instance(cls):
        if not cls._instance:
            cls._instance = ConnectionManager()
            return cls._instance
        return cls._instance

    def __init__(self, *, send_timeout: float = 2.0):
        self.active_connections_map: dict[str, WebSocket] = {}
        self._connection_lock = asyncio.Lock()
        self._send_locks: dict[str, asyncio.Lock] = {}
        self._send_timeout = send_timeout

    async def connect(self, websocket: WebSocket, socket_id: str) -> bool:
        await websocket.accept()
        duplicate = False
        async with self._connection_lock:
            if socket_id in self.active_connections_map:
                duplicate = True
            else:
                self.active_connections_map[socket_id] = websocket
                self._send_locks[socket_id] = asyncio.Lock()
        if duplicate:
            await websocket.close(code=1008, reason="socket id already connected")
            return False
        return True

        # logger.debug(
        #     f"Connected! Amt of active connections: {len(self.active_connections_map.keys())}"
        # )

    async def disconnect(self, socket_id: str):
        async with self._connection_lock:
            self.active_connections_map.pop(socket_id, None)
            self._send_locks.pop(socket_id, None)

    async def _send_one(
        self,
        socket_id: str,
        connection: WebSocket,
        send_lock: asyncio.Lock,
        payload: str,
    ) -> bool:
        try:
            async with send_lock:
                await asyncio.wait_for(
                    connection.send_text(payload),
                    timeout=self._send_timeout,
                )
            return True
        except Exception as exc:
            print(
                f"Error in broadcast to {socket_id}",
                exc,
                traceback.format_exc(),
                flush=True,
            )
            return False

    # this method sends a message to all connected websockets
    async def broadcast(
        self, message: Union[dict[str, Any], WorkerJobResponse, TestSequenceMessage]
    ):
        payload = json.dumps(message, cls=PlotlyJSONEncoder)
        async with self._connection_lock:
            connections = [
                (socket_id, connection, self._send_locks[socket_id])
                for socket_id, connection in self.active_connections_map.items()
                if connection.client_state != WebSocketState.DISCONNECTED
            ]

        if not connections:
            return

        results = await asyncio.gather(
            *(
                self._send_one(socket_id, connection, send_lock, payload)
                for socket_id, connection, send_lock in connections
            )
        )
        for (socket_id, _, _), sent in zip(connections, results):
            if not sent:
                await self.disconnect(socket_id=socket_id)
