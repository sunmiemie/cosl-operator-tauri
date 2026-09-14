import asyncio
import threading
import time

from queue import Empty, Queue
from typing import Any

from flojoy import DeviceConnectionManager
from flojoy.execution_log import record_execution_event

from captain.internal.wsmanager import ConnectionManager
from captain.models.test_sequencer import MsgState, StatusTypes
from captain.models.topology import Topology
from captain.routes.cloud import utcnow_str
from captain.services.consumer.blocks_watcher import BlocksWatcher
from captain.types.test_sequence import TestSequenceMessage
from captain.types.worker import PoisonPill
from captain.utils.logger import logger

""" Acts as a bridge between backend components """


class WSManager:
    def __init__(self):
        # Flow state/results and diagnostic logs must not share backpressure.
        self.ws = ConnectionManager(send_timeout=2.0)
        self.log_ws = ConnectionManager(send_timeout=0.75)


# Manager for Test Sequencer activities
class TSManager(WSManager):
    def __init__(self):
        # holds the running sequencer (only one at a time)
        self.runner: asyncio.Runner | None = None
        self.pause = False
        self.poison_pill: PoisonPill | None = None
        super().__init__()

    def new_runner(self, runner: asyncio.Runner):
        if self.runner is not None:
            self.kill_runner()
        self.runner = runner
        self.pause = False
        self.poison_pill = None

    def cleanup(self):
        self.runner = None
        self.pause = False

    async def wait_if_paused(self, id_of_test_waiting_for_resume: str):
        logger.info(f"Check if paused: {self.pause}")
        if self.pause:
            logger.info("Sending pause message")
            await self.ws.broadcast(
                TestSequenceMessage(
                    state=MsgState.paused.value,
                    target_id=id_of_test_waiting_for_resume,
                    status=StatusTypes.paused.value,
                    time_taken=-1,
                    created_at=utcnow_str(),
                    is_saved_to_cloud=False,
                    error=None,
                    value=None,
                )
            )
        while self.pause:
            logger.info("Waiting for pause to be lifted")
            if self.poison_pill is not None:
                logger.info("Poison pill detected")
                poison_pill = self.poison_pill
                self.poison_pill = None
                raise poison_pill
            time.sleep(0.5)

    def kill_runner(self):
        if self.runner is not None:
            logger.info("Killing TS Runner")
            try:
                self.poison_pill = PoisonPill()
                self.runner.close()
            except Exception:
                # Current Task can't be kill, but this put a "Poison Pill" in queue will stop the next task
                pass
            self.runner = None
            asyncio.run(
                self.ws.broadcast(
                    TestSequenceMessage(
                        MsgState.error.value,
                        "",
                        StatusTypes.aborted.value,
                        -1,
                        utcnow_str(),
                        False,
                        "Test sequence was interrupted",
                        None,
                    )
                )
            )

    def pause_runner(self):
        if self.runner is not None:
            logger.info("Pausing TS Runner")
            self.pause = True

    def resume_runner(self):
        if self.pause:
            logger.info("Resuming TS Runner")
            self.pause = False


