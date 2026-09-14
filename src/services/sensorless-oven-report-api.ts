import { http, type ApiResponse } from './http'
import type {
  EquipmentReportPayload,
  EquipmentReportUploadFile,
  EquipmentReportMutationResponse,
} from './equipment-report-api'

export type {
  EquipmentReportPayload,
  EquipmentReportUploadFile,
} from './equipment-report-api'

/**
 * 提交无感烘箱测试报告（multipart：payload JSON + 曲线/签名图片）。
 * 服务端会将图片存到本地，写入报告记录，并把关联工单状态置为待审核。
 */
export function createSensorlessOvenReportWithFiles(
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
    '/test/sensorless-oven/report/create/',
    formData,
    headers
  )
}
