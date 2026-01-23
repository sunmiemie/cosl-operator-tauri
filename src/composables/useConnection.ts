import { ref, readonly } from 'vue'
import { http } from '@/services/http'

// 连接状态
export type ConnectionStatus = 'checking' | 'online' | 'offline'

// 全局连接状态
const connectionStatus = ref<ConnectionStatus>('checking')
const lastCheckTime = ref<Date | null>(null)
const checkInterval = ref<number | null>(null)

// 检测间隔（毫秒）
const CHECK_INTERVAL = 10000 // 10秒

// 是否已初始化
let initialized = false

/**
 * 连接状态管理 composable
 */
export function useConnection() {
  /**
   * 检测连接状态
   */
  const checkConnection = async (): Promise<boolean> => {
    try {
      // 确保API已初始化
      if (!http.getBaseUrl()) {
        await http.init()
      }
      
      const result = await http.testConnection()
      connectionStatus.value = result.success ? 'online' : 'offline'
      lastCheckTime.value = new Date()
      return result.success
    } catch (error) {
      console.error('连接检测失败:', error)
      connectionStatus.value = 'offline'
      lastCheckTime.value = new Date()
      return false
    }
  }

  /**
   * 启动定时检测
   */
  const startChecking = () => {
    if (initialized) return
    
    initialized = true
    
    // 立即执行一次检测
    checkConnection()
    
    // 设置定时检测
    checkInterval.value = window.setInterval(() => {
      checkConnection()
    }, CHECK_INTERVAL)
    
    console.log('连接状态检测已启动，间隔:', CHECK_INTERVAL / 1000, '秒')
  }

  /**
   * 停止定时检测
   */
  const stopChecking = () => {
    if (checkInterval.value) {
      clearInterval(checkInterval.value)
      checkInterval.value = null
      initialized = false
      console.log('连接状态检测已停止')
    }
  }

  /**
   * 获取状态文本
   */
  const getStatusText = (): string => {
    switch (connectionStatus.value) {
      case 'online':
        return '在线'
      case 'offline':
        return '离线'
      case 'checking':
        return '检测中'
      default:
        return '未知'
    }
  }

  // 组件卸载时不停止检测（因为是全局状态）
  // 如果需要在特定组件卸载时停止，可以调用 stopChecking

  return {
    connectionStatus: readonly(connectionStatus),
    lastCheckTime: readonly(lastCheckTime),
    checkConnection,
    startChecking,
    stopChecking,
    getStatusText,
  }
}
