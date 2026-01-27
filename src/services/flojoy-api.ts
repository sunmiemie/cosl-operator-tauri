/**
 * Flojoy 后端 API 服务
 * 封装与 Flojoy Python 后端的 HTTP 通信
 * 数据结构对齐 Studio
 */
import ky, { HTTPError } from 'ky'
import {
  blockManifestSchema,
  blockMetadataSchema,
  LegacyDeviceInfoSchema,
  type BlockManifest,
  type BlockMetadata,
  type BlockDefinition,
  type BlockSection,
  type LegacyDeviceInfo,
} from '@/types'

// Re-export types for backwards compatibility
export type { BlockDefinition, BlockSection, BlockMetadata }
export type BlockManifestTree = BlockManifest

// 兼容旧格式的 Block 元数据项
export interface BlockMetadataItem {
  key: string
  title: string
  description?: string
  category: string
  subcategory?: string
  inputs?: Array<{ name: string; type: string; multiple?: boolean }>
  outputs?: Array<{ name: string; type: string }>
  parameters?: Record<string, { type: string; default: unknown; desc?: string | null }>
  pip_dependencies?: string[]
}

// Re-export device types
export type DeviceInfo = LegacyDeviceInfo

// 流程图节点数据（简化版，用于 API 调用）
export interface FlowchartNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

// 流程图边数据
export interface FlowchartEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

// 运行设置（对齐 Studio BackendSettings）
export interface RunSettings {
  nodeDelay?: number
  maximumRuntime?: number
  maximumConcurrentWorkers?: number
}

// 运行流程图参数
export interface RunFlowchartArgs {
  nodes: FlowchartNode[]
  edges: FlowchartEdge[]
  jobId: string
  observeBlocks?: string[]
  settings?: RunSettings
}

// ========== API 客户端 ==========

// 存储当前 API URL
let currentApiUrl = 'http://127.0.0.1:5392'

let apiClient = ky.create({
  prefixUrl: currentApiUrl,
  timeout: 30000,
  // 不使用 credentials: 'include'，避免与 CORS 冲突
})

/**
 * 配置 API 客户端
 */
export function configureApi(host: string, port: number) {
  currentApiUrl = `http://${host}:${port}`
  apiClient = ky.create({
    prefixUrl: currentApiUrl,
    timeout: 30000,
  })
}

/**
 * 获取当前 API URL
 */
export function getApiUrl(): string {
  return currentApiUrl
}

// ========== API 方法 ==========

/**
 * 健康检查
 */
export async function checkHealth(): Promise<boolean> {
  try {
    await apiClient.get('health')
    return true
  } catch {
    return false
  }
}

/**
 * 获取 Blocks 清单（树结构）
 * 返回 Studio 格式的 manifest 树
 */
export async function getManifestTree(blocksPath?: string): Promise<BlockManifestTree> {
  const searchParams = blocksPath ? { blocks_path: blocksPath } : undefined
  const response = await apiClient.get('blocks/manifest', { searchParams }).json()
  return blockManifestSchema.parse(response)
}

/**
 * 获取 Blocks 元数据（平铺结构）
 * 返回 key -> metadata 的映射
 */
export async function getBlockMetadata(
  blocksPath?: string,
  customDirChanged = false
): Promise<BlockMetadata> {
  const searchParams: Record<string, string | boolean> = {}
  if (blocksPath) {
    searchParams.blocks_path = blocksPath
    searchParams.custom_dir_changed = customDirChanged
  }
  const response = await apiClient.get('blocks/metadata', { searchParams }).json()
  return blockMetadataSchema.parse(response)
}

/**
 * 获取 Blocks 元数据（按分类聚合 - 兼容旧格式）
 * @deprecated 推荐使用 getManifestTree + getBlockMetadata
 */
export async function getMetadata(blocksPath?: string): Promise<Record<string, BlockMetadataItem[]>> {
  const searchParams = blocksPath ? { blocks_path: blocksPath } : undefined
  const response = await apiClient.get('blocks/metadata', { searchParams }).json()
  return response as Record<string, BlockMetadataItem[]>
}

/**
 * 运行流程图
 * @param args 运行参数，包含节点、边、jobId、观察块和运行设置
 */
export async function runFlowchart(args: RunFlowchartArgs): Promise<void> {
  const { nodes, edges, jobId, observeBlocks = [], settings } = args

  // 构建请求体，对齐 Studio 的 PostWFC 模型
  const requestBody: Record<string, unknown> = {
    fc: JSON.stringify({ nodes, edges }),
    jobsetId: jobId,
    cancelExistingJobs: true,
    observeBlocks,
  }

  // 添加运行设置（如果有）
  if (settings) {
    if (settings.nodeDelay !== undefined) {
      requestBody.nodeDelay = settings.nodeDelay
    }
    if (settings.maximumRuntime !== undefined) {
      requestBody.maximumRuntime = settings.maximumRuntime
    }
    if (settings.maximumConcurrentWorkers !== undefined) {
      requestBody.maximumConcurrentWorkers = settings.maximumConcurrentWorkers
    }
  }

  await apiClient.post('wfc', { json: requestBody })
}

/**
 * 取消流程图运行
 */
export async function cancelFlowchartRun(jobId: string): Promise<void> {
  await apiClient.post('cancel_fc', {
    json: {
      jobsetId: jobId,
    },
  })
}

/**
 * 获取设备列表
 */
export async function getDeviceInfo(
  discoverNIDAQmx = false,
  discoverNIDMM = false
): Promise<DeviceInfo> {
  const response = await apiClient.get('devices', {
    searchParams: {
      include_nidaqmx_drivers: discoverNIDAQmx,
      include_nidmm_drivers: discoverNIDMM,
    },
  }).json()
  return LegacyDeviceInfoSchema.parse(response)
}

/**
 * 获取日志级别
 */
export async function getLogLevel(): Promise<string> {
  const response = await apiClient.get('log_level').json<{ level: string }>()
  return response.level
}

/**
 * 设置日志级别
 */
export async function setLogLevel(level: string): Promise<void> {
  await apiClient.post('log_level', { json: { level } })
}

// 导出错误类型
export { HTTPError }
