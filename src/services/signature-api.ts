import { http, type ApiResponse } from './http'

export interface UserSignatureInfo {
  userId: number
  username: string
  nickname?: string | null
  hasSignature: boolean
  signatureId?: number | null
  originalFilename?: string | null
  mimeType?: string | null
  fileSize?: number
  imageUrl?: string | null
}

interface UserSignatureResponse {
  code: number
  msg?: string
  data: UserSignatureInfo
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
