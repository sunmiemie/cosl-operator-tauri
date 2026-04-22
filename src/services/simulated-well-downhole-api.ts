import { http, type ApiResponse } from './http'

export interface SimulatedWellDownholeWorkItem {
  id: number
  work_no: string
  well_name: string
  test_environment: Record<string, any>
  test_interval: Record<string, any>
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
  test_environment: Record<string, any>
  test_interval: Record<string, any>
  order_ids: string[]
  devices: any[]
  status?: number
  extra?: Record<string, any>
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

export async function deleteSimulatedWellDownholeWork(
  id: number,
  headers?: Record<string, string>
): Promise<ApiResponse<DeleteSimulatedWellDownholeWorkResponse>> {
  return http.delete<DeleteSimulatedWellDownholeWorkResponse>(
    `/test/simulated-well/downhole/delete/${id}/`,
    headers
  )
}

