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
  externalizeHassRuntimeGraph,
  getHassPreflightBaudrates,
  getHassPreflightRequiredRoles,
  getRequiredHassHardwareRoles,
  type HassHardwareProfile,
  type HassHardwareRole,
  type ResolvedHassHardwareBinding,
} from '@/services/hass-hardware-binding'
import {
  getHassHardwareProfiles,
  loadHassWorkbenchConfig,
} from '@/services/hass-workbench-config'

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

export interface GracefulFlowchartStopResponse {
  success: boolean
  graceful: boolean
  forced: boolean
  discardedJobs: number
  unfinishedJobs: number
  message: string
}

export type FlojoyExecutionLogLevel = 'debug' | 'info' | 'warning' | 'error'

export interface FlojoyExecutionLogEntry {
  id: string
  timestamp: string
  timestampMs: number
  level: FlojoyExecutionLogLevel | string
  eventType: string
  direction: 'send' | 'receive' | string
  jobsetId: string
  nodeId: string
  function: string
  message: string
  data: unknown
  persisted?: boolean
  persistenceError?: string
}

export interface FlojoyExecutionLogResponse {
  persisted: boolean
  path: string
  events: FlojoyExecutionLogEntry[]
  hasMore: boolean
  nextBeforeTimestampMs: number | null
  nextBeforeEventId: string | null
  queued: number
  persistenceError: string
}

export interface AppendFlojoyExecutionLogInput {
  eventType: string
  message: string
  level?: FlojoyExecutionLogLevel | string
  direction?: 'send' | 'receive' | string
  data?: unknown
  jobsetId?: string
  nodeId?: string
  function?: string
}

export interface HassHardwareBindingResolveResponse {
  bindings: ResolvedHassHardwareBinding[]
  errors: Partial<Record<HassHardwareRole, string>>
}

export type HassRectifierAction =
  | 'initialize'
  | 'set_input'
  | 'set_loads'
  | 'measure'
  | 'shutdown'

export interface HassRectifierMeasurement {
  output48Voltage: number
  output48CurrentA: number
  output90Voltage: number
  output90CurrentA: number
}

export interface HassRectifierCommandResponse {
  success: boolean
  action: HassRectifierAction
  message: string
  measurement?: HassRectifierMeasurement | null
}

