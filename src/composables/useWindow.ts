import { computed, nextTick } from 'vue'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { EventEnum, WindowLabel } from '@/enums'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { type } from '@tauri-apps/plugin-os'
import { UserAttentionType } from '@tauri-apps/api/window'

// 检查是否在 Tauri 环境中
const isTauriEnv = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

// 模态窗口与父窗口的映射关系
const modalParentMap = new Map<string, string>()

/** 判断是兼容的系统 */
const isCompatibility = computed(() => {
  if (!isTauriEnv()) {
    return false
  }
  return type() === 'windows' || type() === 'linux'
})

/** 窗口配置接口 */
interface WindowConfig {
  title: string
  label: string
  url: string
  width: number
  height: number
  resizable?: boolean
  minWidth?: number
  minHeight?: number
  transparent?: boolean
  visible?: boolean
  center?: boolean
  decorations?: boolean
  alwaysOnTop?: boolean
  fullscreen?: boolean
  parent?: string
  dragDropEnabled?: boolean
}

export function useWindow() {
  /**
   * 创建 Webview 窗口
   */
  const createWebviewWindow = async (
    title: string,
    label: string,
    url: string,
    width: number,
    height: number,
    wantCloseWindow?: string,
    resizable = false,
    minW = 330,
    minH = 495,
    transparent?: boolean,
    visible = false
  ) => {
    // 如果是独立窗口，使用处理后的label作为路径；否则使用传入的url
    const resolvedUrl = computed(() => {
      if (label.includes(EventEnum.ALONE)) {
        return `/${label.replace(/\d/g, '')}`
      }
      return url.startsWith('/') ? url : `/${url}`
    })
    
    const webview = new WebviewWindow(label, {
      title: title,
      url: resolvedUrl.value,
      fullscreen: false,
      resizable: resizable,
      center: true,
      width: width,
      height: height,
      minHeight: minH,
      minWidth: minW,
      skipTaskbar: false,
      decorations: !isCompatibility.value,
      transparent: transparent || isCompatibility.value,
      titleBarStyle: 'overlay',
      hiddenTitle: true,
      visible: visible,
      dragDropEnabled: false,  // 禁用 Tauri 拖拽以启用 H5 拖拽 API
    })

    await webview.once('tauri://created', async () => {
      if (wantCloseWindow) {
        const win = await WebviewWindow.getByLabel(wantCloseWindow)
        win?.close()
      }
    })

    await webview.once('tauri://error', async () => {
      await checkWinExist(label)
    })

    return webview
  }

  /**
   * 通用窗口创建函数
   */
  const createWindow = async (config: WindowConfig) => {
    const existingWindow = await getWindowByLabel(config.label)

    if (existingWindow) {
      await focusWindow(config.label)
      return existingWindow
    }

    const webview = new WebviewWindow(config.label, {
      title: config.title,
      url: config.url,
      width: config.width,
      height: config.height,
      resizable: config.resizable ?? true,
      minWidth: config.minWidth ?? 330,
      minHeight: config.minHeight ?? 495,
      center: config.center ?? true,
      decorations: config.decorations ?? !isCompatibility.value,
      transparent: config.transparent ?? isCompatibility.value,
      visible: config.visible ?? true,
      alwaysOnTop: config.alwaysOnTop ?? false,
      fullscreen: config.fullscreen ?? false,
      titleBarStyle: 'overlay',
      hiddenTitle: true,
      skipTaskbar: false,
      dragDropEnabled: config.dragDropEnabled ?? false,  // 默认禁用 Tauri 拖拽以启用 H5 拖拽 API
    })

    if (config.parent) {
      const parentWindow = await getWindowByLabel(config.parent)
      if (parentWindow) {
        try {
          await webview.reparent(parentWindow)
        } catch (error) {
          console.warn('设置父窗口失败:', error)
        }
      }
    }

    return webview
  }

  /**
   * 创建模态子窗口
   */
  const createModalWindow = async (
    title: string,
    label: string,
    width: number,
    height: number,
    parent: string
  ) => {
    const existingWindow = await WebviewWindow.getByLabel(label)
    const parentWindow = parent ? await WebviewWindow.getByLabel(parent) : null

    if (existingWindow) {
      existingWindow.requestUserAttention(UserAttentionType.Critical)
      return existingWindow
    }

    modalParentMap.set(label, parent)

    const modalWindow = new WebviewWindow(label, {
      url: `/${label}`,
      title: title,
      width: width,
      height: height,
      resizable: true,
      center: true,
      minWidth: 500,
      minHeight: 400,
      focus: true,
      parent: type() === 'macos' ? undefined : parentWindow ? parentWindow : parent,
      decorations: false,  // 无边框窗口
      transparent: false,
      shadow: true,
      visible: true,
      alwaysOnTop: true,
      dragDropEnabled: false,  // 禁用 Tauri 拖拽以启用 H5 拖拽 API
    })

    modalWindow.once('tauri://created', async () => {
      console.log('模态窗口已创建, 父窗口:', parent)
      await parentWindow?.setEnabled(false)
      await modalWindow.setFocus()
    })

    modalWindow.once('tauri://destroyed', async () => {
      if (parentWindow) {
        await parentWindow.setEnabled(true)
        await parentWindow.setFocus()
      }
      modalParentMap.delete(label)
    })

    modalWindow.once('tauri://error', async (e) => {
      console.error(`${title}窗口创建失败:`, e)
      await parentWindow?.setEnabled(true)
    })

    return modalWindow
  }

  /**
   * 打开设置窗口
   */
  const openSettingsWindow = async () => {
    return await createModalWindow(
      '设置',
      WindowLabel.SETTINGS,
      1200,
      900,
      WindowLabel.MAIN
    )
  }

  /**
   * 获取窗口实例
   */
  const getWindowByLabel = async (label: string): Promise<WebviewWindow | null> => {
    try {
      return await WebviewWindow.getByLabel(label)
    } catch {
      return null
    }
  }

  /**
   * 获取当前窗口
   */
  const getCurrentWindow = (): WebviewWindow | null => {
    if (!isTauriEnv()) {
      console.log('Not in Tauri environment, cannot get current window')
      return null
    }
    return WebviewWindow.getCurrent()
  }

  /**
   * 关闭窗口
   */
  const closeWindow = async (label?: string) => {
    try {
      const window = label ? await getWindowByLabel(label) : getCurrentWindow()

      if (!window) {
        console.warn(`窗口 ${label} 不存在`)
        return
      }

      // 处理模态窗口的父窗口恢复
      if (label?.includes(EventEnum.MODAL)) {
        const parentLabel = modalParentMap.get(label)
        if (parentLabel) {
          const parentWindow = await getWindowByLabel(parentLabel)
          if (parentWindow) {
            await parentWindow.setEnabled(true)
            await parentWindow.setFocus()
          }
          modalParentMap.delete(label)
        } else {
          const mainWindow = await getWindowByLabel(WindowLabel.MAIN)
          if (mainWindow) {
            await mainWindow.setEnabled(true)
            await mainWindow.setFocus()
          }
        }
      }

      await window.close()
    } catch (error) {
      console.error('关闭窗口失败:', error)
      throw error
    }
  }

  /**
   * 隐藏窗口
   */
  const hideWindow = async (label?: string) => {
    try {
      const window = label ? await getWindowByLabel(label) : getCurrentWindow()
      if (!window) {
        console.warn(`窗口 ${label} 不存在`)
        return
      }
      await window.hide()
    } catch (error) {
      console.error('隐藏窗口失败:', error)
      throw error
    }
  }

  /**
   * 显示窗口
   */
  const showWindow = async (label: string) => {
    try {
      const window = await getWindowByLabel(label)
      if (!window) {
        console.warn(`窗口 ${label} 不存在`)
        return
      }
      await window.show()
      await window.setFocus()
    } catch (error) {
      console.error('显示窗口失败:', error)
      throw error
    }
  }

  /**
   * 聚焦窗口
   */
  const focusWindow = async (label: string) => {
    try {
      const window = await getWindowByLabel(label)
      if (!window) {
        console.warn(`窗口 ${label} 不存在`)
        return
      }

      const isMinimized = await window.isMinimized()
      const isVisible = await window.isVisible()

      if (!isVisible) {
        await window.show()
      }

      if (isMinimized) {
        await window.unminimize()
      }

      await window.setFocus()
      await window.requestUserAttention(UserAttentionType.Critical)
    } catch (error) {
      console.error('聚焦窗口失败:', error)
      throw error
    }
  }

  /**
   * 最小化窗口
   */
  const minimizeWindow = async (label?: string) => {
    try {
      const window = label ? await getWindowByLabel(label) : getCurrentWindow()
      if (!window) {
        console.warn(`窗口 ${label} 不存在`)
        return
      }
      await window.minimize()
    } catch (error) {
      console.error('最小化窗口失败:', error)
      throw error
    }
  }

  /**
   * 最大化/还原窗口
   */
  const toggleMaximizeWindow = async (label?: string) => {
    try {
      const window = label ? await getWindowByLabel(label) : getCurrentWindow()
      if (!window) {
        console.warn(`窗口 ${label} 不存在`)
        return
      }
      await window.toggleMaximize()
    } catch (error) {
      console.error('切换最大化状态失败:', error)
      throw error
    }
  }

  /**
   * 调整窗口大小
   */
  const resizeWindow = async (label: string, width: number, height: number) => {
    const webview = await WebviewWindow.getByLabel(label)
    const newSize = new LogicalSize(width, height)
    await webview?.setSize(newSize).catch((error) => {
      console.error('无法调整窗口大小:', error)
    })
  }

  /**
   * 检查窗口是否存在
   */
  const checkWinExist = async (L: string) => {
    const isExistsWinds = await WebviewWindow.getByLabel(L)
    if (isExistsWinds) {
      nextTick().then(async () => {
        const minimized = await isExistsWinds.isMinimized()
        const hidden = await isExistsWinds.isVisible()
        if (!hidden) {
          await isExistsWinds.show()
        }
        if (minimized) {
          await isExistsWinds.unminimize()
        }
        await isExistsWinds.setFocus()
      })
    }
  }

  /**
   * 设置窗口是否可调整大小
   */
  const setResizable = async (label: string, resizable: boolean) => {
    const webview = await WebviewWindow.getByLabel(label)
    if (webview) {
      await webview.setResizable(resizable).catch((error) => {
        console.error('设置窗口可调整大小失败:', error)
      })
    }
  }

  /**
   * 设置窗口是否置顶
   */
  const setAlwaysOnTop = async (label: string, alwaysOnTop: boolean) => {
    try {
      const window = await getWindowByLabel(label)
      if (!window) {
        console.warn(`窗口 ${label} 不存在`)
        return
      }
      await window.setAlwaysOnTop(alwaysOnTop)
    } catch (error) {
      console.error('设置窗口置顶失败:', error)
      throw error
    }
  }

  /**
   * 获取窗口状态
   */
  const getWindowState = async (label: string) => {
    try {
      const window = await getWindowByLabel(label)
      if (!window) {
        return null
      }

      const [isMinimized, isMaximized, isVisible, isFullscreen, isFocused] =
        await Promise.all([
          window.isMinimized(),
          window.isMaximized(),
          window.isVisible(),
          window.isFullscreen(),
          window.isFocused(),
        ])

      return {
        isMinimized,
        isMaximized,
        isVisible,
        isFullscreen,
        isFocused,
      }
    } catch (error) {
      console.error('获取窗口状态失败:', error)
      return null
    }
  }

  /**
   * 获取所有窗口
   */
  const getAllWindows = async (): Promise<WebviewWindow[]> => {
    try {
      return await WebviewWindow.getAll()
    } catch (error) {
      console.error('获取所有窗口失败:', error)
      return []
    }
  }

  /**
   * 打开报告预览窗口
   * @param mode 报告类型: 0=正式报告, 1=临时报告
   * @param unitId 工单ID
   */
  const openReportPreview = async (mode: 0 | 1, unitId: number) => {
    const label = `report-preview-${unitId}`
    return createWindow({
      title: '报告详情',
      label: label,
      url: `/report-preview?mode=${mode}&unitId=${unitId}`,
      width: 800,
      height: 700,
      alwaysOnTop: true,
      resizable: true,
      decorations: false,  // 无边框窗口
      minWidth: 600,
      minHeight: 500,
    })
  }

  return {
    createWebviewWindow,
    createWindow,
    createModalWindow,
    openSettingsWindow,
    openReportPreview,
    getWindowByLabel,
    getCurrentWindow,
    closeWindow,
    hideWindow,
    showWindow,
    focusWindow,
    minimizeWindow,
    toggleMaximizeWindow,
    resizeWindow,
    setResizable,
    setAlwaysOnTop,
    getWindowState,
    getAllWindows,
    checkWinExist,
  }
}
