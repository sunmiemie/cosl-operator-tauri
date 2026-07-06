import { http, type ApiResponse } from './http'

export interface HighTempPressureOrderDTO {
  id: number
  test_platform: string
  test_date: string
  device_name: string
  device_number: string
  task_number: string
  table_no?: string | null
  target_temp: number
  target_pressure: number
  applicant: string
  applicant_phone?: string
  test_application_unit?: string
  test_application_unit_manager?: string
  application_date?: string | null
  research_number?: string
  project_budget_number?: string
  project_name?: string
  client?: string
  planned_time?: string | null
  test_type?: string
  use_device?: string
  max_diameter?: number | null
  hold_time?: number | null
  project_members?: string
  equipment_list?: string
  instrument_combination?: string
  test_steps?: string
  safety_risks?: string
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
  use_device?: string | null
  instrument_length?: string
  max_diameter?: number | null
  scheduled_start_at?: string | null
  scheduled_end_at?: string | null
  schedule_segments?: Array<{
    scheduled_start_at?: string | null
    scheduled_end_at?: string | null
    use_device?: string | null
  }>
  instrument_status?: number
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
    reset_sns?: string[]
    running_sns?: string[]
    remaining_count?: number
  }
}

export interface FinishHighTempPressureOrderPayload {
  instrument_sns?: string[]
}

export interface StartHighTempPressureOrderPayload {
  instrument_sns?: string[]
}

export interface CancelHighTempPressureOrderPayload {
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
  payload: StartHighTempPressureOrderPayload = {},
  headers?: Record<string, string>
): Promise<ApiResponse<MutationResponse>> {
  return http.post<MutationResponse>(
    `/test/high-temp-pressure/order/start/${orderId}/`,
    payload,
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

export async function cancelHighTempPressureOrder(
  orderId: number,
  payload: CancelHighTempPressureOrderPayload = {},
  headers?: Record<string, string>
): Promise<ApiResponse<MutationResponse>> {
  return http.post<MutationResponse>(
    `/test/high-temp-pressure/order/cancel/${orderId}/`,
    payload,
    headers
  )
}

export type HighTempPressureInstrumentScheduleBody = {
  scheduled_start_at?: string
  scheduled_end_at?: string
  use_device?: string
  schedule_segments?: Array<{
    scheduled_start_at: string
    scheduled_end_at: string
    use_device?: string
  }>
}

export type HighTempPressureInstrumentScheduleResponse = {
  code: number
  msg?: string
  data?: HighTempPressureOrderInstrumentDTO & { order_id?: number }
}

export async function saveHighTempPressureInstrumentSchedule(
  instrumentId: number,
  data: HighTempPressureInstrumentScheduleBody,
  headers?: Record<string, string>
): Promise<ApiResponse<HighTempPressureInstrumentScheduleResponse>> {
  return http.post<HighTempPressureInstrumentScheduleResponse>(
    `/test/high-temp-pressure/order/instrument-schedule/${instrumentId}/`,
    data,
    headers
  )
}

export async function clearHighTempPressureInstrumentSchedule(
  instrumentId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<HighTempPressureInstrumentScheduleResponse>> {
  return http.delete<HighTempPressureInstrumentScheduleResponse>(
    `/test/high-temp-pressure/order/instrument-schedule/${instrumentId}/`,
    headers
  )
}
