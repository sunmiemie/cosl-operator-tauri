import type { HaltHassReportJson } from '../types'

const STORAGE_KEY = 'halt-hass.pending-board-reports.v1'

export interface PendingHaltHassBoardReport {
  clientSubmitId: string
  sessionId: number
  targetBoardId: number
  orderId: number
  reportJson: HaltHassReportJson
  result: number
  remark: string
  testerReviewed?: boolean
  testerReviewConfirmed?: boolean
  createdAt: string
  lastError?: string
}

export function loadPendingHaltHassReports(): PendingHaltHassBoardReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    // 保留可恢复的有效报告；损坏缓存本身不在读取时覆盖，便于人工恢复。
    return value.filter(item => item && typeof item === 'object' &&
      typeof item.clientSubmitId === 'string' && item.clientSubmitId.trim() &&
      item.reportJson && typeof item.reportJson === 'object' && !Array.isArray(item.reportJson) &&
      [item.sessionId, item.targetBoardId, item.orderId].every(id => Number.isSafeInteger(id) && id > 0))
  } catch (error) {
    console.warn('[HALT-HASS] 读取待上传逐板报告失败:', error)
    return []
  }
}

export function savePendingHaltHassReports(reports: PendingHaltHassBoardReport[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports))
}

export function mergePendingHaltHassReports(reports: PendingHaltHassBoardReport[]): PendingHaltHassBoardReport[] {
  const merged = new Map(loadPendingHaltHassReports().map(item => [item.clientSubmitId, item]))
  reports.forEach(item => merged.set(item.clientSubmitId, item))
  const result = [...merged.values()]
  savePendingHaltHassReports(result)
  return result
}

export function removePendingHaltHassReport(clientSubmitId: string): PendingHaltHassBoardReport[] {
  const result = loadPendingHaltHassReports().filter(item => item.clientSubmitId !== clientSubmitId)
  savePendingHaltHassReports(result)
  return result
}

export function updatePendingHaltHassReportError(clientSubmitId: string, lastError: string): void {
  const reports = loadPendingHaltHassReports().map(item => (
    item.clientSubmitId === clientSubmitId ? { ...item, lastError } : item
  ))
  savePendingHaltHassReports(reports)
}
