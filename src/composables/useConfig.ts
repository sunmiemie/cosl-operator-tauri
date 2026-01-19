import { ref, readonly } from 'vue'
import { load, Store } from '@tauri-apps/plugin-store'
import { emit, listen } from '@tauri-apps/api/event'
import { appConfigDir } from '@tauri-apps/api/path'
import { ThemeMode } from '@/enums'

// 配置变更事件
const CONFIG_CHANGE_EVENT = 'config-changed'

// 配置文件名
const CONFIG_FILE = 'settings.json'

// 配置接口
export interface AppConfig {
  // 连接设置
  backendUrl: string
  
  // 外观设置
  themeMode: ThemeMode
  
  // 通用设置
  language: string
  autoStart: boolean
  
  // 设备设置（摄像头索引）
  microDevice: number      // 显微镜摄像头索引
  planeDevice: number      // 水平仪摄像头索引
  xrayDevice: number       // X光机摄像头索引
  
  // 离线功能设置
  dataDir: string          // 离线数据存储目录
  autoSave: boolean        // 测试过程自动保存
  autoReUpload: boolean    // 网络恢复自动回传
}

// 默认配置
const defaultConfig: AppConfig = {
  backendUrl: 'http://localhost:8080',
  themeMode: ThemeMode.DARK,
  language: 'zh-CN',
  autoStart: false,
  // 设备设置默认值
  microDevice: -1,
  planeDevice: -1,
  xrayDevice: -1,
  // 离线功能默认值
  dataDir: '',
  autoSave: true,
  autoReUpload: true,
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
      const themeMode = await store.get<ThemeMode>('themeMode')
      const language = await store.get<string>('language')
      const autoStart = await store.get<boolean>('autoStart')
      const microDevice = await store.get<number>('microDevice')
      const planeDevice = await store.get<number>('planeDevice')
      const xrayDevice = await store.get<number>('xrayDevice')
      const dataDir = await store.get<string>('dataDir')
      const autoSave = await store.get<boolean>('autoSave')
      const autoReUpload = await store.get<boolean>('autoReUpload')

      // 检查是否需要写入默认值（首次启动）
      let needsSave = false

      // 基础配置
      if (backendUrl === null || backendUrl === undefined) {
        await store.set('backendUrl', defaultConfig.backendUrl)
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
      
      // 离线功能配置
      if (dataDir === null || dataDir === undefined) {
        await store.set('dataDir', defaultConfig.dataDir)
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

      // 保存默认配置到文件
      if (needsSave) {
        await store.save()
        console.log('配置文件已创建，使用默认配置')
      }

      // 合并配置
      config.value = {
        backendUrl: backendUrl ?? defaultConfig.backendUrl,
        themeMode: themeMode ?? defaultConfig.themeMode,
        language: language ?? defaultConfig.language,
        autoStart: autoStart ?? defaultConfig.autoStart,
        microDevice: microDevice ?? defaultConfig.microDevice,
        planeDevice: planeDevice ?? defaultConfig.planeDevice,
        xrayDevice: xrayDevice ?? defaultConfig.xrayDevice,
        dataDir: dataDir ?? defaultConfig.dataDir,
        autoSave: autoSave ?? defaultConfig.autoSave,
        autoReUpload: autoReUpload ?? defaultConfig.autoReUpload,
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
