/**
 * HALT-HASS 工艺类型定义
 * 对齐 Studio 数据结构
 */
import type { Node, Edge } from '@vue-flow/core'

// ========== Block 相关类型（对齐 Studio） ==========

// Block 参数值类型
export type BlockParameterValue = string | number | boolean | null | undefined

// Block 参数定义（对齐 Studio ParamDefinition）
export interface ParamDefinition {
  type: string
  default: BlockParameterValue
  options?: (string | number)[]
  desc: string | null
  overload: Record<string, string[]> | null
}

// Block IO 定义（对齐 Studio blockIoSchema）
export interface BlockIO {
  name: string
  id: string
  type: string
  desc: string | null
  multiple?: boolean // 仅 input 有
}

// pip 依赖
export interface PipDependency {
  name: string
  v: string | null
}

// Block 定义（对齐 Studio BlockDefinition）
export interface BlockDefinition {
  name: string
  key: string
  type: string
  inputs?: BlockIO[]
  outputs?: BlockIO[]
  parameters?: Record<string, ParamDefinition>
  init_parameters?: Record<string, ParamDefinition>
  pip_dependencies?: PipDependency[]
  children: null
}

// ========== 控件数据类型（对齐 Studio CtrlData） ==========

export type CtrlData = Record<
  string,
  {
    functionName: string
    param: string
    value: BlockParameterValue
    type?: string
    default?: BlockParameterValue
    options?: (string | number)[]
    desc?: string | null
  }
>

// ========== Block 节点数据（对齐 Studio BlockData） ==========

export interface BlockData {
  // 核心标识
  id: string
  label: string
  type: string
  func: string
  path: string
  
  // 控件参数
  ctrls: CtrlData
  initCtrls?: CtrlData
  
  // IO 定义
  inputs?: BlockIO[]
  outputs?: BlockIO[]
  
  // 依赖
  pip_dependencies?: PipDependency[]
  
  // 运行状态
  running?: boolean
  failed?: boolean
  invalid?: boolean
  
  // 额外的自定义字段（用于兼容旧格式）
  blockKey?: string
  category?: string
  status?: 'pending' | 'running' | 'success' | 'error'
  params?: Record<string, unknown>
  result?: unknown
}

// ========== Block 结果类型（对齐 Studio BlockResult） ==========

export interface PlotlyFig {
  data: unknown[]
  layout: Record<string, unknown> | undefined
}

export interface DataContainer {
  type: string
  [key: string]: unknown
}

export interface BlockResult {
  plotly_fig?: PlotlyFig
  text_blob?: string
  data?: DataContainer
}

// ========== 运行设置（对齐 Studio BackendSettings） ==========

export interface RunSettings {
  nodeDelay: number
  maximumRuntime: number
  maximumConcurrentWorkers: number
}

// 默认运行设置
export const defaultRunSettings: RunSettings = {
  nodeDelay: 0,
  maximumRuntime: 3000,
  maximumConcurrentWorkers: 1,
}

// ========== HALT-HASS 工艺类型 ==========

// 电路板组项（用于 metadata 中的简化引用）
export interface BoardGroupItem {
  id: number
  name: string
}

// 电路板型号项（电路板组内的成员）
export interface BoardModelItem {
  id: number
  name: string
  code?: string
}

// 电路板组（完整结构，用于电路板组管理）
export interface BoardGroup {
  id: number
  name: string
  description: string
  boards: BoardModelItem[]
  createdAt?: string
  updatedAt?: string
  userId?: number
}

// 创建电路板组的参数
export interface CreateBoardGroupParams {
  name: string
  description?: string
  boardModelIds: number[]
}

// HALT-HASS 工作项（我的待处理列表）
export interface HaltHassJob {
  id: number
  name: string
  version: string
  status: number  // 0=已创建, 1=待审核, 2=待修改, 3=可使用
  boardGroups: BoardGroupItem[]
  feedback: string[]
  createdAt: string
  auditNum?: number
}

// HALT-HASS 曲线文件引用（文件本体保存在后端）
export interface HaltHassCurveFile {
  fileId: string
  fileName: string
  storedName: string
  storageKey: string
  fileSize: number
  contentType: string
  sha256: string
  uploadedAt: string
}

// HALT-HASS 工艺元信息
export interface HaltHassMetadata {
  // 工艺名称
  name: string
  // 版本号
  version: string
  // 电路板组（多选）
  boardGroup: BoardGroupItem[]
  // 描述/说明
  description: string
  // 试验时长（小时，最多两位小数）
  durationHours?: number
  // HALT-HASS 曲线文件
  curveFile?: HaltHassCurveFile
  // 基础版本（用于迭代）
  baseVersion?: {
    processId: number
    version: string
  }
  // 创建时间
  createdAt?: string
  // 更新时间
  updatedAt?: string
  // 创建者
  createdBy?: string
}

// ========== 安装指导类型 ==========

// 单个安装步骤
export interface InstallationStep {
  id: number
  // 步骤标题
  title: string
  // 文字说明
  content: string
  // 图片列表（base64 或 URL）
  images: string[]
  // 视频（可选，URL 或 base64）
  video?: string
}

// 安装指导
export interface InstallationGuide {
  steps: InstallationStep[]
}

// HALT-HASS 流程图数据
export interface HaltHassFlowchart {
  // 节点列表
  nodes: Node<BlockData>[]
  // 边（连线）列表
  edges: Edge[]
  // 观察块 ID 列表（用于实时显示结果）
  observeBlocks: string[]
  // 运行参数
  runSettings: RunSettings
}

// HALT-HASS 工艺完整 JSON 结构
export interface HaltHassProcessJson {
  // 元信息
  metadata: HaltHassMetadata
  // 安装指导
  installGuide: InstallationGuide
  // 流程图数据
  flowchart: HaltHassFlowchart
  // 审核反馈（可选）
  feedback?: string[]
}

// 创建空的 HALT-HASS 工艺 JSON
export function createEmptyHaltHassJson(): HaltHassProcessJson {
  return {
    metadata: {
      name: '',
      version: '1.0.0',
      boardGroup: [],
      description: '',
    },
    installGuide: {
      steps: [],
    },
    flowchart: {
      nodes: [],
      edges: [],
      observeBlocks: [],
      runSettings: { ...defaultRunSettings },
    },
  }
}

// 编辑表单状态
export interface HaltHassEditForm {
  // 工艺名称
  name: string
  // 版本号
  version: string
  // 描述
  description: string
  // 当前编辑的工艺 ID（-1 表示新建）
  processId: number
  // 是否为编辑模式（修改已有工艺）
  isEdit: boolean
  // 是否有未保存的更改
  hasUnsavedChanges: boolean
}

// 创建空的编辑表单
export function createEmptyEditForm(): HaltHassEditForm {
  return {
    name: '',
    version: '1.0.0',
    description: '',
    processId: -1,
    isEdit: false,
    hasUnsavedChanges: false,
  }
}

// ========== Manifest 树结构类型（对齐 Studio） ==========

// 叶子节点
export type Leaf = BlockDefinition

// 父节点（分类）
export interface ParentNode {
  name: string
  key?: string
  children: (ParentNode | BlockDefinition)[]
}

// 根节点
export interface RootNode {
  name: 'ROOT'
  children: (ParentNode | BlockDefinition)[]
}

// 仅包含叶子的父节点
export interface LeafParentNode extends ParentNode {
  children: Leaf[]
}

// 树节点联合类型
export type TreeNode = Leaf | ParentNode | LeafParentNode | RootNode
