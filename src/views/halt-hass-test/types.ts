/**
 * HALT-HASS 测试页面类型定义
 */

// 导入共享类型
import type { BoardModelItem, HaltHassProcessJson } from '@/views/process-halt-hass/types'

// ==================== 测试流程阶段 ====================

/**
 * 测试页面阶段
 * schedule -> detect -> scan -> download -> install -> test -> upload -> complete
 */
export type PagePhase =
  | 'schedule'  // 排程
  | 'detect'    // 设备检测
  | 'scan'      // 扫码
  | 'download'  // 下载工艺
  | 'install'   // 安装指导
  | 'test'      // 流程图运行
  | 'upload'    // 上传报告
  | 'complete'  // 完成

/**
 * 测试模式
 */
export type TestMode =
  | 'normal'    // 正常测试
  | 'continue'  // 继续测试（暂存恢复）
  | 'feedback'  // 重做测试（审核打回）
  | 'question'  // 疑问处理

// ==================== 工单相关类型 ====================

/**
 * 电路板组信息（工单中返回）
 */
export interface OrderBoardGroup {
  id: number
  name: string
  boards: BoardModelItem[]
}

/**
 * 工艺信息（工单中返回）
 */
export interface OrderProcess {
  id: number
  name: string
  version: string
}

/**
 * 已扫描的电路板
 */
export interface ScannedBoard {
  serial: string
  boardModelId?: number
  boardModelName?: string
  scannedAt: Date
}

export type OrderBoardSerial = string | {
  serial?: string
  sn?: string
  serialNumber?: string
  serial_num?: string
  boardModelId?: number
  board_model_id?: number
}

export interface OrderScheduleSegment {
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  scheduled_start_at?: string | null
  scheduled_end_at?: string | null
}

/**
 * HALT-HASS 工单
 */
export interface HaltHassOrder {
  id: number
  orderNo: string
  status: number  // 0=已创建, 1=待领取, 2=测试中, 3=待审核, 4=待重做, 5=正常, 6=异常, 7=暂存, 8=疑问
  boardCount: number
  cycleCount: number
  singleCycleDurationHours: number
  totalCycleDurationHours: number
  requiredRuntimeSeconds: number
  elapsedRuntimeSeconds: number
  remainingRuntimeSeconds: number
  runtimeProgress: number
  runtimeConfigured: boolean
  runtimeCompleted: boolean
  currentRunStartedAt?: string | null
  boardGroup: OrderBoardGroup
  process: OrderProcess
  boardSerials?: OrderBoardSerial[]
  scannedBoards: ScannedBoard[]
  feedbackReason: string
  remark: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  scheduleSegments?: OrderScheduleSegment[]
}

/**
 * 工单状态枚举
 */
export const ORDER_STATUS = {
  CREATED: 0,     // 已创建
  PENDING: 1,     // 待领取
  TESTING: 2,     // 测试中
  REVIEWING: 3,   // 待审核
  REDO: 4,        // 待重做
  NORMAL: 5,      // 正常
  ABNORMAL: 6,    // 异常
  SAVED: 7,       // 暂存
  QUESTION: 8,    // 疑问
} as const

/**
 * 工单状态文本映射
 */
export const ORDER_STATUS_TEXT: Record<number, string> = {
  [ORDER_STATUS.CREATED]: '已创建',
  [ORDER_STATUS.PENDING]: '待领取',
  [ORDER_STATUS.TESTING]: '测试中',
  [ORDER_STATUS.REVIEWING]: '待审核',
  [ORDER_STATUS.REDO]: '待重做',
  [ORDER_STATUS.NORMAL]: '正常',
  [ORDER_STATUS.ABNORMAL]: '异常',
  [ORDER_STATUS.SAVED]: '暂存',
  [ORDER_STATUS.QUESTION]: '疑问',
}

// ==================== 报告相关类型 ====================

/**
 * 测试结果枚举
 */
export const TEST_RESULT = {
  NORMAL: 1,    // 正常
  ABNORMAL: 2,  // 异常
  QUESTION: 3,  // 疑问
} as const

/**
 * 审核状态枚举
 */
export const REVIEW_STATUS = {
  PENDING: 0,   // 待审核
  APPROVED: 1,  // 已通过
  REJECTED: 2,  // 已打回
} as const

/**
 * 流程图节点运行结果
 */
export interface NodeRunResult {
  nodeId: string
  nodeName: string
  status: 'success' | 'error' | 'skipped'
  startTime?: string
  endTime?: string
  duration?: number
  output?: unknown
  error?: string
}

/**
 * 测试报告 JSON 数据
 */
export interface HaltHassReportJson {
  // 工单信息
  orderId: number
  orderNo: string

  // 测试信息
  startTime: string
  endTime: string
  duration: number  // 秒

  // 电路板信息
  boards: ScannedBoard[]

  // 流程图运行结果
  flowchartResult: {
    nodes: NodeRunResult[]
    totalNodes: number
    successNodes: number
    failedNodes: number
  }

  // 测试数据（传感器数据等）
  testData?: Record<string, unknown>

  // 操作员备注
  remark?: string
}

/**
 * HALT-HASS 测试报告
 */
export interface HaltHassReport {
  id: number
  orderId: number
  reportJson: HaltHassReportJson
  result: number  // 1=正常, 2=异常, 3=疑问
  operatorId: number
  operatorName?: string
  reviewerId?: number
  reviewerName?: string
  reviewStatus: number  // 0=待审核, 1=已通过, 2=已打回
  reviewTime?: string
  reviewComment?: string
  createdAt: string
}

// ==================== 临时数据类型 ====================

/**
 * 临时测试数据（暂存/继续测试）
 */
export interface HaltHassTempData {
  // 当前阶段
  phase: PagePhase

  // 当前安装指导步骤
  installStep: number

  // 流程图运行状态
  flowchartState?: {
    currentNodeId?: string
    completedNodes: string[]
    nodeResults: NodeRunResult[]
  }

  // 测试数据
  testData?: Record<string, unknown>

  // 更新时间
  updatedAt: string
}

// ==================== 设备检测类型 ====================

/**
 * 设备检测状态
 */
export interface DeviceStatus {
  flojoyBackend: boolean
  scanner: boolean
  camera?: boolean
}

// ==================== 组件 Props 类型 ====================

/**
 * ScanProgress 组件 Props
 */
export interface ScanProgressProps {
  order: HaltHassOrder | null
  scannedBoards: ScannedBoard[]
  isScanning: boolean
}

/**
 * InstallGuideViewer 组件 Props
 */
export interface InstallGuideViewerProps {
  processJson: HaltHassProcessJson | null
  currentStep: number
}

/**
 * FlowchartRunner 组件 Props
 */
export interface FlowchartRunnerProps {
  processJson: HaltHassProcessJson | null
  isRunning: boolean
  nodeStatuses: Record<string, string>
}

/**
 * TestResultPanel 组件 Props
 */
export interface TestResultPanelProps {
  report: HaltHassReportJson | null
  isUploading: boolean
}
