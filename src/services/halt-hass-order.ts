/**
 * HALT-HASS 工单和报告 API 服务
 * 提供与 cnooc-backend 的 HALT-HASS 测试工单和报告相关接口对接
 */
import { http, type ApiResponse } from './http'
import type {
  HaltHassOrder,
  HaltHassReport,
  HaltHassReportJson,
  HaltHassTempData,
  ScannedBoard,
} from '@/views/halt-hass-test/types'
import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'

export type HaltHassOrderDTO = Record<string, any>

export type HaltHassOrderListResponse = {
  code: number
  data: {
    list: HaltHassOrderDTO[]
    total: number
    page: number
    pageSize: number
  }
  msg?: string
}

export type ListHaltHassOrdersParams = {
  page?: number
  pageSize?: number
  orderNo?: string
  status?: number | string
}

export type HaltHassOrderWriteResponse = {
  code: number
  msg?: string
  data?: HaltHassOrderDTO
}

export type HaltHassOrderScheduleBody = {
  scheduled_start_at: string
  scheduled_end_at: string
}

function normalizeScannedBoards(value: unknown): ScannedBoard[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => ({
    serial: String(item?.serial || item?.sn || ''),
    boardModelId: item?.board_model_id ?? item?.boardModelId,
    boardModelName: item?.board_model_name || item?.boardModelName,
    scannedAt: item?.scanned_at || item?.scannedAt ? new Date(item.scanned_at || item.scannedAt) : new Date(),
  }))
}

export function mapHaltHassOrder(dto: HaltHassOrderDTO): HaltHassOrder {
  const boardGroup = dto.board_group || dto.boardGroup || {}
  const process = dto.process || dto.process_info || dto.processInfo || {}
  const scannedBoards = normalizeScannedBoards(dto.scanned_boards || dto.scannedBoards)
  const orderNo = String(dto.order_no || dto.orderNo || dto.task_number || dto.taskNumber || dto.id || '')

  return {
    id: Number(dto.id),
    orderNo,
    status: Number(dto.status ?? 0),
    boardCount: Number(dto.board_count ?? dto.boardCount ?? scannedBoards.length ?? 0),
    boardGroup: {
      id: Number(boardGroup.id ?? dto.board_group_id ?? dto.boardGroupId ?? 0),
      name: String(boardGroup.name || dto.board_group_name || dto.boardGroupName || '-'),
      boards: Array.isArray(boardGroup.boards) ? boardGroup.boards : [],
    },
    process: {
      id: Number(process.id ?? dto.process_id ?? dto.processId ?? 0),
      name: String(process.name || dto.process_name || dto.processName || '-'),
      version: String(process.version || dto.process_version || dto.processVersion || ''),
    },
    scannedBoards,
    feedbackReason: String(dto.feedback_reason || dto.feedbackReason || ''),
    remark: String(dto.remark || ''),
    createdAt: String(dto.created_at || dto.createdAt || ''),
    startedAt: dto.started_at || dto.startedAt,
    completedAt: dto.completed_at || dto.completedAt,
    scheduledStartAt: dto.scheduled_start_at || dto.scheduledStartAt || null,
    scheduledEndAt: dto.scheduled_end_at || dto.scheduledEndAt || null,
  }
}

// ==================== 工单 API ====================

/**
 * 通过序列号查询工单
 * 扫码枪扫描后调用此接口获取工单信息
 */
export async function getOrderBySerial(
  serial: string
): Promise<ApiResponse<HaltHassOrder[]>> {
  return http.get<HaltHassOrder[]>('/test/halt-hass/order/by-serial/', {}, { serial })
}

/**
 * 获取 HALT-HASS 工单列表
 */
export async function listHaltHassOrders(
  params: ListHaltHassOrdersParams
): Promise<ApiResponse<HaltHassOrderListResponse>> {
  const query: Record<string, string> = {}
  if (params.page !== undefined) query.page = String(params.page)
  if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
  if (params.orderNo) query.orderNo = params.orderNo
  if (params.status !== undefined) query.status = String(params.status)
  return http.get<HaltHassOrderListResponse>('/test/halt-hass/order/list/', {}, query)
}

/**
 * 获取工单详情
 */
export async function getOrderDetail(
  orderId: number
): Promise<ApiResponse<HaltHassOrder>> {
  return http.get<HaltHassOrder>(`/test/halt-hass/order/detail/${orderId}/`)
}

/**
 * 开始测试（领取工单）
 * 提交所有扫描的电路板序列号，正式开始测试
 */
export async function startOrder(
  orderId: number,
  data: {
    operatorId: number
    boardSerials: string[]
  }
): Promise<ApiResponse<{ success: boolean }>> {
  return http.post<{ success: boolean }>(
    `/test/halt-hass/order/start/${orderId}/`,
    {
      operator_id: data.operatorId,
      board_serials: data.boardSerials,
    }
  )
}

/**
 * 保存 HALT-HASS 工单排程
 */
