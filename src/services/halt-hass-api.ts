/**
 * HALT-HASS 工艺后端 API 服务
 * 提供与 cnooc-backend 的 HALT-HASS 工艺管理接口对接
 */
import { http, type ApiResponse } from './http'
import type {
  HaltHassProcessJson,
  BoardGroupItem,
  BoardGroup,
  CreateBoardGroupParams,
  HaltHassJob,
} from '@/views/process-halt-hass/types'

// ==================== 类型定义 ====================

/**
 * 工艺列表项（列表接口返回）
 */
export interface HaltHassProcessListItem {
  id: number
  name: string
  version: string
  status: number
  boardGroups: BoardGroupItem[]
  createdAt: string
  userName: string
  auditNum: number
  active: number
}

/**
 * 工艺列表响应
 */
export interface HaltHassProcessListResponse {
  list: HaltHassProcessListItem[]
  total: number
  currentPage: number
  pageSize: number
}

/**
 * 工艺详情（详情接口返回）
 */
export interface HaltHassProcessDetail {
  id: number
  name: string
  version: string
  status: number
  boardGroups: BoardGroupItem[]
  createdAt: string
  userName: string
  processJson: HaltHassProcessJson | null
  feedback: string[]
  auditNum: number
  active: number
}

/**
 * 工艺版本项
 */
export interface HaltHassVersionItem {
  id: number
  name: string
  version: string
  active: number
  createdAt: string
}

/**
 * 创建工艺请求参数
 */
export interface CreateHaltHassParams {
  name: string
  version: string
  boardGroupIds: number[]
  processJson: HaltHassProcessJson
  userId?: number
}

/**
 * 更新工艺请求参数
 */
export interface UpdateHaltHassParams {
  name?: string
  version?: string
  boardGroupIds?: number[]
  processJson?: HaltHassProcessJson
}

// ==================== API 函数 ====================

/**
 * 获取 HALT-HASS 工艺列表
 */
export async function getHaltHassProcessList(params: {
  currentPage?: number
  pageSize?: number
  name?: string
  status?: string
  boardGroupId?: string
}): Promise<ApiResponse<HaltHassProcessListResponse>> {
  const queryParams: Record<string, string> = {}
  if (params.currentPage) queryParams.currentPage = String(params.currentPage)
  if (params.pageSize) queryParams.pageSize = String(params.pageSize)
  if (params.name) queryParams.name = params.name
  if (params.status) queryParams.status = params.status
  if (params.boardGroupId) queryParams.boardGroupId = params.boardGroupId

  return http.get<HaltHassProcessListResponse>('/test/halt-hass/list/', {}, queryParams)
}

/**
 * 获取 HALT-HASS 工艺详情
 */
export async function getHaltHassProcessDetail(
  id: number
): Promise<ApiResponse<HaltHassProcessDetail>> {
  return http.get<HaltHassProcessDetail>(`/test/halt-hass/detail/${id}/`)
}

/**
 * 创建 HALT-HASS 工艺
 */
export async function createHaltHassProcess(
  data: CreateHaltHassParams
): Promise<ApiResponse<{ id: number }>> {
  return http.post<{ id: number }>('/test/halt-hass/create/', data)
}

/**
 * 更新 HALT-HASS 工艺
 */
export async function updateHaltHassProcess(
  id: number,
  data: UpdateHaltHassParams
): Promise<ApiResponse<void>> {
  return http.put<void>(`/test/halt-hass/update/${id}/`, data)
}

/**
 * 删除 HALT-HASS 工艺
 */
export async function deleteHaltHassProcess(id: number): Promise<ApiResponse<void>> {
  return http.delete<void>(`/test/halt-hass/delete/${id}/`)
}

/**
 * 按电路板组获取可用的 HALT-HASS 工艺
 */
export async function getHaltHassProcessByBoard(
  boardId: number
): Promise<ApiResponse<{ id: number; name: string; version: string }[]>> {
  return http.get<{ id: number; name: string; version: string }[]>(
    `/test/halt-hass/by-board/${boardId}/`
  )
}

/**
 * 获取工艺版本列表
 */
export async function getHaltHassVersionList(
  boardGroupId: string
): Promise<ApiResponse<HaltHassVersionItem[]>> {
  return http.get<HaltHassVersionItem[]>('/test/halt-hass/versions/', {}, { boardGroupId })
}

/**
 * 提交审核
 */
export async function submitHaltHassToCheck(id: number): Promise<ApiResponse<void>> {
  return http.post<void>('/test/addprocess/submitcheck/', { id })
}

/**
 * 保存工艺（创建或更新）
 * @param processJson 工艺 JSON 数据
 * @param processId 工艺 ID（如果提供则更新，否则创建）
 * @param userId 用户 ID（创建时使用）
 */
