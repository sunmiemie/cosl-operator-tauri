import { http, type ApiResponse } from './http'

export interface WellCommConfigDto {
  device_role: string
  vid?: string
  pid?: string
  adapter_serial?: string
  baud_rate?: number
  transport?: 'lan' | 'serial'
  host?: string
  port?: number
}

export interface CalibrationWorkOrderDTO {
  id: number
  task_number: string
  instrument_model_id: number
  instrument_model_name: string
  serial_number: string
  tester_id: number | null
  tester_name: string
  location: string
  calibration_device: string
  hi_well_id: number
  lo_well_id: number
  hi_well_no: string
  lo_well_no: string
  hi_well_api: string | number | null
  lo_well_api: string | number | null
  plan_date: string | null
  kc: string | number | null
  hi_well_ref_min?: string | number | null
  hi_well_ref_max?: string | number | null
  hi_well_ka_min?: string | number | null
  hi_well_ka_max?: string | number | null
  hi_well_ba_limit?: string | number | null
  lo_well_ref_min?: string | number | null
  lo_well_ref_max?: string | number | null
  lo_well_kb_min?: string | number | null
  lo_well_kb_max?: string | number | null
  lo_well_bb_limit?: string | number | null
  dual_sensor?: boolean
  hi_well_comm_configs?: WellCommConfigDto[]
  lo_well_comm_configs?: WellCommConfigDto[]
  hi_well_data_source?: 'mock' | 'live'
  lo_well_data_source?: 'mock' | 'live'
  status: number
  status_text?: string
  remark?: string
  scheduled_start_at?: string | null
  scheduled_end_at?: string | null
  schedule_segments?: Array<{
    scheduled_start_at?: string | null
    scheduled_end_at?: string | null
  }>
  created_at?: string
  updated_at?: string
}

export interface CalibrationWorkOrderListResponse {
  code: number
  msg?: string
  data: {
    list: CalibrationWorkOrderDTO[]
    total: number
    page: number
    pageSize: number
  }
}

export interface ListCalibrationWorkOrdersParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: number | string
}

export type CalibrationOrderScheduleBody = {
  scheduled_start_at: string
  scheduled_end_at: string
  schedule_segments?: Array<{
    scheduled_start_at: string
    scheduled_end_at: string
  }>
}

export type CalibrationOrderScheduleResponse = {
  code: number
  msg?: string
  data?: {
    scheduledStartAt?: string | null
    scheduledEndAt?: string | null
    scheduleSegments?: Array<{
      scheduledStartAt?: string | null
      scheduledEndAt?: string | null
    }>
  }
}

export async function getCalibrationOrderDetail(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<{ code: number; data: CalibrationWorkOrderDTO; msg?: string }>> {
  return http.get<{ code: number; data: CalibrationWorkOrderDTO; msg?: string }>(
    `/test/calibration-well/order/detail/${orderId}/`,
    headers
  )
}

export async function listCalibrationWorkOrders(
  params: ListCalibrationWorkOrdersParams,
  headers?: Record<string, string>
): Promise<ApiResponse<CalibrationWorkOrderListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.keyword) query.keyword = params.keyword
  if (params.status !== undefined) query.status = String(params.status)

  return http.get<CalibrationWorkOrderListResponse>(
    '/test/calibration-well/order/list/',
    headers,
    query
  )
}

export async function saveCalibrationOrderSchedule(
  orderId: number,
  data: CalibrationOrderScheduleBody,
  headers?: Record<string, string>
): Promise<ApiResponse<CalibrationOrderScheduleResponse>> {
  return http.post<CalibrationOrderScheduleResponse>(
    `/test/calibration-well/order/schedule/${orderId}/`,
    data,
    headers
  )
}

