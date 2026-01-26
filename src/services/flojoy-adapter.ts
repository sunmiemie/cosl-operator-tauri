/**
 * Flojoy 数据适配层
 * 负责 Vue Flow 节点/边与 Studio 结构的转换
 */
import type { Node, Edge } from '@vue-flow/core'
import type {
  BlockData,
  BlockDefinition,
  CtrlData,
  RunSettings,
  BlockIO,
  ParamDefinition,
  PipDependency,
} from '@/views/process-halt-hass/types'
import type { BlockMetadataItem } from '@/services/flojoy-api'

/**
 * 将 Block 元数据转换为 CtrlData
 * @param parameters Block 参数定义
 * @param func 函数名
 */
export function parametersToCtrlData(
  parameters: Record<string, ParamDefinition> | undefined,
  func: string
): CtrlData {
  if (!parameters) return {}

  const ctrls: CtrlData = {}
  for (const [key, param] of Object.entries(parameters)) {
    ctrls[key] = {
      functionName: func,
      param: key,
      value: param.default,
      type: param.type,
      default: param.default,
      options: param.options,
      desc: param.desc,
    }
  }
  return ctrls
}

/**
 * 将 BlockMetadataItem 转换为完整的 BlockData
 * @param metadata Block 元数据
 * @param existingData 已有的部分数据
 */
export function metadataToBlockData(
  metadata: BlockMetadataItem,
  existingData?: Partial<BlockData>
): BlockData {
  const func = metadata.key

  return {
    id: existingData?.id || '',
    label: metadata.title,
    type: metadata.category?.toLowerCase() || 'default',
    func,
    path: metadata.key, // 路径暂用 key

    // 转换参数为控件数据
    ctrls: parametersToCtrlData(metadata.parameters as any, func),
    initCtrls: {},

    // IO 定义 - 使用 name 作为 id（Studio 惯例）
    inputs: metadata.inputs?.map((input) => ({
      name: input.name,
      id: input.name || 'default', // Studio 使用 name 作为 id
      type: input.type,
      desc: null,
      multiple: input.multiple,
    })),
    outputs: metadata.outputs?.map((output) => ({
      name: output.name,
      id: output.name || 'default', // Studio 使用 name 作为 id
      type: output.type,
      desc: null,
    })),

    // 依赖
    pip_dependencies: metadata.pip_dependencies?.map((dep) => {
      if (typeof dep === 'string') {
        const match = dep.match(/^([^=<>]+)([=<>]+.+)?$/)
        return {
          name: match?.[1] || dep,
          v: match?.[2] || null,
        }
      }
      return dep as PipDependency
    }),

    // 状态
    running: false,
    failed: false,
    invalid: false,

    // 兼容旧字段
    blockKey: metadata.key,
    category: metadata.category,
    status: 'pending',
    params: existingData?.params,
    result: existingData?.result,
  }
}

/**
 * 将 Vue Flow 节点转换为 Studio 格式（用于 API 调用）
 * @param nodes Vue Flow 节点列表
 */
export function vueFlowNodesToStudioNodes(
  nodes: Node<BlockData>[]
): Node<BlockData>[] {
  return nodes.map((node) => {
    const data = node.data

    // 确保关键字段存在
    const studioData: BlockData = {
      id: data.id || node.id,
      label: data.label || node.id,
      type: data.type || 'default',
      func: data.func || data.blockKey || node.id,
      path: data.path || data.blockKey || '',
      ctrls: data.ctrls || {},
      initCtrls: data.initCtrls,
      inputs: data.inputs,
      outputs: data.outputs,
      pip_dependencies: data.pip_dependencies,
      running: data.running,
      failed: data.failed,
      invalid: data.invalid,
      // 保留兼容字段
      blockKey: data.blockKey,
      category: data.category,
      status: data.status,
      params: data.params,
      result: data.result,
    }

    return {
      ...node,
      data: studioData,
    }
  })
}

/**
 * 将 Vue Flow 边转换为 Studio 格式（用于 API 调用）
 * @param edges Vue Flow 边列表
 */
export function vueFlowEdgesToStudioEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    sourceHandle: edge.sourceHandle || undefined,
    targetHandle: edge.targetHandle || undefined,
  }))
}

/**
 * 准备运行流程图的参数
 * @param nodes Vue Flow 节点
 * @param edges Vue Flow 边
 * @param jobId 作业 ID
 * @param observeBlocks 观察块列表
 * @param runSettings 运行设置
 */
