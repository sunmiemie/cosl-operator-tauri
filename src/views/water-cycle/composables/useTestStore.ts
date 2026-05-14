import { computed, ref } from 'vue'
import type { OcrRegion } from '@/types/ocr'
import type { WaterCycleOrder } from '@/services/water-cycle-api'

/**
 * ==========================================
 * 全局共享状态与固定数据 (Lightweight Store)
 * ==========================================
 */

// 固定的数据采集通道配置
export const COLLECTION_CHANNELS = [
  { id: 'p1', name: '压力1', unit: 'MPa', color: '#ef4444' },
  { id: 'p2', name: '压力2', unit: 'MPa', color: '#f97316' },
  { id: 'p3', name: '压力3', unit: 'MPa', color: '#f59e0b' },
  { id: 'p4', name: '压力4', unit: 'MPa', color: '#84cc16' },
  { id: 'p5', name: '压力5', unit: 'MPa', color: '#10b981' },
  { id: 'p6', name: '压力6', unit: 'MPa', color: '#06b6d4' },
  { id: 'f1', name: '流量1', unit: 'L/min', color: '#3b82f6' },
  { id: 'f2', name: '流量2', unit: 'L/min', color: '#6366f1' },
  { id: 'f3', name: '流量3', unit: 'L/min', color: '#8b5cf6' },
  { id: 'freq', name: '变频器频率', unit: 'Hz', color: '#d946ef' },
]

export type WaterCycleView = 'dashboard' | 'testing' | 'data_collection' | 'report_preview'

export type MeasurementRecord = {
  timestamp: number
  timeLabel: string
  values: Record<string, number | null>
}

// 视图路由状态: dashboard(排程看板) -> testing(监控确认) -> data_collection(数据采集) -> report_preview(报告预览)
export const currentView = ref<WaterCycleView>('dashboard')

// 当前选中的待测试工单信息
export const selectedOrder = ref<WaterCycleOrder | null>(null)

// OCR 框选区域配置 (Key为通道ID, Value为ROI坐标信息)
export const roiRegions = ref<Record<string, OcrRegion>>({})

// 实时采集到的数值字典 (Key为通道ID)
export const realTimeData = ref<Record<string, number>>({})

// OCR 识别的置信度字典 (Key为通道ID)
export const ocrConfidence = ref<Record<string, number>>({})

// 系统操作日志
export const logs = ref<{ time: string; msg: string }[]>([])

// 采集状态控制
export const isPaused = ref(false)
export const collectionTime = ref(0) // 已采集时长(秒)
export const testStartedAt = ref<number | null>(null)
export const testEndedAt = ref<number | null>(null)
export const reportSavedAt = ref<number | null>(null)
export const measurementHistory = ref<MeasurementRecord[]>([])
export const currentReportNo = ref('')

export const configuredRoiCount = computed(() => Object.keys(roiRegions.value).length)
export const latestMeasurement = computed<Record<string, number | null>>(() => {
  const latest = measurementHistory.value[measurementHistory.value.length - 1]
  return latest?.values || {}
})

/**
 * 从 OCR 返回的字符串中提取有效数字
 * @param text OCR 识别出的原始文本
 * @returns 提取出的浮点数，失败返回 null
 */
export function extractNumber(text: string): number | null {
  const match = text.replace(/\s/g, '').match(/-?\d+\.?\d*/)
  return match ? parseFloat(match[0]) : null
}

/**
 * 根据置信度数值返回对应的状态等级（用于UI颜色显示）
 * @param channelId 通道ID
 */
export function getConfidenceLevel(channelId: string): 'high' | 'medium' | 'low' | 'none' {
  const conf = ocrConfidence.value[channelId]
  if (conf === undefined) return 'none'
  if (conf >= 0.8) return 'high'
  if (conf >= 0.6) return 'medium'
  return 'low'
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatDurationText(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) return `${hours}时${minutes}分${seconds}秒`
  return `${minutes}分${seconds}秒`
}

export function startTestSession() {
  if (!testStartedAt.value) testStartedAt.value = Date.now()
  testEndedAt.value = null
  reportSavedAt.value = null
  currentReportNo.value = ''
}

export function finishTestSession() {
  if (!testEndedAt.value) testEndedAt.value = Date.now()
}

export function createReportNo() {
  const orderNo = selectedOrder.value?.taskNumber || 'WC'
  const time = new Date()
  const stamp = `${time.getFullYear()}${String(time.getMonth() + 1).padStart(2, '0')}${String(time.getDate()).padStart(2, '0')}${String(time.getHours()).padStart(2, '0')}${String(time.getMinutes()).padStart(2, '0')}`
  currentReportNo.value = `RPT-${orderNo}-${stamp}`
  return currentReportNo.value
}

export function markReportSaved() {
  reportSavedAt.value = Date.now()
  if (!currentReportNo.value) createReportNo()
}

export function pushMeasurementRecord(timeLabel: string) {
  const values = COLLECTION_CHANNELS.reduce<Record<string, number | null>>((acc, channel) => {
    acc[channel.id] = realTimeData.value[channel.id] ?? null
    return acc
  }, {})

  const next = measurementHistory.value.concat({
    timestamp: Date.now(),
    timeLabel,
    values,
  })

  measurementHistory.value = next.slice(-300)
}

/**
 * 结束测试时重置所有状态，避免污染下一次测试
 */
export function resetTestState() {
  roiRegions.value = {}
  realTimeData.value = {}
  ocrConfidence.value = {}
  logs.value = []
  isPaused.value = false
  collectionTime.value = 0
  testStartedAt.value = null
  testEndedAt.value = null
  reportSavedAt.value = null
  measurementHistory.value = []
  currentReportNo.value = ''
  selectedOrder.value = null
  currentView.value = 'dashboard'
}
