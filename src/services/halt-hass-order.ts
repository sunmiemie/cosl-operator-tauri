/**
 * HALT-HASS 工单和报告 API 服务
 * 提供与 cnooc-backend 的 HALT-HASS 测试工单和报告相关接口对接
 */
import { http, type ApiResponse } from './http'
import type {
  HaltHassOrder,
  HaltHassChartUpload,
  HaltHassReport,
  HaltHassReportJson,
  HaltHassTargetBoard,
  HaltHassTestSession,
  HaltHassSessionBoardInput,
  HaltHassExecutionProcessOption,
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
  statuses?: Array<number | string>
}

export type HaltHassOrderWriteResponse = {
  code: number
  msg?: string
  data?: HaltHassOrderDTO
}

type BackendEnvelope<T> = {
  code: number
  msg?: string
  data?: T
}

export type HaltHassOrderScheduleBody = {
  scheduled_start_at: string
  scheduled_end_at: string
  use_device?: string
  equipment_id?: string
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
      targetBoardId: item?.target_board_id ?? item?.targetBoardId,
      orderId: item?.order_id ?? item?.orderId,
      orderNo: item?.order_no ?? item?.orderNo,
      role: item?.role,
      slotNo: item?.slot_no ?? item?.slotNo,
      boardModelId: item?.board_model_id ?? item?.boardModelId ?? boardModel?.id,
      boardModelName: item?.board_model_name || item?.boardModelName || boardModel?.name,
      boardModelCode: item?.board_model_code || item?.boardModelCode || boardModel?.code,
      scannedAt: item?.scanned_at || item?.scannedAt ? new Date(item.scanned_at || item.scannedAt) : new Date(),
    }
  })
}

function normalizeTargetBoards(value: unknown): HaltHassTargetBoard[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => ({
    id: Number(item?.id),
    orderId: Number(item?.orderId ?? item?.order_id),
    orderNo: String(item?.orderNo ?? item?.order_no ?? ''),
    processId: Number(item?.processId ?? item?.process_id),
    processName: String(item?.processName ?? item?.process_name ?? ''),
    serial: String(item?.serial ?? item?.serial_number ?? ''),
    boardModelId: Number(item?.boardModelId ?? item?.board_model_id),
    boardModelName: String(item?.boardModelName ?? item?.board_model_name ?? ''),
    boardModelCode: String(item?.boardModelCode ?? item?.board_model_code ?? ''),
    status: Number(item?.status ?? 0),
    statusText: String(item?.statusText ?? item?.status_text ?? ''),
    attemptNo: Number(item?.attemptNo ?? item?.attempt_no ?? 0),
    failureReason: String(item?.failureReason ?? item?.failure_reason ?? ''),
  }))
}

