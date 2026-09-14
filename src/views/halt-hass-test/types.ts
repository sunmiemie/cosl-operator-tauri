/**
 * HALT-HASS 测试页面类型定义
 */

// 导入共享类型
import type {
  BoardModelItem,
  HaltHassAssemblyRule,
  HaltHassFlowType,
  HaltHassProcessJson,
  HaltHassReportType,
} from '@/views/process-halt-hass/types'

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

// ==================== 工单相关类型 ====================

/**
 * 电路板组信息（工单中返回）
 */
export interface OrderBoardGroup {
  id: number
  name: string
  boards: BoardModelItem[]
}

/** 客户端为本次执行选择的工艺信息。 */
export interface OrderProcess {
  id: number
  name: string
  version: string
}

export interface HaltHassExecutionProcessOption extends OrderProcess {
  description?: string
  active: number
  productModelId: number
  clientTestType: 1 | 2
  clientTestTypeName: string
  experimentType?: string
}

/**
 * 已扫描的电路板
 */
export interface ScannedBoard {
  serial: string
  targetBoardId?: number
  orderId?: number
  orderNo?: string
  role?: 'target' | 'companion'
  slotNo?: number
  boardModelId?: number
  boardModelName?: string
  boardModelCode?: string
  scannedAt: Date
}

export type OrderBoardSerial = string | {
  serial?: string
  sn?: string
  serialNumber?: string
  serial_num?: string
  boardModelId?: number
  board_model_id?: number
  boardModelName?: string
  board_model_name?: string
  boardModelCode?: string
  board_model_code?: string
}

export interface HaltHassTargetBoard {
  id: number
  orderId: number
  orderNo: string
  processId: number
  processName?: string
  serial: string
  boardModelId: number
  boardModelName: string
  boardModelCode?: string
  status: number
  statusText: string
  attemptNo: number
  failureReason?: string
}

export type HaltHassSessionBoardRole = 'target' | 'companion'

export interface HaltHassSessionBoard {
  id: number
  sessionId: number
  targetBoardId?: number | null
  orderId?: number | null
  role: HaltHassSessionBoardRole
  serial: string
  boardModelId: number
  boardModelName: string
  boardModelCode?: string
  slotNo: number
  status: number
  statusText: string
  participationSeconds: number
  joinedAt?: string | null
  exitedAt?: string | null
}

export interface HaltHassTestSession {
  id: number
  sessionNo: string
  clientSessionId: string
  processId: number
  processVersion: string
  experimentType: string
  status: number
  statusText: string
  operatorId?: number | null
  elapsedRuntimeSeconds: number
  precheck?: Record<string, unknown>
  flowResult?: Record<string, unknown>
  testData?: Record<string, unknown>
  uploadError?: string
  startedAt?: string | null
  endedAt?: string | null
  closedAt?: string | null
  lastSyncedAt?: string | null
  createdAt?: string | null
  boards: HaltHassSessionBoard[]
}

export interface HaltHassSessionBoardInput {
  role: HaltHassSessionBoardRole
  slotNo: number
  targetBoardId?: number
  serial?: string
  boardModelId?: number
}

export interface HaltHassSlotAssignment {
  slotNo: number
  slotName: string
  required: boolean
  allowCompanion: boolean
  allowedBoardModelIds: number[]
  role: HaltHassSessionBoardRole | 'empty'
  targetBoardId?: number
  companionSerial?: string
  companionBoardModelId?: number
}

export interface HaltHassSessionSelectionContext {
  assemblyRule: HaltHassAssemblyRule
  applicableBoardModels: BoardModelItem[]
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
  productModel: { id: number; name: string } | null
  instrumentModel?: { id: number; name: string } | null
  clientTestType: 1 | 2 | null
  clientTestTypeName: string
  experimentType: string
  taskExecutionDescription: string
  status: number  // 0=已创建, 1=待领取, 2=测试中, 3=待审核, 4=待重做, 5=正常, 6=异常, 7=暂存, 8=疑问
  boardCount: number
  cycleCount: number
  workbenchTestName: string
  boardGroup: OrderBoardGroup
  /** 本次客户端选择的工艺版本；服务端工单详情不会预先绑定。 */
  process: OrderProcess | null
  boardSerials?: OrderBoardSerial[]
  targetBoards?: HaltHassTargetBoard[]
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
  flowType: HaltHassFlowType
  nodeId: string
  nodeName: string
  status: 'success' | 'error' | 'skipped'
  startTime?: string
  endTime?: string
  duration?: number
  output?: unknown
  error?: string
}

export type HaltHassRecordResult = '正常' | '异常' | '不适用'

export interface HaltHassPeriodicRecord {
  intervalIndex: number
  recordedAt: string
  elapsedSeconds: number
  isPartialInterval: boolean
  temperature: number | null
  vibration: number | null
  communications: {
    interfaceBoard: HaltHassRecordResult
    controlBoard: HaltHassRecordResult
    storageBoard: HaltHassRecordResult
  }
  pulserSummary: Exclude<HaltHassRecordResult, '不适用'>
  current48v: number | null
  current90v: number | null
  missingReasons: string[]
}

