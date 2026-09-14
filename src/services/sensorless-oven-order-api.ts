import { http, type ApiResponse } from './http'

export type SensorlessOvenOrderDTO = {
  id: number
  task_number: string
  test_application_unit?: string
  project_name?: string
  applicant: string
  specification?: string
  instrument_name?: string
  sn_numbers?: string
  max_temperature?: number | null
  status: number
  status_text?: string
  scheduled_start_at?: string | null
  scheduled_end_at?: string | null
  created_at: string
  updated_at: string
}

export type SensorlessOvenOrderInstrument = {
  id: string
  dbId?: number
  name: string
  sn: string
  quantity?: number
  status?: number
  completed?: boolean
  completedAt?: string | null
}

export type SensorlessOvenOrder = {
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
  status: number
  statusText?: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  instruments: SensorlessOvenOrderInstrument[]
  createdAt: string
  updatedAt: string
}

function splitSnNumbers(value?: string): string[] {
  return String(value || '')
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function mapSensorlessOvenOrder(dto: SensorlessOvenOrderDTO): SensorlessOvenOrder {
  const sns = splitSnNumbers(dto.sn_numbers)
  const instrumentName = (dto.instrument_name || '').trim()
  const instruments = sns.length
    ? sns.map((sn, index) => ({
        id: `so-ins-${dto.id}-${index}`,
        name: instrumentName || `仪器${index + 1}`,
        sn,
        quantity: 1,
      }))
    : instrumentName
      ? [{
          id: `so-ins-${dto.id}-0`,
          name: instrumentName,
          sn: '-',
          quantity: 1,
        }]
      : []

  return {
    id: dto.task_number,
    dbId: dto.id,
    taskNumber: dto.task_number,
    applicant: dto.applicant,
    deviceName: instrumentName || dto.specification || '无感烘箱',
    deviceNumber: sns[0] || dto.task_number,
    targetTemp: dto.max_temperature ?? 0,
    duration: 0,
    testPlatform: '无感烘箱',
    testDate: dto.created_at,
    remark: dto.project_name || '',
    status: dto.status,
    statusText: dto.status_text,
    scheduledStartAt: dto.scheduled_start_at || null,
    scheduledEndAt: dto.scheduled_end_at || null,
    instruments,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export type SensorlessOvenOrderListResponse = {
  code: number
  data: {
    list: SensorlessOvenOrderDTO[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export type ListSensorlessOvenOrdersParams = {
  page?: number
  pageSize?: number
  taskNumber?: string
  applicant?: string
  keyword?: string
  status?: number | string
}

export async function listSensorlessOvenOrders(
  params: ListSensorlessOvenOrdersParams
): Promise<ApiResponse<SensorlessOvenOrderListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.taskNumber) query.taskNumber = params.taskNumber
  if (params.applicant) query.applicant = params.applicant
  if (params.keyword) query.keyword = params.keyword
  if (params.status !== undefined) query.status = String(params.status)
  return http.get<SensorlessOvenOrderListResponse>('/test/sensorless-oven/order/list/', {}, query)
}

export type SensorlessOvenOrderWriteResponse = {
  code: number
  msg?: string
  data?: SensorlessOvenOrderDTO
}

export type SensorlessOvenOrderScheduleBody = {
  scheduled_start_at: string
  scheduled_end_at: string
}

export async function saveSensorlessOvenOrderSchedule(
  orderId: number,
  data: SensorlessOvenOrderScheduleBody,
  headers?: Record<string, string>
): Promise<ApiResponse<SensorlessOvenOrderWriteResponse>> {
  return http.post<SensorlessOvenOrderWriteResponse>(
    `/test/sensorless-oven/order/schedule/${orderId}/`,
    data,
    headers
  )
}

export async function clearSensorlessOvenOrderSchedule(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<SensorlessOvenOrderWriteResponse>> {
  return http.delete<SensorlessOvenOrderWriteResponse>(
    `/test/sensorless-oven/order/schedule/${orderId}/`,
    headers
  )
}

export async function changeSensorlessOvenOrderStatus(
  orderId: number,
  status: number,
  headers?: Record<string, string>
): Promise<ApiResponse<SensorlessOvenOrderWriteResponse>> {
  return http.post<SensorlessOvenOrderWriteResponse>(
    `/test/sensorless-oven/order/status/${orderId}/`,
    { status },
    headers
  )
}
