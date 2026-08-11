import { http, type ApiResponse } from './http'

export interface SimulatedWellSupportingTool {
  code?: string
  zh?: string
  en?: string
  name?: string
  templateInstrumentCode?: string
  templateInstrumentName?: string
  internalInstrumentId?: number | string
  internalInstrumentSn?: string
  internalInstrumentName?: string
  externalInstrumentModel?: string
  modelNumber?: string
  usedCount?: number
  remainCount?: number
  orderId?: string
  sourceDeviceName?: string
  template?: string
}

export interface SimulatedWellDownholeDevicePayload {
  id?: string | number
  orderId?: string
  order_id?: string
  customer?: string
  deviceName?: string
  name?: string
  sn?: string
  code?: string
  template?: string
  templateName?: string
  template_name?: string
  supportingTools?: SimulatedWellSupportingTool[]
  supporting_tools?: SimulatedWellSupportingTool[]
  selectedSupportingTools?: SimulatedWellSupportingTool[]
  selected_supporting_tools?: SimulatedWellSupportingTool[]
  availableSupportingTools?: SimulatedWellSupportingTool[]
  available_supporting_tools?: SimulatedWellSupportingTool[]
}

export interface SimulatedWellDownholeWorkItem {
  id: number
  work_no: string
  well_name: string
  well_name_en?: string
  testing_device?: string
  testing_device_en?: string
  test_objective?: string
  test_objective_en?: string
  test_type?: string
  test_count?: string
  repair_order_number?: string
  env_text: string
  interval_text: string
  order_ids?: string[]
  devices?: SimulatedWellDownholeDevicePayload[]
  supportingTools?: SimulatedWellSupportingTool[]
  supporting_tools?: SimulatedWellSupportingTool[]
  device_count: number
  status: number
  status_text?: string
  report_count?: number
  created_at: string
  updated_at: string
}

export interface SimulatedWellDownholeWorkListResponse {
  code: number
  data: {
    list: SimulatedWellDownholeWorkItem[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export interface ListSimulatedWellDownholeWorksParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: number | string
}

export async function listSimulatedWellDownholeWorks(
  params: ListSimulatedWellDownholeWorksParams,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellDownholeWorkListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.keyword) query.keyword = params.keyword
  if (params.status !== undefined) query.status = String(params.status)

  return http.get<SimulatedWellDownholeWorkListResponse>(
    '/test/simulated-well/downhole/list/',
    headers,
    query
  )
}

export interface CreateSimulatedWellDownholeWorkPayload {
  work_no?: string
  well_name: string
  well_name_en?: string
  testing_device?: string
  testing_device_en?: string
  test_objective?: string
  test_objective_en?: string
  test_type?: string
  test_count?: string
  repair_order_number?: string
  env_text?: string
  interval_text?: string
  order_ids: string[]
  devices: SimulatedWellDownholeDevicePayload[]
  supportingTools?: SimulatedWellSupportingTool[]
  supporting_tools?: SimulatedWellSupportingTool[]
  status?: number
  report_count?: number
}

export interface BuildSimulatedWellDownholeWorkPayloadOptions {
  status: number
  reportCount?: unknown
}

const simulatedWellText = (value: unknown) => String(value ?? '').trim()

export function stripSimulatedWellUnit(value: unknown, unit: 'm' | '℃' | 'MPa') {
  const text = simulatedWellText(value)
  if (!text || text === '-') return text
  const suffixPattern = {
    m: /\s*m$/i,
    '℃': /\s*(?:℃|°\s*C)$/i,
    MPa: /\s*MPa$/i,
  }[unit]
  return text.replace(suffixPattern, '').trim()
}

function formatSimulatedWellUnit(value: unknown, unit: 'm' | '℃' | 'MPa') {
  const text = simulatedWellText(value)
  if (!text || text === '-') return text || '-'
  const normalized = stripSimulatedWellUnit(text, unit)
  return normalized ? `${normalized}${unit}` : text
}

function namedValues(text: string, labels: string[]) {
  const labelPattern = labels.join('|')
  const expression = new RegExp(
    `(${labelPattern})\\s*[:：]?\\s*(.*?)(?=\\s*(?:/|\\n)?\\s*(?:${labelPattern})\\s*[:：]?|\\s*$)`,
    'g',
  )
  const values: Record<string, string> = {}
  for (const match of text.matchAll(expression)) {
    values[match[1]] = match[2].replace(/[\\s/]+$/, '').trim()
  }
  return values
}

export function formatSimulatedWellEnvironment(value: unknown) {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return '-'
    const values = namedValues(text, ['井深', '井温', '井压'])
    const parts = [
      values['井深'] ? `井深: ${formatSimulatedWellUnit(values['井深'], 'm')}` : '',
      values['井温'] ? `井温: ${formatSimulatedWellUnit(values['井温'], '℃')}` : '',
      values['井压'] ? `井压: ${formatSimulatedWellUnit(values['井压'], 'MPa')}` : '',
    ].filter(Boolean)
    return parts.length ? parts.join(' / ') : text
  }

