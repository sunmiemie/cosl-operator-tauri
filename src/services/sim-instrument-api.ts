import { http, type ApiResponse } from './http'

export interface SimInstrumentListItem {
  id: number
  sn: string
  name: string
  model_number: string
  used_count: number
  remain_count: number
  status: string
}

export interface ListSimInstrumentsParams {
  page?: number
  pageSize?: number
  sn?: string
  name?: string
  model_number?: string
  status?: string
}

export interface SimInstrumentListResponse {
  code: number
  data: {
    list: SimInstrumentListItem[]
    total: number
    currentPage: number
    pageSize: number
  }
  msg?: string
}

export async function listSimInstruments(
  params: ListSimInstrumentsParams = {},
  headers?: Record<string, string>
): Promise<ApiResponse<SimInstrumentListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.sn) query.sn = params.sn
  if (params.name) query.name = params.name
  if (params.model_number) query.model_number = params.model_number
  if (params.status) query.status = params.status

  return http.get<SimInstrumentListResponse>('/data/sim-instrument/list', headers, query)
}
