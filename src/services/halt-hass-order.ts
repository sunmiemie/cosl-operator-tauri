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
  OrderBoardSerial,
  OrderScheduleSegment,
  ScannedBoard,
} from '@/views/halt-hass-test/types'
import type {
  HaltHassFlowchart,
  HaltHassProcessJson,
} from '@/views/process-halt-hass/types'

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

export type HaltHassStartResult = {
  success: boolean
  startedAt?: string | null
  cycleCount?: number
  singleCycleDurationHours?: number
  totalCycleDurationHours?: number
  requiredRuntimeSeconds?: number
  elapsedRuntimeSeconds?: number
  remainingRuntimeSeconds?: number
  runtimeProgress?: number
  runtimeConfigured?: boolean
  runtimeCompleted?: boolean
  currentRunStartedAt?: string | null
}

type BackendEnvelope<T> = {
  code: number
  msg?: string
  data?: T
}

export type HaltHassOrderScheduleBody = {
  scheduled_start_at: string
  scheduled_end_at: string
}

function mapHaltHassRuntimeResult(
  runtime: HaltHassOrderDTO
): HaltHassStartResult {
  return {
    success: true,
    startedAt: runtime.started_at ?? runtime.startedAt ?? null,
    cycleCount: Number(runtime.cycle_count ?? runtime.cycleCount ?? 1),
    singleCycleDurationHours: Number(runtime.single_cycle_duration_hours ?? runtime.singleCycleDurationHours ?? 0),
    totalCycleDurationHours: Number(runtime.total_cycle_duration_hours ?? runtime.totalCycleDurationHours ?? 0),
    requiredRuntimeSeconds: Number(runtime.required_runtime_seconds ?? runtime.requiredRuntimeSeconds ?? 0),
    elapsedRuntimeSeconds: Number(runtime.elapsed_runtime_seconds ?? runtime.elapsedRuntimeSeconds ?? 0),
    remainingRuntimeSeconds: Number(runtime.remaining_runtime_seconds ?? runtime.remainingRuntimeSeconds ?? 0),
    runtimeProgress: Number(runtime.runtime_progress ?? runtime.runtimeProgress ?? 0),
    runtimeConfigured: Boolean(runtime.runtime_configured ?? runtime.runtimeConfigured ?? false),
    runtimeCompleted: Boolean(runtime.runtime_completed ?? runtime.runtimeCompleted ?? false),
    currentRunStartedAt: runtime.current_run_started_at ?? runtime.currentRunStartedAt ?? null,
  }
}

function unwrapBackendEnvelope<T>(
  response: ApiResponse<BackendEnvelope<T>>,
  fallbackError: string
): ApiResponse<T> {
  if (!response.success || !response.data) {
    return {
      success: false,
      error: response.error || fallbackError,
      status: response.status,
    }
  }

  if (response.data.code !== 0) {
    return {
      success: false,
      error: response.data.msg || fallbackError,
      status: response.status,
    }
  }

  return {
    success: true,
    data: response.data.data as T,
    status: response.status,
  }
}

function apiFailure<T>(response: ApiResponse<unknown>, fallbackError: string): ApiResponse<T> {
  return {
    success: false,
    error: response.error || fallbackError,
    status: response.status,
  }
}

function normalizeProcessJson(value: unknown): HaltHassProcessJson | null {
  if (!value || typeof value !== 'object') return null
  const process = value as Partial<HaltHassProcessJson>
  if (
    process.schemaVersion !== 2
    || !process.metadata
    || !process.installGuide
    || !isFlowchart(process.testFlow)
    || !isFlowchart(process.cycleFlow)
  ) {
    return null
  }
  return process as HaltHassProcessJson
}

function isFlowchart(value: unknown): value is HaltHassFlowchart {
  if (!value || typeof value !== 'object') return false
  const flow = value as Partial<HaltHassFlowchart>
  return Array.isArray(flow.nodes)
    && Array.isArray(flow.edges)
    && Array.isArray(flow.observeBlocks)
    && Boolean(flow.runSettings && typeof flow.runSettings === 'object')
}

