import { http, type ApiResponse } from './http'
import { invoke } from '@tauri-apps/api/core'
import type { SimInstrumentListItem } from './sim-instrument-api'

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
  sourceInstrument?: SimInstrumentListItem
  researchToolKey?: string
  orderId?: string
  sourceDeviceName?: string
  template?: string
}

export interface SimulatedWellDownholeDevicePayload {
  id?: string | number
  orderId?: string
  order_id?: string
  orderDbId?: number | string
  order_db_id?: number | string
  deviceDbId?: number | string
  device_db_id?: number | string
  customer?: string
  deviceName?: string
  name?: string
  sn?: string
  code?: string
  template?: string
  templateName?: string
  template_name?: string
  orderType?: 0 | 1
  order_type?: 0 | 1
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
  order_ids?: string[] | string
  order_type?: 0 | 1
  devices?: SimulatedWellDownholeDevicePayload[] | string
  supportingTools?: SimulatedWellSupportingTool[] | string
  supporting_tools?: SimulatedWellSupportingTool[] | string
  device_count: number
  status: 0 | 1 | 2 | 3
  status_text?: string
  report_count?: number
  monitor_csv_url?: string | null
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
  status?: 0 | 1 | 2 | 3
  report_count?: number
}

export interface BuildSimulatedWellDownholeWorkPayloadOptions {
  status: 0 | 1 | 2 | 3
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
    `(${labelPattern})\\s*[:：]?\\s*(.*?)(?=\\s*(?:[/\\n,，;；])?\\s*(?:${labelPattern})\\s*[:：]?|\\s*$)`,
    'g',
  )
  const values: Record<string, string> = {}
  for (const match of text.matchAll(expression)) {
    values[match[1]] = match[2].replace(/[\\s/,，;；]+$/, '').trim()
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

/** 将接口中的测试环境转换为编辑表单使用的无单位值。 */
export function parseSimulatedWellEnvironment(value: unknown) {
  const env: any = value && typeof value === 'object' ? value : {}
  const text = typeof value === 'string' ? value : String(env?.text ?? env?.env_text ?? '')
  const values = namedValues(text, ['井深', '井温', '井压'])
  return {
    wellDepth: stripSimulatedWellUnit(values['井深'] ?? env?.wellDepth ?? env?.depth, 'm'),
    wellTemperature: stripSimulatedWellUnit(values['井温'] ?? env?.wellTemperature ?? env?.temperature, '℃'),
    wellPressure: stripSimulatedWellUnit(values['井压'] ?? env?.wellPressure ?? env?.pressure, 'MPa'),
  }
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

/** 将接口中的测试井段转换为编辑表单使用的无单位值。 */
export function parseSimulatedWellInterval(value: unknown) {
  const interval: any = value && typeof value === 'object' ? value : {}
  const text = typeof value === 'string' ? value : String(interval?.text ?? interval?.interval_text ?? '')
  const values = namedValues(text, ['主测井段', '复测井段', '主段', '重复段'])
  const splitRange = (range: unknown) => {
    const [from = '', to = ''] = String(range ?? '').split('~', 2)
    return { from: stripSimulatedWellUnit(from, 'm'), to: stripSimulatedWellUnit(to, 'm') }
  }
  const main = splitRange(values['主测井段'] ?? values['主段'])
  const repeat = splitRange(values['复测井段'] ?? values['重复段'])
  return {
    mainFrom: main.from || stripSimulatedWellUnit(interval?.mainFrom, 'm'),
    mainTo: main.to || stripSimulatedWellUnit(interval?.mainTo, 'm'),
    repeatFrom: repeat.from || stripSimulatedWellUnit(interval?.repeatFrom, 'm'),
    repeatTo: repeat.to || stripSimulatedWellUnit(interval?.repeatTo, 'm'),
  }
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

interface DownholeMonitorUploadInitResponse {
  code: number
  msg?: string
  data?: {
    upload_id: string
    chunk_size: number
    files: Array<{ id: string; name: string; size: number; kind: string }>
  }
}

interface RustMonitorChunkResponse {
  status: number
  body: string
}

export async function uploadSimulatedWellDownholeMonitorCsv(
  workId: number,
  file: { path: string; name: string; size: number },
  headers: Record<string, string>,
): Promise<ApiResponse<CreateSimulatedWellDownholeWorkResponse>> {
  const initialized = await http.post<DownholeMonitorUploadInitResponse>(
    `/test/simulated-well/downhole/${workId}/monitor-upload/init/`,
    { file: { name: file.name, size: file.size, content_type: 'text/csv' } },
    headers,
  )
  const session = initialized.data?.data
  if (!initialized.success || initialized.data?.code !== 0 || !session) {
    return { success: false, error: initialized.error || initialized.data?.msg || '初始化监控 CSV 上传失败', status: initialized.status }
  }
  const remote = session.files?.[0]
  if (!session.upload_id || !session.chunk_size || !remote) {
    return { success: false, error: '监控 CSV 上传会话返回数据不完整' }
  }

  try {
    for (let start = 0, index = 0; start < file.size; start += session.chunk_size, index += 1) {
      const length = Math.min(session.chunk_size, file.size - start)
      const url = http.buildUrl(
        `/test/simulated-well/downhole/${workId}/monitor-upload/${session.upload_id}/files/${remote.id}/chunks/${index}/`,
      )
      const response = await invoke<RustMonitorChunkResponse>('upload_simulated_well_file_chunk', {
        request: {
          uploadId: session.upload_id,
          url,
          path: file.path,
          start,
          length,
          totalFileSize: file.size,
          fileName: file.name,
          uploadedBefore: start,
          totalUploadSize: file.size,
          headers,
        },
      })
      let body: { code?: number; msg?: string } = {}
      try { body = JSON.parse(response.body) } catch { /* 后续统一处理 HTTP 错误 */ }
      if (response.status < 200 || response.status >= 300 || body.code !== 0) {
        throw new Error(body.msg || `监控 CSV 分块上传失败（HTTP ${response.status}）`)
      }
    }
    const completed = await http.post<CreateSimulatedWellDownholeWorkResponse>(
      `/test/simulated-well/downhole/${workId}/monitor-upload/${session.upload_id}/complete/`,
      {},
      headers,
    )
    if (!completed.success || completed.data?.code !== 0) {
      throw new Error(completed.error || completed.data?.msg || '保存监控 CSV 失败')
    }
    return completed
  } catch (error) {
    await http.delete(
      `/test/simulated-well/downhole/${workId}/monitor-upload/${session.upload_id}/`,
      headers,
    )
    return { success: false, error: error instanceof Error ? error.message : '监控 CSV 上传失败' }
  }
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
