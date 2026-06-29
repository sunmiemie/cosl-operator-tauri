import { ref, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { type as getOsType } from '@tauri-apps/plugin-os'

const RESIZE_DEBOUNCE_MS = 200

/**
 * 窗口最大化状态。macOS 无边框窗口下 isMaximized IPC 易挂起并触发 resize 循环，故跳过轮询。
 */
export function useWindowMaximizeState() {
  const isMaximized = ref(false)
  const showMaximizeButton = getOsType() !== 'macos'
  const appWindow = getCurrentWindow()

  let unlistenResize: (() => void) | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let syncInFlight = false

  async function syncMaximizedState() {
    if (!showMaximizeButton || syncInFlight) return
    syncInFlight = true
    try {
      isMaximized.value = await appWindow.isMaximized()
    } catch {
      // 忽略平台差异导致的查询失败
    } finally {
      syncInFlight = false
    }
  }

  async function toggleMaximize() {
    await appWindow.toggleMaximize()
    await syncMaximizedState()
  }

  onMounted(async () => {
    if (!showMaximizeButton) return

    await syncMaximizedState()
    unlistenResize = await appWindow.onResized(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        void syncMaximizedState()
      }, RESIZE_DEBOUNCE_MS)
    })
  })

  onUnmounted(() => {
    unlistenResize?.()
    if (resizeTimer) clearTimeout(resizeTimer)
  })

  return {
    appWindow,
    isMaximized,
    showMaximizeButton,
    toggleMaximize,
  }
}
