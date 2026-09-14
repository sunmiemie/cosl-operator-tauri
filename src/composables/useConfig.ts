import { ref, readonly } from 'vue'
import { load, Store } from '@tauri-apps/plugin-store'
import { emit, listen } from '@tauri-apps/api/event'
import { appConfigDir } from '@tauri-apps/api/path'
import { ThemeMode } from '@/enums'

// 配置变更事件
const CONFIG_CHANGE_EVENT = 'config-changed'

// 配置文件名
const CONFIG_FILE = 'settings.json'

// X-Ray 裁剪区域配置接口
export interface XrayCropArea {
  w: readonly [number, number]  // 水平裁剪范围 [左边界, 右边界]
  h: readonly [number, number]  // 垂直裁剪范围 [下边界, 上边界]
  enabled: boolean     // 是否启用裁剪
}

// 配置接口
export interface AppConfig {
  // 连接设置
  backendUrl: string
  simulatedWellWindowAgentUrl: string
  fileReceiverEnabled: boolean
  fileReceiverPort: number
  fileReceiverDirectory: string
  fileReceiverTokenHash: string
  
  // 外观设置
  themeMode: ThemeMode
  
  // 通用设置
  language: string
  autoStart: boolean
  
  // 设备设置（摄像头索引）
  microDevice: number      // 显微镜摄像头索引
  planeDevice: number      // 水平仪摄像头索引
  xrayDevice: number       // X光机摄像头索引
  highTempPressureCaptureDevice: number // OCR视频采集卡索引（保留原配置键）
  highTempPressureCaptureDeviceName: string // OCR视频采集卡名称（保留原配置键）
  sensorlessOvenLeftPort: string // 无感烘箱左侧设备串口
  sensorlessOvenRightPort: string // 无感烘箱右侧设备串口
  
  // X-Ray 裁剪区域设置
  xrayCropArea: XrayCropArea
  
  // 离线功能设置
  dataDir: string          // 离线数据存储目录
  downloadDir: string      // 旧版通用下载文件保存目录（兼容历史配置）
  highTempPressureDownloadDir: string // 高温高压井下载文件保存目录
  vibrationDownloadDir: string // 振动台下载文件保存目录
  vibrationSharedReportDir: string // 振动台第三方报告共享文件夹
  autoSave: boolean        // 测试过程自动保存
  autoReUpload: boolean    // 网络恢复自动回传
  
  // 侧边栏菜单隐藏配置（存储被隐藏的路由路径列表）
  hiddenMenus: string[]
  
  // 安全设置
  lockerPassword: string   // 锁定密码 (MD5 加密后存储)
  
  // Flojoy Python 环境设置
  flojoyPythonPath: string       // Python 解释器路径
  flojoyEnvInitialized: boolean  // 环境是否已初始化（依赖已安装）
}

// 默认配置
// 默认密码: 12345678 的 MD5 值
const DEFAULT_LOCKER_PASSWORD = '25d55ad283aa400af464c76d713c07ad'

const defaultConfig: AppConfig = {
  backendUrl: 'http://localhost:8080',
  simulatedWellWindowAgentUrl: 'ws://127.0.0.1:17890/',
  fileReceiverEnabled: false,
  fileReceiverPort: 17891,
  fileReceiverDirectory: '',
  fileReceiverTokenHash: '',
  themeMode: ThemeMode.DARK,
  language: 'zh-CN',
  autoStart: false,
  // 设备设置默认值
  microDevice: -1,
  planeDevice: -1,
  xrayDevice: -1,
  highTempPressureCaptureDevice: -1,
  highTempPressureCaptureDeviceName: '',
  sensorlessOvenLeftPort: '',
  sensorlessOvenRightPort: '',
  // X-Ray 裁剪区域默认值（默认不启用，使用全画面）
  xrayCropArea: {
    w: [0, 1920],    // 默认水平范围
    h: [0, 1080],    // 默认垂直范围
    enabled: false   // 默认不启用裁剪
  },
  // 离线功能默认值
  dataDir: '',
  downloadDir: '',
  highTempPressureDownloadDir: '',
  vibrationDownloadDir: '',
  vibrationSharedReportDir: '',
  autoSave: true,
  autoReUpload: true,
  // 隐藏菜单默认值（默认全部显示）
  hiddenMenus: [],
  // 安全设置默认值（默认密码: 12345678）
  lockerPassword: DEFAULT_LOCKER_PASSWORD,
  // Flojoy Python 环境默认值
  flojoyPythonPath: '',
  flojoyEnvInitialized: false,
}

// 当前配置
const config = ref<AppConfig>({ ...defaultConfig })

// Store实例
let store: Store | null = null

// 是否已初始化
let initialized = false

