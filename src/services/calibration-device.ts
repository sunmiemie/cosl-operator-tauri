import { http, type ApiResponse } from './http'
import type { CalibrationWorkOrder, WellCommConfig } from '@/views/scale-well-cluster/shared/types'

export interface PretestReading {
  count: number
  cps: number
  gr: number
  sn?: string
  firmware?: string
  sync?: string
  status?: string
  standby_cur?: string
  comm_ok?: boolean
}

export interface PretestRow {
  index: number
  cps_b: number
  cps_a?: number | null
  ok: boolean
}

export interface SamplingResult {
  samples: number[]
  samples_a?: number[] | null
  hi_mean: number
  lo_mean: number
}

export interface DeviceSessionInfo {
  sessionId: number
  orderId: number
  dataSource: string
  phase: string
  resolvedPorts?: Record<string, unknown>
}

type BackendEnvelope<T> = { code: number; data?: T; msg?: string }

function unwrap<T>(response: ApiResponse<BackendEnvelope<T>>): T {
  if (!response.success || !response.data) {
    throw new Error(response.error || '请求失败')
  }
  if (response.data.code !== 0) {
    throw new Error(response.data.msg || '设备 API 错误')
  }
  return response.data.data as T
}

export async function openDeviceSession(
  orderId: number,
  headers?: Record<string, string>
): Promise<DeviceSessionInfo> {
  const response = await http.post<BackendEnvelope<{
    sessionId: number
    orderId: number
    dataSource: string
    phase: string
    resolvedPorts?: Record<string, unknown>
  }>>('/test/calibration-well/device/session/open/', { orderId }, headers)
  const data = unwrap(response)
  return {
    sessionId: data.sessionId,
    orderId: data.orderId,
    dataSource: data.dataSource,
    phase: data.phase,
    resolvedPorts: data.resolvedPorts,
  }
}

export async function closeDeviceSession(
  sessionId: number,
  headers?: Record<string, string>
): Promise<void> {
  const response = await http.post<BackendEnvelope<unknown>>(
    '/test/calibration-well/device/session/close/',
    { sessionId },
    headers
  )
  unwrap(response)
}

export type DeviceStreamHandler = (
  event: string,
  data: Record<string, unknown>
) => void | Promise<void>

export async function subscribeDeviceStream(
  path: string,
  queryParams: Record<string, string>,
  onEvent: DeviceStreamHandler,
  headers?: Record<string, string>,
  signal?: AbortSignal
): Promise<void> {
  await http.subscribeEventStream(path, onEvent, {
    headers,
    queryParams,
    signal,
    timeout: 0,
  })
}

export async function streamPretestRead(
  sessionId: number,
  onEvent: DeviceStreamHandler,
  headers?: Record<string, string>,
  signal?: AbortSignal
): Promise<void> {
  return subscribeDeviceStream(
    '/test/calibration-well/device/session/stream/pretest/',
    { sessionId: String(sessionId) },
    onEvent,
    headers,
    signal
  )
}

export async function streamPretest100(
  sessionId: number,
  params: {
    phase: 'hi' | 'lo'
    refMin: number
    refMax: number
    total: number
    dualSensor: boolean
  },
  onEvent: DeviceStreamHandler,
  headers?: Record<string, string>,
  signal?: AbortSignal
): Promise<void> {
  return subscribeDeviceStream(
    '/test/calibration-well/device/session/stream/pretest100/',
    {
      sessionId: String(sessionId),
      phase: params.phase,
      refMin: String(params.refMin),
      refMax: String(params.refMax),
      total: String(params.total),
      dualSensor: String(params.dualSensor),
    },
    onEvent,
    headers,
    signal
  )
}

export async function streamFormalSampling(
  sessionId: number,
  params: {
    phase: 'hi' | 'lo'
    hiApi: number
    loApi: number
    refMin: number
    refMax: number
    count: number
    dualSensor: boolean
    kcMin: number
    kcMax: number
  },
  onEvent: DeviceStreamHandler,
  headers?: Record<string, string>,
  signal?: AbortSignal
): Promise<void> {
  return subscribeDeviceStream(
    '/test/calibration-well/device/session/stream/sampling/',
    {
      sessionId: String(sessionId),
      phase: params.phase,
      hiApi: String(params.hiApi),
      loApi: String(params.loApi),
      refMin: String(params.refMin),
      refMax: String(params.refMax),
      count: String(params.count),
      dualSensor: String(params.dualSensor),
      kcMin: String(params.kcMin),
      kcMax: String(params.kcMax),
    },
    onEvent,
    headers,
    signal
  )
}

