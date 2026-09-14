from pydantic import BaseModel


class PostCancelFC(BaseModel):
    jobsetId: str | None = None


class PostGracefulStopFC(BaseModel):
    jobsetId: str | None = None
    timeoutSeconds: float = 15.0


class GracefulStopFCResponse(BaseModel):
    success: bool
    graceful: bool
    forced: bool
    discardedJobs: int
    unfinishedJobs: int
    message: str


class PostWFC(BaseModel):
    fc: str
    jobsetId: str
    cancelExistingJobs: bool
    observeBlocks: list[str]
    nodeDelay: float
    maximumRuntime: float
    maximumConcurrentWorkers: int


class WorkerSuccessResponse(BaseModel):
    node_id: str
    result: dict


class WorkerFailedResponse(BaseModel):
    node_id: str
    result: dict