// 初始化 Promise（用于等待初始化完成）
let initPromise: Promise<AppConfig> | null = null

/**
 * 初始化配置（应用启动时调用）
 * 确保配置文件存在并加载配置
 */
export async function initializeConfig(): Promise<AppConfig> {
  if (initialized && store) {
    return config.value
  }

  // 避免重复初始化
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    try {
      // 加载 store
      store = await load(CONFIG_FILE)

      // 读取所有配置项
      const backendUrl = await store.get<string>('backendUrl')
      const simulatedWellWindowAgentUrl = await store.get<string>('simulatedWellWindowAgentUrl')
      const fileReceiverEnabled = await store.get<boolean>('fileReceiverEnabled')
      const fileReceiverPort = await store.get<number>('fileReceiverPort')
      const fileReceiverDirectory = await store.get<string>('fileReceiverDirectory')
      const fileReceiverTokenHash = await store.get<string>('fileReceiverTokenHash')
      const themeMode = await store.get<ThemeMode>('themeMode')
      const language = await store.get<string>('language')
      const autoStart = await store.get<boolean>('autoStart')
      const microDevice = await store.get<number>('microDevice')
      const planeDevice = await store.get<number>('planeDevice')
      const xrayDevice = await store.get<number>('xrayDevice')
      const highTempPressureCaptureDevice = await store.get<number>('highTempPressureCaptureDevice')
      const highTempPressureCaptureDeviceName = await store.get<string>('highTempPressureCaptureDeviceName')
      const sensorlessOvenLeftPort = await store.get<string>('sensorlessOvenLeftPort')
      const sensorlessOvenRightPort = await store.get<string>('sensorlessOvenRightPort')
      const xrayCropArea = await store.get<XrayCropArea>('xrayCropArea')
      const dataDir = await store.get<string>('dataDir')
      const downloadDir = await store.get<string>('downloadDir')
      const highTempPressureDownloadDir = await store.get<string>('highTempPressureDownloadDir')
      const vibrationDownloadDir = await store.get<string>('vibrationDownloadDir')
      const vibrationSharedReportDir = await store.get<string>('vibrationSharedReportDir')
      const autoSave = await store.get<boolean>('autoSave')
      const autoReUpload = await store.get<boolean>('autoReUpload')
      const hiddenMenus = await store.get<string[]>('hiddenMenus')
      const lockerPassword = await store.get<string>('lockerPassword')
      const flojoyPythonPath = await store.get<string>('flojoyPythonPath')
      const flojoyEnvInitialized = await store.get<boolean>('flojoyEnvInitialized')

      // 检查是否需要写入默认值（首次启动）
      let needsSave = false

      // 基础配置
      if (backendUrl === null || backendUrl === undefined) {
        await store.set('backendUrl', defaultConfig.backendUrl)
        needsSave = true
      }
      if (simulatedWellWindowAgentUrl === null || simulatedWellWindowAgentUrl === undefined) {
        await store.set('simulatedWellWindowAgentUrl', defaultConfig.simulatedWellWindowAgentUrl)
        needsSave = true
      }
      if (fileReceiverEnabled === null || fileReceiverEnabled === undefined) {
        await store.set('fileReceiverEnabled', defaultConfig.fileReceiverEnabled)
        needsSave = true
      }
      // 监听地址已固定为 0.0.0.0，清理旧版遗留配置。
      if (await store.delete('fileReceiverBindAddress')) {
        needsSave = true
      }
      if (fileReceiverPort === null || fileReceiverPort === undefined) {
        await store.set('fileReceiverPort', defaultConfig.fileReceiverPort)
        needsSave = true
      }
      if (fileReceiverDirectory === null || fileReceiverDirectory === undefined) {
        await store.set('fileReceiverDirectory', defaultConfig.fileReceiverDirectory)
        needsSave = true
      }
      if (fileReceiverTokenHash === null || fileReceiverTokenHash === undefined) {
        await store.set('fileReceiverTokenHash', defaultConfig.fileReceiverTokenHash)
        needsSave = true
      }
      if (themeMode === null || themeMode === undefined) {
        await store.set('themeMode', defaultConfig.themeMode)
        needsSave = true
      }
      if (language === null || language === undefined) {
        await store.set('language', defaultConfig.language)
        needsSave = true
      }
      if (autoStart === null || autoStart === undefined) {
        await store.set('autoStart', defaultConfig.autoStart)
        needsSave = true
      }
      
      // 设备配置
      if (microDevice === null || microDevice === undefined) {
        await store.set('microDevice', defaultConfig.microDevice)
        needsSave = true
      }
      if (planeDevice === null || planeDevice === undefined) {
        await store.set('planeDevice', defaultConfig.planeDevice)
        needsSave = true
      }
      if (xrayDevice === null || xrayDevice === undefined) {
        await store.set('xrayDevice', defaultConfig.xrayDevice)
        needsSave = true
      }
      if (highTempPressureCaptureDevice === null || highTempPressureCaptureDevice === undefined) {
        await store.set('highTempPressureCaptureDevice', defaultConfig.highTempPressureCaptureDevice)
        needsSave = true
      }
      if (highTempPressureCaptureDeviceName === null || highTempPressureCaptureDeviceName === undefined) {
        await store.set('highTempPressureCaptureDeviceName', defaultConfig.highTempPressureCaptureDeviceName)
        needsSave = true
      }
      if (sensorlessOvenLeftPort === null || sensorlessOvenLeftPort === undefined) {
        await store.set('sensorlessOvenLeftPort', defaultConfig.sensorlessOvenLeftPort)
        needsSave = true
      }
      if (sensorlessOvenRightPort === null || sensorlessOvenRightPort === undefined) {
        await store.set('sensorlessOvenRightPort', defaultConfig.sensorlessOvenRightPort)
        needsSave = true
      }
      if (xrayCropArea === null || xrayCropArea === undefined) {
        await store.set('xrayCropArea', defaultConfig.xrayCropArea)
        needsSave = true
      }
      
      // 离线功能配置
      if (dataDir === null || dataDir === undefined) {
        await store.set('dataDir', defaultConfig.dataDir)
        needsSave = true
      }
      if (downloadDir === null || downloadDir === undefined) {
        await store.set('downloadDir', defaultConfig.downloadDir)
        needsSave = true
      }
      if (highTempPressureDownloadDir === null || highTempPressureDownloadDir === undefined) {
        await store.set('highTempPressureDownloadDir', downloadDir ?? defaultConfig.highTempPressureDownloadDir)
        needsSave = true
      }
      if (vibrationDownloadDir === null || vibrationDownloadDir === undefined) {
        await store.set('vibrationDownloadDir', downloadDir ?? defaultConfig.vibrationDownloadDir)
        needsSave = true
      }
      if (vibrationSharedReportDir === null || vibrationSharedReportDir === undefined) {
        await store.set('vibrationSharedReportDir', defaultConfig.vibrationSharedReportDir)
        needsSave = true
      }
      if (autoSave === null || autoSave === undefined) {
        await store.set('autoSave', defaultConfig.autoSave)
        needsSave = true
      }
      if (autoReUpload === null || autoReUpload === undefined) {
        await store.set('autoReUpload', defaultConfig.autoReUpload)
        needsSave = true
      }
      
      // 菜单隐藏配置
      if (hiddenMenus === null || hiddenMenus === undefined) {
        await store.set('hiddenMenus', defaultConfig.hiddenMenus)
        needsSave = true
      }
      
      // 安全配置
      if (lockerPassword === null || lockerPassword === undefined) {
        await store.set('lockerPassword', defaultConfig.lockerPassword)
        needsSave = true
      }
      
      // Flojoy Python 环境配置
      if (flojoyPythonPath === null || flojoyPythonPath === undefined) {
        await store.set('flojoyPythonPath', defaultConfig.flojoyPythonPath)
        needsSave = true
      }
      if (flojoyEnvInitialized === null || flojoyEnvInitialized === undefined) {
        await store.set('flojoyEnvInitialized', defaultConfig.flojoyEnvInitialized)
        needsSave = true
      }

      // 保存默认配置到文件
      if (needsSave) {
        await store.save()
        console.log('配置文件已创建，使用默认配置')
      }

      // 合并配置
      config.value = {
        backendUrl: backendUrl ?? defaultConfig.backendUrl,
        simulatedWellWindowAgentUrl: simulatedWellWindowAgentUrl ?? defaultConfig.simulatedWellWindowAgentUrl,
        fileReceiverEnabled: fileReceiverEnabled ?? defaultConfig.fileReceiverEnabled,
        fileReceiverPort: fileReceiverPort ?? defaultConfig.fileReceiverPort,
        fileReceiverDirectory: fileReceiverDirectory ?? defaultConfig.fileReceiverDirectory,
        fileReceiverTokenHash: fileReceiverTokenHash ?? defaultConfig.fileReceiverTokenHash,
        themeMode: themeMode ?? defaultConfig.themeMode,
        language: language ?? defaultConfig.language,
        autoStart: autoStart ?? defaultConfig.autoStart,
        microDevice: microDevice ?? defaultConfig.microDevice,
        planeDevice: planeDevice ?? defaultConfig.planeDevice,
        xrayDevice: xrayDevice ?? defaultConfig.xrayDevice,
        highTempPressureCaptureDevice: highTempPressureCaptureDevice ?? defaultConfig.highTempPressureCaptureDevice,
        highTempPressureCaptureDeviceName: highTempPressureCaptureDeviceName ?? defaultConfig.highTempPressureCaptureDeviceName,
        sensorlessOvenLeftPort: sensorlessOvenLeftPort ?? defaultConfig.sensorlessOvenLeftPort,
        sensorlessOvenRightPort: sensorlessOvenRightPort ?? defaultConfig.sensorlessOvenRightPort,
        xrayCropArea: xrayCropArea ?? defaultConfig.xrayCropArea,
        dataDir: dataDir ?? defaultConfig.dataDir,
        downloadDir: downloadDir ?? defaultConfig.downloadDir,
        highTempPressureDownloadDir: highTempPressureDownloadDir ?? downloadDir ?? defaultConfig.highTempPressureDownloadDir,
        vibrationDownloadDir: vibrationDownloadDir ?? downloadDir ?? defaultConfig.vibrationDownloadDir,
        vibrationSharedReportDir: vibrationSharedReportDir ?? defaultConfig.vibrationSharedReportDir,
        autoSave: autoSave ?? defaultConfig.autoSave,
        autoReUpload: autoReUpload ?? defaultConfig.autoReUpload,
        hiddenMenus: hiddenMenus ?? defaultConfig.hiddenMenus,
        lockerPassword: lockerPassword ?? defaultConfig.lockerPassword,
        flojoyPythonPath: flojoyPythonPath ?? defaultConfig.flojoyPythonPath,
        flojoyEnvInitialized: flojoyEnvInitialized ?? defaultConfig.flojoyEnvInitialized,
      }

      // 监听配置变更事件（跨窗口同步）
      await listen<Partial<AppConfig>>(CONFIG_CHANGE_EVENT, (event) => {
        const changes = event.payload
        config.value = { ...config.value, ...changes }
      })

      initialized = true

      // 打印配置信息
      const configPath = await getConfigPath()
      console.log('配置文件位置:', configPath)
      console.log('当前配置:', config.value)

      return config.value
    } catch (error) {
      console.error('初始化配置失败:', error)
      return config.value
    }
  })()

  return initPromise
}

