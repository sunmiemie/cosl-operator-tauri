/**
 * Flojoy 后端管理 Composable
 * 封装 Tauri 命令，提供 Python 配置、后端启动/停止和健康检查功能
 * 使用 Python 源码运行方案（非 sidecar）
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useConfig } from './useConfig'

// 后端状态枚举
export const BackendStatus = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  ERROR: 'error',
} as const

export type BackendStatusType = (typeof BackendStatus)[keyof typeof BackendStatus]

// 初始化状态枚举
export const InitStatus = {
  IDLE: 'idle',
  CHECKING: 'checking',
  INSTALLING: 'installing',
  READY: 'ready',
  ERROR: 'error',
} as const

export type InitStatusType = (typeof InitStatus)[keyof typeof InitStatus]

// 默认配置
const DEFAULT_PORT = 5392
const HEALTH_CHECK_INTERVAL = 5000 // 5秒健康检查间隔

export function useFlojoyBackend() {
  // 使用配置管理
  const { config, setConfigItem, initConfig } = useConfig()
  
  // ========== Python 环境状态 ==========
  
  // Python 解释器路径
  const pythonPath = ref('')
  
  // Python 版本信息
  const pythonVersion = ref('')
  
  // Python 版本是否有效（3.11）
  const pythonVersionValid = ref(false)
  
  // Poetry 是否已安装
  const poetryInstalled = ref(false)
  
  // 依赖是否已安装
  const dependenciesInstalled = ref(false)
  
  // 初始化状态
  const initStatus = ref<InitStatusType>(InitStatus.IDLE)
  
  // 初始化错误信息
  const initError = ref<string | null>(null)

  // ========== 后端运行状态 ==========
  
  // 后端状态
  const status = ref<BackendStatusType>(BackendStatus.STOPPED)
  
  // 进程 ID
  const pid = ref<number | null>(null)
  
  // 错误信息
  const errorMessage = ref<string | null>(null)
  
  // 端口
  const port = ref(DEFAULT_PORT)
  
  // 后端目录
  const backendDir = ref('')
  
  // 健康检查定时器
  let healthCheckTimer: number | null = null
  // 共享初始化 Promise，避免页面挂载和启动后端时并发初始化
  let initPromise: Promise<void> | null = null

  // ========== 计算属性 ==========
  
  // 后端 URL
  const backendUrl = computed(() => `http://127.0.0.1:${port.value}`)
  
  // 是否正在运行
  const isRunning = computed(() => status.value === BackendStatus.RUNNING)
  
  // 是否正在启动
  const isStarting = computed(() => status.value === BackendStatus.STARTING)
  
  // 环境是否就绪（Python 配置正确、Poetry 和依赖已安装）
  const isEnvironmentReady = computed(() => 
    pythonPath.value !== '' && 
    pythonVersionValid.value && 
    poetryInstalled.value && 
    dependenciesInstalled.value
  )
  
  // 是否正在初始化
  const isInitializing = computed(() => 
    initStatus.value === InitStatus.CHECKING || 
    initStatus.value === InitStatus.INSTALLING
  )

  // ========== Python 环境配置方法 ==========

  // 配置 Python 解释器
  async function configurePython(path: string): Promise<boolean> {
    try {
      await invoke('configure_python', { pythonPath: path })
      pythonPath.value = path
      
      // 保存到配置文件
      await setConfigItem('flojoyPythonPath', path)
      
      // 检查版本
      const versionValid = await checkPythonVersion(path)
      return versionValid
    } catch (error) {
      console.error('配置 Python 失败:', error)
      initError.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  // 检查 Python 版本
  async function checkPythonVersion(path: string): Promise<boolean> {
    try {
      const [major, minor, patch, isValid] = await invoke<[number, number, number, boolean]>(
        'check_python_version',
        { pythonPath: path }
      )
      pythonVersion.value = `${major}.${minor}.${patch}`
      pythonVersionValid.value = isValid
      return isValid
    } catch (error) {
      console.error('检查 Python 版本失败:', error)
      pythonVersion.value = ''
      pythonVersionValid.value = false
      return false
    }
  }

  // 检查 Poetry 是否已安装
  async function checkPoetryInstalled(): Promise<boolean> {
    try {
      const installed = await invoke<boolean>('check_poetry_installed')
      poetryInstalled.value = installed
      return installed
    } catch (error) {
      console.error('检查 Poetry 失败:', error)
      poetryInstalled.value = false
      return false
    }
  }

  // 安装 Poetry
  async function installPoetry(): Promise<boolean> {
    try {
      await invoke<string>('install_poetry')
      poetryInstalled.value = true
      return true
    } catch (error) {
      console.error('安装 Poetry 失败:', error)
      initError.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  // 安装依赖
  async function installDependencies(): Promise<boolean> {
    try {
      initStatus.value = InitStatus.INSTALLING
      await invoke<string>('install_dependencies')
      dependenciesInstalled.value = true
      initStatus.value = InitStatus.READY
      
      // 保存初始化状态到配置文件
      await setConfigItem('flojoyEnvInitialized', true)
      
      return true
    } catch (error) {
      console.error('安装依赖失败:', error)
      initError.value = error instanceof Error ? error.message : String(error)
      initStatus.value = InitStatus.ERROR
      return false
    }
  }

  // 完整初始化流程
  async function initializeEnvironment(): Promise<boolean> {
    try {
      initStatus.value = InitStatus.CHECKING
      initError.value = null
      
      // 1. 初始化后端目录
      const dir = await invoke<string>('init_flojoy_backend_dir')
      backendDir.value = dir
      
      // 2. 检查 Python 配置
      if (!pythonPath.value) {
        initStatus.value = InitStatus.IDLE
        initError.value = '请先配置 Python 解释器路径'
        return false
      }
      
      // 3. 验证 Python 版本
      const versionValid = await checkPythonVersion(pythonPath.value)
      if (!versionValid) {
        initStatus.value = InitStatus.ERROR
        initError.value = `Python 版本不符合要求，需要 Python 3.11，当前版本: ${pythonVersion.value}`
        return false
      }
      
      // 4. 检查/安装 Poetry
      initStatus.value = InitStatus.INSTALLING
      let poetryReady = await checkPoetryInstalled()
      if (!poetryReady) {
        // 安装 poetry（通过 pip）
        const poetryOk = await installPoetry()
        if (!poetryOk) return false
      }
      
      // 5. 安装依赖
      const depsOk = await installDependencies()
      if (!depsOk) return false
      
      initStatus.value = InitStatus.READY
      return true
    } catch (error) {
      console.error('初始化环境失败:', error)
      initStatus.value = InitStatus.ERROR
      initError.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  // ========== 后端运行控制方法 ==========

  // 设置端口
  async function setPort(newPort: number): Promise<boolean> {
    try {
      await invoke('set_flojoy_backend_port', { newPort })
      port.value = newPort
      return true
    } catch (error) {
      console.error('设置端口失败:', error)
      return false
    }
  }

  // 启动后端
  async function start(): Promise<boolean> {
    try {
      await init()

      if (!pythonPath.value) {
        status.value = BackendStatus.ERROR
        errorMessage.value = '请先配置 Python 解释器路径'
        return false
      }

      status.value = BackendStatus.STARTING
      errorMessage.value = null
      
      const result = await invoke<string>('start_flojoy_backend')
      console.log('Flojoy 后端启动结果:', result)
      
      // 等待后端就绪
      const ready = await waitForReady(20000) // 最多等待 20 秒
      
      if (ready) {
        status.value = BackendStatus.RUNNING
        await getPid()
        startHealthCheck()
        return true
      } else {
        status.value = BackendStatus.ERROR
        errorMessage.value = '后端启动超时'
        return false
      }
    } catch (error) {
      status.value = BackendStatus.ERROR
      errorMessage.value = error instanceof Error ? error.message : String(error)
      console.error('启动 Flojoy 后端失败:', error)
      return false
    }
  }

  // 停止后端
  async function stop(): Promise<boolean> {
    try {
      stopHealthCheck()
      
      const result = await invoke<string>('stop_flojoy_backend')
      console.log('Flojoy 后端停止结果:', result)
      
      status.value = BackendStatus.STOPPED
      pid.value = null
      errorMessage.value = null
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      console.error('停止 Flojoy 后端失败:', error)
      return false
    }
  }

  // 检查后端是否运行
  async function checkRunning(): Promise<boolean> {
    try {
      return await invoke<boolean>('is_flojoy_backend_running')
    } catch (error) {
      console.error('检查后端状态失败:', error)
      return false
    }
  }

  // 获取后端进程 ID
  async function getPid(): Promise<number | null> {
    try {
      const result = await invoke<number | null>('get_flojoy_backend_pid')
      pid.value = result
      return result
    } catch (error) {
      console.error('获取后端 PID 失败:', error)
      return null
    }
  }

  // 等待后端就绪
  async function waitForReady(timeout: number): Promise<boolean> {
    const startTime = Date.now()
    const checkInterval = 500 // 每 500ms 检查一次
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${backendUrl.value}/health`)
        if (response.ok) {
          return true
        }
      } catch {
        // 忽略错误，继续重试
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval))
    }
    
    return false
  }

  // 健康检查
  async function healthCheck(): Promise<boolean> {
    try {
      // 首先检查进程是否存在
      const running = await checkRunning()
      if (!running) {
        status.value = BackendStatus.STOPPED
        pid.value = null
        return false
      }
      
      // 然后检查 API 是否响应
      try {
        const response = await fetch(`${backendUrl.value}/health`)
        if (response.ok) {
          status.value = BackendStatus.RUNNING
          return true
        } else {
          status.value = BackendStatus.ERROR
          errorMessage.value = '后端 API 无响应'
          return false
        }
      } catch {
        status.value = BackendStatus.ERROR
        errorMessage.value = '后端 API 无响应'
        return false
      }
    } catch (error) {
      status.value = BackendStatus.ERROR
      errorMessage.value = '健康检查失败'
      return false
    }
  }

  // 启动健康检查定时器
  function startHealthCheck() {
    stopHealthCheck()
    healthCheckTimer = window.setInterval(() => {
      healthCheck()
    }, HEALTH_CHECK_INTERVAL)
  }

  // 停止健康检查定时器
  function stopHealthCheck() {
    if (healthCheckTimer !== null) {
      clearInterval(healthCheckTimer)
      healthCheckTimer = null
    }
  }

  // 初始化：加载配置并检查后端状态
  async function init() {
    if (initPromise) {
      await initPromise
      return
    }

    initPromise = (async () => {
      try {
        // 先初始化应用配置
        await initConfig()
        
        // 从配置文件加载 Python 路径
        const savedPythonPath = config.value.flojoyPythonPath
        if (savedPythonPath) {
          pythonPath.value = savedPythonPath
          // 配置 Rust 端
          await invoke('configure_python', { pythonPath: savedPythonPath })
        }
        
        // 从配置文件加载环境初始化状态
        const savedEnvInitialized = config.value.flojoyEnvInitialized
        if (savedEnvInitialized) {
          dependenciesInstalled.value = true
          poetryInstalled.value = true // 如果依赖已安装，Poetry 肯定也安装了
        }
        
        // 获取 Rust 端配置
        const rustConfig = await invoke<[string, string, number, boolean, boolean]>('get_flojoy_config')
        // 如果配置文件有 Python 路径，使用配置文件的；否则使用 Rust 端的
        if (!pythonPath.value) {
          pythonPath.value = rustConfig[0]
        }
        backendDir.value = rustConfig[1]
        port.value = rustConfig[2]
        // 如果配置文件中没有标记已初始化，则使用 Rust 端的状态
        if (!savedEnvInitialized) {
          poetryInstalled.value = rustConfig[3]
          dependenciesInstalled.value = rustConfig[4]
        }
        
        // 如果有 Python 路径，检查版本
        if (pythonPath.value) {
          await checkPythonVersion(pythonPath.value)
        }
        
        // 检查后端是否已在运行
        const running = await checkRunning()
        if (running) {
          await getPid()
          const healthy = await healthCheck()
          if (healthy) {
            startHealthCheck()
          }
        }
        
        // 更新初始化状态
        if (isEnvironmentReady.value) {
          initStatus.value = InitStatus.READY
        }
      } catch (error) {
        console.error('初始化 Flojoy 后端状态失败:', error)
      }
    })().finally(() => {
      initPromise = null
    })

    await initPromise
  }

  // 生命周期钩子
  onMounted(() => {
    init()
  })

  onUnmounted(() => {
    stopHealthCheck()
  })

  return {
    // Python 环境状态
    pythonPath,
    pythonVersion,
    pythonVersionValid,
    poetryInstalled,
    dependenciesInstalled,
    initStatus,
    initError,
    backendDir,
    
    // 后端运行状态
    status,
    pid,
    errorMessage,
    port,
    
    // 计算属性
    backendUrl,
    isRunning,
    isStarting,
    isEnvironmentReady,
    isInitializing,
    
    // Python 环境配置方法
    configurePython,
    checkPythonVersion,
    checkPoetryInstalled,
    installPoetry,
    installDependencies,
    initializeEnvironment,
    
    // 后端运行控制方法
    setPort,
    start,
    stop,
    checkRunning,
    getPid,
    healthCheck,
  }
}
