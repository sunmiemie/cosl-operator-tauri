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
    return value?.order && value?.session ? value as HaltHassLocalSessionState : null
  } catch (error) {
    console.warn('[HALT-HASS] 读取本地场次状态失败:', error)
    return null
  }
}

export function clearHaltHassLocalSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}
