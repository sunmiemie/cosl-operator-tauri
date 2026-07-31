import type {
  CalibrationDataGroup,
  ReportAppendixA,
  ReportAppendixB,
  ReportAppendixC,
  ReportDraft
} from "../shared/types"

export type {
  CalibrationDataGroup,
  ReportAppendixA,
  ReportAppendixB,
  ReportAppendixC,
  ReportDraft,
  ReportAppendixTab
} from "../shared/types"

/** 报告状态（客户端） */
export type ReportReviewStatus = "draft" | "pending" | "approved" | "rejected"

/** 刻度报告列表项 */
export interface CalibrationReport {
  id: string
  dbId: number
  orderDbId: number
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
  statusCode: number
  statusText?: string
  submittedAt: string
  reviewRemark?: string
  appendixA: ReportAppendixA
  appendixB: ReportAppendixB
  appendixC: ReportAppendixC
}

/** 列表筛选 */
export interface ReportFilter {
  keyword: string
  status: ReportReviewStatus | ""
}

export function isReportEditable(status: ReportReviewStatus | number): boolean {
  if (typeof status === "number") return status === 0 || status === 3
  return status === "draft" || status === "rejected"
}