export async function saveHaltHassOrderSchedule(
  orderId: number,
  data: HaltHassOrderScheduleBody,
  headers?: Record<string, string>
): Promise<ApiResponse<HaltHassOrderWriteResponse>> {
  return http.post<HaltHassOrderWriteResponse>(
    `/test/halt-hass/order/schedule/${orderId}/`,
    data,
    headers
  )
}

/**
 * 清除 HALT-HASS 工单排程
 */
export async function clearHaltHassOrderSchedule(
  orderId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<HaltHassOrderWriteResponse>> {
  return http.delete<HaltHassOrderWriteResponse>(
    `/test/halt-hass/order/schedule/${orderId}/`,
    headers
  )
}

/**
 * 上传临时数据（暂存）
 */
export async function uploadTempData(
  orderId: number,
  data: HaltHassTempData
): Promise<ApiResponse<{ success: boolean }>> {
  return http.post<{ success: boolean }>(
    `/test/halt-hass/order/temp/upload/${orderId}/`,
    { data_json: data }
  )
}

/**
 * 下载临时数据（恢复暂存）
 */
export async function downloadTempData(
  orderId: number
): Promise<ApiResponse<HaltHassTempData>> {
  return http.get<HaltHassTempData>(`/test/halt-hass/order/temp/download/${orderId}/`)
}

/**
 * 下载反馈数据（审核打回后的数据）
 */
export async function downloadFeedbackData(
  orderId: number
): Promise<ApiResponse<{
  report: HaltHassReport
  comment: string
}>> {
  return http.get<{
    report: HaltHassReport
    comment: string
  }>(`/test/halt-hass/order/feedback/download/${orderId}/`)
}

/**
 * 下载工艺数据
 * 根据工单关联的工艺 ID 获取完整工艺 JSON
 */
export async function downloadProcessData(
  processId: number
): Promise<ApiResponse<HaltHassProcessJson>> {
  return http.get<HaltHassProcessJson>(`/test/halt-hass/process/${processId}/`)
}

// ==================== 报告 API ====================

/**
 * 上传测试报告
 */
export async function uploadReport(data: {
  orderId: number
  reportJson: HaltHassReportJson
  result: number  // 1=正常, 2=异常, 3=疑问
  operatorId: number
  remark?: string
}): Promise<ApiResponse<{ id: number }>> {
  return http.post<{ id: number }>('/test/halt-hass/report/upload/', {
    order_id: data.orderId,
    report_json: data.reportJson,
    result: data.result,
    operator_id: data.operatorId,
    remark: data.remark || '',
  })
}

/**
 * 获取报告详情
 */
export async function getReportDetail(
  reportId: number
): Promise<ApiResponse<HaltHassReport>> {
  return http.get<HaltHassReport>(`/test/halt-hass/report/detail/${reportId}/`)
}

// ==================== 辅助函数 ====================

/**
 * 验证序列号是否属于指定电路板组
 * 本地验证，不调用 API
 */
export function validateSerialBelongsToGroup(
  serial: string,
  order: HaltHassOrder
): { valid: boolean; boardModel?: { id: number; name: string } } {
  // 简单验证：检查序列号前缀是否匹配电路板组中的任一型号
  // 实际逻辑可能需要根据具体业务规则调整
  const boards = order.boardGroup.boards

  for (const board of boards) {
    // 假设序列号格式为：型号代码-序号，如 "BM001-00123"
    if (board.code && serial.toUpperCase().startsWith(board.code.toUpperCase())) {
      return { valid: true, boardModel: { id: board.id, name: board.name } }
    }
  }

  // 如果没有明确的型号代码匹配，返回 true 但不指定具体型号
  // 实际场景中可能需要更严格的验证
  return { valid: true }
}

/**
 * 检查是否已扫描完所有电路板
 */
export function isAllBoardsScanned(
  scannedBoards: ScannedBoard[],
  requiredCount: number
): boolean {
  // 必须有要求数量且已扫描数量达到要求
  return requiredCount > 0 && scannedBoards.length >= requiredCount
}

/**
 * 检查序列号是否已扫描
 */
export function isSerialAlreadyScanned(
  serial: string,
  scannedBoards: ScannedBoard[]
): boolean {
  return scannedBoards.some(
    board => board.serial.toUpperCase() === serial.toUpperCase()
  )
}

/**
 * 构建报告 JSON
 */
export function buildReportJson(params: {
  orderId: number
  orderNo: string
  boards: ScannedBoard[]
  startTime: Date
  endTime: Date
  flowchartResult: HaltHassReportJson['flowchartResult']
  testData?: Record<string, unknown>
  remark?: string
}): HaltHassReportJson {
  const duration = Math.floor((params.endTime.getTime() - params.startTime.getTime()) / 1000)

  return {
    orderId: params.orderId,
    orderNo: params.orderNo,
    startTime: params.startTime.toISOString(),
    endTime: params.endTime.toISOString(),
    duration,
    boards: params.boards,
    flowchartResult: params.flowchartResult,
    testData: params.testData,
    remark: params.remark,
  }
}