export function mapHaltHassOrder(dto: HaltHassOrderDTO): HaltHassOrder {
  const boardGroup = dto.board_group || dto.boardGroup || {}
  const boardsInGroup = dto.boards_in_group || dto.boardsInGroup
  const scannedBoards = normalizeScannedBoards(dto.scanned_boards || dto.scannedBoards)
  const orderNo = String(dto.order_no || dto.orderNo || dto.task_number || dto.taskNumber || dto.id || '')
  const boardSerials = Array.isArray(dto.board_serials || dto.boardSerials)
    ? (dto.board_serials || dto.boardSerials) as OrderBoardSerial[]
    : []
  const scheduleSegments = normalizeScheduleSegments(dto.schedule_segments || dto.scheduleSegments)
  const targetBoards = normalizeTargetBoards(dto.target_boards || dto.targetBoards)
  const productModel = dto.product_model || dto.productModel || null
  const instrumentModel = dto.instrument_model || dto.instrumentModel || null
  const rawClientTestType = dto.client_test_type ?? dto.clientTestType
  const clientTestType = rawClientTestType === 1 || rawClientTestType === 2
    ? rawClientTestType
    : Number(rawClientTestType) === 1 || Number(rawClientTestType) === 2
      ? Number(rawClientTestType) as 1 | 2
      : null

  return {
    id: Number(dto.id),
    orderNo,
    productModel: productModel
      ? { id: Number(productModel.id ?? dto.product_model_id ?? dto.productModelId), name: String(productModel.name || '') }
      : null,
    instrumentModel: instrumentModel
      ? { id: Number(instrumentModel.id ?? dto.instrument_model_id ?? dto.instrumentModelId), name: String(instrumentModel.name || '') }
      : null,
    clientTestType,
    clientTestTypeName: String(
      dto.client_test_type_name || dto.clientTestTypeName || (clientTestType === 1 ? '高速率测试' : clientTestType === 2 ? 'SDS 测试' : '')
    ),
    experimentType: String(dto.experiment_type ?? dto.experimentType ?? ''),
    taskExecutionDescription: String(
      dto.task_execution_description ?? dto.taskExecutionDescription ?? ''
    ),
    status: Number(dto.status ?? 0),
    boardCount: Number(dto.board_count ?? dto.boardCount ?? scannedBoards.length ?? 0),
    cycleCount: Number(dto.cycle_count ?? dto.cycleCount ?? 1),
    workbenchTestName: String(dto.workbench_test_name ?? dto.workbenchTestName ?? ''),
    boardGroup: {
      id: Number(boardGroup.id ?? dto.board_group_id ?? dto.boardGroupId ?? 0),
      name: String(boardGroup.name || dto.board_group_name || dto.boardGroupName || '-'),
      boards: Array.isArray(boardGroup.boards)
        ? boardGroup.boards
        : Array.isArray(boardsInGroup)
          ? boardsInGroup
          : [],
    },
    process: null,
    boardSerials,
    targetBoards,
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
  if (params.statuses?.length) query.statuses = params.statuses.join(',')
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
 * 下载工艺数据
 * 根据客户端本次选择的工艺 ID 获取完整工艺 JSON
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

// ==================== 测试场次 API ====================

function normalizeSession(value: any): HaltHassTestSession {
  return {
    id: Number(value?.id),
    sessionNo: String(value?.sessionNo ?? value?.session_no ?? ''),
    clientSessionId: String(value?.clientSessionId ?? value?.client_session_id ?? ''),
    processId: Number(value?.processId ?? value?.process_id),
    processVersion: String(value?.processVersion ?? value?.process_version ?? ''),
    experimentType: String(value?.experimentType ?? value?.experiment_type ?? ''),
    status: Number(value?.status ?? 0),
    statusText: String(value?.statusText ?? value?.status_text ?? ''),
    operatorId: value?.operatorId ?? value?.operator_id ?? null,
    elapsedRuntimeSeconds: Number(value?.elapsedRuntimeSeconds ?? value?.elapsed_runtime_seconds ?? 0),
    precheck: value?.precheck || {},
    flowResult: value?.flowResult ?? value?.flow_result ?? {},
    testData: value?.testData ?? value?.test_data ?? {},
    uploadError: String(value?.uploadError ?? value?.upload_error ?? ''),
    startedAt: value?.startedAt ?? value?.started_at ?? null,
    endedAt: value?.endedAt ?? value?.ended_at ?? null,
    closedAt: value?.closedAt ?? value?.closed_at ?? null,
    lastSyncedAt: value?.lastSyncedAt ?? value?.last_synced_at ?? null,
    createdAt: value?.createdAt ?? value?.created_at ?? null,
    boards: Array.isArray(value?.boards)
      ? value.boards.map((item: any) => ({
          id: Number(item?.id),
          sessionId: Number(item?.sessionId ?? item?.session_id),
          targetBoardId: item?.targetBoardId ?? item?.target_board_id ?? null,
          orderId: item?.orderId ?? item?.order_id ?? null,
          role: item?.role === 'companion' ? 'companion' : 'target',
          serial: String(item?.serial ?? ''),
          boardModelId: Number(item?.boardModelId ?? item?.board_model_id),
          boardModelName: String(item?.boardModelName ?? item?.board_model_name ?? ''),
          boardModelCode: String(item?.boardModelCode ?? item?.board_model_code ?? ''),
          slotNo: Number(item?.slotNo ?? item?.slot_no),
          status: Number(item?.status ?? 0),
          statusText: String(item?.statusText ?? item?.status_text ?? ''),
          participationSeconds: Number(item?.participationSeconds ?? item?.participation_seconds ?? 0),
          joinedAt: item?.joinedAt ?? item?.joined_at ?? null,
          exitedAt: item?.exitedAt ?? item?.exited_at ?? null,
        }))
      : [],
  }
}

/**
 * 获取当前工单可在客户端执行的已审核工艺版本。
 * 工单本身不绑定工艺；每次未执行或复测前由操作人员选择。
 */
export async function listExecutionProcessOptions(
  order: HaltHassOrder
): Promise<ApiResponse<HaltHassExecutionProcessOption[]>> {
  if (!order.id || !order.productModel?.id || !order.clientTestType || !order.boardGroup?.id) {
    return { success: false, error: '工单缺少编号、产品、客户端测试类型或电路板组信息' }
  }

  const query: Record<string, string> = {
    orderId: String(order.id),
  }

  const response = await http.get<BackendEnvelope<{
    processes?: Array<Record<string, unknown>>
  }>>('/test/halt-hass/order/options/', {}, query)
  const unwrapped = unwrapBackendEnvelope(response, '获取可执行工艺版本失败')
  if (!unwrapped.success) {
    return apiFailure<HaltHassExecutionProcessOption[]>(unwrapped, '获取可执行工艺版本失败')
  }

  const processes = (unwrapped.data?.processes || [])
    .map(item => ({
      id: Number(item.id),
      name: String(item.name || ''),
        version: String(item.version || ''),
        description: String(item.description || ''),
      active: Number(item.active || 0),
      productModelId: Number(item.productModelId || 0),
      clientTestType: Number(item.clientTestType) as 1 | 2,
      clientTestTypeName: String(item.clientTestTypeName || ''),
      experimentType: String(item.experimentType || ''),
    }))
    .filter(item => item.id > 0 && item.name && item.version)
    .filter(item => (
      item.productModelId === order.productModel?.id
      && item.clientTestType === order.clientTestType
      && item.experimentType === order.experimentType
    ))

  return { success: true, data: processes, status: response.status }
}

export async function listEligibleSessionBoards(params: {
  processId?: number
  keyword?: string
} = {}): Promise<ApiResponse<HaltHassTargetBoard[]>> {
  const query: Record<string, string> = {}
  if (params.processId) query.processId = String(params.processId)
  if (params.keyword) query.keyword = params.keyword
  const response = await http.get<BackendEnvelope<any[]>>(
    '/test/halt-hass/session/eligible-boards/',
    {},
    query,
  )
  const unwrapped = unwrapBackendEnvelope(response, '获取可测试目标板失败')
  if (!unwrapped.success) return apiFailure<HaltHassTargetBoard[]>(unwrapped, '获取可测试目标板失败')
  return {
    success: true,
    data: normalizeTargetBoards(unwrapped.data || []),
    status: response.status,
  }
}

export async function createHaltHassSession(data: {
  clientSessionId: string
  processId: number
  orderIds: number[]
  operatorId?: number
  boards: HaltHassSessionBoardInput[]
}): Promise<ApiResponse<HaltHassTestSession>> {
  const response = await http.post<BackendEnvelope<any>>('/test/halt-hass/session/create/', data)
  const unwrapped = unwrapBackendEnvelope(response, '创建测试场次失败')
  if (!unwrapped.success) return apiFailure<HaltHassTestSession>(unwrapped, '创建测试场次失败')
  return { success: true, data: normalizeSession(unwrapped.data), status: response.status }
}

export async function getHaltHassSessionByClientId(
  clientSessionId: string,
): Promise<ApiResponse<HaltHassTestSession>> {
  const response = await http.get<BackendEnvelope<any>>(
    '/test/halt-hass/session/by-client-id/',
    {},
    { clientSessionId },
  )
  const unwrapped = unwrapBackendEnvelope(response, '恢复测试场次失败')
  if (!unwrapped.success) return apiFailure<HaltHassTestSession>(unwrapped, '恢复测试场次失败')
  return { success: true, data: normalizeSession(unwrapped.data), status: response.status }
}

export async function startHaltHassSession(
  sessionId: number,
  precheck: Record<string, unknown> = {},
): Promise<ApiResponse<HaltHassTestSession>> {
  const response = await http.post<BackendEnvelope<any>>(
    `/test/halt-hass/session/start/${sessionId}/`,
    { precheck },
  )
  const unwrapped = unwrapBackendEnvelope(response, '开始测试场次失败')
  if (!unwrapped.success) return apiFailure<HaltHassTestSession>(unwrapped, '开始测试场次失败')
  return { success: true, data: normalizeSession(unwrapped.data), status: response.status }
}

export async function completeHaltHassSession(
  sessionId: number,
  data: {
    powerOffCompleted: true
    success: boolean
    elapsedRuntimeSeconds: number
    flowResult?: Record<string, unknown>
    testData?: Record<string, unknown>
    failureReason?: string
  },
): Promise<ApiResponse<HaltHassTestSession>> {
  const response = await http.post<BackendEnvelope<any>>(
    `/test/halt-hass/session/complete/${sessionId}/`,
    data,
  )
  const unwrapped = unwrapBackendEnvelope(response, '结束测试场次失败')
  if (!unwrapped.success) return apiFailure<HaltHassTestSession>(unwrapped, '结束测试场次失败')
  return { success: true, data: normalizeSession(unwrapped.data), status: response.status }
}

export async function cancelHaltHassSession(
  sessionId: number,
  data: {
    reason?: string
    powerOffCompleted?: boolean
    forceExitConfirmed?: boolean
  } = {},
): Promise<ApiResponse<HaltHassTestSession>> {
  const response = await http.post<BackendEnvelope<any>>(
    `/test/halt-hass/session/cancel/${sessionId}/`,
    data,
  )
  const unwrapped = unwrapBackendEnvelope(response, '取消测试场次失败')
  if (!unwrapped.success) return apiFailure<HaltHassTestSession>(unwrapped, '取消测试场次失败')
  return { success: true, data: normalizeSession(unwrapped.data), status: response.status }
}

// ==================== 报告 API ====================

/**
 * 上传测试报告
 */
export async function uploadReport(data: {
  orderId: number
  sessionId: number
  targetBoardId: number
  clientSubmitId: string
  reportJson: HaltHassReportJson
  result: number  // 1=正常, 2=异常
  operatorId: number
  remark?: string
  chartFiles?: HaltHassChartUpload[]
}): Promise<ApiResponse<{ id: number }>> {
  const payload = {
    orderId: data.orderId,
    sessionId: data.sessionId,
    targetBoardId: data.targetBoardId,
    clientSubmitId: data.clientSubmitId,
    reportJson: data.reportJson,
    result: data.result,
    operatorId: data.operatorId,
    remark: data.remark || '',
  }
  let response: ApiResponse<BackendEnvelope<{ id: number }>>
  if (data.chartFiles?.length) {
    const formData = new FormData()
    formData.append('payload', JSON.stringify(payload))
    data.chartFiles.forEach((file) => {
      formData.append('chart_image', file.blob, file.metadata.fileName)
    })
    response = await http.postFormData<BackendEnvelope<{ id: number }>>(
      '/test/halt-hass/report/upload/',
      formData,
    )
  } else {
    response = await http.post<BackendEnvelope<{ id: number }>>(
      '/test/halt-hass/report/upload/',
      payload,
    )
  }
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
