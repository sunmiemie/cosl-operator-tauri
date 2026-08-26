import { http, type ApiResponse } from './http'

export type WaterCycleOrderDTO = {
  id: number
  test_platform: string
  test_date: string
  start_time: string
  end_time: string
  scheduled_start_at?: string | null
  scheduled_end_at?: string | null
  schedule_segments?: WaterCycleOrderScheduleSegmentDTO[] | null
  device_name: string
  device_number: string
  task_number: string
  flow_process: string
  need_pressure_test: string
  need_command_transfer: string
  applicant: string
  remark: string
  status: number
  status_text?: string
  instruments?: WaterCycleOrderInstrumentDTO[]
  created_at: string
  updated_at: string
}

export type WaterCycleOrderScheduleSegmentDTO = {
  scheduled_start_at?: string | null
  scheduled_end_at?: string | null
}

export type WaterCycleOrderInstrumentDTO = {
  id?: number
  instrument_name?: string
  sn_numbers?: string
  quantity?: number
  scheduled_start_at?: string | null
  scheduled_end_at?: string | null
  instrument_status?: number
  is_completed?: boolean
  completed_at?: string | null
}

export type WaterCycleOrder = {
  id: string
  dbId: number
  taskNumber: string
  applicant: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  scheduleSegments: WaterCycleOrderScheduleSegment[]
  deviceName: string
  deviceNumber: string
  flowProcess: string
  testPlatform: string
  testDate: string
  startTime: string
  endTime: string
  needPressureTest: string
  needCommandTransfer: string
  remark: string
  status: number
  statusText?: string
  instruments: WaterCycleOrderInstrument[]
  createdAt: string
  updatedAt: string
}

export type WaterCycleOrderScheduleSegment = {
  scheduledStartAt: string
  scheduledEndAt: string
}

export type WaterCycleOrderInstrument = {
  id: string
  dbId?: number
  name: string
  sn: string
  quantity?: number
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  status?: number
  completed?: boolean
  completedAt?: string | null
}

export function mapWaterCycleOrder(dto: WaterCycleOrderDTO): WaterCycleOrder {
  const scheduleSegments: WaterCycleOrderScheduleSegment[] = Array.isArray(dto.schedule_segments)
    ? dto.schedule_segments
        .map((segment) => {
          const scheduledStartAt = segment?.scheduled_start_at || ''
          const scheduledEndAt = segment?.scheduled_end_at || ''
          if (!scheduledStartAt || !scheduledEndAt) return null
          return { scheduledStartAt, scheduledEndAt }
        })
        .filter(Boolean) as WaterCycleOrderScheduleSegment[]
    : []

  const instruments = Array.isArray(dto.instruments)
    ? dto.instruments.map((item, index) => ({
        id: `water-ins-${dto.id}-${item.id ?? index}`,
        dbId: item.id,
        name: item.instrument_name || dto.device_name || `仪器${index + 1}`,
        sn: item.sn_numbers || dto.device_number || '-',
        quantity: item.quantity,
        scheduledStartAt: item.scheduled_start_at || null,
        scheduledEndAt: item.scheduled_end_at || null,
        status: item.instrument_status ?? (item.is_completed ? 2 : 0),
        completed: item.is_completed === true || item.instrument_status === 2,
        completedAt: item.completed_at || null,
      }))
    : []

  return {
    id: String(dto.id),
    dbId: dto.id,
    taskNumber: dto.task_number,
    applicant: dto.applicant,
    scheduledStartAt: dto.scheduled_start_at || null,
    scheduledEndAt: dto.scheduled_end_at || null,
    scheduleSegments,
    deviceName: dto.device_name,
    deviceNumber: dto.device_number,
    flowProcess: dto.flow_process,
    testPlatform: dto.test_platform,
    testDate: dto.test_date,
    startTime: dto.start_time,
    endTime: dto.end_time,
    needPressureTest: dto.need_pressure_test,
    needCommandTransfer: dto.need_command_transfer,
    remark: dto.remark,
    status: dto.status,
    statusText: dto.status_text,
    instruments,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export type WaterCycleOrderListResponse = {
  code: number
  data: {
    list: WaterCycleOrderDTO[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export type ListWaterCycleOrdersParams = {
  page?: number
  pageSize?: number
  taskNumber?: string
  status?: number | string
  statuses?: Array<number | string>
}

export async function listWaterCycleOrders(
  params: ListWaterCycleOrdersParams
): Promise<ApiResponse<WaterCycleOrderListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.taskNumber) query.taskNumber = params.taskNumber
  if (params.status !== undefined) query.status = String(params.status)
  if (params.statuses?.length) query.statuses = params.statuses.join(',')
  return http.get<WaterCycleOrderListResponse>('/test/water-cycle/order/list/', {}, query)
}

export type WaterCycleOrderWriteResponse = {
  code: number
  msg?: string
  data?: WaterCycleOrderDTO
}

export type UpdateWaterCycleOrderBody = Partial<
  Pick<
    WaterCycleOrderDTO,
    | 'test_platform'
    | 'test_date'
    | 'start_time'
    | 'end_time'
    | 'device_name'
    | 'device_number'
    | 'task_number'
    | 'flow_process'
    | 'need_pressure_test'
    | 'need_command_transfer'
    | 'applicant'
    | 'remark'
    | 'status'
  >
> & {
  running_instrument_ids?: number[]
}

export async function updateWaterCycleOrder(
  orderId: number,
  data: UpdateWaterCycleOrderBody,
  headers?: Record<string, string>
): Promise<ApiResponse<WaterCycleOrderWriteResponse>> {
  return http.put<WaterCycleOrderWriteResponse>(`/test/water-cycle/order/detail/${orderId}/`, data, headers)
}

export type WaterCycleOrderScheduleBody = {
  scheduled_start_at: string
  scheduled_end_at: string
  schedule_segments?: Array<{
    scheduled_start_at: string
    scheduled_end_at: string
  }>
}

export async function saveWaterCycleOrderSchedule(
  orderId: number,
  data: WaterCycleOrderScheduleBody,
  headers?: Record<string, string>
): Promise<ApiResponse<WaterCycleOrderWriteResponse>> {
  return http.post<WaterCycleOrderWriteResponse>(`/test/water-cycle/order/schedule/${orderId}/`, data, headers)
}

export async function clearWaterCycleOrderSchedule(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<WaterCycleOrderWriteResponse>> {
  return http.delete<WaterCycleOrderWriteResponse>(`/test/water-cycle/order/schedule/${orderId}/`, headers)
}

export type FinishWaterCycleOrderBody = {
  completed_instrument_ids?: number[]
  instrument_sns?: string[]
}

export type FinishWaterCycleOrderResponse = {
  code: number
  msg?: string
  data?: {
    order_id?: number
    before_status?: number
    after_status?: number
    completed_instrument_ids?: number[]
    remaining_count?: number
  }
}

export async function finishWaterCycleOrder(
  orderId: number,
  data: FinishWaterCycleOrderBody,
  headers?: Record<string, string>
): Promise<ApiResponse<FinishWaterCycleOrderResponse>> {
  return http.post<FinishWaterCycleOrderResponse>(`/test/water-cycle/order/finish/${orderId}/`, data, headers)
}