/**
 * 获取配置文件路径
 */
async function getConfigPath(): Promise<string> {
  try {
    const configDir = await appConfigDir()
    return `${configDir}\\${CONFIG_FILE}`
  } catch {
    return CONFIG_FILE
  }
}

/**
 * 配置管理 composable
 */
export function useConfig() {
  /**
   * 初始化配置（兼容旧调用方式）
   */
  const initConfig = async (): Promise<AppConfig> => {
    return initializeConfig()
  }

  /**
   * 获取配置文件路径
   */
  const getConfigPathAsync = async (): Promise<string> => {
    return getConfigPath()
  }

  /**
   * 保存单个配置项
   */
  const setConfigItem = async <K extends keyof AppConfig>(
    key: K,
    value: AppConfig[K]
  ): Promise<void> => {
    if (!store) {
      await initConfig()
    }

    try {
      // 更新本地状态
      config.value[key] = value
      
      // 保存到store
      await store?.set(key, value)
      await store?.save()

      // 广播配置变更
      await emit(CONFIG_CHANGE_EVENT, { [key]: value })
      
      console.log(`配置已保存: ${key} =`, value)
    } catch (error) {
      console.error('保存配置失败:', error)
      throw error
    }
  }

  /**
   * 批量保存配置
   */
  const setConfig = async (updates: Partial<AppConfig>): Promise<void> => {
    if (!store) {
      await initConfig()
    }

    try {
      // 更新本地状态
      config.value = { ...config.value, ...updates }
      
      // 保存到store
      for (const [key, value] of Object.entries(updates)) {
        await store?.set(key, value)
      }
      await store?.save()

      // 广播配置变更
      await emit(CONFIG_CHANGE_EVENT, updates)
      
      console.log('配置已批量保存:', updates)
    } catch (error) {
      console.error('批量保存配置失败:', error)
      throw error
    }
  }

  /**
   * 获取单个配置项
   */
  const getConfigItem = <K extends keyof AppConfig>(key: K): AppConfig[K] => {
    return config.value[key]
  }

  /**
   * 重置配置为默认值
   */
  const resetConfig = async (): Promise<void> => {
    await setConfig(defaultConfig)
  }

  /**
   * 检查是否已初始化
   */
  const isInitialized = (): boolean => {
    return initialized
  }

  return {
    config: readonly(config),
    initConfig,
    getConfigPath: getConfigPathAsync,
    setConfigItem,
    setConfig,
    getConfigItem,
    resetConfig,
    isInitialized,
  }
}
