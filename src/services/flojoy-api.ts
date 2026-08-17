/**
 * Flojoy 后端 API 服务
 * 封装与 Flojoy Python 后端的 HTTP 通信
 * 数据结构对齐 Studio
 */
import ky, { HTTPError } from 'ky'
import {
  blockManifestSchema,
  blockMetadataSchema,
  DeviceInfoSchema,
  LegacyDeviceInfoSchema,
  convertLegacyDeviceInfo,
  type BlockManifest,
  type BlockMetadata,
  type BlockDefinition,
  type BlockSection,
  type DeviceInfo as StructuredDeviceInfo,
  type LegacyDeviceInfo,
} from '@/types'
import {
  applyHassHardwareBindings,
  getHassPreflightBaudrates,
  getHassPreflightRequiredRoles,
  getRequiredHassHardwareRoles,
  resolveHassPreflightPowerBinding,
  resolveHassHardwareBindings,
  type HassHardwareRole,
  type ResolvedHassHardwareBinding,
} from '@/services/hass-hardware-binding'
import { applyHassCycleDuration } from '@/services/hass-cycle-runtime'

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
export type DeviceInfo = StructuredDeviceInfo

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
  haltHassRemainingDurationSeconds?: number
}

export interface HassHardwarePreflightResult {
  role: string
  displayName: string
  success: boolean
  message: string
  details: Record<string, string | number>
}

export interface HassHardwarePreflightResponse {
  ready: boolean
  powerMaintained: boolean
  powerResource: string
  results: HassHardwarePreflightResult[]
  message: string
}

export interface HassHardwareShutdownResult {
  role: string
  displayName: string
  success: boolean
  message: string
}

export interface HassHardwareShutdownResponse {
  success: boolean
  results: HassHardwareShutdownResult[]
  message: string
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
  const {
    nodes,
    edges,
    jobId,
    observeBlocks = [],
    settings,
    haltHassRemainingDurationSeconds,
  } = args
  const requiredHardware = getRequiredHassHardwareRoles(nodes)
  let runtimeNodes = nodes

  if (requiredHardware.length > 0) {
    // 工艺文件中的 COM 号只作为历史显示值；每次运行都根据 USB 硬件身份
    // 解析当前端口，并且只修改本次请求的内存副本。
    const deviceInfo = await getDeviceInfo(false, false, false)
    const bindings = resolveHassHardwareBindings(
      requiredHardware,
      deviceInfo.serialDevices
    )
    runtimeNodes = applyHassHardwareBindings(nodes, bindings)
    console.info(
      '[HASS Hardware Binding]',
      bindings.map(({ displayName, port, hwid }) => ({ displayName, port, hwid }))
    )
  }

  if (haltHassRemainingDurationSeconds !== undefined) {
    runtimeNodes = applyHassCycleDuration(
      runtimeNodes,
      haltHassRemainingDurationSeconds
    )
  }