export async function saveHaltHassProcess(
  processJson: HaltHassProcessJson,
  processId?: number,
  userId?: number
): Promise<ApiResponse<{ id: number }>> {
  const { metadata } = processJson
  const boardGroupIds = metadata.boardGroup.map((bg) => bg.id)

  if (processId && processId > 0) {
    // 更新
    const updateResult = await updateHaltHassProcess(processId, {
      name: metadata.name,
      version: metadata.version,
      boardGroupIds,
      processJson,
    })

    if (updateResult.success) {
      return { success: true, data: { id: processId } }
    }
    return { success: false, error: updateResult.error }
  } else {
    // 创建
    const createResult = await createHaltHassProcess({
      name: metadata.name,
      version: metadata.version,
      boardGroupIds,
      processJson,
      userId,
    })

    if (createResult.success && createResult.data) {
      // 后端返回格式: {code: 0, data: {id: N}}，需要解包嵌套的 data
      const responseData = createResult.data as unknown as { code: number; data: { id: number } }
      return { success: true, data: { id: responseData.data?.id } }
    }
    return { success: false, error: createResult.error || '创建失败' }
  }
}

/**
 * 加载工艺（从后端获取并返回处理后的数据）
 */
export async function loadHaltHassProcess(
  processId: number
): Promise<{ success: boolean; data?: HaltHassProcessJson; error?: string }> {
  const result = await getHaltHassProcessDetail(processId)

  if (!result.success || !result.data) {
    return { success: false, error: result.error || '获取工艺详情失败' }
  }

  // 后端返回格式: {code: 0, data: HaltHassProcessDetail}，需要解包嵌套的 data
  const responseData = result.data as unknown as { code: number; data: HaltHassProcessDetail }
  const detail = responseData.data

  if (!detail) {
    return { success: false, error: '工艺数据为空' }
  }

  if (!detail.processJson) {
    return { success: false, error: '工艺 JSON 数据为空' }
  }

  // 确保数据结构完整
  const processJson: HaltHassProcessJson = {
    metadata: {
      name: detail.name || detail.processJson.metadata?.name || '',
      version: detail.version || detail.processJson.metadata?.version || '1.0.0',
      boardGroup: detail.boardGroups || detail.processJson.metadata?.boardGroup || [],
      description: detail.processJson.metadata?.description || '',
      createdAt: detail.createdAt || detail.processJson.metadata?.createdAt,
      updatedAt: detail.processJson.metadata?.updatedAt,
      createdBy: detail.userName || detail.processJson.metadata?.createdBy,
    },
    installGuide: detail.processJson.installGuide || { steps: [] },
    flowchart: detail.processJson.flowchart || {
      nodes: [],
      edges: [],
      observeBlocks: [],
      runSettings: {
        nodeDelay: 0,
        maximumRuntime: 3000,
        maximumConcurrentWorkers: 1,
      },
    },
    // 保存审核反馈
    feedback: detail.feedback || [],
  }

  return { success: true, data: processJson }
}

// ==================== 电路板组 API ====================

/**
 * 电路板组列表响应
 */
export interface BoardGroupListResponse {
  list: BoardGroup[]
  total: number
}

/**
 * 获取电路板组列表
 */
export async function getBoardGroupList(params?: {
  currentPage?: number
  pageSize?: number
  name?: string
}): Promise<ApiResponse<BoardGroupListResponse>> {
  const queryParams: Record<string, string> = {}
  if (params?.currentPage) queryParams.currentPage = String(params.currentPage)
  if (params?.pageSize) queryParams.pageSize = String(params.pageSize)
  if (params?.name) queryParams.name = params.name

  return http.get<BoardGroupListResponse>('/equipment/board-group/list/', {}, queryParams)
}

/**
 * 获取电路板组详情
 */
export async function getBoardGroupDetail(id: number): Promise<ApiResponse<BoardGroup>> {
  return http.get<BoardGroup>(`/equipment/board-group/detail/${id}/`)
}

/**
 * 创建电路板组
 */
export async function createBoardGroup(
  data: CreateBoardGroupParams
): Promise<ApiResponse<{ id: number }>> {
  return http.post<{ id: number }>('/equipment/board-group/create/', data)
}

/**
 * 更新电路板组
 */
export async function updateBoardGroup(
  id: number,
  data: Partial<CreateBoardGroupParams>
): Promise<ApiResponse<void>> {
  return http.put<void>(`/equipment/board-group/update/${id}/`, data)
}

/**
 * 删除电路板组
 */
export async function deleteBoardGroup(id: number): Promise<ApiResponse<void>> {
  return http.delete<void>(`/equipment/board-group/delete/${id}/`)
}

// ==================== 我的待处理 API ====================

/**
 * 获取我的待处理 HALT-HASS 工艺列表
 */
export async function getHaltHassMyJob(): Promise<ApiResponse<HaltHassJob[]>> {
  return http.get<HaltHassJob[]>('/test/halt-hass/myjob/')
}
