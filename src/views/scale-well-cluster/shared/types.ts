/** 工单状态 */
export type WorkOrderStatus = "pending" | "in_progress" | "completed"

/** 刻度井群角色 */
export type ScaleWellRole = "leader" | "tester"

/** 伽马刻度工单 */
export interface CalibrationWorkOrder {
  id: string
  toolType: string
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
  kc: number | null
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
  dataWritten: boolean
  fileCreated: boolean
}

export interface ScheduleEntry {
  orderId: string
  date: string
  timeSlot: string
}

export type ReportAppendixTab = "appA" | "appB" | "appC"