function getSerialText(value: OrderBoardSerial | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  return String(value.serial || value.sn || value.serialNumber || value.serial_num || '').trim()
}

function normalizeScheduleSegments(value: unknown): OrderScheduleSegment[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      scheduledStartAt: (item.scheduledStartAt ?? item.scheduled_start_at ?? null) as string | null,
      scheduledEndAt: (item.scheduledEndAt ?? item.scheduled_end_at ?? null) as string | null,
    }))
    .filter((item) => Boolean(item.scheduledStartAt && item.scheduledEndAt))
}

function normalizeScannedBoards(value: unknown): ScannedBoard[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const boardModel = item?.board_model || item?.boardModel || {}
    return {
      serial: String(item?.serial || item?.sn || ''),
      boardModelId: item?.board_model_id ?? item?.boardModelId ?? boardModel?.id,
      boardModelName: item?.board_model_name || item?.boardModelName || boardModel?.name,
      scannedAt: item?.scanned_at || item?.scannedAt ? new Date(item.scanned_at || item.scannedAt) : new Date(),
    }
  })
}

export function mapHaltHassOrder(dto: HaltHassOrderDTO): HaltHassOrder {
  const boardGroup = dto.board_group || dto.boardGroup || {}
  const boardsInGroup = dto.boards_in_group || dto.boardsInGroup
  const process = dto.process || dto.process_info || dto.processInfo || {}
  const scannedBoards = normalizeScannedBoards(dto.scanned_boards || dto.scannedBoards)
  const orderNo = String(dto.order_no || dto.orderNo || dto.task_number || dto.taskNumber || dto.id || '')
  const boardSerials = Array.isArray(dto.board_serials || dto.boardSerials)
    ? (dto.board_serials || dto.boardSerials) as OrderBoardSerial[]
    : []
  const scheduleSegments = normalizeScheduleSegments(dto.schedule_segments || dto.scheduleSegments)

  return {
    id: Number(dto.id),
    orderNo,
    status: Number(dto.status ?? 0),
    boardCount: Number(dto.board_count ?? dto.boardCount ?? scannedBoards.length ?? 0),
    cycleCount: Number(dto.cycle_count ?? dto.cycleCount ?? 1),
    singleCycleDurationHours: Number(dto.single_cycle_duration_hours ?? dto.singleCycleDurationHours ?? 0),
    totalCycleDurationHours: Number(dto.total_cycle_duration_hours ?? dto.totalCycleDurationHours ?? 0),
    requiredRuntimeSeconds: Number(dto.required_runtime_seconds ?? dto.requiredRuntimeSeconds ?? 0),
    elapsedRuntimeSeconds: Number(dto.elapsed_runtime_seconds ?? dto.elapsedRuntimeSeconds ?? 0),
    remainingRuntimeSeconds: Number(dto.remaining_runtime_seconds ?? dto.remainingRuntimeSeconds ?? 0),
    runtimeProgress: Number(dto.runtime_progress ?? dto.runtimeProgress ?? 0),
    runtimeConfigured: Boolean(dto.runtime_configured ?? dto.runtimeConfigured ?? false),
    runtimeCompleted: Boolean(dto.runtime_completed ?? dto.runtimeCompleted ?? false),
    currentRunStartedAt: dto.current_run_started_at ?? dto.currentRunStartedAt ?? null,
    boardGroup: {
      id: Number(boardGroup.id ?? dto.board_group_id ?? dto.boardGroupId ?? 0),
      name: String(boardGroup.name || dto.board_group_name || dto.boardGroupName || '-'),
      boards: Array.isArray(boardGroup.boards)
        ? boardGroup.boards
        : Array.isArray(boardsInGroup)
          ? boardsInGroup
          : [],
    },
    process: {
      id: Number(process.id ?? dto.process_id ?? dto.processId ?? 0),
      name: String(process.name || dto.process_name || dto.processName || '-'),
      version: String(process.version || dto.process_version || dto.processVersion || ''),
    },
    boardSerials,
    scannedBoards,
    feedbackReason: String(dto.feedback_reason || dto.feedbackReason || ''),
    remark: String(dto.remark || ''),
    createdAt: String(dto.created_at || dto.createdAt || ''),
    startedAt: dto.started_at || dto.startedAt,
    completedAt: dto.completed_at || dto.completedAt,
    scheduledStartAt: dto.scheduled_start_at || dto.scheduledStartAt || null,
    scheduledEndAt: dto.scheduled_end_at || dto.scheduledEndAt || null,
    scheduleSegments,
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
  const response = await http.get<BackendEnvelope<HaltHassOrderDTO[]>>(
    '/test/halt-hass/order/by-serial/',
    {},
    { serial }
  )
  const unwrapped = unwrapBackendEnvelope(response, '查询工单失败')
  if (!unwrapped.success) return apiFailure<HaltHassOrder[]>(unwrapped, '查询工单失败')

  return {
    success: true,
    data: (unwrapped.data || []).map(mapHaltHassOrder),
    status: response.status,
  }
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
  const response = await http.get<BackendEnvelope<HaltHassOrderDTO>>(
    `/test/halt-hass/order/detail/${orderId}/`
  )
  const unwrapped = unwrapBackendEnvelope(response, '获取工单详情失败')
  if (!unwrapped.success) return apiFailure<HaltHassOrder>(unwrapped, '获取工单详情失败')

  return {
    success: true,
    data: mapHaltHassOrder(unwrapped.data || {}),
    status: response.status,
  }
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
): Promise<ApiResponse<HaltHassStartResult>> {
  const response = await http.post<BackendEnvelope<unknown>>(
    `/test/halt-hass/order/start/${orderId}/`,
    {
      operatorId: data.operatorId,
      boardSerials: data.boardSerials,
    }
  )
  const unwrapped = unwrapBackendEnvelope(response, '开始测试失败')
  if (!unwrapped.success) return apiFailure<HaltHassStartResult>(unwrapped, '开始测试失败')
  const runtime = (unwrapped.data || {}) as HaltHassOrderDTO
  return {
    success: true,
    data: mapHaltHassRuntimeResult(runtime),
    status: response.status,
  }
}

/**
 * 循环流实际启动时才开始或继续累计循环总时长。
 */
export async function startOrderCycleRuntime(
  orderId: number
): Promise<ApiResponse<HaltHassStartResult>> {
  const response = await http.post<BackendEnvelope<unknown>>(
    `/test/halt-hass/order/cycle/start/${orderId}/`
  )
  const unwrapped = unwrapBackendEnvelope(response, '启动循环流计时失败')
  if (!unwrapped.success) {
    return apiFailure<HaltHassStartResult>(unwrapped, '启动循环流计时失败')
  }

  return {
    success: true,
    data: mapHaltHassRuntimeResult(
      (unwrapped.data || {}) as HaltHassOrderDTO
    ),
    status: response.status,
  }
}

/**
 * 循环流结束、失败或手动停止时冻结已累计时长。
 */
export async function pauseOrderCycleRuntime(
  orderId: number
): Promise<ApiResponse<HaltHassStartResult>> {
  const response = await http.post<BackendEnvelope<unknown>>(
    `/test/halt-hass/order/cycle/pause/${orderId}/`
  )
  const unwrapped = unwrapBackendEnvelope(response, '暂停循环流计时失败')
  if (!unwrapped.success) {
    return apiFailure<HaltHassStartResult>(unwrapped, '暂停循环流计时失败')
  }

  return {
    success: true,
    data: mapHaltHassRuntimeResult(
      (unwrapped.data || {}) as HaltHassOrderDTO
    ),
    status: response.status,
  }
}

/**
 * 清空测试中工单的上一轮执行状态。
 * 后端保留工单配置与排程，只删除实际扫码和运行状态。
 */
export async function resetRunningOrderExecution(
  orderId: number
): Promise<ApiResponse<{ id: number; status: number }>> {
  const response = await http.post<BackendEnvelope<{ id: number; status: number }>>(
    `/test/halt-hass/order/reset-running/${orderId}/`
  )
  const unwrapped = unwrapBackendEnvelope(response, '清空工单执行状态失败')
  if (!unwrapped.success) {
    return apiFailure<{ id: number; status: number }>(unwrapped, '清空工单执行状态失败')
  }
  return {
    success: true,
    data: unwrapped.data,
    status: response.status,
  }
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
  const tempData = data
  const response = await http.post<BackendEnvelope<unknown>>(
    `/test/halt-hass/order/temp/upload/${orderId}/`,
    { data: tempData }
  )
  const unwrapped = unwrapBackendEnvelope(response, '暂存数据上传失败')
  if (!unwrapped.success) return apiFailure<{ success: boolean }>(unwrapped, '暂存数据上传失败')
  return { success: true, data: { success: true }, status: response.status }
}

/**
 * 下载临时数据（恢复暂存）
 */
export async function downloadTempData(
  orderId: number
): Promise<ApiResponse<HaltHassTempData>> {
  const response = await http.get<BackendEnvelope<HaltHassTempData>>(
    `/test/halt-hass/order/temp/download/${orderId}/`
  )
  return unwrapBackendEnvelope(response, '下载暂存数据失败')
}

/**
 * 下载反馈数据（审核打回后的数据）
 */
export async function downloadFeedbackData(
  orderId: number
): Promise<ApiResponse<{
  report: HaltHassReport | null
  comment: string
}>> {
  const response = await http.get<BackendEnvelope<{
    report: HaltHassReport | null
    comment: string
  }>>(`/test/halt-hass/order/feedback/download/${orderId}/`)
  return unwrapBackendEnvelope(response, '下载反馈数据失败')
}

/**
 * 下载工艺数据
 * 根据工单关联的工艺 ID 获取完整工艺 JSON
 */
export async function downloadProcessData(
  processId: number
): Promise<ApiResponse<HaltHassProcessJson>> {
  const response = await http.get<BackendEnvelope<Record<string, unknown>>>(
    `/test/halt-hass/detail/${processId}/`
  )
  const unwrapped = unwrapBackendEnvelope(response, '下载工艺数据失败')
  if (!unwrapped.success) return apiFailure<HaltHassProcessJson>(unwrapped, '下载工艺数据失败')

  const detail = unwrapped.data || {}
  const processJson = normalizeProcessJson(detail.processJson)

  if (!processJson) {
    return {
      success: false,
      error: '工艺不是有效的 HALT-HASS 双流程数据',
      status: response.status,
    }
  }

  return {
    success: true,
    data: processJson,
    status: response.status,
  }
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
  const response = await http.post<BackendEnvelope<{ id: number }>>('/test/halt-hass/report/upload/', {
    orderId: data.orderId,
    reportJson: data.reportJson,
    result: data.result,
    operatorId: data.operatorId,
    remark: data.remark || '',
  })
  return unwrapBackendEnvelope(response, '报告上传失败')
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
  const serialUpper = serial.trim().toUpperCase()
  const preset = order.boardSerials || []
  if (preset.length) {
    const matched = preset.find((item) => getSerialText(item).toUpperCase() === serialUpper)
    if (!matched) return { valid: false }

    if (typeof matched === 'object') {
      const boardModelId = matched.boardModelId ?? matched.board_model_id
      const board = order.boardGroup.boards.find((item) => item.id === boardModelId)
      if (board) return { valid: true, boardModel: { id: board.id, name: board.name } }
    }

    return { valid: true }
  }

  const boards = order.boardGroup.boards

  for (const board of boards) {
    // 假设序列号格式为：型号代码-序号，如 "BM001-00123"
    if (board.code && serialUpper.startsWith(board.code.toUpperCase())) {
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