export interface HaltHassDualCurvePoint {
  time: number
  actual: number | null
  target: number | null
}

export interface HaltHassScalarCurvePoint {
  time: number
  value: number | null
}

export interface HaltHassChartSummary {
  pulser: HaltHassDualCurvePoint[]
  temperature: HaltHassDualCurvePoint[]
  vibration: HaltHassDualCurvePoint[]
  current48v: HaltHassScalarCurvePoint[]
  current90v: HaltHassScalarCurvePoint[]
}

export interface HaltHassChartImage {
  chartType: 'pulser' | 'temperature' | 'vibration' | 'current'
  title: string
  fileName: string
  mimeType: 'image/png'
  startAt: string
  endAt: string
  checksum: string
  rendererVersion: string
  fileUrl?: string
  size?: number
}

export interface HaltHassChartUpload {
  metadata: HaltHassChartImage
  blob: Blob
}

export interface HaltHassScannedBoardSummary {
  scannedBoardCount: number
  testedTargetBoardCount: number
  nonTargetBoardCount: number
  boards: ScannedBoard[]
}

export interface HaltHassReportSubject {
  targetBoardId: number
  targetSerial: string
  targetBoardModel: string
}

export interface HaltHassTelemetrySnapshot {
  periodicRecords: HaltHassPeriodicRecord[]
  chartSummary: HaltHassChartSummary
  rectifierReport?: HaltHassRectifierReportData
  generatedAt: string
}

export type HaltHassPassResult = '合格' | '不合格'

export interface HaltHassResultReview {
  originalResult: HaltHassPassResult
  result: HaltHassPassResult
  modifiedBy?: number
  modifiedAt?: string
}

export interface HaltHassRectifierLoadRecord {
  load48Ohm: number
  load90Ohm: number
  output48Voltage: number | null
  output48CurrentA: number | null
  output90Voltage: number | null
  output90CurrentA: number | null
  output48Result: HaltHassResultReview
  output90Result: HaltHassResultReview
  recordedAt: string
  missingReasons: string[]
}

export interface HaltHassRectifierVoltageStepRecord {
  inputVoltage: number
  voltageChangedAt: string
  halfLoad: HaltHassRectifierLoadRecord
  fullLoad: HaltHassRectifierLoadRecord
}

export interface HaltHassRectifierTemperatureStageRecord {
  stageIndex: number
  stageIdentity: string
  targetTemperature: number | null
  actualTemperature: number | null
  targetVibration: number | null
  actualVibration: number | null
  startedAt: string
  completedAt: string
  voltageSteps: HaltHassRectifierVoltageStepRecord[]
}

export interface HaltHassBoardConclusion extends HaltHassResultReview {
  serial: string
  boardModelId?: number
  boardModelName: string
  boardModelCode?: string
  role: 'target' | 'companion'
  slotNo: number
}

export interface HaltHassRectifierReportData {
  currentUnit: 'A'
  stages: HaltHassRectifierTemperatureStageRecord[]
  boardConclusions: HaltHassBoardConclusion[]
}

/**
 * 测试报告 JSON 数据
 */
export interface HaltHassReportJson {
  // 工单信息
  orderId: number
  orderNo: string
  sessionId?: number
  sessionNo?: string
  targetBoardId?: number
  targetSerial?: string
  boardModelName?: string
  attemptNo?: number

  // 测试信息
  startTime: string
  endTime: string
  duration: number  // 秒
  reportType?: HaltHassReportType
  currentUnit?: 'A' | 'mA'

  // 测试人员在上传前完成的报告复核信息
  testerReview?: {
    finalResult: 1 | 2
    completed: boolean
    confirmed: boolean
    confirmedAt?: string
  }

  // 电路板信息
  boards: ScannedBoard[]
  scannedBoardSummary?: HaltHassScannedBoardSummary
  reportSubject?: HaltHassReportSubject

  // 流程图运行结果
  flowchartResult: {
    nodes: NodeRunResult[]
    nodeResults?: NodeRunResult[]
    totalNodes: number
    successNodes: number
    failedNodes: number
  }

  // 测试数据（传感器数据等）
  testData?: Record<string, unknown>
  periodicRecords?: HaltHassPeriodicRecord[]
  chartSummary?: HaltHassChartSummary
  chartImages?: HaltHassChartImage[]
  rectifierReport?: HaltHassRectifierReportData

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
  result: number  // 1=正常, 2=异常
  operatorId: number
  operatorName?: string
  reviewerId?: number
  reviewerName?: string
  reviewStatus: number  // 0=待审核, 1=已通过, 2=已打回
  reviewTime?: string
  reviewComment?: string
  createdAt: string
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
  activeFlowType: HaltHassFlowType
  testFlowPassed: boolean
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
