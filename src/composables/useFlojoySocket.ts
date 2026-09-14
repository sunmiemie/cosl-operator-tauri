/**
 * Flojoy WebSocket 连接管理
 * 用于接收流程图运行状态和结果
 * 对齐 Studio socket-receiver 实现
 */
import { ref, shallowRef, computed, onUnmounted } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { getApiUrl } from '@/services/flojoy-api'
import type { FlojoyExecutionLogEntry } from '@/services/flojoy-api'
import type { BlockResult } from '@/views/process-halt-hass/types'

// ========== 类型定义（对齐 Studio） ==========

// 服务器状态枚举（对齐 Studio ServerStatus）
export enum ServerStatus {
  // 服务器状态
  STANDBY = '🐢 awaiting a new job',
  RUNNING_PYTHON_JOB = '🏃‍♀️ running python job: ',
  FAILED_BLOCK = '❌ Failed to run: ',
  RUN_PRE_JOB_OP = '⏳ running pre-job operation...',
  BUILDING_TOPOLOGY = ' 🔨 building flow chart...',
  MAXIMUM_RUNTIME_EXCEEDED = '⏰ maximum runtime exceeded',
  COLLECTING_PIP_DEPENDENCIES = ' 📦 collecting pip dependencies...',
  INSTALLING_PACKAGES = '✨ installing missing packages...',
  IMPORTING_BLOCK_FUNCTIONS = ' 📦 importing node functions...',
  PRE_JOB_OP_FAILED = '❌ pre-job operation failed - Re-run script...',
  RUN_IN_PROCESS = '🏃‍♀️ running script...',
  IMPORTING_BLOCK_FUNCTIONS_FAILED = '❌ importing node functions failed',

  // 客户端状态
  OFFLINE = '🛑 server offline',
  CONNECTING = 'Connecting to server...',
  CONNECTED = '✅ connected',
}

// WebSocket 消息类型（对齐 Studio WorkerJobResponse）
export interface WorkerJobResponse {
  type: 'worker_response'
    | 'connection_established'
    | 'manifest_update'
    | 'execution_log'
    | 'execution_log_batch'
    | 'execution_log_connection_established'
  jobsetId?: string
  socketId?: string
  SYSTEM_STATUS?: ServerStatus
  FAILED_NODES?: Record<string, string>
  RUNNING_NODE?: string
  NODE_RESULTS?: {
    cmd: string
    id: string
    result: BlockResult
  }
  event?: FlojoyExecutionLogEntry
  events?: FlojoyExecutionLogEntry[]
}

// 节点运行状态
export interface NodeRunStatus {
  nodeId: string
  status: 'pending' | 'running' | 'success' | 'error'
  result?: BlockResult
  error?: string
}

// ========== Composable ==========

