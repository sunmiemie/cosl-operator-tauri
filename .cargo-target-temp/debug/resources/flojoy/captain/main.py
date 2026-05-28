from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from captain.routes import (
    blocks,
    devices,
    flowchart,
    key,
    test_profile,
    ws,
    log,
    test_sequence,
    cloud,
    auth,
)
from captain.utils.config import origins
from captain.utils.logger import logger
from captain.internal.manager import WatchManager


@asynccontextmanager
async def startup_event(app: FastAPI):
    logger.info("Running startup event")
    watch_manager = WatchManager.get_instance()
    watch_manager.start_thread()
    yield


app = FastAPI(lifespan=startup_event)


# 健康检查端点
@app.get("/health")
async def health_check():
    """健康检查端点，用于检测后端是否正常运行"""
    return JSONResponse(content={"status": "ok", "message": "Flojoy backend is running"})

# cors middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# routes
app.include_router(ws.router)
app.include_router(flowchart.router)
app.include_router(log.router)
app.include_router(key.router)
app.include_router(test_profile.router)
app.include_router(blocks.router)
app.include_router(devices.router)
app.include_router(test_sequence.router)
app.include_router(cloud.router)
app.include_router(auth.router)
