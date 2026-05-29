import { http, type ApiResponse } from './http'

export type HighTempBoxOrderInstrumentDTO = {
  id?: number
  instrument_name?: string
  sn_numbers?: string
  quantity?: number
  instrument_status?: number
  is_completed?: boolean
  completed_at?: string | null
}

export type HighTempBoxOrderDTO = {
  id: number
  test_platform: string
  test_date: string
  run_time: number
  device_name: string
  device_number: string
  task_number: string
  target_temp: number
  applicant: string
  remark: string
  feedback_reason: string
  status: number
  status_text?: string
  scheduled_start_at?: string | null
  scheduled_end_at?: string | null
  instruments?: HighTempBoxOrderInstrumentDTO[]
  created_at: string
  updated_at: string
}

export type HighTempBoxOrderInstrument = {
  id: string
  dbId?: number
  name: string
  sn: string
  quantity?: number
  status?: number
  completed?: boolean
  completedAt?: string | null
}

export type HighTempBoxOrder = {
  id: string
  dbId: number
  taskNumber: string
  applicant: string
  deviceName: string
  deviceNumber: string
  targetTemp: number
  duration: number
  testPlatform: string
  testDate: string
  remark: string
  feedbackReason: string
  status: number
  statusText?: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  instruments: HighTempBoxOrderInstrument[]
  createdAt: string
  updatedAt: string
}

export function mapHighTempBoxOrder(dto: HighTempBoxOrderDTO): HighTempBoxOrder {
  return {
    id: dto.task_number,
    dbId: dto.id,
    taskNumber: dto.task_number,
    applicant: dto.applicant,
    deviceName: dto.device_name,
    deviceNumber: dto.device_number,
    targetTemp: dto.target_temp,
    duration: dto.run_time,
    testPlatform: dto.test_platform,
    testDate: dto.test_date,
    remark: dto.remark,
    feedbackReason: dto.feedback_reason,
    status: dto.status,
    statusText: dto.status_text,
    scheduledStartAt: dto.scheduled_start_at || null,
    scheduledEndAt: dto.scheduled_end_at || null,
    instruments: Array.isArray(dto.instruments)
      ? dto.instruments.map((item, index) => ({
          id: `htb-ins-${dto.id}-${item.id ?? index}`,
          dbId: item.id,
          name: item.instrument_name || dto.device_name || `仪器${index + 1}`,
          sn: item.sn_numbers || dto.device_number || '-',
          quantity: item.quantity,
          status: item.instrument_status ?? (item.is_completed ? 2 : 0),
          completed: item.is_completed === true || item.instrument_status === 2,
          completedAt: item.completed_at || null,
        }))
      : [],
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export type HighTempBoxOrderListResponse = {
  code: number
  data: {
    list: HighTempBoxOrderDTO[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export type ListHighTempBoxOrdersParams = {
  page?: number
  pageSize?: number
  taskNumber?: string
  status?: number | string
}

export async function listHighTempBoxOrders(
  params: ListHighTempBoxOrdersParams
): Promise<ApiResponse<HighTempBoxOrderListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.taskNumber) query.taskNumber = params.taskNumber
  if (params.status !== undefined) query.status = String(params.status)
  return http.get<HighTempBoxOrderListResponse>('/test/high-temp-box/order/list/', {}, query)
}

export type HighTempBoxOrderWriteResponse = {
  code: number
  msg?: string
  data?: HighTempBoxOrderDTO
}

export type HighTempBoxOrderStatusMutationResponse = {
  code: number
  msg?: string
  data?: {
    order_id: number
    before_status: number
    after_status: number
    running_instrument_ids?: number[]
    completed_instrument_ids?: number[]
    remaining_instrument_ids?: number[]
  }
}

export type ChangeHighTempBoxOrderStatusOptions = {
  runningInstrumentIds?: Array<number | string>
  completedInstrumentIds?: Array<number | string>
}

export type UpdateHighTempBoxOrderBody = Partial<
  Pick<
    HighTempBoxOrderDTO,
    | 'test_platform'
    | 'test_date'
    | 'run_time'
    | 'device_name'
    | 'device_number'
    | 'task_number'
    | 'target_temp'
    | 'applicant'
    | 'remark'
    | 'feedback_reason'
    | 'status'
  >
>

export async function updateHighTempBoxOrder(
  orderId: number,
  data: UpdateHighTempBoxOrderBody,
  headers?: Record<string, string>
): Promise<ApiResponse<HighTempBoxOrderWriteResponse>> {
  return http.put<HighTempBoxOrderWriteResponse>(`/test/high-temp-box/order/detail/${orderId}/`, data, headers)
}

export async function changeHighTempBoxOrderStatus(
  orderId: number,
  status: number,
  headers?: Record<string, string>,
  options: ChangeHighTempBoxOrderStatusOptions = {}
): Promise<ApiResponse<HighTempBoxOrderStatusMutationResponse>> {
  return http.post<HighTempBoxOrderStatusMutationResponse>(
    `/test/high-temp-box/order/status/${orderId}/`,
    {
      status,
      running_instrument_ids: options.runningInstrumentIds,
      completed_instrument_ids: options.completedInstrumentIds,
    },
    headers
  )
}

export type HighTempBoxOrderScheduleBody = {
  scheduled_start_at: string
  scheduled_end_at: string
}

export async function saveHighTempBoxOrderSchedule(
  orderId: number,
  data: HighTempBoxOrderScheduleBody,
  headers?: Record<string, string>
): Promise<ApiResponse<HighTempBoxOrderWriteResponse>> {
  return http.post<HighTempBoxOrderWriteResponse>(
    `/test/high-temp-box/order/schedule/${orderId}/`,
    data,
    headers
  )
}

export async function clearHighTempBoxOrderSchedule(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<HighTempBoxOrderWriteResponse>> {
  return http.delete<HighTempBoxOrderWriteResponse>(
    `/test/high-temp-box/order/schedule/${orderId}/`,
    headers
  )
}
