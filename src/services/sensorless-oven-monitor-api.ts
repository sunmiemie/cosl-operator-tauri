import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export const SENSORLESS_OVEN_MONITOR_EVENT = 'sensorless-oven-monitor'

export type SensorlessOvenPort = {
  device: string
  description: string
  hwid: string
  serial_number: string
  manufacturer: string
  vid: number | null
  pid: number | null
  by_id: string | null
  display: string
}

export type SensorlessOvenMonitorEvent = {
  event?: string
  phase?: string
  message?: string
  side?: 'left' | 'right'
  port?: string
  device_id?: string | number
  temperature?: number
  timestamp?: string
  timestamp_ms?: number
  left?: Record<string, unknown> | null
  right?: Record<string, unknown> | null
  warnings?: string[]
  output_dir?: string
  point_count?: number
}

export type StartSensorlessOvenMonitorResult = {
  output_dir: string
  script_path: string
  python_program: string
  left_port: string
  right_port: string
}

export async function listSensorlessOvenPorts() {
  return invoke<SensorlessOvenPort[]>('list_sensorless_oven_ports', { pythonPath: null })
}

export function isSensorlessOvenPortPresent(ports: SensorlessOvenPort[], device?: string | null) {
  const value = device?.trim() || ''
  if (!value) return false
  return ports.some((port) => port.device === value || port.by_id === value)
}

export async function startSensorlessOvenMonitor(payload: {
  leftPort?: string
  rightPort?: string
  orderId?: string
  sessionId?: string
}) {
  return invoke<StartSensorlessOvenMonitorResult>('start_sensorless_oven_monitor', {
    leftPort: payload.leftPort || '',
    rightPort: payload.rightPort || '',
    orderId: payload.orderId || null,
    sessionId: payload.sessionId || null,
    pythonPath: null,
  })
}

export async function pauseSensorlessOvenMonitor(outputDir: string) {
  return invoke('pause_sensorless_oven_monitor', { outputDir })
}

export async function resumeSensorlessOvenMonitor(outputDir: string) {
  return invoke('resume_sensorless_oven_monitor', { outputDir })
}

export async function stopSensorlessOvenMonitor(outputDir?: string | null) {
  return invoke('stop_sensorless_oven_monitor', { outputDir: outputDir || null })
}

export async function listenSensorlessOvenMonitor(
  handler: (payload: SensorlessOvenMonitorEvent) => void,
): Promise<UnlistenFn> {
  return listen<SensorlessOvenMonitorEvent>(SENSORLESS_OVEN_MONITOR_EVENT, (event) => {
    handler(event.payload)
  })
}
