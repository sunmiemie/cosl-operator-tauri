import { http, type ApiResponse } from './http'

export interface SimulatedWellReportItem {
  id: number
  report_no: string
  task_number: string
  test_date: string
  tester: string
  status: number
  status_text?: string
  submit_time: string
  audit_time?: string | null
  remark?: string | null
}

export interface SimulatedWellReportListResponse {
  code: number
  data: {
    list: SimulatedWellReportItem[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export interface ListSimulatedWellReportsParams {
  page?: number
  pageSize?: number
  taskNumber?: string
  tester?: string
}

export async function listSimulatedWellReports(
  params: ListSimulatedWellReportsParams,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellReportListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.taskNumber) query.taskNumber = params.taskNumber
  if (params.tester) query.tester = params.tester

  return http.get<SimulatedWellReportListResponse>(
    '/test/simulated-well/report/list/',
    headers,
    query
  )
}

export interface CreateSimulatedWellReportPayload {
  report_no: string
  task_number: string
  test_date: string
  tester: string
  status?: number
  remark?: string
}

export interface SimulatedWellReportMutationResponse {
  code: number
  msg?: string
  data?: SimulatedWellReportItem
  errors?: Record<string, unknown>
}

export async function createSimulatedWellReport(
  payload: CreateSimulatedWellReportPayload,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellReportMutationResponse>> {
  return http.post<SimulatedWellReportMutationResponse>(
    '/test/simulated-well/report/create/',
    payload,
    headers
  )
}

export async function updateSimulatedWellReport(
  id: number,
  payload: Partial<CreateSimulatedWellReportPayload>,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellReportMutationResponse>> {
  return http.put<SimulatedWellReportMutationResponse>(
    `/test/simulated-well/report/detail/${id}/`,
    payload,
    headers
  )
}

export interface SimulatedWellReportDetailResponse {
  code: number
  data: SimulatedWellReportItem
  msg?: string
}

export async function getSimulatedWellReportDetail(
  id: number,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellReportDetailResponse>> {
  return http.get<SimulatedWellReportDetailResponse>(
    `/test/simulated-well/report/detail/${id}/`,
    headers
  )
}

export interface DeleteSimulatedWellReportResponse {
  code: number
  msg?: string
}

export async function deleteSimulatedWellReport(
  id: number,
  headers?: Record<string, string>
): Promise<ApiResponse<DeleteSimulatedWellReportResponse>> {
  return http.delete<DeleteSimulatedWellReportResponse>(
    `/test/simulated-well/report/detail/${id}/`,
    headers
  )
}
