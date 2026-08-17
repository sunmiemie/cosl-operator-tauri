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
  psiIdsByName: Record<string, string>
  ambiguousNames: string[]
  error?: string
}

export type ScheduleHostDevicePsiIdsResult = {
  success: boolean
  psiIdsByName: Record<string, string>
  ambiguousNames: string[]
  error?: string
}

const EQUIPMENT_MODEL_KEYWORDS: Record<ScheduleHostEquipment, string[]> = {
  // 设备台账中的正式型号为 GWY-1500，实例名称才是“高温高压井”。
  // 型号元数据存在时分类会优先使用型号，因此必须同时识别正式型号前缀。
  'high-temp-pressure': ['高温高压井', '高温高压', '高压井', 'GWY'],
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

export function collectScheduleHostDevicePsiIds(
  rows: DeviceInstanceDTO[],
  equipment: ScheduleHostEquipment
) {
  const groupedPsiIds = new Map<string, Set<string>>()
  rows
    .filter((row) => isScheduleHostDevice(row, equipment))
    .forEach((row) => {
      const name = getScheduleHostDeviceName(row)
      const psiId = firstText(row.psi_id)
      if (!name || !psiId) return
      const psiIds = groupedPsiIds.get(name) ?? new Set<string>()
      psiIds.add(psiId)
      groupedPsiIds.set(name, psiIds)
    })

  const psiIdsByName: Record<string, string> = {}
  const ambiguousNames: string[] = []
  groupedPsiIds.forEach((psiIds, name) => {
    if (psiIds.size === 1) {
      psiIdsByName[name] = Array.from(psiIds)[0]
      return
    }
    ambiguousNames.push(name)
  })

  return {
    psiIdsByName,
    ambiguousNames: ambiguousNames.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
  }
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
      psiIdsByName: {},
      ambiguousNames: [],
      error: response.error || response.data?.msg || response.data?.message || '加载主机列表失败',
    }
  }

  const rows = normalizeDeviceInstanceList(response.data.data)
  return {
    success: true,
    names: collectScheduleHostDeviceNames(rows, equipment),
    ...collectScheduleHostDevicePsiIds(rows, equipment),
  }
}

export async function fetchScheduleHostDevicePsiIds(
  equipment: ScheduleHostEquipment,
  headers?: Record<string, string>
): Promise<ScheduleHostDevicePsiIdsResult> {
  const response = await listDeviceInstances({ currentPage: 1, size: 2000 }, headers)
  if (!response.success || !response.data || Number(response.data.code) !== 0) {
    return {
      success: false,
      psiIdsByName: {},
      ambiguousNames: [],
      error: response.error || response.data?.msg || response.data?.message || '加载主机列表失败',
    }
  }

  return {
    success: true,
    ...collectScheduleHostDevicePsiIds(
      normalizeDeviceInstanceList(response.data.data),
      equipment
    ),
  }
}
