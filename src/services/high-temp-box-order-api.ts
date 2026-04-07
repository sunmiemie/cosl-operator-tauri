import { http, type ApiResponse } from './http'

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
  created_at: string
  updated_at: string
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
  data: UpdateHighTempBoxOrderBody
): Promise<ApiResponse<HighTempBoxOrderWriteResponse>> {
  return http.put<HighTempBoxOrderWriteResponse>(`/test/high-temp-box/order/detail/${orderId}/`, data)
}
