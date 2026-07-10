import { listDeviceInstances, type DeviceInstanceDTO } from './device-instance-api'

export type ScheduleHostEquipment =
  | 'high-temp-pressure'
  | 'halt-hass'
  | 'vibration-table'
  | 'water-cycle'
  | 'simulated-well'
  | 'high-temp-box'

export type ScheduleHostDeviceNamesResult = {
  success: boolean
  names: string[]
  error?: string
}

const EQUIPMENT_MODEL_KEYWORDS: Record<ScheduleHostEquipment, string[]> = {
  'high-temp-pressure': ['高温高压井', '高温高压', '高压井'],
  'halt-hass': ['HALT-HASS', 'HALT', 'HASS'],
  'vibration-table': ['振动台', '冲击台'],
  'water-cycle': ['水循环'],
  'simulated-well': ['模拟井'],
  'high-temp-box': ['高温箱'],
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function normalizeMatchText(value: string) {
  return value.trim().toLocaleUpperCase().replace(/[\s_\-/&]+/gu, '')
}

function textMatchesKeyword(text: string, keyword: string) {
  const normalizedText = normalizeMatchText(text)
  const normalizedKeyword = normalizeMatchText(keyword)
  return Boolean(normalizedText && normalizedKeyword && normalizedText.includes(normalizedKeyword))
}

export function getScheduleHostDeviceName(row: DeviceInstanceDTO) {
  return firstText(row.deviceName, row.device_name, row.psi_name)
}

function getScheduleHostModelName(row: DeviceInstanceDTO) {
  return firstText(
    row.psimodel_name,
    row.host_model_name,
    row.hostModelName,
    row.modelName,
    row.model_name,
    row.model
  )
}

export function isScheduleHostDevice(row: DeviceInstanceDTO, equipment: ScheduleHostEquipment) {
  const modelName = getScheduleHostModelName(row)
  const candidateTexts = modelName ? [modelName] : [getScheduleHostDeviceName(row)]
  const keywords = EQUIPMENT_MODEL_KEYWORDS[equipment]
  const matchesEquipment = keywords.some((keyword) =>
    candidateTexts.some((text) => textMatchesKeyword(text, keyword))
  )

  if (!matchesEquipment) return false
  if (equipment !== 'high-temp-box') return true

  return !EQUIPMENT_MODEL_KEYWORDS['high-temp-pressure'].some((keyword) =>
    candidateTexts.some((text) => textMatchesKeyword(text, keyword))
  )
}

export function normalizeDeviceInstanceList(response: unknown): DeviceInstanceDTO[] {
  const payload = (response as { data?: unknown })?.data ?? response ?? {}
  const list = Array.isArray(payload)
    ? payload
    : (payload as { list?: unknown; records?: unknown; results?: unknown; items?: unknown }).list ??
      (payload as { list?: unknown; records?: unknown; results?: unknown; items?: unknown }).records ??
      (payload as { list?: unknown; records?: unknown; results?: unknown; items?: unknown }).results ??
      (payload as { list?: unknown; records?: unknown; results?: unknown; items?: unknown }).items ??
      []

  return Array.isArray(list) ? list as DeviceInstanceDTO[] : []
}

export function collectScheduleHostDeviceNames(rows: DeviceInstanceDTO[], equipment: ScheduleHostEquipment) {
  const names = rows
    .filter((row) => isScheduleHostDevice(row, equipment))
    .map(getScheduleHostDeviceName)
    .filter(Boolean)

  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

export async function fetchScheduleHostDeviceNames(
  equipment: ScheduleHostEquipment,
  headers?: Record<string, string>
): Promise<ScheduleHostDeviceNamesResult> {
  const response = await listDeviceInstances({ currentPage: 1, size: 2000 }, headers)
  if (!response.success || !response.data || Number(response.data.code) !== 0) {
    return {
      success: false,
      names: [],
      error: response.error || response.data?.msg || response.data?.message || '加载主机列表失败',
    }
  }

  return {
    success: true,
    names: collectScheduleHostDeviceNames(
      normalizeDeviceInstanceList(response.data.data),
      equipment
    ),
  }
}
