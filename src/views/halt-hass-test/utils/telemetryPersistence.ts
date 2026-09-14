import type { HaltHassPeriodicRecord } from '../types'

const STORAGE_PREFIX = 'halt-hass.telemetry-records.v1.'

function storageKey(sessionId: number | string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

export function loadHaltHassPeriodicRecords(
  sessionId: number | string | null | undefined,
): HaltHassPeriodicRecord[] {
  if (sessionId === null || sessionId === undefined || sessionId === '') return []
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(sessionId)) || '[]')
    return Array.isArray(value) ? value : []
  } catch (error) {
    console.warn('[HALT-HASS] 读取三分钟测试记录失败:', error)
    return []
  }
}

export function saveHaltHassPeriodicRecords(
  sessionId: number | string | null | undefined,
  records: HaltHassPeriodicRecord[],
): void {
  if (sessionId === null || sessionId === undefined || sessionId === '') return
  localStorage.setItem(storageKey(sessionId), JSON.stringify(records))
}

export function clearHaltHassPeriodicRecords(
  sessionId: number | string | null | undefined,
): void {
  if (sessionId === null || sessionId === undefined || sessionId === '') return
  localStorage.removeItem(storageKey(sessionId))
}