export function prepareRunFlowchartArgs(
  nodes: Node<BlockData>[],
  edges: Edge[],
  jobId: string,
  observeBlocks?: string[],
  runSettings?: RunSettings
) {
  const studioNodes = vueFlowNodesToStudioNodes(nodes)
  const studioEdges = vueFlowEdgesToStudioEdges(edges)

  // 默认观察所有节点
  const observe = observeBlocks || nodes.map((n) => n.id)

  return {
    nodes: studioNodes.map((n) => ({
      id: n.id,
      type: n.type || 'default',
      position: n.position,
      data: (n.data || {}) as Record<string, unknown>,
    })),
    edges: studioEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
    jobId,
    observeBlocks: observe,
    settings: runSettings,
  }
}

/**
 * 从拖放数据创建节点
 * @param dropData 拖放数据（JSON 字符串）
 * @param position 节点位置
 */
export function createNodeFromDrop(
  dropData: string,
  position: { x: number; y: number }
): Node<BlockData> | null {
  try {
    const data = JSON.parse(dropData)
    const id = `${data.key || 'node'}-${Date.now()}`

    // 标准化 inputs，确保有正确的 id（使用 name 作为 id，Studio 惯例）
    const inputs = (data.inputs || [{ name: 'default', type: 'Any' }]).map(
      (input: { name?: string; id?: string; type?: string; multiple?: boolean }) => ({
        name: input.name || 'default',
        id: input.id || input.name || 'default',
        type: input.type || 'Any',
        multiple: input.multiple ?? false,
      })
    )

    // 标准化 outputs，确保有正确的 id
    const outputs = (data.outputs || [{ name: 'default', type: 'Any' }]).map(
      (output: { name?: string; id?: string; type?: string }) => ({
        name: output.name || 'default',
        id: output.id || output.name || 'default',
        type: output.type || 'Any',
      })
    )

    const blockData: BlockData = {
      id,
      label: data.label || data.title || data.key,
      type: data.type || 'default',
      func: data.key || id,
      path: data.key || '',
      ctrls: parametersToCtrlData(data.parameters, data.key || id),
      inputs,
      outputs,
      pip_dependencies: data.pip_dependencies,
      running: false,
      failed: false,
      invalid: false,
      blockKey: data.key,
      category: data.category,
      status: 'pending',
      params: {},
    }

    return {
      id,
      type: data.type || 'default',
      position,
      data: blockData,
    }
  } catch (e) {
    console.error('Failed to create node from drop data:', e)
    return null
  }
}

/**
 * 更新节点的运行状态
 * @param nodes 节点列表
 * @param nodeId 要更新的节点 ID
 * @param status 新状态
 * @param result 运行结果（可选）
 */
export function updateNodeRunStatus(
  nodes: Node<BlockData>[],
  nodeId: string,
  status: 'pending' | 'running' | 'success' | 'error',
  result?: unknown
): Node<BlockData>[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        data: {
          ...node.data,
          running: status === 'running',
          failed: status === 'error',
          status,
          result: result !== undefined ? result : node.data.result,
        },
      }
    }
    return node
  })
}

/**
 * 重置所有节点的运行状态
 * @param nodes 节点列表
 */
export function resetAllNodeStatus(
  nodes: Node<BlockData>[]
): Node<BlockData>[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      running: false,
      failed: false,
      status: 'pending',
      result: undefined,
    },
  }))
}

/**
 * 从 BlockDefinition 创建节点（用于从 manifest 添加）
 * @param block Block 定义
 * @param position 节点位置
 */
export function createNodeFromBlockDefinition(
  block: BlockDefinition,
  position: { x: number; y: number }
): Node<BlockData> {
  const id = `${block.key}-${Date.now()}`

  const blockData: BlockData = {
    id,
    label: block.name,
    type: block.type || 'default',
    func: block.key,
    path: block.key,
    ctrls: parametersToCtrlData(block.parameters as any, block.key),
    initCtrls: parametersToCtrlData(block.init_parameters as any, block.key),
    inputs: block.inputs,
    outputs: block.outputs,
    pip_dependencies: block.pip_dependencies,
    running: false,
    failed: false,
    invalid: false,
    blockKey: block.key,
    category: block.type,
    status: 'pending',
  }

  return {
    id,
    type: block.type?.toLowerCase() || 'default',
    position,
    data: blockData,
  }
}

/**
 * 序列化流程图数据（用于保存/导出）
 * @param nodes Vue Flow 节点
 * @param edges Vue Flow 边
 * @param observeBlocks 观察块列表
 * @param runSettings 运行设置
 */
