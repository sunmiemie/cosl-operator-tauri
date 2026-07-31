/** 工单状态 */
export type WorkOrderStatus = "pending" | "in_progress" | "completed"

/** 刻度井群角色 */
export type ScaleWellRole = "leader" | "tester"

/** 刻度合格判定阈值（来自后端刻度井配置） */
export interface QualificationThresholds {
  kaMin: number
  kaMax: number
  baLimit: number
  kbMin: number
  kbMax: number
  bbLimit: number
  hiRefMin: number
  hiRefMax: number
  loRefMin: number
  loRefMax: number
  dualSensor: boolean
}

/** 刻度井通信配置（来自后端 well comm_configs） */
export interface WellCommConfig {
  deviceRole: 'instrument' | 'instrument_b' | 'data_stick' | 'power_supply'
  vid?: string
  pid?: string
  adapterSerial?: string
  baudRate?: number
  transport?: 'lan' | 'serial'
  host?: string
  port?: number
}

/** 伽马刻度工单 */
export interface CalibrationWorkOrder {
  id: string
  dbId?: number
  toolType: string
  modelName: string
  serialNumber: string
  engineer: string
  location: string
  calibrationDevice: string
  hiWell: string
  loWell: string
  hiApi: number
  loApi: number
  remark: string
  planDate: string
  status: WorkOrderStatus
  statusCode?: number
  statusText?: string
  kc: number | null
  qualification?: QualificationThresholds
  hiWellCommConfigs?: WellCommConfig[]
  loWellCommConfigs?: WellCommConfig[]
  hiWellDataSource?: 'mock' | 'live'
  loWellDataSource?: 'mock' | 'live'
}

export interface CalibrationDataGroup {
  ka: number | null
  kb: number | null
  kc: number | null
  ba: number | null
  bb: number | null
  bc: number | null
}

export interface ReportAppendixA {
  serialNumber: string
  testDate: string
  engineer: string
  softVer: string
  cycleHours: string
  location: string
  useWell: boolean
  useJig: boolean
  beforeData: CalibrationDataGroup
  currentData: CalibrationDataGroup
  remark: string
}

export interface ReportAppendixB {
  toolTypeName: string
  serialNumber: string
  engineer: string
  testDate: string
  qcEngineer: string
  qcDate: string
  loWell: string
  hiWell: string
  loApi: number
  hiApi: number
  ka: number | null
  kb: number | null
  kc: number | null
  ba: number | null
  bb: number | null
  bc: number | null
}

export interface ReportAppendixC {
  recordNo: string
  serialNumber: string
  engineer: string
  testDate: string
  hiWell: string
  loWell: string
  hiApi: number
  loApi: number
  remark: string
}

export interface ReportDraft {
  workOrderId: string
  toolType: string
  appendixA: ReportAppendixA
  appendixB: ReportAppendixB
  appendixC: ReportAppendixC
}

export interface SampleStats {
  mean: number | null
  std: number | null
  max: number | null
  min: number | null
}

export type SampleLogType = "info" | "success" | "warn"

export interface SampleLogLine {
  ts: string
  msg: string
  type: SampleLogType
}

export interface PretestCommState {
  standbyCur: string
  cgrTime: string
  firmware: string
  flashErase: string
  sn: string
  sync: string
  status: string
  count: string
  cps: string
  gr: string
  commOk: boolean | null
  commMessage: string
  commVisible: boolean
  running: boolean
  buttonLabel: string
}

export interface Pretest100Row {
  index: number
  cpsA?: number
  cpsB: number
  ok: boolean
}

export interface SampleTableRow {
  countA: number
  countB: number
  cpsA: number
  cpsB: number
}

export interface PhaseSamplingState {
  pretest: PretestCommState
  pretestRows: Pretest100Row[]
  pretestProgress: number
  pretestLiveCps: number | null
  pretestMean: number | null
  pretestFilename: string
  pretestStart: string
  pretestEnd: string
  pretestResultVisible: boolean
  pretestResultOk: boolean
  pretestResultMessage: string
  pretestDone: boolean
  samplingUnlocked: boolean
  samples: number[]
  samplesA: number[]
  tableData: SampleTableRow[]
  chartCps: number[]
  chartCount: number[]
  chartSeriesVisible: [boolean, boolean]
  liveCps: number | null
  liveCpsA: number | null
  progress: number
  currentPoint: number
  done: boolean
  samplingRunning: boolean
  sampleButtonLabel: string
  logs: SampleLogLine[]
  sdLogs: string[]
  sdDebug: boolean
  tStart: string
  tEnd: string
  mainTab: "curve" | "table"
  dataSubTab: "cps" | "count"
}

export interface CalibrationDraft {
  preChecks: boolean[]
  connectionStep: number
  connectionDone: boolean
  softVer: string
  qcEngineer: string
  hiInterval: number
  hiCount: number
  loInterval: number
  loCount: number
  hiHole: number
  loHole: number
  hiPretestDone: boolean
  loPretestDone: boolean
  hiSampleProgress: number
  loSampleProgress: number
  hiSampleKc: number | null
  loSampleKc: number | null
  hiSampleBa: number | null
  loSampleBa: number | null
  hiStats: SampleStats
  loStats: SampleStats
  hiSamplingDone: boolean
  loSamplingDone: boolean
  hiPhase: PhaseSamplingState
  loPhase: PhaseSamplingState
  dataWritten: boolean
  fileCreated: boolean
  deviceSessionId: number | null
}

export interface ScheduleEntry {
  orderId: string
  date: string
  timeSlot: string
}

export type ReportAppendixTab = "appA" | "appB" | "appC"
