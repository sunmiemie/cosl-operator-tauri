/**
 * OCR 图像识别 Composable
 *
 * 提供 OCR 初始化、区域配置、单帧识别、连续识别等功能
 */
import { ref, computed, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  OcrRegion,
  OcrFrameResult,
  OcrRegionResult,
  OcrResultEventPayload,
  OcrStreamOptions,
} from '@/types/ocr'

/**
 * OCR 操作 Composable
 */
export function useOcr() {
  // ==================== 状态 ====================

  /** OCR 模型是否已初始化 */
  const isInitialized = ref(false)
  /** 是否正在初始化 */
  const isInitializing = ref(false)
  /** 是否正在进行连续识别 */
  const isStreaming = ref(false)
  /** 当前配置的 ROI 区域 */
  const regions = ref<OcrRegion[]>([])
  /** 最新的识别结果 */
  const lastResult = ref<OcrFrameResult | null>(null)
  /** 错误信息 */
  const error = ref('')
  /** 是否正在处理识别请求 */
  const isProcessing = ref(false)

  // 事件监听器
  let resultUnlisten: UnlistenFn | null = null

  // ==================== 计算属性 ====================

  /**
   * 各区域的文本映射
   * 返回 { [regionId]: text } 格式，方便快速获取某个区域的识别结果
   */
  const regionTexts = computed<Record<string, string>>(() => {
    if (!lastResult.value) return {}
    const map: Record<string, string> = {}
    for (const region of lastResult.value.regions) {
      map[region.id] = region.text
    }
    return map
  })

  /**
   * 各区域的置信度映射
   */
  const regionConfidences = computed<Record<string, number>>(() => {
    if (!lastResult.value) return {}
    const map: Record<string, number> = {}
    for (const region of lastResult.value.regions) {
      map[region.id] = region.confidence
    }
    return map
  })

  /**
   * 最后一次处理耗时
   */
  const lastProcessTime = computed(() => lastResult.value?.processTimeMs ?? 0)

  // ==================== 方法 ====================

  /**
   * 初始化 OCR 模型
   * 应用启动时调用，加载 ONNX 模型
   */
  async function initialize(): Promise<boolean> {
    if (isInitialized.value) {
      console.log('[useOcr] 模型已初始化，跳过')
      return true
    }

    if (isInitializing.value) {
      console.log('[useOcr] 正在初始化中，请等待')
      return false
    }

    try {
      isInitializing.value = true
      error.value = ''

      console.log('[useOcr] 开始初始化 OCR 模型...')
      const result = await invoke<boolean>('init_ocr')

      if (result) {
        isInitialized.value = true
        console.log('[useOcr] OCR 模型初始化成功')

        // 设置结果事件监听
        await setupEventListeners()
      }

      return result
    } catch (err: unknown) {
      const errMsg = String(err)
      error.value = errMsg
      console.error('[useOcr] 初始化失败:', errMsg)
      return false
    } finally {
      isInitializing.value = false
    }
  }

  /**
   * 检查 OCR 是否已初始化
   */
  async function checkInitialized(): Promise<boolean> {
    try {
      const result = await invoke<boolean>('is_ocr_initialized')
      isInitialized.value = result
      return result
    } catch (err) {
      console.error('[useOcr] 检查初始化状态失败:', err)
      return false
    }
  }

  /**
   * 配置 ROI 区域（替换现有配置）
   */
  async function setRegions(newRegions: OcrRegion[]): Promise<void> {
    try {
      await invoke('set_ocr_regions', { regions: newRegions })
      regions.value = [...newRegions]
      error.value = ''
    } catch (err: unknown) {
      error.value = String(err)
      throw err
    }
  }

  /**
   * 获取当前 ROI 配置（从后端同步）
   */
  async function syncRegions(): Promise<OcrRegion[]> {
    try {
      const result = await invoke<OcrRegion[]>('get_ocr_regions')
      regions.value = result
      return result
    } catch (err: unknown) {
      error.value = String(err)
      return []
    }
  }

  /**
   * 添加单个 ROI 区域
   */
  async function addRegion(region: OcrRegion): Promise<void> {
    try {
      await invoke('add_ocr_region', { region })
      regions.value.push(region)
      error.value = ''
    } catch (err: unknown) {
      error.value = String(err)
      throw err
    }
  }

  /**
   * 移除 ROI 区域
   */
  async function removeRegion(id: string): Promise<void> {
    try {
      await invoke('remove_ocr_region', { id })
      regions.value = regions.value.filter((r) => r.id !== id)
      error.value = ''
    } catch (err: unknown) {
      error.value = String(err)
      throw err
    }
  }

  /**
   * 清空所有 ROI 区域
   */
  async function clearRegions(): Promise<void> {
    try {
      await invoke('clear_ocr_regions')
      regions.value = []
      error.value = ''
    } catch (err: unknown) {
      error.value = String(err)
      throw err
    }
  }

  /**
   * 单帧识别
   * @param imageData - base64 编码的图片数据（可带 data URL 前缀）
   * @returns 识别结果，失败返回 null
   */
  async function recognizeImage(imageData: string): Promise<OcrFrameResult | null> {
    if (!isInitialized.value) {
      error.value = 'OCR 未初始化'
      return null
    }

    try {
      isProcessing.value = true
      error.value = ''

      const result = await invoke<OcrFrameResult>('ocr_recognize', { imageData })
      lastResult.value = result
      return result
    } catch (err: unknown) {
      error.value = String(err)
      console.error('[useOcr] 识别失败:', err)
      return null
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * 识别指定区域
   * @param imageData - base64 编码的图片数据
   * @param targetRegions - 要识别的区域列表（如果不传则使用已配置的区域）
   */
  async function recognizeRegions(
    imageData: string,
    targetRegions?: OcrRegion[]
  ): Promise<OcrFrameResult | null> {
    if (!isInitialized.value) {
      error.value = 'OCR 未初始化'
      return null
    }

    const regionsToUse = targetRegions ?? regions.value
    if (regionsToUse.length === 0) {
      error.value = '未配置 ROI 区域'
      return null
    }

    try {
      isProcessing.value = true
      error.value = ''

      const result = await invoke<OcrFrameResult>('ocr_recognize_regions', {
        imageData,
        regions: regionsToUse,
      })
      lastResult.value = result
      return result
    } catch (err: unknown) {
      error.value = String(err)
      console.error('[useOcr] 区域识别失败:', err)
      return null
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * 启动连续识别（配合摄像头使用）
   * @param options - 连续识别配置
   */
  async function startStream(options?: OcrStreamOptions): Promise<boolean> {
    if (!isInitialized.value) {
      error.value = 'OCR 未初始化'
      return false
    }

    if (isStreaming.value) {
      console.log('[useOcr] 连续识别已在运行')
      return true
    }

    try {
      await invoke('start_ocr_stream', { intervalMs: options?.intervalMs ?? 33 })
      isStreaming.value = true
      error.value = ''
      console.log('[useOcr] 连续识别已启动')
      return true
    } catch (err: unknown) {
      error.value = String(err)
      console.error('[useOcr] 启动连续识别失败:', err)
      return false
    }
  }

  /**
   * 停止连续识别
   */
  async function stopStream(): Promise<void> {
    try {
      await invoke('stop_ocr_stream')
      isStreaming.value = false
      console.log('[useOcr] 连续识别已停止')
    } catch (err: unknown) {
      error.value = String(err)
      console.error('[useOcr] 停止连续识别失败:', err)
    }
  }

  /**
   * 检查是否正在进行连续识别
   */
  async function checkStreaming(): Promise<boolean> {
    try {
      const result = await invoke<boolean>('is_ocr_streaming')
      isStreaming.value = result
      return result
    } catch (err) {
      return false
    }
  }

  /**
   * 释放 OCR 资源
   */
  async function release(): Promise<void> {
    try {
      // 先停止流
      if (isStreaming.value) {
        await stopStream()
      }

      // 清理事件监听
      if (resultUnlisten) {
        resultUnlisten()
        resultUnlisten = null
      }

      // 释放后端资源
      await invoke('release_ocr')

      // 重置状态
      isInitialized.value = false
      regions.value = []
      lastResult.value = null
      error.value = ''

      console.log('[useOcr] 资源已释放')
    } catch (err: unknown) {
      error.value = String(err)
      console.error('[useOcr] 释放资源失败:', err)
    }
  }

  /**
   * 获取单个区域的识别文本
   */
  function getRegionText(regionId: string): string {
    return regionTexts.value[regionId] ?? ''
  }

  /**
   * 获取单个区域的置信度
   */
  function getRegionConfidence(regionId: string): number {
    return regionConfidences.value[regionId] ?? 0
  }

  /**
   * 创建 ROI 区域配置
   * 辅助方法，方便快速创建区域配置
   */
  function createRegion(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    label?: string
  ): OcrRegion {
    return { id, x, y, width, height, label }
  }

  // ==================== 内部方法 ====================

  /**
   * 设置事件监听器
   */
  async function setupEventListeners() {
    // 监听 OCR 结果事件（用于连续识别模式）
    resultUnlisten = await listen<OcrResultEventPayload>('ocr-result', (event) => {
      lastResult.value = event.payload.result
    })
  }

  // ==================== 生命周期 ====================

  // 组件卸载时释放资源
  onUnmounted(() => {
    if (resultUnlisten) {
      resultUnlisten()
      resultUnlisten = null
    }
  })

  // ==================== 返回 ====================

  return {
    // 状态
    isInitialized,
    isInitializing,
    isStreaming,
    isProcessing,
    regions,
    lastResult,
    error,

    // 计算属性
    regionTexts,
    regionConfidences,
    lastProcessTime,

    // 方法
    initialize,
    checkInitialized,
    setRegions,
    syncRegions,
    addRegion,
    removeRegion,
    clearRegions,
    recognizeImage,
    recognizeRegions,
    startStream,
    stopStream,
    checkStreaming,
    release,
    getRegionText,
    getRegionConfidence,
    createRegion,
  }
}
