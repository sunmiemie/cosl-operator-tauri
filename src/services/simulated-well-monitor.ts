import { invoke } from '@tauri-apps/api/core'

export type MonitorMetricStatus = 'fresh' | 'stale' | 'unavailable'
export type MonitorServerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

export interface SimulatedWellEdibDevice {
  device: string
  connected: 0 | 1 | null
  status: MonitorMetricStatus
}

export interface SimulatedWellMonitorMessage {
  type: 'simulated-window'
  machine_id: string
  timestamp_ms: number
  edib: {
    status: MonitorMetricStatus
    devices: SimulatedWellEdibDevice[]
  }
  service: {
    device: string | null
    cdepth_m: number | null
    cdepth_status: MonitorMetricStatus
    speed_m_per_min: number | null
    speed_status: MonitorMetricStatus
  }
}

export interface SimulatedWellDepthPoint {
  timestampMs: number
  value: number | null
  status: MonitorMetricStatus
}

export interface SimulatedWellCommunicationEvent {
  timestampMs: number
  depth: number
  device: string
  connected: 0 | 1 | null
  depthCarried: boolean
  deviceStates: Array<{
    device: string
    connected: 0 | 1 | null
  }>
}

export interface SimulatedWellWsStatus {
  status: MonitorServerStatus
  connected: boolean
  targetUrl: string | null
  machineId: string | null
  lastMessageAt: number | null
  sessionId: string | null
  workNo: string | null
  error: string | null
}

export interface SimulatedWellMonitorSnapshot {
  sessionId: string
  workNo: string
  sampleCount: number
  lastMessageAt: number | null
  latest: SimulatedWellMonitorMessage | null
  points: SimulatedWellDepthPoint[]
  communicationEvents: SimulatedWellCommunicationEvent[]
  schemaWarning: string | null
}

export interface SimulatedWellMonitorSessionInfo {
  sessionId: string
  workNo: string
  csvPath: string
}

export interface SimulatedWellMonitorCsvFile {
  sessionId: string
  path: string
  name: string
  size: number
  sampleCount: number
}

export function getSimulatedWellWsStatus() {
  return invoke<SimulatedWellWsStatus>('get_simulated_well_ws_status')
}

export function connectSimulatedWellMonitor(targetUrl: string) {
  return invoke<SimulatedWellWsStatus>('connect_simulated_well_monitor', { targetUrl })
}

export function startSimulatedWellMonitorSession(workNo: string) {
  return invoke<SimulatedWellMonitorSessionInfo>('start_simulated_well_monitor_session', { workNo })
}

export function getSimulatedWellMonitorSnapshot(sessionId: string) {
  return invoke<SimulatedWellMonitorSnapshot>('get_simulated_well_monitor_snapshot', { sessionId })
}

export function stopSimulatedWellMonitorSession(sessionId: string) {
  return invoke<SimulatedWellMonitorCsvFile>('stop_simulated_well_monitor_session', { sessionId })
}

export function getSimulatedWellMonitorFile(sessionId: string) {
  return invoke<SimulatedWellMonitorCsvFile>('get_simulated_well_monitor_file', { sessionId })
}

export function deleteSimulatedWellMonitorFile(sessionId: string) {
  return invoke<boolean>('delete_simulated_well_monitor_file', { sessionId })
}
