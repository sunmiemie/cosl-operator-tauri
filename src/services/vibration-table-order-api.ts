import { http, type ApiResponse } from './http'

export type VibrationTableOrderDTO = {
  id: number
  order_no: string
  order_type: string
  applicant: string
  device_name: string
  device_number?: string
  deviceNumber?: string
  level: string
  duration: number
  test_date: string | null
  remark: string
  status: number
  status_text?: string
  created_at: string
  updated_at: string
}

export type VibrationTableOrderListResponse = {
  code: number
  data: {
    list: VibrationTableOrderDTO[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export type ListVibrationTableOrdersParams = {
  page?: number
  pageSize?: number
  taskNumber?: string
  status?: number | string
}

export async function listVibrationTableOrders(
  params: ListVibrationTableOrdersParams
): Promise<ApiResponse<VibrationTableOrderListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.taskNumber) query.taskNumber = params.taskNumber
  if (params.status !== undefined) query.status = String(params.status)
  return http.get<VibrationTableOrderListResponse>('/test/vibration-table/order/list/', {}, query)
}

export type VibrationTableOrderWriteResponse = {
  code: number
  msg?: string
  data?: VibrationTableOrderDTO
}

export type VibrationTableOrderStatusMutationResponse = {
  code: number
  msg?: string
  data?: {
    order_id: number
    before_status: number
    after_status: number
  }
}

export type UpdateVibrationTableOrderBody = Partial<
  Pick<
    VibrationTableOrderDTO,
    | 'order_no'
    | 'order_type'
    | 'applicant'
    | 'device_name'
    | 'level'
    | 'duration'
    | 'test_date'
    | 'remark'
    | 'status'
  >
>

export async function updateVibrationTableOrder(
  orderId: number,
  data: UpdateVibrationTableOrderBody,
  headers?: Record<string, string>
): Promise<ApiResponse<VibrationTableOrderWriteResponse>> {
  return http.put<VibrationTableOrderWriteResponse>(`/test/vibration-table/order/detail/${orderId}/`, data, headers)
}

export async function changeVibrationTableOrderStatus(
  orderId: number,
  status: number,
  headers?: Record<string, string>
): Promise<ApiResponse<VibrationTableOrderStatusMutationResponse>> {
  return http.post<VibrationTableOrderStatusMutationResponse>(
    `/test/vibration-table/order/status/${orderId}/`,
    { status },
    headers
  )
}
