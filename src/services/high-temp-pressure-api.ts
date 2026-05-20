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
  use_device?: string
  max_diameter?: number | null
  hold_time?: number | null
  admin_signature_url?: string | null
  sanxin_confirm_date?: string | null
  sanxin_tester_item_1?: string | null
  sanxin_tester_item_2?: string | null
  sanxin_is_sanxin?: boolean | number | null
  instrument_count?: number
  instrument_names?: string
  instrument_sns?: string
  test_types?: string
  instruments?: HighTempPressureOrderInstrumentDTO[]
  remark: string
  status: number
  status_text?: string
  created_at: string
  updated_at: string
}

export interface HighTempPressureOrderInstrumentDTO {
  id?: number
  instrument_name: string
  instrument_sn: string
  test_type?: string
  quantity?: number
  max_diameter?: number | null
  is_completed?: boolean
  completed_at?: string | null
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

export interface MutationResponse {
  code: number
  msg?: string
  data?: {
    order_id?: number
    before_status?: number
    after_status?: number
    completed_sns?: string[]
    remaining_sns?: string[]
    remaining_count?: number
  }
}

export interface FinishHighTempPressureOrderPayload {
  instrument_sns?: string[]
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

export async function startHighTempPressureOrder(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<MutationResponse>> {
  return http.post<MutationResponse>(
    `/test/high-temp-pressure/order/start/${orderId}/`,
    {},
    headers
  )
}

export async function finishHighTempPressureOrder(
  orderId: number,
  payload: FinishHighTempPressureOrderPayload = {},
  headers?: Record<string, string>
): Promise<ApiResponse<MutationResponse>> {
  return http.post<MutationResponse>(
    `/test/high-temp-pressure/order/finish/${orderId}/`,
    payload,
    headers
  )
}
