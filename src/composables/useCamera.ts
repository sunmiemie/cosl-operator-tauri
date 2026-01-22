/**
 * 摄像头调用封装
 * 支持两种模式：
 * 1. Native 模式：通过 Tauri 调用 Rust/OpenCV 控制摄像头
 * 2. WebRTC 模式：使用浏览器原生 API（作为后备方案）
 */
import { ref, onUnmounted, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// 摄像头设备信息
export interface CameraDevice {
  deviceId: string
  label: string
  kind: string
  index?: number  // Tauri 模式使用的索引
}

// 拍照结果
export interface PhotoResult {
  dataUrl: string
  blob?: Blob
  width?: number
  height?: number
}

// Tauri 摄像头信息
interface TauriCameraInfo {
  index: number
  name: string
  available: boolean
}

/**
 * 摄像头操作 Composable
 */
export function useCamera() {
  // 当前视频流 (WebRTC 模式)
  const stream = ref<MediaStream | null>(null)
  // 当前视频元素
  const videoElement = ref<HTMLVideoElement | null>(null)
  // 可用摄像头列表
  const devices = ref<CameraDevice[]>([])
  // 当前选中的摄像头ID/索引
  const currentDeviceId = ref<string>('')
  const currentDeviceIndex = ref<number>(-1)
  // 是否正在加载
  const isLoading = ref(false)
  // 错误信息
  const error = ref<string>('')
  // 是否已启动
  const isActive = ref(false)
  // 是否使用 Tauri 模式
  const useTauriMode = ref(false)
  // 当前帧 (Tauri 模式)
  const currentFrame = ref<string>('')
  // 事件监听器
  let frameUnlisten: UnlistenFn | null = null

  /**
   * 获取可用摄像头列表（直接使用 Tauri）
   */
  async function getDeviceList(): Promise<CameraDevice[]> {
    try {
      console.log('通过 Tauri 获取摄像头列表...')
      const tauriCameras = await invoke<TauriCameraInfo[]>('get_camera_list')
      console.log('Tauri 摄像头列表:', tauriCameras)
      
      useTauriMode.value = true
      devices.value = tauriCameras.map(cam => ({
        deviceId: String(cam.index),
        label: cam.name || `摄像头 ${cam.index}`,
        kind: 'videoinput',
        index: cam.index
      }))
      
      return devices.value
    } catch (err) {
      console.error('获取摄像头列表失败:', err)
      error.value = '无法获取摄像头列表: ' + String(err)
      return []
    }
  }

  /**
   * 启动摄像头（直接使用 Tauri）
   * @param deviceIndex - 摄像头索引
   * 
   * 注意：为处理热更新/刷新后黑屏问题，始终在启动前尝试释放摄像头，
   * 确保 Tauri 后端状态与前端状态同步。
   */
  async function startCamera(deviceIndex?: string | number): Promise<boolean> {
    try {
      isLoading.value = true
      error.value = ''
      
      const index = typeof deviceIndex === 'number' 
        ? deviceIndex 
        : (deviceIndex ? parseInt(deviceIndex) : 0)
      
      console.log('启动摄像头，索引:', index)
      
      // 无论本地状态如何，始终先尝试停止/释放摄像头
      // 这对于热更新/页面刷新后恢复摄像头至关重要
      try {
        // 取消旧的帧监听（如果存在）
        if (frameUnlisten) {
          frameUnlisten()
          frameUnlisten = null
        }
        // 停止后端视频流和释放摄像头
        await invoke('stop_video_stream')
        await invoke('release_camera')
      } catch (e) {
        // 忽略停止时的错误（可能本来就没启动）
        console.debug('预清理摄像头:', e)
      }
      
      // 重置本地状态
      currentFrame.value = ''
      isActive.value = false

      // 启动视频流
      await invoke('start_video_stream', { index })
      
      // 监听帧事件
      frameUnlisten = await listen<{ frame: string }>('camera-frame', (event) => {
        currentFrame.value = event.payload.frame
        
        // 如果有视频元素，更新 poster
        if (videoElement.value && currentFrame.value) {
          videoElement.value.poster = currentFrame.value
        }
      })
      
      currentDeviceIndex.value = index
      currentDeviceId.value = String(index)
      isActive.value = true
      useTauriMode.value = true
      
      console.log('摄像头启动成功')
      return true
    } catch (err: unknown) {
      console.error('启动摄像头失败:', err)
      error.value = '启动摄像头失败: ' + String(err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 停止摄像头
   */
  async function stopCamera() {
    try {
      await invoke('stop_video_stream')
      await invoke('release_camera')
    } catch (e) {
      console.warn('停止摄像头失败:', e)
    }
    
    // 取消帧监听
    if (frameUnlisten) {
      frameUnlisten()
      frameUnlisten = null
    }
    
    currentFrame.value = ''
    
    if (videoElement.value) {
      videoElement.value.poster = ''
    }
    
    isActive.value = false
    currentDeviceId.value = ''
    currentDeviceIndex.value = -1
  }

  /**
   * 切换摄像头
   */
  async function switchCamera(deviceId: string): Promise<boolean> {
    return await startCamera(deviceId)
  }

  /**
   * 拍照（直接使用 Tauri）
   */
  async function takePhoto(): Promise<PhotoResult | null> {
    try {
      // 使用当前帧
      if (currentFrame.value) {
        return {
          dataUrl: currentFrame.value
        }
      }
      
      // 或者直接捕获一帧
      const frame = await invoke<string>('capture_frame')
      return {
        dataUrl: frame
      }
    } catch (err: unknown) {
      console.error('拍照失败:', err)
      error.value = '拍照失败: ' + String(err)
      return null
    }
  }

  /**
   * 连续拍照（用于多图拍摄）
   */
  async function takeMultiplePhotos(count: number, interval: number = 500): Promise<PhotoResult[]> {
    const results: PhotoResult[] = []
    
    for (let i = 0; i < count; i++) {
      const photo = await takePhoto()
      if (photo) {
        results.push(photo)
      }
      
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    }
    
    return results
  }

  /**
   * 绑定视频元素
   */
  function bindVideoElement(element: HTMLVideoElement) {
    videoElement.value = element
    if (stream.value && element) {
      element.srcObject = stream.value
      element.play().catch(console.error)
    } else if (useTauriMode.value && currentFrame.value && element) {
      element.poster = currentFrame.value
    }
  }

  /**
   * 解绑视频元素
   */
  function unbindVideoElement() {
    if (videoElement.value) {
      videoElement.value.srcObject = null
      videoElement.value.poster = ''
    }
    videoElement.value = null
  }

  /**
   * 重启摄像头驱动
   */
  async function restartCameraDriver(): Promise<boolean> {
    try {
      await stopCamera()
      const result = await invoke<boolean>('restart_all_cameras')
      return result
    } catch (e) {
      console.error('重启摄像头驱动失败:', e)
      return false
    }
  }

  // 组件卸载时自动停止摄像头
  onUnmounted(() => {
    stopCamera()
  })

  return {
    // 状态
    stream,
    devices,
    currentDeviceId,
    currentDeviceIndex,
    isLoading,
    error,
    isActive,
    useTauriMode,
    currentFrame,
    isTauriAvailable: computed(() => true),  // 始终使用 Tauri
    
    // 方法
    getDeviceList,
    startCamera,
    stopCamera,
    switchCamera,
    takePhoto,
    takeMultiplePhotos,
    bindVideoElement,
    unbindVideoElement,
    restartCameraDriver
  }
}
