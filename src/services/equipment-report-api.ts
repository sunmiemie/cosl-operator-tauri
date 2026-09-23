import { http, type ApiResponse } from './http'

export type EquipmentReportResult = 'pass' | 'fail' | 'pending'

export interface EquipmentReportAttachment {
  [key: string]: unknown
  field?: string
  type?: string
  name?: string
  file_name?: string
  file_url?: string
  content_type?: string
  curve_index?: number
  curve_title?: string
  curve_range?: Record<string, unknown>
}

export interface EquipmentInstrumentReportResult {
  order_id?: number
  order_no?: string
  instrument_id?: number | string
  instrument_name: string
  instrument_sn: string
  equipment_id?: string
  result: EquipmentReportResult
  result_text?: string
  observation?: string
  metrics?: Record<string, unknown>
  attachments?: EquipmentReportAttachment[]
  curve_attachment_field?: string
  report_json?: Record<string, unknown>
  remark?: string
}

export interface EquipmentReportPayload {
  report_no?: string
  task_number: string
  test_date: string
  tester: string
  status?: number
  overall_result?: EquipmentReportResult
  order_ids: number[]
  order_numbers: string[]
  instrument_results: EquipmentInstrumentReportResult[]
  report_json?: Record<string, unknown>
  attachments?: EquipmentReportAttachment[]
  remark?: string
  client_submit_id: string
}

export interface EquipmentReportItem extends EquipmentReportPayload {
  display_order_numbers?: string[]
  id: number
  report_no: string
  status: number
  status_text?: string
  submit_time?: string
  audit_time?: string | null
  reviewer_id?: number | null
  batch_submit_id?: string
  order?: number | null
  instrument?: number | null
  instrument_name?: string
  instrument_sn?: string
  equipment_id?: string
  attempt_no?: number
  is_current?: boolean
  assistantSync?: {
    success?: boolean
    deferred?: boolean
    error?: string
    failed?: number
  }
}

export interface EquipmentReportBatchItem {
  batch_submit_id: string
  report_no: string
  reports: EquipmentReportItem[]
  assistantSync?: EquipmentReportItem['assistantSync'] & {
    list?: Array<Record<string, unknown>>
  }
}

export interface EquipmentReportListResponse {
  code: number
  data: {
    list: EquipmentReportItem[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export interface ListEquipmentReportsParams {
  page?: number
  pageSize?: number
  taskNumber?: string
  tester?: string
  status?: number | string
}

export interface EquipmentReportDetailResponse {
  code: number
  data: EquipmentReportItem
  msg?: string
}

export interface EquipmentReportMutationResponse {
  code: number
  msg?: string
  data?: EquipmentReportItem | EquipmentReportBatchItem
  errors?: Record<string, unknown>
}

export interface EquipmentReportUploadFile {
  fieldName: string
  fileName: string
  blob: Blob
}

export interface VibrationTablePreExperimentPayload {
  order_id: number
  order_number?: string
  tester?: string
  summary: Record<string, unknown>
  records: Array<Record<string, unknown>>
  attachments?: EquipmentReportAttachment[]
  export_dir?: string
  client_submit_id: string
}

export interface VibrationTablePreExperimentItem extends VibrationTablePreExperimentPayload {
  id: number
  order: number
  experiment_no: number
  created_at?: string
  updated_at?: string
}

export interface VibrationTablePreExperimentMutationResponse {
  code: number
  msg?: string
  data?: VibrationTablePreExperimentItem
}

export function createHighTempPressureReport(
  payload: EquipmentReportPayload,
  headers?: Record<string, string>
): Promise<ApiResponse<EquipmentReportMutationResponse>> {
  return http.post<EquipmentReportMutationResponse>(
    '/test/high-temp-pressure/report/create/',
    payload,
    headers
  )
}

export function createHighTempPressureReportWithFiles(
  payload: EquipmentReportPayload,
  files: EquipmentReportUploadFile[],
  headers?: Record<string, string>
): Promise<ApiResponse<EquipmentReportMutationResponse>> {
  const formData = new FormData()
  formData.append('payload', JSON.stringify(payload))
  files.forEach((file) => {
    formData.append(file.fieldName, file.blob, file.fileName)
  })
  return http.postFormData<EquipmentReportMutationResponse>(
    '/test/high-temp-pressure/report/create/',
    formData,
    headers
  )
}

export function listHighTempPressureReports(
  params: ListEquipmentReportsParams = {},
  headers?: Record<string, string>
): Promise<ApiResponse<EquipmentReportListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.taskNumber) query.taskNumber = params.taskNumber
  if (params.tester) query.tester = params.tester
  if (params.status !== undefined && params.status !== '') query.status = String(params.status)
  return http.get<EquipmentReportListResponse>(
    '/test/high-temp-pressure/report/list/',
    headers,
    query
  )
}

export function getHighTempPressureReportDetail(
  id: number,
  headers?: Record<string, string>
): Promise<ApiResponse<EquipmentReportDetailResponse>> {
  return http.get<EquipmentReportDetailResponse>(
    `/test/high-temp-pressure/report/detail/${id}/`,
    headers
  )
}

export function downloadHighTempPressureReportPdf(
  id: number,
  headers?: Record<string, string>
): Promise<ApiResponse<ArrayBuffer>> {
  return http.downloadFile(
    `/test/high-temp-pressure/report/download/${id}/`,
    undefined,
    headers
  )
}

export function createVibrationTableReport(
  payload: EquipmentReportPayload,
  headers?: Record<string, string>
): Promise<ApiResponse<EquipmentReportMutationResponse>> {
  return http.post<EquipmentReportMutationResponse>(
    '/test/vibration-table/report/create/',
    payload,
    headers
  )
}

export function createVibrationTableReportWithFiles(
  payload: EquipmentReportPayload,
  files: EquipmentReportUploadFile[],
  headers?: Record<string, string>
): Promise<ApiResponse<EquipmentReportMutationResponse>> {
  const formData = new FormData()
  formData.append('payload', JSON.stringify(payload))
  files.forEach((file) => {
    formData.append(file.fieldName, file.blob, file.fileName)
  })
  return http.postFormData<EquipmentReportMutationResponse>(
    '/test/vibration-table/report/create/',
    formData,
    headers
  )
}

export function createVibrationTablePreExperiment(
  payload: VibrationTablePreExperimentPayload,
  files: EquipmentReportUploadFile[],
  headers?: Record<string, string>
): Promise<ApiResponse<VibrationTablePreExperimentMutationResponse>> {
  const formData = new FormData()
  formData.append('payload', JSON.stringify(payload))
  files.forEach((file) => {
    formData.append(file.fieldName, file.blob, file.fileName)
  })
  return http.postFormData<VibrationTablePreExperimentMutationResponse>(
    '/test/vibration-table/pre-experiment/create/',
    formData,
    headers
  )
}
