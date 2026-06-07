import { http, type ApiResponse } from './http'

export type EquipmentReportResult = 'pass' | 'fail' | 'pending'

export interface EquipmentInstrumentReportResult {
  order_id?: number
  order_no?: string
  instrument_id?: number | string
  instrument_name: string
  instrument_sn: string
  result: EquipmentReportResult
  result_text?: string
  observation?: string
  metrics?: Record<string, unknown>
  attachments?: Array<Record<string, unknown>>
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
  attachments?: Array<Record<string, unknown>>
  remark?: string
  client_submit_id: string
}

export interface EquipmentReportItem extends EquipmentReportPayload {
  id: number
  report_no: string
  status: number
  status_text?: string
  submit_time?: string
  audit_time?: string | null
  reviewer_id?: number | null
}

export interface EquipmentReportMutationResponse {
  code: number
  msg?: string
  data?: EquipmentReportItem
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
  attachments?: Array<Record<string, unknown>>
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
