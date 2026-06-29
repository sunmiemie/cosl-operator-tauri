/** 报告审核状态 */
export type ReportReviewStatus = "pending" | "approved" | "rejected"

/** Kc/B 数据组 */
export interface CalibrationDataGroup {
  ka: number | null
  kb: number | null
  kc: number | null
  ba: number | null
  bb: number | null
  bc: number | null
}

/** 附录 A 数据 */
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

/** 附录 B 数据 */
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

/** 附录 C 数据 */
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

/** 刻度报告 */
export interface CalibrationReport {
  id: string
  workOrderId: string
  toolType: string
  serialNumber: string
  engineer: string
  testDate: string
  location: string
  kc: number | null
  hiWell: string
  loWell: string
  hiApi: number
  loApi: number
  softVer: string
  status: ReportReviewStatus
  submittedAt: string
  appendixA: ReportAppendixA
  appendixB: ReportAppendixB
  appendixC: ReportAppendixC
}

/** 列表筛选 */
export interface ReportFilter {
  keyword: string
  status: ReportReviewStatus | ""
}

export type ReportAppendixTab = "appA" | "appB" | "appC"