export function serializeFlowchart(
  nodes: Node<BlockData>[],
  edges: Edge[],
  observeBlocks?: string[],
  runSettings?: RunSettings
) {
  return {
    nodes: vueFlowNodesToStudioNodes(nodes),
    edges: vueFlowEdgesToStudioEdges(edges),
    observeBlocks: observeBlocks || nodes.map((n) => n.id),
    runSettings: runSettings || {
      nodeDelay: 0,
      maximumRuntime: 3000,
      maximumConcurrentWorkers: 1,
    },
  }
}

/**
 * 反序列化流程图数据（用于加载/导入）
 * @param data 序列化的流程图数据
 */
export function deserializeFlowchart(data: {
  nodes?: Node<BlockData>[]
  edges?: Edge[]
  observeBlocks?: string[]
  runSettings?: RunSettings
}) {
  return {
    nodes: data.nodes || [],
    edges: data.edges || [],
    observeBlocks: data.observeBlocks || [],
    runSettings: data.runSettings || {
      nodeDelay: 0,
      maximumRuntime: 3000,
      maximumConcurrentWorkers: 1,
    },
  }
}

// ========== Studio 原生格式支持 ==========

/**
 * Studio 原生 JSON 格式（与 HASS循环.json 一致）
 */
export interface StudioFlowchartJson {
  name: string
  rfInstance: {
    nodes: StudioNode[]
    edges: StudioEdge[]
  }
  textNodes?: unknown[]
  controlNodes?: unknown[]
  controlVisualizationNodes?: unknown[]
  controlTextNodes?: unknown[]
}

interface StudioNode {
  id: string
  type: string
  data: StudioNodeData
  position: { x: number; y: number }
  width?: number
  height?: number
  selected?: boolean
  positionAbsolute?: { x: number; y: number }
  dragging?: boolean
}

interface StudioNodeData {
  id: string
  label: string
  func: string
  type: string
  ctrls: Record<string, StudioCtrl>
  initCtrls: Record<string, StudioCtrl>
  inputs: StudioIO[]
  outputs: StudioIO[]
  pip_dependencies?: Array<{ name: string; v: string | null }>
  path: string
}

interface StudioCtrl {
  type: string
  default: unknown
  desc: string | null
  overload: unknown | null
  functionName: string
  param: string
  value: unknown
  options?: unknown[]
}

interface StudioIO {
  name: string
  id: string
  type: string
  desc: string | null
  multiple?: boolean
}

interface StudioEdge {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  data?: {
    outputType?: string
  }
}

/**
 * 序列化为 Studio 原生格式（用于导出兼容文件）
 * @param name 流程图名称
 * @param nodes Vue Flow 节点
 * @param edges Vue Flow 边
 */
export function serializeToStudioFormat(
  name: string,
  nodes: Node<BlockData>[],
  edges: Edge[]
): StudioFlowchartJson {
  // 转换节点为 Studio 格式
  const studioNodes: StudioNode[] = nodes.map((node) => {
    const data = node.data
    
    // 转换 ctrls
    const ctrls: Record<string, StudioCtrl> = {}
    if (data?.ctrls) {
      for (const [key, ctrl] of Object.entries(data.ctrls)) {
        ctrls[key] = {
          type: ctrl.type || 'str',
          default: ctrl.default ?? null,
          desc: ctrl.desc ?? null,
          overload: null,
          functionName: data.func || '',
          param: key,
          value: ctrl.value,
          options: ctrl.options,
        }
      }
    }
    
    // 转换 initCtrls
    const initCtrls: Record<string, StudioCtrl> = {}
    if (data?.initCtrls) {
      for (const [key, ctrl] of Object.entries(data.initCtrls)) {
        initCtrls[key] = {
          type: ctrl.type || 'str',
          default: ctrl.default ?? null,
          desc: ctrl.desc ?? null,
          overload: null,
          functionName: data.func || '',
          param: key,
          value: ctrl.value,
          options: ctrl.options,
        }
      }
    }
    
    // 转换 inputs
    const inputs: StudioIO[] = (data?.inputs || []).map((input, idx) => ({
      name: input.name || 'default',
      id: input.id || input.name || `input-${idx}`,
      type: input.type || 'Any',
      desc: input.desc ?? null,
      multiple: input.multiple ?? false,
    }))
    
    // 转换 outputs
    const outputs: StudioIO[] = (data?.outputs || []).map((output, idx) => ({
      name: output.name || 'default',
      id: output.id || output.name || `output-${idx}`,
      type: output.type || 'Any',
      desc: output.desc ?? null,
    }))
    
    return {
      id: node.id,
      type: node.type || 'default',
      data: {
        id: node.id,
        label: data?.label || '',
        func: data?.func || '',
        type: node.type || 'default',
        ctrls,
        initCtrls,
        inputs,
        outputs,
        pip_dependencies: data?.pip_dependencies?.map((dep) => ({
          name: dep.name,
          v: dep.v ?? null,
        })),
        path: data?.path || '',
      },
      position: node.position,
      width: node.width,
      height: node.height,
    }
  })
  
  // 转换边为 Studio 格式
  const studioEdges: StudioEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle || 'default',
    targetHandle: edge.targetHandle || 'default',
    data: {
      outputType: 'Any',
    },
  }))
  
  return {
    name,
    rfInstance: {
      nodes: studioNodes,
      edges: studioEdges,
    },
    textNodes: [],
    controlNodes: [],
    controlVisualizationNodes: [],
    controlTextNodes: [],
  }
}

