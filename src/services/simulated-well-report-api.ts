import { http, type ApiResponse } from './http'
import { invoke } from '@tauri-apps/api/core'

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
  operator_user_id?: number | null
  operator_signature_url?: string | null
  monitor_csv_url?: string | null
  report_json?: Record<string, unknown>
  attachments?: Array<Record<string, unknown>>
  order_ids?: number[]
  order_numbers?: string[]
  instrument_results?: Array<{
    order_id: number
    device_id: number
    instrument_sn: string
  }>
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
  keyword?: string
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
  if (params.keyword) query.keyword = params.keyword
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
  instrument_results?: Array<{
    order_id: number
    device_id: number
    instrument_sn: string
  }>
  client_submit_id?: string | null
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

export interface SimulatedWellLocalUploadFile {
  path: string
  name: string
  size: number
  contentType?: string
  kind: 'curve_chart' | 'report_file' | 'operator_signature' | 'monitor_csv'
}

interface UploadSessionResponse {
  code: number
  msg?: string
  data?: {
    completed: boolean
    report?: SimulatedWellReportItem
    upload_id?: string
    chunk_size?: number
    files?: Array<{ id: string; name: string; size: number; kind: string }>
  }
}

interface RustChunkResponse {
  status: number
  body: string
}

export async function createSimulatedWellReportWithLargeFiles(
  payload: CreateSimulatedWellReportPayload,
  files: SimulatedWellLocalUploadFile[],
  headers: Record<string, string>,
  onSession?: (uploadId: string) => void,
  onSaving?: () => void,
): Promise<ApiResponse<SimulatedWellReportMutationResponse>> {
  const initialized = await http.post<UploadSessionResponse>(
    '/test/simulated-well/report/upload/init/',
    {
      payload,
      files: files.map((file) => ({
        kind: file.kind,
        name: file.name,
        size: file.size,
        content_type: file.contentType || '',
      })),
    },
    headers,
  )
  if (!initialized.success || initialized.data?.code !== 0 || !initialized.data.data) {
    return { success: false, error: initialized.error || initialized.data?.msg || '初始化上传失败', status: initialized.status }
  }
  if (initialized.data.data.completed && initialized.data.data.report) {
    return { success: true, data: { code: 0, msg: '报告已提交', data: initialized.data.data.report } }
  }

  const uploadId = initialized.data.data.upload_id
  const chunkSize = initialized.data.data.chunk_size
  const remoteFiles = initialized.data.data.files
  if (!uploadId || !chunkSize || !remoteFiles || remoteFiles.length !== files.length) {
    return { success: false, error: '上传会话返回数据不完整' }
  }
  onSession?.(uploadId)
  const totalUploadSize = files.reduce((total, file) => total + file.size, 0)
  let uploadedBefore = 0
  try {
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex]
      const remote = remoteFiles[fileIndex]
      for (let start = 0, index = 0; start < file.size; start += chunkSize, index += 1) {
        const length = Math.min(chunkSize, file.size - start)
        const url = http.buildUrl(`/test/simulated-well/report/upload/${uploadId}/files/${remote.id}/chunks/${index}/`)
        const response = await invoke<RustChunkResponse>('upload_simulated_well_file_chunk', {
          request: {
            uploadId,
            url,
            path: file.path,
            start,
            length,
            totalFileSize: file.size,
            fileName: file.name,
            uploadedBefore,
            totalUploadSize,
            headers,
          },
        })
        let body: { code?: number; msg?: string } = {}
        try { body = JSON.parse(response.body) } catch { /* 后续统一报告 HTTP 错误 */ }
        if (response.status < 200 || response.status >= 300 || body.code !== 0) {
          const responseDetail = response.body
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 300)
          throw new Error(
            body.msg
              || `上传分块失败（HTTP ${response.status}）${responseDetail ? `：${responseDetail}` : ''}`,
          )
        }
        uploadedBefore += length
      }
    }
    onSaving?.()
    const completed = await http.post<SimulatedWellReportMutationResponse>(
      `/test/simulated-well/report/upload/${uploadId}/complete/`,
      {},
      headers,
    )
    if (!completed.success || completed.data?.code !== 0) {
      throw new Error(completed.error || completed.data?.msg || '保存报告失败')
    }
    return completed
  } catch (error) {
    await http.delete(`/test/simulated-well/report/upload/${uploadId}/`, headers)
    return { success: false, error: error instanceof Error ? error.message : '上传失败' }
  }
}

export async function cancelSimulatedWellLargeUpload(uploadId: string, headers: Record<string, string>) {
  await invoke<boolean>('cancel_simulated_well_upload', { uploadId }).catch(() => false)
  return http.delete(`/test/simulated-well/report/upload/${uploadId}/`, headers)
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

export async function updateSimulatedWellReportWithSignature(
  id: number,
  payload: Partial<CreateSimulatedWellReportPayload>,
  signature: SimulatedWellReportUploadFile,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellReportMutationResponse>> {
  const formData = new FormData()
  formData.append('payload', JSON.stringify(payload))
  formData.append(signature.fieldName, signature.blob, signature.fileName)
  return http.putFormData<SimulatedWellReportMutationResponse>(
    `/test/simulated-well/report/detail/${id}/`,
    formData,
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
