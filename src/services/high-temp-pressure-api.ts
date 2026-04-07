import { http, type ApiResponse } from './http'

export interface HighTempPressureOrderDTO {
  id: number
  test_platform: string
  test_date: string
  device_name: string
  device_number: string
  task_number: string
  target_temp: number
  target_pressure: number
  applicant: string
  remark: string
  status: number
  status_text?: string
  created_at: string
  updated_at: string
}

export interface HighTempPressureOrderListResponse {
  code: number
  data: {
    list: HighTempPressureOrderDTO[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export interface ListHighTempPressureOrdersParams {
  page?: number
  pageSize?: number
  taskNumber?: string
  status?: number | string
}

export async function listHighTempPressureOrders(
  params: ListHighTempPressureOrdersParams,
  headers?: Record<string, string>
): Promise<ApiResponse<HighTempPressureOrderListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.taskNumber) query.taskNumber = params.taskNumber
  if (params.status !== undefined) query.status = String(params.status)

  return http.get<HighTempPressureOrderListResponse>(
    '/test/high-temp-pressure/order/list/',
    headers,
    query
  )
}