/** @deprecated 请使用 streamPretestRead */
export async function readPretestReading(
  sessionId: number,
  headers?: Record<string, string>
): Promise<PretestReading> {
  const response = await http.post<BackendEnvelope<PretestReading>>(
    '/test/calibration-well/device/session/pretest/read/',
    { sessionId },
    headers
  )
  return unwrap(response)
}

/** @deprecated 请使用 streamPretest100 */
export async function runPretest100(
  sessionId: number,
  params: {
    phase: 'hi' | 'lo'
    refMin: number
    refMax: number
    total: number
    dualSensor: boolean
  },
  headers?: Record<string, string>
): Promise<PretestRow[]> {
  const response = await http.post<BackendEnvelope<PretestRow[]>>(
    '/test/calibration-well/device/session/pretest100/',
    {
      sessionId,
      phase: params.phase,
      refMin: params.refMin,
      refMax: params.refMax,
      total: params.total,
      dualSensor: params.dualSensor,
    },
    headers
  )
  return unwrap(response)
}

/** @deprecated 请使用 streamFormalSampling */
export async function runFormalSampling(
  sessionId: number,
  params: {
    phase: 'hi' | 'lo'
    hiApi: number
    loApi: number
    refMin: number
    refMax: number
    count: number
    dualSensor: boolean
    kcMin: number
    kcMax: number
  },
  headers?: Record<string, string>
): Promise<SamplingResult> {
  const response = await http.post<BackendEnvelope<SamplingResult>>(
    '/test/calibration-well/device/session/sampling/',
    {
      sessionId,
      phase: params.phase,
      hiApi: params.hiApi,
      loApi: params.loApi,
      refMin: params.refMin,
      refMax: params.refMax,
      count: params.count,
      dualSensor: params.dualSensor,
      kcMin: params.kcMin,
      kcMax: params.kcMax,
    },
    headers
  )
  return unwrap(response)
}

export async function writeCoefficients(
  sessionId: number,
  coeffs: { ka: number; kb: number; kc: number; ba: number; bb: number; bc: number },
  headers?: Record<string, string>
): Promise<void> {
  const response = await http.post<BackendEnvelope<{ ok: boolean }>>(
    '/test/calibration-well/device/session/write-coefficients/',
    { sessionId, ...coeffs },
    headers
  )
  unwrap(response)
}

const ROLE_LABELS: Record<string, string> = {
  instrument: '仪器（TBUS）',
  instrument_b: '传感器 B',
  data_stick: '程控电源',
  power_supply: '直流电源',
}

function mapCommItem(item: WellCommConfig) {
  if (item.deviceRole === 'power_supply') {
    return {
      device: ROLE_LABELS.power_supply,
      mode: item.transport === 'lan' ? 'LAN' : 'RS232',
      port: item.transport === 'lan' ? `${item.host}:${item.port}` : item.host || '—',
      baud: '—',
    }
  }
  return {
    device: ROLE_LABELS[item.deviceRole] || item.deviceRole,
    mode: 'USB-Serial',
    port: `${item.vid}:${item.pid}/${item.adapterSerial || '—'}`,
    baud: String(item.baudRate ?? '—'),
  }
}

export function buildCommPortRows(order: CalibrationWorkOrder | null) {
  if (!order) return []
  const hi = order.hiWellCommConfigs ?? []
  const lo = order.loWellCommConfigs ?? []
  const merged = [...hi]
  for (const item of lo) {
    if (item.deviceRole === 'power_supply' && merged.some((c) => c.deviceRole === 'power_supply')) {
      continue
    }
    if (!merged.some((c) => c.deviceRole === item.deviceRole)) {
      merged.push(item)
    }
  }
  const rows = merged.map(mapCommItem)
  const ds =
    order.hiWellDataSource === 'live' || order.loWellDataSource === 'live' ? 'Live' : 'Mock'
  if (rows.length) {
    rows.unshift({ device: '数据源', mode: ds, port: '服务端', baud: '—' })
  }
  return rows
}

export function getSettingsHint(order: CalibrationWorkOrder | null): string {
  if (!order) return '通信配置由 Web 刻度井管理维护'
  const ds =
    order.hiWellDataSource === 'live' || order.loWellDataSource === 'live'
      ? 'Live 模式（服务端）'
      : 'Mock 模式（服务端）'
  return ds
}