/**
 * 从 Studio 原生格式反序列化（用于导入兼容文件）
 * @param data Studio 格式的 JSON 数据
 */
export function deserializeFromStudioFormat(data: StudioFlowchartJson): {
  nodes: Node<BlockData>[]
  edges: Edge[]
} {
  const rfInstance = data.rfInstance
  
  // 转换节点
  const nodes: Node<BlockData>[] = (rfInstance?.nodes || []).map((studioNode) => {
    const studioData = studioNode.data
    
    // 转换 ctrls
    const ctrls: CtrlData = {}
    if (studioData?.ctrls) {
      for (const [key, ctrl] of Object.entries(studioData.ctrls)) {
        ctrls[key] = {
          functionName: ctrl.functionName,
          param: ctrl.param,
          value: ctrl.value,
          type: ctrl.type,
          default: ctrl.default,
          options: ctrl.options as unknown[],
          desc: ctrl.desc ?? undefined,
        }
      }
    }
    
    // 转换 initCtrls
    const initCtrls: CtrlData = {}
    if (studioData?.initCtrls) {
      for (const [key, ctrl] of Object.entries(studioData.initCtrls)) {
        initCtrls[key] = {
          functionName: ctrl.functionName,
          param: ctrl.param,
          value: ctrl.value,
          type: ctrl.type,
          default: ctrl.default,
          options: ctrl.options as unknown[],
          desc: ctrl.desc ?? undefined,
        }
      }
    }
    
    // 转换 inputs
    const inputs: BlockIO[] = (studioData?.inputs || []).map((input) => ({
      name: input.name,
      id: input.id,
      type: input.type,
      desc: input.desc ?? undefined,
      multiple: input.multiple,
    }))
    
    // 转换 outputs
    const outputs: BlockIO[] = (studioData?.outputs || []).map((output) => ({
      name: output.name,
      id: output.id,
      type: output.type,
      desc: output.desc ?? undefined,
    }))
    
    // 直接使用 Studio 原始类型（不做转换）
    const nodeType = studioNode.type || 'default'
    
    const blockData: BlockData = {
      id: studioNode.id,
      label: studioData?.label || '',
      type: nodeType,
      func: studioData?.func || '',
      path: studioData?.path || '',
      ctrls,
      initCtrls,
      inputs,
      outputs,
      pip_dependencies: studioData?.pip_dependencies?.map((dep) => ({
        name: dep.name,
        v: dep.v,
      })),
      running: false,
      failed: false,
      invalid: false,
      blockKey: studioData?.func,
      category: nodeType,
      status: 'pending',
    }
    
    return {
      id: studioNode.id,
      type: nodeType, // 保持 Studio 原始类型
      position: studioNode.position,
      data: blockData,
      // 不传递 width/height，让 Vue Flow 自动计算节点尺寸
      // Studio 的尺寸是 React Flow 计算的，与我们的自定义节点样式不匹配
    }
  })
  
  // 转换边
  const edges: Edge[] = (rfInstance?.edges || []).map((studioEdge) => ({
    id: studioEdge.id,
    source: studioEdge.source,
    target: studioEdge.target,
    sourceHandle: studioEdge.sourceHandle,
    targetHandle: studioEdge.targetHandle,
  }))
  
  return { nodes, edges }
}

/**
 * 检测 JSON 数据是否为 Studio 原生格式
 * @param data JSON 数据
 */
export function isStudioFormat(data: unknown): data is StudioFlowchartJson {
  return (
    typeof data === 'object' &&
    data !== null &&
    'rfInstance' in data &&
    typeof (data as StudioFlowchartJson).rfInstance === 'object'
  )
}