  const env: any = value || {}
  const text = env?.text ?? env?.env_text
  if (text !== undefined && text !== null && `${text}`.trim() !== '') return formatSimulatedWellEnvironment(String(text))
  const depth = env?.wellDepth ?? env?.depth
  const temperature = env?.wellTemperature ?? env?.temperature
  const pressure = env?.wellPressure ?? env?.pressure
  const parts = [
    depth !== undefined && depth !== null && `${depth}`.trim() !== '' ? `井深: ${formatSimulatedWellUnit(depth, 'm')}` : '',
    temperature !== undefined && temperature !== null && `${temperature}`.trim() !== '' ? `井温: ${formatSimulatedWellUnit(temperature, '℃')}` : '',
    pressure !== undefined && pressure !== null && `${pressure}`.trim() !== '' ? `井压: ${formatSimulatedWellUnit(pressure, 'MPa')}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : '-'
}

function formatSimulatedWellRange(value: unknown) {
  const text = simulatedWellText(value)
  if (!text) return '-'
  const [from, to, ...rest] = text.split('~')
  if (rest.length || to !== undefined) {
    return `${formatSimulatedWellUnit(from, 'm')}~${formatSimulatedWellUnit(to, 'm')}`
  }
  return formatSimulatedWellUnit(text, 'm')
}

export function formatSimulatedWellInterval(value: unknown) {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return '-'
    const values = namedValues(text, ['主测井段', '复测井段', '主段', '重复段'])
    const main = values['主测井段'] ?? values['主段']
    const repeat = values['复测井段'] ?? values['重复段']
    const parts = [
      main ? `主测井段: ${formatSimulatedWellRange(main)}` : '',
      repeat ? `复测井段: ${formatSimulatedWellRange(repeat)}` : '',
    ].filter(Boolean)
    return parts.length ? parts.join(' / ') : text
  }

  const interval: any = value || {}
  const text = interval?.text ?? interval?.interval_text
  if (text !== undefined && text !== null && `${text}`.trim() !== '') return formatSimulatedWellInterval(String(text))
  const main = interval?.mainFrom !== undefined && interval?.mainFrom !== null && `${interval.mainFrom}`.trim() !== ''
    || interval?.mainTo !== undefined && interval?.mainTo !== null && `${interval.mainTo}`.trim() !== ''
    ? `${formatSimulatedWellUnit(interval.mainFrom || '-', 'm')}~${formatSimulatedWellUnit(interval.mainTo || '-', 'm')}`
    : ''
  const repeat = interval?.repeatFrom !== undefined && interval?.repeatFrom !== null && `${interval.repeatFrom}`.trim() !== ''
    || interval?.repeatTo !== undefined && interval?.repeatTo !== null && `${interval.repeatTo}`.trim() !== ''
    ? `${formatSimulatedWellUnit(interval.repeatFrom || '-', 'm')}~${formatSimulatedWellUnit(interval.repeatTo || '-', 'm')}`
    : ''
  return [main ? `主测井段: ${main}` : '', repeat ? `复测井段: ${repeat}` : ''].filter(Boolean).join(' / ') || '-'
}

function buildEnvironmentText(payload: any) {
  return [
    payload?.testEnvironment?.wellDepth ? `井深:${payload.testEnvironment.wellDepth}` : '',
    payload?.testEnvironment?.wellTemperature ? `井温:${payload.testEnvironment.wellTemperature}` : '',
    payload?.testEnvironment?.wellPressure ? `井压:${payload.testEnvironment.wellPressure}` : ''
  ]
    .filter(Boolean)
    .join(' ')
}

function buildIntervalText(payload: any) {
  const main =
    payload?.testInterval?.mainFrom || payload?.testInterval?.mainTo
      ? `主测井段: ${payload?.testInterval?.mainFrom || '-'}~${payload?.testInterval?.mainTo || '-'}`
      : ''
  const repeat =
    payload?.testInterval?.repeatFrom || payload?.testInterval?.repeatTo
      ? `复测井段: ${payload?.testInterval?.repeatFrom || '-'}~${payload?.testInterval?.repeatTo || '-'}`
      : ''
  return [main, repeat].filter(Boolean).join(' / ')
}

/** 将设备配套表单转换为下井作业接口的统一请求体。 */
export function buildSimulatedWellDownholeWorkPayload(
  payload: any,
  options: BuildSimulatedWellDownholeWorkPayloadOptions
): CreateSimulatedWellDownholeWorkPayload {
  return {
    well_name: payload?.wellName || '',
    well_name_en: payload?.wellNameEn || '',
    testing_device: payload?.testingDevice || '',
    testing_device_en: payload?.testingDeviceEn || '',
    test_objective: payload?.testObjective || '',
    test_objective_en: payload?.testObjectiveEn || '',
    test_type: payload?.testType || '',
    test_count: String(payload?.testCount || ''),
    repair_order_number: payload?.repairOrderNumber || '',
    env_text: buildEnvironmentText(payload),
    interval_text: buildIntervalText(payload),
    order_ids: payload?.orderIds || [],
    devices: payload?.devices || [],
    supportingTools: payload?.supportingTools || [],
    supporting_tools: payload?.supportingTools || [],
    status: options.status,
    report_count: Number(options.reportCount ?? 0) || 0
  }
}

export interface CreateSimulatedWellDownholeWorkResponse {
  code: number
  msg?: string
  data: SimulatedWellDownholeWorkItem
}

export async function createSimulatedWellDownholeWork(
  payload: CreateSimulatedWellDownholeWorkPayload,
  headers?: Record<string, string>
): Promise<ApiResponse<CreateSimulatedWellDownholeWorkResponse>> {
  return http.post<CreateSimulatedWellDownholeWorkResponse>(
    '/test/simulated-well/downhole/create/',
    payload,
    headers
  )
}

export interface DeleteSimulatedWellDownholeWorkResponse {
  code: number
  msg?: string
}

export interface SimulatedWellDownholeWorkDetailResponse {
  code: number
  data: SimulatedWellDownholeWorkItem
  msg?: string
}

export async function getSimulatedWellDownholeWorkDetail(
  id: number,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellDownholeWorkDetailResponse>> {
  return http.get<SimulatedWellDownholeWorkDetailResponse>(
    `/test/simulated-well/downhole/detail/${id}/`,
    headers
  )
}

export async function updateSimulatedWellDownholeWork(
  id: number,
  payload: Partial<CreateSimulatedWellDownholeWorkPayload>,
  headers?: Record<string, string>
): Promise<ApiResponse<CreateSimulatedWellDownholeWorkResponse>> {
  return http.put<CreateSimulatedWellDownholeWorkResponse>(
    `/test/simulated-well/downhole/detail/${id}/`,
    payload,
    headers
  )
}

export async function deleteSimulatedWellDownholeWork(
  id: number,
  headers?: Record<string, string>
): Promise<ApiResponse<DeleteSimulatedWellDownholeWorkResponse>> {
  return http.delete<DeleteSimulatedWellDownholeWorkResponse>(
    `/test/simulated-well/downhole/delete/${id}/`,
    headers
  )
}