export async function clearCalibrationOrderSchedule(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<CalibrationOrderScheduleResponse>> {
  return http.delete<CalibrationOrderScheduleResponse>(
    `/test/calibration-well/order/schedule/${orderId}/`,
    headers
  )
}

export interface CalibrationReportDTO {
  id: number
  report_no: string
  order_id: number
  task_number: string
  serial_number: string
  tester_name: string
  test_date: string | null
  status: number
  status_text?: string
  report_json: {
    appendixA?: Record<string, unknown>
    appendixB?: Record<string, unknown>
    appendixC?: Record<string, unknown>
    calibrationSummary?: string
  }
  kc: string | number | null
  submit_time?: string | null
  audit_time?: string | null
  reviewer_id?: number | null
  review_remark?: string
  client_submit_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface CalibrationReportListResponse {
  code: number
  msg?: string
  data: {
    list: CalibrationReportDTO[]
    total: number
    page: number
    pageSize: number
  }
}

export type CalibrationReportPayload = {
  orderId: number
  reportJson?: Record<string, unknown>
  kc?: number | null
  testDate?: string
  testerName?: string
  serialNumber?: string
  clientSubmitId?: string
}

export async function listCalibrationReports(
  params: {
    page?: number
    pageSize?: number
    keyword?: string
    status?: number
    testerId?: number
  },
  headers?: Record<string, string>
): Promise<ApiResponse<CalibrationReportListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.keyword) query.keyword = params.keyword
  if (params.status !== undefined) query.status = String(params.status)
  if (params.testerId !== undefined) query.testerId = String(params.testerId)

  return http.get<CalibrationReportListResponse>(
    '/test/calibration-well/report/list/',
    headers,
    query
  )
}

export async function getCalibrationReportByOrder(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<{ code: number; data: CalibrationReportDTO | null; msg?: string }>> {
  return http.get<{ code: number; data: CalibrationReportDTO | null; msg?: string }>(
    `/test/calibration-well/report/by-order/${orderId}/`,
    headers
  )
}

export async function getCalibrationReportDetail(
  reportId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<{ code: number; data: CalibrationReportDTO; msg?: string }>> {
  return http.get<{ code: number; data: CalibrationReportDTO; msg?: string }>(
    `/test/calibration-well/report/detail/${reportId}/`,
    headers
  )
}

export async function createCalibrationReport(
  data: CalibrationReportPayload,
  headers?: Record<string, string>
): Promise<ApiResponse<{ code: number; data: CalibrationReportDTO; msg?: string }>> {
  return http.post<{ code: number; data: CalibrationReportDTO; msg?: string }>(
    '/test/calibration-well/report/create/',
    data,
    headers
  )
}

export async function updateCalibrationReport(
  reportId: number,
  data: Partial<CalibrationReportPayload>,
  headers?: Record<string, string>
): Promise<ApiResponse<{ code: number; data: CalibrationReportDTO; msg?: string }>> {
  return http.post<{ code: number; data: CalibrationReportDTO; msg?: string }>(
    `/test/calibration-well/report/update/${reportId}/`,
    data,
    headers
  )
}

export async function submitCalibrationReport(
  reportId: number,
  data?: { clientSubmitId?: string },
  headers?: Record<string, string>
): Promise<ApiResponse<{ code: number; data: CalibrationReportDTO; msg?: string }>> {
  return http.post<{ code: number; data: CalibrationReportDTO; msg?: string }>(
    `/test/calibration-well/report/submit/${reportId}/`,
    data ?? {},
    headers
  )
}

export async function claimCalibrationOrder(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<{ code: number; data: CalibrationWorkOrderDTO; msg?: string }>> {
  return http.post<{ code: number; data: CalibrationWorkOrderDTO; msg?: string }>(
    `/test/calibration-well/order/claim/${orderId}/`,
    {},
    headers
  )
}

export async function completeCalibrationOrder(
  orderId: number,
  data: {
    kc: number
    hiMean?: number
    loMean?: number
    coefficients?: { ka?: number; kb?: number; ba?: number; bb?: number; bc?: number }
    calibrationSummary?: string
  },
  headers?: Record<string, string>
): Promise<ApiResponse<{ code: number; data: CalibrationWorkOrderDTO; msg?: string }>> {
  return http.post<{ code: number; data: CalibrationWorkOrderDTO; msg?: string }>(
    `/test/calibration-well/order/complete/${orderId}/`,
    data,
    headers
  )
}

export interface CalibrationHistoryDTO {
  id: number
  serial_number: string
  order_id: number
  ka: string | number | null
  kb: string | number | null
  kc: string | number | null
  ba: string | number | null
  bb: string | number | null
  bc: string | number | null
  hi_mean?: string | number | null
  lo_mean?: string | number | null
  status: string
  created_at?: string
}

export async function getCalibrationHistoryLast(
  serialNumber: string,
  headers?: Record<string, string>
): Promise<ApiResponse<{ code: number; data: CalibrationHistoryDTO | null; msg?: string }>> {
  return http.get<{ code: number; data: CalibrationHistoryDTO | null; msg?: string }>(
    '/test/calibration-well/history/last/',
    headers,
    { serialNumber }
  )
}
