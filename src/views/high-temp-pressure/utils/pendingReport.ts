import type { ScheduledSelection } from '../types'

const LEGACY_PENDING_REPORT_STORAGE_KEY = 'high-temp-pressure-pending-report-v1'
const SINGLE_PENDING_REPORT_STORAGE_KEY = 'high-temp-pressure-pending-report-v2'
const PENDING_REPORT_LIST_STORAGE_KEY = 'high-temp-pressure-pending-reports-v3'

export type HighTempPressureReportDraft = {
  observation: string
  operatorName: string
  /** @deprecated 旧缓存兼容；复核人由服务端审核时写入。 */
  reviewerName?: string
  confirmChecks: boolean[]
  instrumentResultMap: Record<string, {
    result: 'pass' | 'fail' | 'pending'
    observation: string
  }>
  paperReportChecks: {
    onlineTest: boolean
    otherRequirements: string
    testingProtectiveCapProvider: 'applicant' | 'tester'
    testingPlugProvider: 'applicant' | 'tester'
    noDistorted: boolean
    noLeakage: boolean
    curveStatus: 'normal' | 'abnormal'
    otherDescriptions: string
    testingCurveCopies: number
    otherCopies: number
  }
  curveRange?: {
    startMs: number | null
    endMs: number | null
  }
  curveRanges?: Array<{
    id: string
    title: string
    startMs: number | null
    endMs: number | null
    visibleSeries?: Array<'upperTemp' | 'lowerTemp' | 'pressure'>
  }>
  reportUnitDraftMap?: Record<string, HighTempPressureReportUnitDraft>
  activeReportIndex?: number
  reportStage?: 'editing' | 'review'
  reviewConfirmed?: boolean
}

export type HighTempPressureReportUnitDraft = {
  result: 'pass' | 'fail' | 'pending'
  instrumentObservation: string
  observation: string
  operatorName: string
  /** @deprecated 旧缓存兼容；复核人由服务端审核时写入。 */
  reviewerName?: string
  confirmChecks: boolean[]
  paperReportChecks: HighTempPressureReportDraft['paperReportChecks']
  completed: boolean
}

export type HighTempPressurePendingReport = {
  version: 1
  phase: 'finishing' | 'report'
  selections: ScheduledSelection[]
  exportedCaptureDir: string
  csvCount: number
  runtimeSeconds: number
  clientSubmitId: string
  savedAt: string
  draft?: HighTempPressureReportDraft
}

export function createHighTempPressureClientSubmitId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `htp-${crypto.randomUUID()}`
  }
  return `htp-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function savePendingHighTempPressureReport(session: HighTempPressurePendingReport) {
  try {
    const reports = loadPendingHighTempPressureReports()
    const existingIndex = reports.findIndex((item) => item.clientSubmitId === session.clientSubmitId)
    if (existingIndex >= 0) reports.splice(existingIndex, 1, session)
    else reports.unshift(session)
    reports.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    window.localStorage.setItem(PENDING_REPORT_LIST_STORAGE_KEY, JSON.stringify(reports))
    window.localStorage.removeItem(SINGLE_PENDING_REPORT_STORAGE_KEY)
    return true
  } catch (error) {
    console.warn('[high-temp-pressure] save pending report failed:', error)
    return false
  }
}

function isValidPendingReport(value: unknown): value is HighTempPressurePendingReport {
  if (!value || typeof value !== 'object') return false
  const parsed = value as Partial<HighTempPressurePendingReport>
  return parsed.version === 1 &&
    Array.isArray(parsed.selections) &&
    parsed.selections.length > 0 &&
    !!String(parsed.exportedCaptureDir || '').trim() &&
    !!String(parsed.clientSubmitId || '').trim()
}

function sortPendingReports(reports: HighTempPressurePendingReport[]) {
  return reports.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
}

export function loadPendingHighTempPressureReports(): HighTempPressurePendingReport[] {
  try {
    window.localStorage.removeItem(LEGACY_PENDING_REPORT_STORAGE_KEY)

    const listRaw = window.localStorage.getItem(PENDING_REPORT_LIST_STORAGE_KEY)
    if (listRaw) {
      const parsed = JSON.parse(listRaw) as unknown
      const reports = Array.isArray(parsed) ? parsed.filter(isValidPendingReport) : []
      if (reports.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
        window.localStorage.setItem(PENDING_REPORT_LIST_STORAGE_KEY, JSON.stringify(reports))
      }
      return sortPendingReports(reports)
    }

    // 将旧版只能保存一份的缓存无感迁移到报告队列，避免升级后丢失未提交报告。
    const singleRaw = window.localStorage.getItem(SINGLE_PENDING_REPORT_STORAGE_KEY)
    if (singleRaw) {
      const single = JSON.parse(singleRaw) as unknown
      window.localStorage.removeItem(SINGLE_PENDING_REPORT_STORAGE_KEY)
      if (isValidPendingReport(single)) {
        window.localStorage.setItem(PENDING_REPORT_LIST_STORAGE_KEY, JSON.stringify([single]))
        return [single]
      }
    }
    return []
  } catch (error) {
    console.warn('[high-temp-pressure] load pending reports failed:', error)
    return []
  }
}

export function removePendingHighTempPressureReport(clientSubmitId: string) {
  try {
    const reports = loadPendingHighTempPressureReports()
      .filter((item) => item.clientSubmitId !== clientSubmitId)
    window.localStorage.setItem(PENDING_REPORT_LIST_STORAGE_KEY, JSON.stringify(reports))
    return true
  } catch {
    return false
  }
}

export function clearPendingHighTempPressureReports() {
  try {
    window.localStorage.removeItem(PENDING_REPORT_LIST_STORAGE_KEY)
    window.localStorage.removeItem(SINGLE_PENDING_REPORT_STORAGE_KEY)
  } catch {
    // 本地存储不可用时无需阻断流程。
  }
}
