import { http, type ApiResponse } from './http'

export type VibrationTableOrderInstrumentDTO = {
  id?: number
  instrument_id?: number | string
  instrumentId?: number | string
  instrument_name?: string
  instrumentName?: string
  name?: string
  device_name?: string
  instrument_sn?: string
  instrumentSn?: string
  sn_numbers?: string
  sn?: string
  device_number?: string
  deviceNumber?: string
  code?: string
  model?: string
  remark?: string
  status?: number
  instrument_status?: number
  status_text?: string
  statusText?: string
  quantity?: number
  weight?: string
  length?: string
  max_diameter?: string
  is_completed?: boolean
  attempt_no?: number
  current_report_id?: number | null
  current_report_status?: number | null
  instrument_progress?: Array<{
    instrument_sn: string
    instrument_status: number
    is_completed: boolean
    completed_at?: string | null
    attempt_no?: number
    current_report_id?: number | null
    current_report_status?: number | null
  }>
}

export type VibrationTableOrderDTO = {
  id: number
  order_no: string
  order_type: string
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
  task_number?: string | null
  table_no?: string | null
  test_type?: string
  test_purpose?: string
  vibration_direction?: string
  acceleration?: string
  slope?: string
  frequency?: string
  vibration_times?: number
  project_members?: string
  equipment_list?: string
  instrument_combination?: string
  test_steps?: string
  safety_risks?: string
  device_name: string
  device_number?: string
  deviceNumber?: string
  level: string
  duration: number
  test_date: string | null
  remark: string
  status: number
  status_text?: string
  scheduled_start_at?: string | null
  scheduled_end_at?: string | null
  schedule_segments?: Array<{
    scheduled_start_at?: string | null
    scheduled_end_at?: string | null
    use_device?: string | null
    useDevice?: string | null
  }>
  instruments?: VibrationTableOrderInstrumentDTO[]
  order_instruments?: VibrationTableOrderInstrumentDTO[]
  vibration_table_order_instrument?: VibrationTableOrderInstrumentDTO[] | VibrationTableOrderInstrumentDTO
  vibration_table_order_instruments?: VibrationTableOrderInstrumentDTO[]
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
    completed_instrument_ids?: number[]
    remaining_instrument_ids?: number[]
  }
}

export type ChangeVibrationTableOrderStatusOptions = {
  runningInstrumentIds?: Array<number | string>
  runningInstrumentSns?: string[]
  completedInstrumentIds?: Array<number | string>
  completedInstrumentSns?: string[]
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
  headers?: Record<string, string>,
  options: ChangeVibrationTableOrderStatusOptions = {}
): Promise<ApiResponse<VibrationTableOrderStatusMutationResponse>> {
  return http.post<VibrationTableOrderStatusMutationResponse>(
    `/test/vibration-table/order/status/${orderId}/`,
    {
      status,
      running_instrument_ids: options.runningInstrumentIds,
      running_instrument_sns: options.runningInstrumentSns,
      completed_instrument_ids: options.completedInstrumentIds,
      completed_instrument_sns: options.completedInstrumentSns,
    },
    headers
  )
}

export type VibrationTableOrderScheduleBody = {
  scheduled_start_at?: string
  scheduled_end_at?: string
  use_device?: string
  schedule_segments?: Array<{
    scheduled_start_at: string
    scheduled_end_at: string
    use_device?: string
  }>
}

export async function saveVibrationTableOrderSchedule(
  orderId: number,
  data: VibrationTableOrderScheduleBody,
  headers?: Record<string, string>
): Promise<ApiResponse<VibrationTableOrderWriteResponse>> {
  return http.post<VibrationTableOrderWriteResponse>(
    `/test/vibration-table/order/schedule/${orderId}/`,
    data,
    headers
  )
}

export async function clearVibrationTableOrderSchedule(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<VibrationTableOrderWriteResponse>> {
  return http.delete<VibrationTableOrderWriteResponse>(
    `/test/vibration-table/order/schedule/${orderId}/`,
    headers
  )
}
