import { ref, watch, computed } from 'vue'
import { ThemeMode } from '@/enums'
import { emit, listen } from '@tauri-apps/api/event'
import { useConfig } from './useConfig'

// 主题变更事件名
const THEME_CHANGE_EVENT = 'theme-changed'

// 当前主题模式
const themeMode = ref<ThemeMode>(ThemeMode.DARK)

// 实际应用的主题（考虑系统偏好）
const appliedTheme = computed(() => {
  if (themeMode.value === ThemeMode.SYSTEM) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? ThemeMode.DARK
      : ThemeMode.LIGHT
  }
  return themeMode.value
})

// 是否为暗色模式
const isDark = computed(() => appliedTheme.value === ThemeMode.DARK)

// 是否已初始化监听器
let listenerInitialized = false

/**
 * 主题管理 composable
 */
export function useTheme() {
  const { initConfig, setConfigItem, config } = useConfig()

  /**
   * 初始化主题
   */
  const initTheme = async () => {
    // 从配置加载主题
    try {
      await initConfig()
      themeMode.value = config.value.themeMode
    } catch (error) {
      console.warn('从配置加载主题失败，使用默认值:', error)
    }

    // 应用主题
    applyTheme()

    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (themeMode.value === ThemeMode.SYSTEM) {
        applyTheme()
      }
    })

    // 初始化跨窗口主题同步监听
    if (!listenerInitialized) {
      listenerInitialized = true
      await listen<ThemeMode>(THEME_CHANGE_EVENT, (event) => {
        // 接收到其他窗口的主题变更事件
        const newTheme = event.payload
        if (newTheme && Object.values(ThemeMode).includes(newTheme)) {
          themeMode.value = newTheme
          applyTheme()
        }
      })
    }
  }

  /**
   * 应用主题到 DOM
   */
  const applyTheme = () => {
    const html = document.documentElement
    
    if (appliedTheme.value === ThemeMode.DARK) {
      html.classList.add('dark')
      html.classList.remove('light')
    } else {
      html.classList.add('light')
      html.classList.remove('dark')
    }
  }

  /**
   * 设置主题模式（会同步到所有窗口并保存到配置）
   */
  const setTheme = async (mode: ThemeMode) => {
    themeMode.value = mode
    applyTheme()
    
    // 保存到配置文件
    try {
      await setConfigItem('themeMode', mode)
    } catch (error) {
      console.warn('保存主题配置失败:', error)
    }
    
    // 向所有窗口广播主题变更事件
    try {
      await emit(THEME_CHANGE_EVENT, mode)
    } catch (error) {
      console.warn('广播主题变更事件失败:', error)
    }
  }

  /**
   * 切换亮色/暗色模式
   */
  const toggleTheme = async () => {
    const newMode = isDark.value ? ThemeMode.LIGHT : ThemeMode.DARK
    await setTheme(newMode)
  }

  // 监听主题变化
  watch(themeMode, () => {
    applyTheme()
  })

  return {
    themeMode,
    appliedTheme,
    isDark,
    initTheme,
    setTheme,
    toggleTheme,
  }
}