export function useFlojoySocket() {
  // 状态
  const socket = ref<WebSocket | null>(null)
  const logSocket = shallowRef<WebSocket | null>(null)
  const socketId = ref<string>('')
  const serverStatus = ref<ServerStatus>(ServerStatus.CONNECTING)
  const blockResults = ref<Record<string, BlockResult>>({})
  const runningBlock = ref<string>('')
  const failedBlocks = ref<Record<string, string>>({})
  
  // 消息队列（用于调试）
  const messageQueue = ref<WorkerJobResponse[]>([])
  const lastMessage = ref<WorkerJobResponse | null>(null)
  const executionLogs = shallowRef<FlojoyExecutionLogEntry[]>([])
  const executionLogIds = new Set<string>()
  const pendingExecutionLogs = new Map<string, FlojoyExecutionLogEntry>()
  let executionLogFlushTimer: ReturnType<typeof setTimeout> | null = null
  const executionLogFlushInterval = 250
  const maxExecutionLogs = 1000
  
  // 重连配置
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5
  const reconnectDelay = 2000
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let logReconnectAttempts = 0
  let logReconnectTimer: ReturnType<typeof setTimeout> | null = null
  let manuallyDisconnected = false

  function flushExecutionLogs() {
    executionLogFlushTimer = null
    if (!pendingExecutionLogs.size) return

    const next = [...executionLogs.value]
    for (const entry of pendingExecutionLogs.values()) {
      if (executionLogIds.has(entry.id)) continue
      executionLogIds.add(entry.id)
      next.push(entry)
    }
    pendingExecutionLogs.clear()
    next.sort((left, right) => left.timestampMs - right.timestampMs)
    if (next.length > maxExecutionLogs) {
      const removed = next.splice(0, next.length - maxExecutionLogs)
      removed.forEach(entry => executionLogIds.delete(entry.id))
    }
    executionLogs.value = next
  }

  function queueExecutionLogs(entries: FlojoyExecutionLogEntry[]) {
    for (const entry of entries) {
      if (!entry?.id || executionLogIds.has(entry.id)) continue
      pendingExecutionLogs.set(entry.id, entry)
    }
    if (!executionLogFlushTimer && pendingExecutionLogs.size) {
      executionLogFlushTimer = setTimeout(
        flushExecutionLogs,
        executionLogFlushInterval,
      )
    }
  }

  function closeLogSocket() {
    if (logReconnectTimer) {
      clearTimeout(logReconnectTimer)
      logReconnectTimer = null
    }
    const current = logSocket.value
    logSocket.value = null
    if (current) {
      current.onclose = null
      current.close()
    }
  }

  function scheduleLogReconnect() {
    if (manuallyDisconnected || logReconnectTimer) return
    const delay = Math.min(1000 * 2 ** logReconnectAttempts, 30_000)
    logReconnectTimer = setTimeout(() => {
      logReconnectTimer = null
      logReconnectAttempts++
      connectLogSocket()
    }, delay)
  }

  function connectLogSocket() {
    if (
      logSocket.value?.readyState === WebSocket.OPEN
      || logSocket.value?.readyState === WebSocket.CONNECTING
    ) {
      return
    }
    const apiUrl = getApiUrl()
    const logClientId = `${socketId.value || uuidv4()}-logs-${uuidv4()}`
    const wsUrl = `${apiUrl.replace(/^http/, 'ws')}/ws/logs/${logClientId}`
    try {
      const nextSocket = new WebSocket(wsUrl)
      logSocket.value = nextSocket
      nextSocket.onopen = () => {
        logReconnectAttempts = 0
      }
      nextSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WorkerJobResponse
          if (data.type === 'execution_log_batch' && data.events?.length) {
            queueExecutionLogs(data.events)
          } else if (data.type === 'execution_log' && data.event) {
            queueExecutionLogs([data.event])
          }
        } catch (error) {
          console.error('[Flojoy Log WS] Failed to parse message:', error)
        }
      }
      nextSocket.onclose = () => {
        if (logSocket.value === nextSocket) logSocket.value = null
        scheduleLogReconnect()
      }
      nextSocket.onerror = (error) => {
        console.error('[Flojoy Log WS] Error:', error)
      }
    } catch (error) {
      console.error('[Flojoy Log WS] Connection failed:', error)
      scheduleLogReconnect()
    }
  }

  // 计算属性
  const isConnected = computed(() =>
    serverStatus.value !== ServerStatus.OFFLINE &&
    serverStatus.value !== ServerStatus.CONNECTING
  )

  const isRunning = computed(() =>
    serverStatus.value === ServerStatus.RUN_IN_PROCESS ||
    serverStatus.value.startsWith(ServerStatus.RUNNING_PYTHON_JOB) ||
    serverStatus.value === ServerStatus.BUILDING_TOPOLOGY ||
    serverStatus.value === ServerStatus.RUN_PRE_JOB_OP ||
    serverStatus.value === ServerStatus.COLLECTING_PIP_DEPENDENCIES ||
    serverStatus.value === ServerStatus.INSTALLING_PACKAGES ||
    serverStatus.value === ServerStatus.IMPORTING_BLOCK_FUNCTIONS
  )

  const isError = computed(() =>
    serverStatus.value === ServerStatus.FAILED_BLOCK ||
    serverStatus.value === ServerStatus.PRE_JOB_OP_FAILED ||
    serverStatus.value === ServerStatus.IMPORTING_BLOCK_FUNCTIONS_FAILED ||
    serverStatus.value === ServerStatus.MAXIMUM_RUNTIME_EXCEEDED
  )

  /**
   * 连接 WebSocket
   * 使用 Studio 的连接格式：ws://host:port/ws/{socketId}
   */
  function connect() {
    if (socket.value?.readyState === WebSocket.OPEN) {
      return
    }

    manuallyDisconnected = false

    // 生成唯一的 socket ID
    const newSocketId = uuidv4()
    socketId.value = newSocketId

    // 从 API URL 构建 WebSocket URL
    const apiUrl = getApiUrl()
    const wsUrl = `${apiUrl.replace(/^http/, 'ws')}/ws/${newSocketId}`

    serverStatus.value = ServerStatus.CONNECTING

    try {
      socket.value = new WebSocket(wsUrl)

      socket.value.onopen = () => {
        console.log('[Flojoy WS] Connected with socketId:', newSocketId)
        reconnectAttempts = 0
        connectLogSocket()
      }

      socket.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WorkerJobResponse
          handleMessage(data)
        } catch (e) {
          console.error('[Flojoy WS] Failed to parse message:', e)
        }
      }

      socket.value.onclose = (event) => {
        console.log('[Flojoy WS] Disconnected:', event.code, event.reason)
        serverStatus.value = ServerStatus.OFFLINE
        socket.value = null

        // 尝试重连
        if (!manuallyDisconnected && reconnectAttempts < maxReconnectAttempts) {
          reconnectTimer = setTimeout(() => {
            reconnectAttempts++
            console.log(`[Flojoy WS] Reconnecting (${reconnectAttempts}/${maxReconnectAttempts})...`)
            connect()
          }, reconnectDelay)
        }
      }

      socket.value.onerror = (error) => {
        console.error('[Flojoy WS] Error:', error)
        serverStatus.value = ServerStatus.OFFLINE
      }
    } catch (e) {
      console.error('[Flojoy WS] Connection failed:', e)
      serverStatus.value = ServerStatus.OFFLINE
    }
  }

  /**
   * 断开连接
   */
  function disconnect() {
    manuallyDisconnected = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (socket.value) {
      socket.value.onclose = null
      socket.value.close()
      socket.value = null
    }
    closeLogSocket()

    serverStatus.value = ServerStatus.OFFLINE
  }

  /**
   * 处理 WebSocket 消息（对齐 Studio processWorkerResponse）
   */
  function handleMessage(data: WorkerJobResponse) {
    if (data.type === 'execution_log_batch' && data.events?.length) {
      queueExecutionLogs(data.events)
      return
    }
    if (data.type === 'execution_log' && data.event?.id) {
      queueExecutionLogs([data.event])
      return
    }
    lastMessage.value = data
    messageQueue.value.push(data)

    // 限制队列大小
    if (messageQueue.value.length > 100) {
      messageQueue.value.shift()
    }

    switch (data.type) {
      case 'connection_established':
        // 连接建立，更新 socketId 和状态
        if (data.socketId) {
          socketId.value = data.socketId
        }
        if (data.SYSTEM_STATUS) {
          serverStatus.value = data.SYSTEM_STATUS
        } else {
          serverStatus.value = ServerStatus.CONNECTED
        }
        console.log('[Flojoy WS] Connection established, socketId:', socketId.value)
        break

      case 'worker_response':
        // 工作响应，处理各类状态更新
        processWorkerResponse(data)
        break

      case 'manifest_update':
        // Manifest 更新通知
        console.log('[Flojoy WS] Manifest update received')
        // 可以在这里触发 manifest 刷新
        break

      case 'execution_log':
      case 'execution_log_batch':
      case 'execution_log_connection_established':
        break

      default:
        console.log('[Flojoy WS] Unknown message type:', data)
    }
  }

  /**
   * 处理 worker_response 消息
   */
  function processWorkerResponse(res: WorkerJobResponse) {
    // 更新系统状态
    if (res.SYSTEM_STATUS) {
      serverStatus.value = res.SYSTEM_STATUS
    }

    // 更新节点结果
    if (res.NODE_RESULTS) {
      const { id, result } = res.NODE_RESULTS
      blockResults.value = {
        ...blockResults.value,
        [id]: result,
      }
    }

    // 更新运行中的节点
    if (res.RUNNING_NODE !== undefined) {
      // Flojoy 使用空字符串表示当前节点已经结束；必须同步清空，
      // 否则最后一个节点会一直保持 running 状态。
      runningBlock.value = res.RUNNING_NODE
    }

    // 失败状态在同一次执行中必须保持。Flojoy 后续状态帧可能携带空对象，
    // 不能因此抹掉先前失败并把整条测试流误判为成功。
    if (res.FAILED_NODES && Object.keys(res.FAILED_NODES).length > 0) {
      failedBlocks.value = {
        ...failedBlocks.value,
        ...res.FAILED_NODES,
      }
    }
  }

  /**
   * 清除节点结果
   */
  function wipeBlockResults() {
    blockResults.value = {}
    runningBlock.value = ''
    failedBlocks.value = {}
  }

  /**
   * 获取节点状态
   */
  function getNodeStatus(nodeId: string): NodeRunStatus {
    const isCurrentlyRunning = runningBlock.value === nodeId
    const hasFailed = nodeId in failedBlocks.value
    const hasResult = nodeId in blockResults.value

    let status: NodeRunStatus['status'] = 'pending'
    if (isCurrentlyRunning) {
      status = 'running'
    } else if (hasFailed) {
      status = 'error'
    } else if (hasResult) {
      status = 'success'
    }

    return {
      nodeId,
      status,
      result: blockResults.value[nodeId],
      error: failedBlocks.value[nodeId],
    }
  }

  /**
   * 获取所有节点状态
   */
  function getAllNodeStatuses(nodeIds: string[]): Map<string, NodeRunStatus> {
    const statuses = new Map<string, NodeRunStatus>()
    for (const nodeId of nodeIds) {
      statuses.set(nodeId, getNodeStatus(nodeId))
    }
    return statuses
  }

  /**
   * 清除所有状态（运行前调用）
   */
  function clearNodeStatuses() {
    wipeBlockResults()
  }

  // 清理
  onUnmounted(() => {
    disconnect()
    if (executionLogFlushTimer) clearTimeout(executionLogFlushTimer)
    executionLogFlushTimer = null
    flushExecutionLogs()
  })

  return {
    // 状态
    socketId,
    serverStatus,
    blockResults,
    runningBlock,
    failedBlocks,
    lastMessage,
    messageQueue,
    executionLogs,

    // 计算属性
    isConnected,
    isRunning,
    isError,

    // 方法
    connect,
    disconnect,
    wipeBlockResults,
    clearNodeStatuses,
    getNodeStatus,
    getAllNodeStatuses,

    // 兼容旧 API
    nodeStatuses: computed(() => {
      const map = new Map<string, NodeRunStatus>()
      // 收集所有已知节点 ID
      const nodeIds = new Set([
        ...Object.keys(blockResults.value),
        ...Object.keys(failedBlocks.value),
        runningBlock.value,
      ].filter(Boolean))
      for (const nodeId of nodeIds) {
        map.set(nodeId, getNodeStatus(nodeId))
      }
      return map
    }),
  }
}
