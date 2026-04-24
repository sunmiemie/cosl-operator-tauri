import { http, type ApiResponse } from './http'

export interface SimulatedWellReportTemplateListItem {
  id: number
  report_no: string
  report_name: string
  configured: boolean
  field_count: number
  updated_at: string
}

export interface SimulatedWellReportTemplateListResponse {
  code: number
  data: {
    list: SimulatedWellReportTemplateListItem[]
    total: number
    currentPage: number
    pageSize: number
  }
  msg?: string
}

export interface SimulatedWellReportTemplateDetail {
  id: number
  report_no: string
  report_name: string
  test_products: any[]
  match_instruments: any[]
  test_items: any[]
  evaluation_standards: any[]
  updated_at: string
}

export interface SimulatedWellReportTemplateDetailResponse {
  code: number
  data: SimulatedWellReportTemplateDetail
  msg?: string
}

export async function listSimulatedWellReportTemplates(
  params: { keyword?: string; currentPage?: number; pageSize?: number } = {},
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellReportTemplateListResponse>> {
  const query: Record<string, string> = {}
  if (params.keyword) query.keyword = params.keyword
  if (params.currentPage !== undefined) query.currentPage = String(params.currentPage)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)

  return http.get<SimulatedWellReportTemplateListResponse>(
    '/data/simulated-well-report-template/list',
    headers,
    query
  )
}

export async function getSimulatedWellReportTemplateDetail(
  id: number,
  headers?: Record<string, string>
): Promise<ApiResponse<SimulatedWellReportTemplateDetailResponse>> {
  return http.get<SimulatedWellReportTemplateDetailResponse>(
    `/data/simulated-well-report-template/detail/${id}/`,
    headers
  )
}
