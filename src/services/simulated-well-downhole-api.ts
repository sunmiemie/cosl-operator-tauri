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
  env_text?: string
  interval_text?: string
  order_ids: string[]
  devices: SimulatedWellDownholeDevicePayload[]
  supportingTools?: SimulatedWellSupportingTool[]
  supporting_tools?: SimulatedWellSupportingTool[]
  status?: number
  report_count?: number
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