  // 构建请求体，对齐 Studio 的 PostWFC 模型
  const requestBody: Record<string, unknown> = {
    fc: JSON.stringify({ nodes: runtimeNodes, edges }),
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
 * 取消 Flojoy 当前运行中的流程。
 * 客户端重新进入“测试中”工单时，本地 Job ID 已丢失，需要由后端按当前拓扑停止。
 */
export async function cancelCurrentFlowchartRun(): Promise<void> {
  await apiClient.post('cancel_fc', {
    json: {
      jobsetId: null,
    },
  })
}

/**
 * 获取设备列表
 */
export async function getDeviceInfo(
  discoverNIDAQmx = false,
  discoverNIDMM = false,
  includeVISADevices = true
): Promise<DeviceInfo> {
  const response = await apiClient.get('devices', {
    searchParams: {
      include_nidaqmx_drivers: discoverNIDAQmx,
      include_nidmm_drivers: discoverNIDMM,
      include_visa_devices: includeVISADevices,
    },
  }).json()

  // 当前 Flojoy 返回结构化的 camelCase 数据；同时兼容旧版 snake_case 字符串数组。
  const structuredResult = DeviceInfoSchema.safeParse(response)
  if (structuredResult.success) {
    return structuredResult.data
  }

  const legacyInfo: LegacyDeviceInfo = LegacyDeviceInfoSchema.parse(response)
  return convertLegacyDeviceInfo(legacyInfo)
}

/**
 * 先确认 6723G 并输出 48 V / 1 A，等待台架设备稳定启动 20 秒后，
 * 再重新枚举脉冲器、IFBOX 和其余设备并执行真实通信预检。
 */
export async function runHassHardwarePreflight(
  nodes: FlowchartNode[]
): Promise<HassHardwarePreflightResponse> {
  const deviceInfo = await getDeviceInfo(false, false, false)
  const powerBinding = resolveHassPreflightPowerBinding(deviceInfo.serialDevices)
  const requiredRoles = getHassPreflightRequiredRoles(nodes)
  const baudrates = getHassPreflightBaudrates(nodes)

  const response = await apiClient.post('devices/halt-hass/preflight', {
    json: {
      bindings: [powerBinding],
      requiredRoles,
      baudrates,
      supplyVoltage: 48,
      supplyCurrentLimit: 1,
      powerStabilizationSeconds: 20,
    },
    timeout: 60000,
  }).json<Omit<HassHardwarePreflightResponse, 'powerResource'>>()

  return {
    ...response,
    powerResource: powerBinding.resource,
  }
}

/**
 * 正式流程尚未接管供电时，关闭预检阶段开启的 6723G 输出。
 */
export async function releaseHassPreflightPower(resource: string): Promise<void> {
  if (!resource) return
  await apiClient.post('devices/halt-hass/power-off', {
    json: { resource },
  })
}

function getControlString(
  node: FlowchartNode,
  controlName: string
): string | undefined {
  const ctrls = node.data.ctrls
  if (!ctrls || typeof ctrls !== 'object' || Array.isArray(ctrls)) {
    return undefined
  }
  const control = (ctrls as Record<string, unknown>)[controlName]
  if (!control || typeof control !== 'object' || Array.isArray(control)) {
    return undefined
  }
  const value = (control as Record<string, unknown>).value
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * 软件循环总时长到期后的独立关闭流程。
 * 此接口重新解析当前 USB 映射，不依赖循环工艺 end 分支或已取消
 * 拓扑中的旧连接对象。
 */
export async function runHassHardwareShutdown(
  nodes: FlowchartNode[]
): Promise<HassHardwareShutdownResponse> {
  const deviceInfo = await getDeviceInfo(false, false, false)
  const requiredPowerRoles: HassHardwareRole[] = [
    'itech6723',
    'itech3123',
  ]
  const bindings: ResolvedHassHardwareBinding[] = []

  // 单个电源缺失时仍把其它可用设备和 MQTT 停止请求提交给后端；
  // 后端会把缺失设备作为失败项返回，避免一项解析失败阻断全部收尾。
  for (const role of requiredPowerRoles) {
    try {
      bindings.push(
        ...resolveHassHardwareBindings([role], deviceInfo.serialDevices)
      )
    } catch (error) {
      console.error(`[HALT-HASS] 无法解析 ${role} 下电端口:`, error)
    }
  }

  const stopEdmNode = nodes.find(
    node => String(node.data.func || '').toUpperCase() === 'STOP_EDM'
  )
  const brokerIp = stopEdmNode
    ? getControlString(stopEdmNode, 'broker_ip') || '127.0.0.1'
    : '127.0.0.1'

  return apiClient.post('devices/halt-hass/shutdown', {
    json: {
      bindings,
      requiredPowerRoles,
      brokerIp,
    },
    timeout: 30000,
  }).json<HassHardwareShutdownResponse>()
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
