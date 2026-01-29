/**
 * OCR 图像识别相关类型定义
 */

/**
 * ROI 区域配置
 * 用于指定图像中需要进行 OCR 识别的区域
 */
export interface OcrRegion {
  /** 区域唯一标识 */
  id: string
  /** 左上角 X 坐标 */
  x: number
  /** 左上角 Y 坐标 */
  y: number
  /** 区域宽度 */
  width: number
  /** 区域高度 */
  height: number
  /** 区域标签（用于标识用途，如 "温度显示"、"压力值" 等） */
  label?: string
}

/**
 * 文本框
 * 检测模型输出的单个文本区域
 */
export interface TextBox {
  /** 识别的文本内容 */
  text: string
  /** 置信度 0-1 */
  confidence: number
  /** 四个角点坐标 [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]，按顺时针排列 */
  points: [[number, number], [number, number], [number, number], [number, number]]
}

/**
 * 单个 ROI 区域的识别结果
 */
export interface OcrRegionResult {
  /** 区域 ID，对应 OcrRegion.id */
  id: string
  /** 合并后的识别文本（该区域内所有文本框的文本拼接） */
  text: string
  /** 平均置信度 0-1 */
  confidence: number
  /** 该区域内检测到的所有文本框 */
  boxes: TextBox[]
}

/**
 * OCR 整帧识别结果
 */
export interface OcrFrameResult {
  /** 帧时间戳（毫秒，Unix 时间戳） */
  timestamp: number
  /** 各 ROI 区域的识别结果 */
  regions: OcrRegionResult[]
  /** 处理耗时（毫秒） */
  processTimeMs: number
}

/**
 * OCR 初始化选项
 */
export interface OcrInitOptions {
  /** 是否使用 GPU 加速（默认 false，使用 CPU） */
  useGpu?: boolean
  /** 推理线程数（默认 4） */
  numThreads?: number
}

/**
 * OCR 连续识别配置
 */
export interface OcrStreamOptions {
  /** 识别间隔（毫秒），默认 33ms (约 30fps) */
  intervalMs?: number
}

/**
 * OCR 事件类型
 */
export type OcrEventType = 'ocr-result' | 'ocr-error' | 'ocr-stream-started' | 'ocr-stream-stopped'

/**
 * OCR 结果事件负载
 */
export interface OcrResultEventPayload {
  result: OcrFrameResult
}

/**
 * OCR 错误事件负载
 */
export interface OcrErrorEventPayload {
  error: string
  code?: string
}
