/**
 * Flojoy 服务管理 Composable
 * 
 * 负责管理 Flojoy 服务的启动、停止、状态监控
 * 支持内嵌运行时和外部运行时两种模式
 */
import { ref, computed, readonly, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/**
 * Flojoy 服务状态
 */
export type FlojoyStatus = 'stopped' | 'starting' | 'running' | 'failed' | 'stopping'

/**
 * Flojoy 运行时模式
 */
export type FlojoyRuntimeMode = 'embedded' | 'external'

/**
 * Flojoy 服务配置
 */
export interface FlojoyConfig {
  /** 运行时模式 */
  mode: FlojoyRuntimeMode
  /** 外部可执行文件路径（仅外部模式使用） */
  executable_path: string
  /** 启动参数 */
  args: string[]
  /** 监听端口 */
  port: number
  /** 启动超时时间（秒） */
  startup_timeout: number
}

/**
 * Flojoy 状态信息
 */
export interface FlojoyStatusInfo {
  status: FlojoyStatus
  mode: FlojoyRuntimeMode
  port: number
  error: string | null
  url: string | null
  embedded_available: boolean
}

/**
 * 内嵌资源路径信息
 */
export interface EmbeddedPaths {
  python_path: string | null
  ui_path: string | null
  backend_path: string | null
  all_available: boolean
}

/**
 * Flojoy 日志条目
 */
export interface FlojoyLogEntry {
  type: 'stdout' | 'stderr'
  message: string
  timestamp: Date
}

// 全局状态（单例模式）
const status = ref<FlojoyStatus>('stopped')
const mode = ref<FlojoyRuntimeMode>('embedded')
const port = ref<number>(5392)
const error = ref<string | null>(null)
const url = ref<string | null>(null)
const embeddedAvailable = ref<boolean>(false)
const embeddedPaths = ref<EmbeddedPaths | null>(null)

const config = ref<FlojoyConfig>({
  mode: 'embedded',
  executable_path: '',
  args: [],
  port: 5392,
  startup_timeout: 30
})
const logs = ref<FlojoyLogEntry[]>([])
const maxLogs = 100 // 最多保留的日志条数

// 事件监听器
let statusUnlisten: UnlistenFn | null = null
let logUnlisten: UnlistenFn | null = null
let isListening = false

/**
 * 初始化事件监听
 */
async function initListeners(): Promise<void> {
  if (isListening) return
  
  try {
    // 监听状态变更事件
    statusUnlisten = await listen<FlojoyStatusInfo>('flojoy-status', (event) => {
      const info = event.payload
      status.value = info.status
      mode.value = info.mode
      port.value = info.port
      error.value = info.error
      url.value = info.url
      embeddedAvailable.value = info.embedded_available
    })
    
    // 监听日志事件
    logUnlisten = await listen<{ type: 'stdout' | 'stderr'; message: string }>('flojoy-log', (event) => {
      const entry: FlojoyLogEntry = {
        type: event.payload.type,
        message: event.payload.message,
        timestamp: new Date()
      }
      
      logs.value.push(entry)
      
      // 限制日志数量
      if (logs.value.length > maxLogs) {
        logs.value = logs.value.slice(-maxLogs)
      }
    })
    
    isListening = true
  } catch (e) {
    console.error('初始化 Flojoy 事件监听失败:', e)
  }
}

/**
 * 清理事件监听
 */
function cleanupListeners(): void {
  if (statusUnlisten) {
    statusUnlisten()
    statusUnlisten = null
  }
  if (logUnlisten) {
    logUnlisten()
    logUnlisten = null
  }
  isListening = false
}

export function useFlojoy() {
  // 计算属性
  const isRunning = computed(() => status.value === 'running')
  const isStarting = computed(() => status.value === 'starting')
  const isStopped = computed(() => status.value === 'stopped')
  const hasFailed = computed(() => status.value === 'failed')
  const canStart = computed(() => status.value === 'stopped' || status.value === 'failed')
  const canStop = computed(() => status.value === 'running')
  const isEmbeddedMode = computed(() => config.value.mode === 'embedded')
  const isExternalMode = computed(() => config.value.mode === 'external')
  
  // 是否已配置（内嵌模式检查资源可用性，外部模式检查路径）
  const isConfigured = computed(() => {
    if (config.value.mode === 'embedded') {
      return embeddedAvailable.value
    } else {
      return config.value.executable_path.length > 0
    }
  })
  
  /**
   * 检查内嵌资源是否可用
   */
  async function checkEmbeddedResources(): Promise<EmbeddedPaths> {
    try {
      const result = await invoke<EmbeddedPaths>('check_embedded_flojoy')
      embeddedPaths.value = result
      embeddedAvailable.value = result.all_available
      return result
    } catch (e) {
      console.error('检查内嵌资源失败:', e)
      return {
        python_path: null,
        ui_path: null,
        backend_path: null,
        all_available: false
      }
    }
  }
  
  /**
   * 启动 Flojoy 服务
   */
  async function startFlojoy(customConfig?: Partial<FlojoyConfig>): Promise<boolean> {
    if (!canStart.value) {
      console.warn('Flojoy 服务无法启动，当前状态:', status.value)
      return false
    }
    
    // 合并配置
    const startConfig: FlojoyConfig = {
      ...config.value,
      ...customConfig
    }
    
    // 验证配置
    if (startConfig.mode === 'external' && !startConfig.executable_path) {
      error.value = '外部模式需要配置可执行文件路径'
      return false
    }
    
    try {
      await initListeners()
      
      const result = await invoke<FlojoyStatusInfo>('start_flojoy', { config: startConfig })
      
      status.value = result.status
      mode.value = result.mode
      port.value = result.port
      error.value = result.error
      url.value = result.url
      embeddedAvailable.value = result.embedded_available
      
      return result.status !== 'failed'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      status.value = 'failed'
      return false
    }
  }
  
  /**
   * 停止 Flojoy 服务
   */
  async function stopFlojoy(): Promise<boolean> {
    if (!canStop.value && status.value !== 'starting') {
      console.warn('Flojoy 服务无法停止，当前状态:', status.value)
      return false
    }
    
    try {
      const result = await invoke<FlojoyStatusInfo>('stop_flojoy')
      
      status.value = result.status
      mode.value = result.mode
      error.value = result.error
      url.value = result.url
      
      return result.status === 'stopped'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }
  
  /**
   * 重启 Flojoy 服务
   */
  async function restartFlojoy(): Promise<boolean> {
    try {
      await initListeners()
      
      const result = await invoke<FlojoyStatusInfo>('restart_flojoy')
      
      status.value = result.status
      mode.value = result.mode
      port.value = result.port
      error.value = result.error
      url.value = result.url
      embeddedAvailable.value = result.embedded_available
      
      return result.status !== 'failed'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      status.value = 'failed'
      return false
    }
  }
  
  /**
   * 刷新状态
   */
  async function refreshStatus(): Promise<void> {
    try {
      const result = await invoke<FlojoyStatusInfo>('flojoy_status')
      
      status.value = result.status
      mode.value = result.mode
      port.value = result.port
      error.value = result.error
      url.value = result.url
      embeddedAvailable.value = result.embedded_available
    } catch (e) {
      console.error('获取 Flojoy 状态失败:', e)
    }
  }
  
  /**
   * 更新配置
   */
  async function updateConfig(newConfig: Partial<FlojoyConfig>): Promise<boolean> {
    const updatedConfig: FlojoyConfig = {
      ...config.value,
      ...newConfig
    }
    
    try {
      await invoke('update_flojoy_config', { config: updatedConfig })
      config.value = updatedConfig
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }
  
  /**
   * 加载配置
   */
  async function loadConfig(): Promise<void> {
    try {
      const result = await invoke<FlojoyConfig>('get_flojoy_config')
      config.value = result
    } catch (e) {
      console.error('加载 Flojoy 配置失败:', e)
    }
  }
  
  /**
   * 清空日志
   */
  function clearLogs(): void {
    logs.value = []
  }
  
  /**
   * 初始化（加载配置和状态）
   */
  async function initialize(): Promise<void> {
    await initListeners()
    await loadConfig()
    await checkEmbeddedResources()
    await refreshStatus()
  }
  
  // 组件卸载时清理（可选）
  onUnmounted(() => {
    // 注意：由于是全局状态，这里不应该清理监听器
    // 除非确定是最后一个使用者
  })
  
  return {
    // 状态
    status: readonly(status),
    mode: readonly(mode),
    port: readonly(port),
    error: readonly(error),
    url: readonly(url),
    config: readonly(config),
    logs: readonly(logs),
    embeddedAvailable: readonly(embeddedAvailable),
    embeddedPaths: readonly(embeddedPaths),
    
    // 计算属性
    isRunning,
    isStarting,
    isStopped,
    hasFailed,
    canStart,
    canStop,
    isConfigured,
    isEmbeddedMode,
    isExternalMode,
    
    // 方法
    startFlojoy,
    stopFlojoy,
    restartFlojoy,
    refreshStatus,
    updateConfig,
    loadConfig,
    clearLogs,
    initialize,
    checkEmbeddedResources,
    
    // 清理（用于应用关闭时）
    cleanup: cleanupListeners
  }
}