export interface HassRectifierCommandInput {
  inputVoltage?: number
  sourceCurrentLimitA?: number
  load48Ohm?: number
  load90Ohm?: number
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
  } = args
  const externalizedGraph = externalizeHassRuntimeGraph(nodes, edges)
  const requiredHardware = getRequiredHassHardwareRoles(externalizedGraph.nodes)
  let runtimeNodes = externalizedGraph.nodes
  const runtimeEdges = externalizedGraph.edges

  if (requiredHardware.length > 0) {
    // 工艺只描述设备角色；每次运行都根据客户端工作台配置解析当前端口，
    // 并且只修改本次请求的内存副本。
    const bindings = await discoverHassHardwareBindings(
      requiredHardware,
      getHassPreflightBaudrates(externalizedGraph.nodes),
    )
    runtimeNodes = applyHassHardwareBindings(externalizedGraph.nodes, bindings)
    console.info(
      '[HASS Hardware Binding]',
      bindings.map(({ displayName, port, hwid }) => ({ displayName, port, hwid }))
    )
  }

  // 构建请求体，对齐 Studio 的 PostWFC 模型
  const requestBody: Record<string, unknown> = {
    fc: JSON.stringify({ nodes: runtimeNodes, edges: runtimeEdges }),
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

export async function resolveHassHardwareBindings(
  roles: HassHardwareRole[],
  baudrates: Partial<Record<HassHardwareRole, number>> = {},
  profiles: HassHardwareProfile[] = getHassHardwareProfiles(roles),
): Promise<HassHardwareBindingResolveResponse> {
  const response = await apiClient.post('devices/halt-hass/resolve-bindings', {
    json: { roles, baudrates, profiles },
    timeout: 15000,
  }).json<HassHardwareBindingResolveResponse>()

  return response
}

export async function discoverHassHardwareBindings(
  roles: HassHardwareRole[],
  baudrates: Partial<Record<HassHardwareRole, number>> = {},
  allowPartial = false,
  profiles: HassHardwareProfile[] = getHassHardwareProfiles(roles),
): Promise<ResolvedHassHardwareBinding[]> {
  const response = await resolveHassHardwareBindings(roles, baudrates, profiles)

  const errors = Object.entries(response.errors || {})
  if (!allowPartial && errors.length > 0) {
    throw new Error(errors.map(([, message]) => message).join('；'))
  }
  if (allowPartial) {
    errors.forEach(([role, message]) => {
      console.error(`[HALT-HASS] 无法按序列号解析 ${role}: ${message}`)
    })
  }
  return response.bindings
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
 * 停止调度新的循环节点，等待当前在途节点结束并释放 Flojoy 设备连接。
 * 超时后由 Flojoy 执行有记录的强制释放，调用方仍应继续做独立下电确认。
 */
export async function gracefulStopCurrentFlowchartRun(
  jobId: string | null,
  timeoutSeconds = 15,
): Promise<GracefulFlowchartStopResponse> {
  return apiClient.post('graceful_stop_fc', {
    json: {
      jobsetId: jobId,
      timeoutSeconds,
    },
    timeout: Math.max(30_000, (timeoutSeconds + 10) * 1000),
  }).json<GracefulFlowchartStopResponse>()
}

/**
 * 获取设备列表
 */
export async function getDeviceInfo(
  discoverNIDAQmx = false,
  discoverNIDMM = false,
  includeVISADevices = true,
  includeCameraDevices = true,
): Promise<DeviceInfo> {
  const response = await apiClient.get('devices', {
    searchParams: {
      include_nidaqmx_drivers: discoverNIDAQmx,
      include_nidmm_drivers: discoverNIDMM,
      include_visa_devices: includeVISADevices,
      include_camera_devices: includeCameraDevices,
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
 * 先按序列号确认固定的 3123 并输出 48 V / 1 A，等待台架设备稳定启动 20 秒后，
 * 再重新枚举脉冲器、IFBOX 和其余设备并执行真实通信预检。
 */
export async function runHassHardwarePreflight(
  nodes: FlowchartNode[],
  reportType: 'drive_control' | 'rectifier_regulator' = 'drive_control',
): Promise<HassHardwarePreflightResponse> {
  if (reportType === 'rectifier_regulator') {
    const requiredRoles = getHassPreflightRequiredRoles(nodes, reportType)
    const profiles = getHassHardwareProfiles(requiredRoles)
    const response = await apiClient.post('devices/halt-hass/preflight', {
      json: {
        bindings: [],
        requiredRoles,
        profiles,
        reportType,
      },
      timeout: 60000,
    }).json<Omit<HassHardwarePreflightResponse, 'powerResource'>>()
    return { ...response, powerResource: '' }
  }

  const [powerBinding] = await discoverHassHardwareBindings(['itech3123_48v'])
  const requiredRoles = getHassPreflightRequiredRoles(nodes, reportType)
  const baudrates = getHassPreflightBaudrates(nodes)
  const profiles = getHassHardwareProfiles([
    'itech3123_48v',
    ...requiredRoles,
  ])

  const response = await apiClient.post('devices/halt-hass/preflight', {
    json: {
      bindings: [powerBinding],
      requiredRoles,
      baudrates,
      profiles,
      supplyVoltage: 48,
      supplyCurrentLimit: 1,
      powerStabilizationSeconds: 20,
      reportType,
    },
    timeout: 60000,
  }).json<Omit<HassHardwarePreflightResponse, 'powerResource'>>()

  return {
    ...response,
    powerResource: powerBinding.resource,
  }
}

/**
 * 正式流程尚未接管供电时，关闭预检阶段开启的 48 V 3123 输出。
 */
export async function releaseHassPreflightPower(resource: string): Promise<void> {
  if (!resource) return
  const profile = getHassHardwareProfiles(['itech3123_48v'])[0]
  await apiClient.post('devices/halt-hass/power-off', {
    json: {
      resource,
      role: 'itech3123_48v',
      instrumentSerial: profile?.matcher.instrumentSerial,
    },
  })
}

/**
 * 软件循环总时长到期后的独立关闭流程。
 * 此接口重新解析当前 USB 映射，不依赖循环工艺 end 分支或已取消
 * 拓扑中的旧连接对象。
 */
export async function runHassHardwareShutdown(
  _nodes: FlowchartNode[],
  jobId = '',
  reportType: 'drive_control' | 'rectifier_regulator' = 'drive_control',
): Promise<HassHardwareShutdownResponse> {
  if (reportType === 'rectifier_regulator') {
    const roles: HassHardwareRole[] = [
      'itech3123_input',
      'itech8513_48v_load',
      'itech8513_90v_load',
    ]
    const bindings = await discoverHassHardwareBindings(roles, {}, true)
    const response = await runHassRectifierCommand(
      'shutdown',
      bindings,
      {},
      jobId,
    )
    return {
      success: response.success,
      message: response.success ? '整流稳压负载和输入源已关闭' : response.message,
      results: [{
        role: 'rectifier_hardware',
        displayName: '整流稳压输入源和两路负载',
        success: response.success,
        message: response.message,
      }],
    }
  }
  const requiredPowerRoles: HassHardwareRole[] = [
    'itech3123_48v',
    'itech3123',
  ]
  // 单个电源缺失时仍把其它可用设备和 MQTT 停止请求提交给后端；
  // 后端会把缺失设备作为失败项返回，避免一项解析失败阻断全部收尾。
  const bindings = await discoverHassHardwareBindings(
    requiredPowerRoles,
    {},
    true,
  )

  const brokerIp = loadHassWorkbenchConfig().mqtt.broker

  return apiClient.post('devices/halt-hass/shutdown', {
    json: {
      bindings,
      requiredPowerRoles,
      brokerIp,
      jobsetId: jobId,
    },
    timeout: 30000,
  }).json<HassHardwareShutdownResponse>()
}

export async function resolveHassRectifierBindings(): Promise<ResolvedHassHardwareBinding[]> {
  return discoverHassHardwareBindings([
    'itech3123_input',
    'itech8513_48v_load',
    'itech8513_90v_load',
  ])
}

export async function runHassRectifierCommand(
  action: HassRectifierAction,
  bindings: ResolvedHassHardwareBinding[],
  input: HassRectifierCommandInput = {},
  jobId = '',
): Promise<HassRectifierCommandResponse> {
  return apiClient.post('devices/halt-hass/rectifier/command', {
    json: {
      action,
      bindings,
      inputVoltage: input.inputVoltage,
      sourceCurrentLimitA: input.sourceCurrentLimitA ?? 5,
      load48Ohm: input.load48Ohm,
      load90Ohm: input.load90Ohm,
      jobsetId: jobId,
    },
    timeout: 30000,
  }).json<HassRectifierCommandResponse>()
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

/**
 * 获取 Flojoy 结构化执行日志。jobId 为空时返回全部任务中的最近记录。
 */
export async function getExecutionLogs(
  jobId = '',
  limit = 200,
  beforeEventId?: string,
  beforeTimestampMs?: number,
): Promise<FlojoyExecutionLogResponse> {
  return apiClient.get('execution_logs', {
    searchParams: {
      jobset_id: jobId,
      limit: String(limit),
      ...(beforeEventId ? { before_event_id: beforeEventId } : {}),
      ...(beforeTimestampMs === undefined
        ? {}
        : { before_timestamp_ms: String(beforeTimestampMs) }),
    },
  }).json<FlojoyExecutionLogResponse>()
}

/** 把客户端侧通信事件追加到 Flojoy 的同一份 JSONL 日志。 */
export async function appendExecutionLog(
  event: AppendFlojoyExecutionLogInput
): Promise<{ persisted: boolean; event: FlojoyExecutionLogEntry }> {
  return apiClient.post('execution_logs', { json: event }).json<{
    persisted: boolean
    event: FlojoyExecutionLogEntry
  }>()
}

// 导出错误类型
export { HTTPError }
