/**
 * HALT-HASS 测试运行器 Composable
 * 管理测试的运行状态、日志、结果
 */
import { ref, computed, onUnmounted } from 'vue'
import type { Node, Edge } from 'reactflow'
import type { BlockData, EdgeData } from '@/react-flojoy'

// 测试状态枚举
export enum TestStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// 节点运行状态
export interface NodeStatus {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: any
  error?: string
  startTime?: number
  endTime?: number
}

// 测试结果
export interface TestResult {
  jobId: string
  status: TestStatus
  startTime: number
  endTime?: number
  duration?: number
  nodeResults: Record<string, any>
  errors: string[]
}

// 日志条目
export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  nodeId?: string
}

export function useTestRunner(backendUrl: () => string) {
  // ========== 状态 ==========
  
  // 测试状态
  const status = ref<TestStatus>(TestStatus.IDLE)
  
  // 当前任务 ID
  const jobId = ref<string | null>(null)
  
  // 测试进度 (0-100)
  const progress = ref(0)
  
  // 节点状态
  const nodeStatuses = ref<Record<string, NodeStatus>>({})
  
  // 当前运行节点
  const currentNodeId = ref<string | null>(null)
  
  // 测试结果
  const result = ref<TestResult | null>(null)
  
  // 日志
  const logs = ref<LogEntry[]>([])
  
  // 错误信息
  const errorMessage = ref<string | null>(null)
  
  // WebSocket 连接
  let ws: WebSocket | null = null

  // ========== 计算属性 ==========
  
  const isIdle = computed(() => status.value === TestStatus.IDLE)
  const isRunning = computed(() => status.value === TestStatus.RUNNING)
  const isPaused = computed(() => status.value === TestStatus.PAUSED)
  const isCompleted = computed(() => status.value === TestStatus.COMPLETED)
  const isFailed = computed(() => status.value === TestStatus.FAILED)
  const isCancelled = computed(() => status.value === TestStatus.CANCELLED)
  const isFinished = computed(() => 
    status.value === TestStatus.COMPLETED || 
    status.value === TestStatus.FAILED || 
    status.value === TestStatus.CANCELLED
  )

  // ========== 方法 ==========
  
  // 添加日志
  function addLog(level: LogEntry['level'], message: string, nodeId?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      nodeId,
    }
    logs.value.push(entry)
    
    // 限制日志数量
    if (logs.value.length > 1000) {
      logs.value = logs.value.slice(-1000)
    }
  }
  
  // 清空日志
  function clearLogs() {
    logs.value = []
  }
  
  // 连接 WebSocket
  function connectWebSocket() {
    if (ws) {
      ws.close()
    }
    
    const wsUrl = backendUrl().replace(/^https?/, 'ws') + '/ws'
    addLog('info', `连接 WebSocket: ${wsUrl}`)
    
    try {
      ws = new WebSocket(wsUrl)
      
      ws.onopen = () => {
        addLog('info', 'WebSocket 已连接')
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWebSocketMessage(data)
        } catch {
          addLog('debug', `收到原始消息: ${event.data}`)
        }
      }
      
      ws.onerror = () => {
        addLog('error', 'WebSocket 连接错误')
      }
      
      ws.onclose = () => {
        addLog('info', 'WebSocket 已断开')
        ws = null
      }
    } catch (e) {
      addLog('error', `WebSocket 连接失败: ${e}`)
    }
  }
  
  // 断开 WebSocket
  function disconnectWebSocket() {
    if (ws) {
      ws.close()
      ws = null
    }
  }
  
  // 处理 WebSocket 消息
  function handleWebSocketMessage(data: any) {
    // 系统状态
    if (data.SYSTEM_STATUS) {
      if (data.SYSTEM_STATUS === 'RUNNING') {
        status.value = TestStatus.RUNNING
      } else if (data.SYSTEM_STATUS === 'STANDBY') {
        if (status.value === TestStatus.RUNNING) {
          status.value = TestStatus.COMPLETED
          progress.value = 100
          addLog('info', '测试完成')
        }
      }
    }
    
    // 节点运行状态
    if (data.RUNNING_NODE) {
      currentNodeId.value = data.RUNNING_NODE
      nodeStatuses.value[data.RUNNING_NODE] = {
        id: data.RUNNING_NODE,
        status: 'running',
        startTime: Date.now(),
      }
      addLog('info', `节点开始运行: ${data.RUNNING_NODE}`, data.RUNNING_NODE)
    }
    
    // 节点结果
    if (data.NODE_RESULTS) {
      const { id, result: nodeResult } = data.NODE_RESULTS
      nodeStatuses.value[id] = {
        ...nodeStatuses.value[id],
        status: 'completed',
        result: nodeResult,
        endTime: Date.now(),
      }
      addLog('info', `节点完成: ${id}`, id)
    }
    
    // 失败节点
    if (data.FAILED_NODES) {
      for (const [nodeId, error] of Object.entries(data.FAILED_NODES)) {
        nodeStatuses.value[nodeId] = {
          ...nodeStatuses.value[nodeId],
          status: 'failed',
          error: error as string,
          endTime: Date.now(),
        }
        addLog('error', `节点失败: ${nodeId} - ${error}`, nodeId)
      }
      status.value = TestStatus.FAILED
    }
    
    // 进度更新
    if (data.PROGRESS !== undefined) {
      progress.value = Math.round(data.PROGRESS * 100)
    }
    
    // 日志消息
    if (data.LOG) {
      addLog('info', data.LOG)
    }
    
    // 错误消息
    if (data.ERROR) {
      addLog('error', data.ERROR)
      errorMessage.value = data.ERROR
    }
  }
  
  // 开始测试
  async function start(
    nodes: Node<BlockData>[],
    edges: Edge<EdgeData>[],
    metadata?: any,
    testParams?: any
  ): Promise<boolean> {
    try {
      // 重置状态
      status.value = TestStatus.RUNNING
      progress.value = 0
      nodeStatuses.value = {}
      currentNodeId.value = null
      result.value = null
      errorMessage.value = null
      
      // 生成任务 ID
      jobId.value = `halt-hass-${Date.now()}`
      
      // 初始化节点状态
      nodes.forEach(node => {
        nodeStatuses.value[node.id] = {
          id: node.id,
          status: 'pending',
        }
      })
      
      addLog('info', '开始运行测试...')
      addLog('info', `任务 ID: ${jobId.value}`)
      addLog('info', `节点数: ${nodes.length}, 边数: ${edges.length}`)
      
      // 连接 WebSocket
      connectWebSocket()
      
      // 发送运行请求
      const response = await fetch(`${backendUrl()}/wfc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fc: JSON.stringify({ nodes, edges }),
          jobsetId: jobId.value,
          cancelExistingJobs: true,
          observeBlocks: nodes.map(n => n.id),
          nodeDelay: 0,
          maximumRuntime: testParams?.duration ? testParams.duration * 60 : 3600,
          maximumConcurrentWorkers: 4,
        }),
      })
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`)
      }
      
      addLog('info', '测试请求已发送')
      return true
    } catch (error) {
      status.value = TestStatus.FAILED
      errorMessage.value = error instanceof Error ? error.message : '启动失败'
      addLog('error', `启动测试失败: ${errorMessage.value}`)
      return false
    }
  }
  
  // 停止测试
  async function stop(): Promise<boolean> {
    try {
      addLog('info', '正在停止测试...')
      
      await fetch(`${backendUrl()}/cancel_fc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobsetId: jobId.value || '' }),
      })
      
      status.value = TestStatus.CANCELLED
      disconnectWebSocket()
      addLog('info', '测试已停止')
      return true
    } catch (error) {
      addLog('error', `停止测试失败: ${error}`)
      return false
    }
  }
  
  // 暂停测试（预留）
  async function pause(): Promise<boolean> {
    addLog('warn', '暂停功能暂未实现')
    return false
  }
  
  // 恢复测试（预留）
  async function resume(): Promise<boolean> {
    addLog('warn', '恢复功能暂未实现')
    return false
  }
  
  // 重置状态
  function reset() {
    status.value = TestStatus.IDLE
    jobId.value = null
    progress.value = 0
    nodeStatuses.value = {}
    currentNodeId.value = null
    result.value = null
    errorMessage.value = null
    disconnectWebSocket()
  }
  
  // 清理
  onUnmounted(() => {
    disconnectWebSocket()
  })

  return {
    // 状态
    status,
    jobId,
    progress,
    nodeStatuses,
    currentNodeId,
    result,
    logs,
    errorMessage,
    
    // 计算属性
    isIdle,
    isRunning,
    isPaused,
    isCompleted,
    isFailed,
    isCancelled,
    isFinished,
    
    // 方法
    start,
    stop,
    pause,
    resume,
    reset,
    addLog,
    clearLogs,
  }
}
