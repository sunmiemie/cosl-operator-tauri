/**
 * HALT-HASS 工艺 JSON 类型定义
 * 
 * 以 Flojoy 原生流程 JSON 为主，外层包装最小元数据
 */

/**
 * 工艺元数据
 */
export interface HaltHassProcessMeta {
  /** 创建时间（ISO 8601） */
  createdAt: string
  /** 更新时间（ISO 8601） */
  updatedAt: string
  /** 备注/说明 */
  notes?: string
  /** 作者 */
  author?: string
}

/**
 * Flojoy 节点定义（简化，实际结构由 Flojoy 决定）
 * 这里只定义基础结构，完整结构取决于 Flojoy 版本
 */
export interface FlojoyNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Flojoy 边（连接）定义
 */
export interface FlojoyEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  [key: string]: unknown
}

/**
 * Flojoy 原生流程 JSON 结构（简化）
 * 实际结构由 Flojoy 版本决定，此处定义基础框架
 */
export interface FlojoyFlow {
  /** Flojoy 版本 */
  version?: string
  /** 节点列表 */
  nodes: FlojoyNode[]
  /** 边（连接）列表 */
  edges: FlojoyEdge[]
  /** 视口状态 */
  viewport?: {
    x: number
    y: number
    zoom: number
  }
  /** 其他 Flojoy 特有字段 */
  [key: string]: unknown
}

/**
 * HALT-HASS 工艺 JSON 完整结构
 */
export interface HaltHassProcess {
  /** 工艺名称 */
  name: string
  /** 版本号 */
  version: string
  /** 电路板型号 ID（可选，后端对接时使用） */
  boardModelId?: number
  /** Flojoy 流程 JSON */
  flojoyFlow: FlojoyFlow
  /** 元数据 */
  meta: HaltHassProcessMeta
}

/**
 * 创建空的 Flojoy 流程
 */
export function createEmptyFlojoyFlow(): FlojoyFlow {
  return {
    version: '1.0.0',
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  }
}

/**
 * 创建新的 HALT-HASS 工艺
 */
export function createHaltHassProcess(
  name: string = '未命名工艺',
  version: string = '1.0.0'
): HaltHassProcess {
  const now = new Date().toISOString()
  return {
    name,
    version,
    flojoyFlow: createEmptyFlojoyFlow(),
    meta: {
      createdAt: now,
      updatedAt: now
    }
  }
}

/**
 * 本地存储的工艺列表项（用于列表展示）
 */
export interface HaltHassProcessListItem {
  /** 文件名 */
  fileName: string
  /** 工艺名称 */
  name: string
  /** 版本号 */
  version: string
  /** 电路板型号 ID */
  boardModelId?: number
  /** 更新时间 */
  updatedAt: string
  /** 文件完整路径 */
  filePath: string
}

/**
 * 验证是否为有效的 HALT-HASS 工艺 JSON
 */
export function isValidHaltHassProcess(data: unknown): data is HaltHassProcess {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.name === 'string' &&
    typeof obj.version === 'string' &&
    obj.flojoyFlow !== undefined &&
    obj.meta !== undefined
  )
}

/**
 * 验证是否为 Flojoy 原生流程 JSON（简单验证）
 */
export function isFlojoyFlow(data: unknown): data is FlojoyFlow {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return Array.isArray(obj.nodes) && Array.isArray(obj.edges)
}
