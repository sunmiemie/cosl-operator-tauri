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
  reviewer_id?: number | null
  report_json?: Record<string, unknown>
  attachments?: Array<Record<string, unknown>>
  order_ids?: number[]
  order_numbers?: string[]
  client_submit_id?: string | null
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
  status?: number | string
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
  if (params.status !== undefined && params.status !== '') query.status = String(params.status)

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
  report_json?: Record<string, unknown>
  attachments?: Array<Record<string, unknown>>
  order_ids?: number[]
  order_numbers?: string[]
  client_submit_id?: string | null
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

export interface SimulatedWellReportUploadFile {
  fieldName: string
  fileName: string
  blob: Blob
}

export async function createSimulatedWellReportWithFiles(
  payload: CreateSimulatedWellReportPayload,
  files: SimulatedWellReportUploadFile[],
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellReportMutationResponse>> {
  const formData = new FormData()
  formData.append('payload', JSON.stringify(payload))
  files.forEach((file) => {
    formData.append(file.fieldName, file.blob, file.fileName)
  })
  return http.postFormData<SimulatedWellReportMutationResponse>(
    '/test/simulated-well/report/create/',
    formData,
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
