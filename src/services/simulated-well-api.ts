import { http, type ApiResponse } from './http'

export interface SimulatedWellOrderDeviceDTO {
  device_name: string
  device_number: string
}

export interface SimulatedWellOrderDTO {
  id: number
  task_number: string
  customer_unit?: string
  task_desc?: string
  device_count?: number
  plan_date?: string | null
  admin_signature_url?: string | null
  sanxin_confirm_date?: string | null
  sanxin_tester_item_1?: string | null
  sanxin_tester_item_2?: string | null
  sanxin_is_sanxin?: boolean | number | string | null
  status: number
  status_text?: string
  created_at: string
  updated_at: string
  devices?: SimulatedWellOrderDeviceDTO[]
}

export interface SimulatedWellOrderListResponse {
  code: number
  data: {
    list: SimulatedWellOrderDTO[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export interface ListSimulatedWellOrdersParams {
  page?: number
  pageSize?: number
  taskNumber?: string
  status?: number | string
  includeDevices?: boolean
}

export async function listSimulatedWellOrders(
  params: ListSimulatedWellOrdersParams,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellOrderListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.taskNumber) query.taskNumber = params.taskNumber
  if (params.status !== undefined) query.status = String(params.status)
  if (params.includeDevices) query.includeDevices = '1'

  return http.get<SimulatedWellOrderListResponse>(
    '/test/simulated-well/order/list/',
    headers,
    query
  )
}

export interface SimulatedWellOrderDetailResponse {
  code: number
  data: SimulatedWellOrderDTO
  msg?: string
}

export async function getSimulatedWellOrderDetail(
  id: number,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellOrderDetailResponse>> {
  return http.get<SimulatedWellOrderDetailResponse>(`/test/simulated-well/order/detail/${id}/`, headers)
}
