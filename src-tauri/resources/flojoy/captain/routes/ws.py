import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from captain.utils.config import manager
from captain.utils.logger import logger
from captain.utils.status_codes import STATUS_CODES

router = APIRouter(tags=["ws"])


@router.websocket("/ws/{socket_id}")
async def websocket_endpoint(websocket: WebSocket, socket_id: str):
    if not await manager.ws.connect(websocket, socket_id=socket_id):
        logger.info("client %s is already connected", socket_id)
        return
    try:
        # send "Connection established" message to client
        await websocket.send_text(
            json.dumps(
                {
                    "type": "connection_established",
                    "msg": "You are now connected to flojoy servers",
                    "socketId": socket_id,
                    "SYSTEM_STATUS": STATUS_CODES["STANDBY"],
                }
            )
        )
        print(
            "Flojoy Studio is running! Visit community.flojoy.ai or discord.gg/7HEBr7yG8c for help.",
            flush=True,
        )

        # await for messages and send messages (no need to read from frontend, this is used to keep connection alive)
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("Flojoy websocket %s closed with error: %s", socket_id, exc)
    finally:
        await manager.ws.disconnect(socket_id=socket_id)
        logger.info(f"Client {socket_id} is disconnected")


@router.websocket("/ws/logs/{socket_id}")
async def execution_log_websocket_endpoint(websocket: WebSocket, socket_id: str):
    """Best-effort log stream isolated from test state/result messages."""
    if not await manager.log_ws.connect(websocket, socket_id=socket_id):
        logger.info("log client %s is already connected", socket_id)
        return
    try:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "execution_log_connection_established",
                    "socketId": socket_id,
                }
            )
        )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("Execution log websocket %s closed with error: %s", socket_id, exc)
    finally:
        await manager.log_ws.disconnect(socket_id=socket_id)