# Manager for flowchart activities (main manager)
class Manager(WSManager):
    def __init__(self):
        super().__init__()
        self.running_topology: Topology | None = None  # holds the topology
        self.debug_mode = False
        self.task_queue: Queue[Any] = Queue()
        self.finish_queue: Queue[Any] = Queue()
        self.thread_count = 0

    def end_worker_threads(self):
        for _ in range(self.thread_count):
            self.task_queue.put(PoisonPill())  # poison pill
            self.finish_queue.put(PoisonPill())  # poison pill

    def _discard_pending_jobs(self) -> int:
        """Remove work that has not started after a graceful-stop request."""
        discarded = 0
        while True:
            try:
                self.task_queue.get_nowait()
            except Empty:
                break
            else:
                self.task_queue.task_done()
                discarded += 1
        return discarded

    def graceful_stop_flowchart(
        self,
        jobset_id: str | None,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        """Stop future scheduling, wait for in-flight jobs, then release devices."""
        topology = self.running_topology
        if topology is None:
            DeviceConnectionManager.clear()
            return {
                "success": True,
                "graceful": True,
                "forced": False,
                "discardedJobs": 0,
                "unfinishedJobs": 0,
                "message": "Flojoy 当前没有运行中的流程，设备连接已释放",
            }

        if jobset_id and topology.jobset_id != jobset_id:
            return {
                "success": False,
                "graceful": False,
                "forced": False,
                "discardedJobs": 0,
                "unfinishedJobs": self.task_queue.unfinished_tasks,
                "message": (
                    f"运行任务不匹配：当前 {topology.jobset_id}，请求 {jobset_id}"
                ),
            }

        effective_jobset_id = jobset_id or topology.jobset_id
        timeout_seconds = max(0.1, min(float(timeout_seconds), 120.0))
        record_execution_event(
            "flowchart-stop-requested",
            "收到流程收尾请求，停止调度新一轮并等待当前节点结束",
            jobset_id=effective_jobset_id,
            function_name="GRACEFUL_STOP_FLOWCHART",
            data={"timeoutSeconds": timeout_seconds},
        )

        topology.request_stop()
        discarded_jobs = self._discard_pending_jobs()
        deadline = time.monotonic() + timeout_seconds
        while self.task_queue.unfinished_tasks > 0 and time.monotonic() < deadline:
            time.sleep(0.05)

        unfinished_jobs = self.task_queue.unfinished_tasks
        forced = unfinished_jobs > 0
        if forced:
            logger.warning(
                "Graceful flowchart stop timed out with %s unfinished job(s)",
                unfinished_jobs,
            )
            record_execution_event(
                "flowchart-stop-timeout",
                "等待当前节点结束超时，转入强制连接释放",
                level="warning",
                jobset_id=effective_jobset_id,
                function_name="GRACEFUL_STOP_FLOWCHART",
                data={
                    "discardedJobs": discarded_jobs,
                    "unfinishedJobs": unfinished_jobs,
                },
            )

        # At this point either every node returned, or the bounded fallback was
        # reached. Closing registered handles before power-off prevents the
        # shutdown API from racing the loop's VISA/serial connections.
        DeviceConnectionManager.clear()
        if forced:
            topology.cancel()
        else:
            topology.finalize_requested_stop()
        self.end_worker_threads()
        self.running_topology = None

        message = (
            "当前节点已结束，Flojoy 设备连接已释放"
            if not forced
            else "等待当前节点超时，已强制释放 Flojoy 设备连接"
        )
        record_execution_event(
            "flowchart-stop-completed",
            message,
            level="warning" if forced else "info",
            jobset_id=effective_jobset_id,
            function_name="GRACEFUL_STOP_FLOWCHART",
            data={
                "graceful": not forced,
                "forced": forced,
                "discardedJobs": discarded_jobs,
                "unfinishedJobs": unfinished_jobs,
            },
        )
        return {
            "success": True,
            "graceful": not forced,
            "forced": forced,
            "discardedJobs": discarded_jobs,
            "unfinishedJobs": unfinished_jobs,
            "message": message,
        }


class WatchManager(object):
    _instance = None

    @classmethod
    def get_instance(cls):
        if not cls._instance:
            cls._instance = WatchManager()
            return cls._instance
        return cls._instance

    def __init__(self) -> None:
        self.create_new_thread()

    def create_new_thread(self):
        block_watcher = BlocksWatcher()

        async def run_services(stop_flag: threading.Event):
            await block_watcher.run(stop_flag)

        logger.info("Starting thread for startup event")
        self.thread_event = threading.Event()
        thread = threading.Thread(
            target=lambda: asyncio.run(run_services(self.thread_event))
        )
        thread.daemon = True
        self.watch_thread = thread
        self.is_thread_running = False

    def start_thread(self):
        self.watch_thread.start()
        self.is_thread_running = True

    def restart(self):
        if self.is_thread_running:
            self.thread_event.set()
            self.create_new_thread()
            self.start_thread()
