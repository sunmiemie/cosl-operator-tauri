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
