/**
 * 水循环 工单 API 服务
 * 与后端 test_management 子系统接口一致，使用统一 http 客户端
 */
import { http } from './http'

export function configureWaterCycleApi(
  host: string,
  port: number,
  prefix: string = '/test_management',
  scheme: 'http' | 'https' = 'http'
) {
  const base = `${scheme}://${host}:${port}${prefix}`.replace(/\/+$/, '')
  http.setBaseUrl(base)
}

type ListParams = {
  currentPage?: number
  pageSize?: number
  taskNumber?: string
  status?: string
}

/**
 * 列表接口，返回后端原始结构（code/TableData/total）
 */
export async function listWaterCycleOrders(params: ListParams): Promise<{ code: number; TableData: any[]; total: number }> {
  const query: Record<string, string> = {}
  if (params.currentPage !== undefined) query.currentPage = String(params.currentPage)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.taskNumber) query.taskNumber = params.taskNumber
  if (params.status) query.status = params.status

  const result = await http.get<any>('/water-cycle/order/list/', {}, query)
  if (!result.success || !result.data) {
    return { code: 1, TableData: [], total: 0 }
  }
  return result.data as { code: number; TableData: any[]; total: number }
}