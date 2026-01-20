/**
 * 扫码枪操作封装
 * 通过 Tauri 调用 Rust 端 USB HID 驱动与扫码枪通信
 */
import { ref, onUnmounted, readonly } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// 扫码枪设备信息
export interface ScannerInfo {
  vendor_id: string
  product_id: string
  bus: number
  address: number
}

// 扫描结果事件数据
interface ScannerEventData {
  code: number
  data?: string
  error?: string
}

// 扫码枪状态
export type ScannerStatus = 'idle' | 'checking' | 'scanning' | 'error' | 'not_found'

/**
 * 扫码枪操作 Composable
 */
export function useScanner() {
  // 当前状态
  const status = ref<ScannerStatus>('idle')
  // 是否连接
  const isConnected = ref(false)
  // 是否正在扫描
  const isScanning = ref(false)
  // 最新扫描数据
  const lastScanData = ref<string>('')
  // 错误信息
  const error = ref<string>('')
  // 设备信息
  const deviceInfo = ref<ScannerInfo | null>(null)
  // 扫描回调函数
  let scanCallback: ((data: string) => void) | null = null
  // 事件监听器
  let eventUnlisten: UnlistenFn | null = null

  /**
   * 检测扫码枪是否连接
   */
  async function checkScanner(): Promise<boolean> {
    try {
      status.value = 'checking'
      error.value = ''
      
      const connected = await invoke<boolean>('check_scanner')
      isConnected.value = connected
      
      if (connected) {
        // 获取设备详情
        const info = await invoke<ScannerInfo | null>('get_scanner_info')
        deviceInfo.value = info
        status.value = 'idle'
      } else {
        status.value = 'not_found'
        error.value = '未检测到扫码枪设备'
      }
      
      return connected
    } catch (err) {
      console.error('检测扫码枪失败:', err)
      error.value = String(err)
      status.value = 'error'
      isConnected.value = false
      return false
    }
  }

  /**
   * 开始扫描监听
   * @param callback 扫描到数据时的回调函数
   */
  async function startScanning(callback?: (data: string) => void): Promise<boolean> {
    try {
      if (isScanning.value) {
        console.log('扫码枪已在运行中')
        return true
      }

      error.value = ''
      scanCallback = callback || null
      
      // 先设置事件监听
      eventUnlisten = await listen<ScannerEventData>('scanner-data', (event) => {
        const payload = event.payload
        
        if (payload.code === 0 && payload.data) {
          // 成功扫描到数据
          lastScanData.value = payload.data
          console.log('扫描到数据:', payload.data)
          
          // 调用回调
          if (scanCallback) {
            scanCallback(payload.data)
          }
        } else if (payload.error) {
          // 扫描错误
          console.error('扫描错误:', payload.error)
          error.value = payload.error
          status.value = 'error'
        }
      })
      
      // 启动扫码枪
      await invoke('start_scanner')
      
      isScanning.value = true
      status.value = 'scanning'
      
      console.log('扫码枪已启动')
      return true
    } catch (err) {
      console.error('启动扫码枪失败:', err)
      error.value = String(err)
      status.value = 'error'
      isScanning.value = false
      
      // 清理事件监听
      if (eventUnlisten) {
        eventUnlisten()
        eventUnlisten = null
      }
      
      return false
    }
  }

  /**
   * 停止扫描
   */
  async function stopScanning(): Promise<void> {
    try {
      if (!isScanning.value) {
        return
      }
      
      // 停止扫码枪
      await invoke('stop_scanner')
      
      // 清理事件监听
      if (eventUnlisten) {
        eventUnlisten()
        eventUnlisten = null
      }
      
      isScanning.value = false
      status.value = 'idle'
      scanCallback = null
      
      console.log('扫码枪已停止')
    } catch (err) {
      console.error('停止扫码枪失败:', err)
      error.value = String(err)
    }
  }

  /**
   * 清除最后扫描的数据
   */
  function clearLastScan(): void {
    lastScanData.value = ''
  }

  /**
   * 清除错误
   */
  function clearError(): void {
    error.value = ''
    if (status.value === 'error') {
      status.value = isScanning.value ? 'scanning' : 'idle'
    }
  }

  /**
   * 设置扫描回调
   */
  function onScan(callback: (data: string) => void): void {
    scanCallback = callback
  }

  /**
   * 组件卸载时清理
   */
  onUnmounted(async () => {
    if (isScanning.value) {
      await stopScanning()
    }
  })

  return {
    // 状态 (只读)
    status: readonly(status),
    isConnected: readonly(isConnected),
    isScanning: readonly(isScanning),
    lastScanData: readonly(lastScanData),
    error: readonly(error),
    deviceInfo: readonly(deviceInfo),
    
    // 方法
    checkScanner,
    startScanning,
    stopScanning,
    clearLastScan,
    clearError,
    onScan,
  }
}
