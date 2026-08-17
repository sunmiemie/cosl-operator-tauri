import { http, type ApiResponse } from './http'
import type { EquipmentReportUploadFile } from './equipment-report-api'

export interface UserSignatureInfo {
  userId: number
  username: string
  nickname?: string | null
  hasSignature: boolean
  signatureId?: number | null
  originalFilename?: string | null
  mimeType?: string | null
  fileSize?: number
  sha256?: string | null
  imageUrl?: string | null
}

export type CurrentUserSignatureInfo = UserSignatureInfo

interface UserSignatureResponse {
  code: number
  msg?: string
  data?: UserSignatureInfo
}

export interface CurrentUserReportSignature {
  info: CurrentUserSignatureInfo
  file: EquipmentReportUploadFile
  previewBlob: Blob
}

export function getMySignature(
  headers?: Record<string, string>
): Promise<ApiResponse<UserSignatureResponse>> {
  return http.get<UserSignatureResponse>('/data/signature/me', headers)
}

export function getSignatureImage(
  userId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<ArrayBuffer>> {
  return http.downloadFile(`/data/signature/users/${userId}/image`, undefined, headers)
}

export function getSignatureDisplayName(info: CurrentUserSignatureInfo) {
  return String(info.nickname || info.username || '').trim()
}

export async function loadCurrentUserReportSignature(
  headers?: Record<string, string>
): Promise<CurrentUserReportSignature> {
  const infoResponse = await getMySignature(headers)
  const info = infoResponse.data?.data
  if (!infoResponse.success || infoResponse.data?.code !== 0 || !info) {
    throw new Error(infoResponse.data?.msg || infoResponse.error || '读取当前测试人电子签名失败')
  }
  if (!info.hasSignature || !info.signatureId || !info.imageUrl) {
    throw new Error('当前测试人未配置电子签名，请先在管理端维护个人电子签名')
  }

  const imageResponse = await getSignatureImage(info.userId, headers)
  if (!imageResponse.success || !imageResponse.data) {
    throw new Error(imageResponse.error || '下载当前测试人电子签名失败')
  }

  const mimeType = info.mimeType || 'image/png'
  const previewBlob = new Blob([imageResponse.data], { type: mimeType })
  const fallbackExtension = mimeType === 'image/jpeg' || mimeType === 'image/jpg'
    ? 'jpg'
    : mimeType === 'image/webp'
      ? 'webp'
      : 'png'
  return {
    info,
    previewBlob,
    file: {
      fieldName: 'tester_signature',
      fileName: info.originalFilename || `tester-signature-${info.userId}.${fallbackExtension}`,
      blob: previewBlob,
    },
  }
}
