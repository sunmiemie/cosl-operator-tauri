import type { HaltHassFlowType } from '@/views/process-halt-hass/types'
import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'
import type { HaltHassOrder, HaltHassTestSession, NodeRunResult, PagePhase } from '../types'

const STORAGE_KEY = 'halt-hass.active-session.v1'

export interface HaltHassLocalSessionState {
  order: HaltHassOrder
  session: HaltHassTestSession
  processJson: HaltHassProcessJson
  phase: PagePhase
  installStep: number
  activeFlowType: HaltHassFlowType
  testFlowPassed: boolean
  testFlowResults: NodeRunResult[]
  nodeResults: NodeRunResult[]
  completedNodes: string[]
  currentNodeId: string
  flowchartStartTime?: string | null
  savedAt: string
}

export function saveHaltHassLocalSession(state: HaltHassLocalSessionState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function loadHaltHassLocalSession(): HaltHassLocalSessionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    const isObject = (item: unknown) => item !== null && typeof item === 'object' && !Array.isArray(item)
    if (!isObject(value) || !isObject(value.order) || !isObject(value.session) || !isObject(value.processJson)) return null
    if (typeof value.session.clientSessionId !== 'string' || !value.session.clientSessionId.trim()) return null
    if (!['schedule', 'detect', 'scan', 'download', 'install', 'test', 'upload', 'complete'].includes(value.phase) ||
        !['test', 'cycle'].includes(value.activeFlowType) ||
        !Number.isSafeInteger(value.installStep) || value.installStep < 0 ||
        typeof value.testFlowPassed !== 'boolean' ||
        ![value.testFlowResults, value.nodeResults, value.completedNodes].every(Array.isArray) ||
        !value.completedNodes.every((id: unknown) => typeof id === 'string') ||
        typeof value.currentNodeId !== 'string') return null
    return value as HaltHassLocalSessionState
  } catch (error) {
    console.warn('[HALT-HASS] 读取本地场次状态失败:', error)
    return null
  }
}

export function clearHaltHassLocalSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}
