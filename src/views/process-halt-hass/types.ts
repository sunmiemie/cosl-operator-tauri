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
  // 客户端工作台设备角色；具体串口/VISA 地址只在运行时注入。
  hardwareRole?:
    | 'pulser'
    | 'itech3123_48v'
    | 'itech3123'
    | 'itech3123_input'
    | 'itech8513_48v_load'
    | 'itech8513_90v_load'
    | 'ifbox'
    | 'storage'
  
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

// 工艺适用的电路板型号。这里只保存型号范围，不表达工单数量或具体 SN。
export type HaltHassApplicableBoardModel = BoardModelItem

export interface HaltHassProductModel {
  id: number
  name: string
}

export type HaltHassExperimentMode = 'halt' | 'hass'

export interface HaltHassAssemblySlot {
  slotNo: number
  name: string
  required: boolean
  allowCompanion: boolean
  allowedBoardModelIds: number[]
}

export interface HaltHassAssemblyRule {
  slotCount: number
  minimumTargetBoards: number
  allowCompanionBoards: boolean
  allowEmptySlots: boolean
  slots: HaltHassAssemblySlot[]
}

export type HaltHassReportType = 'drive_control' | 'rectifier_regulator'

export interface RectifierLoadConfig {
  load48Ohm: number
  load90Ohm: number
}

export interface RectifierVoltageRange {
  min: number
  max: number
}

export interface RectifierProcessConfig {
  inputVoltageSteps: number[]
  sourceCurrentLimitA: number
  temperatureToleranceC: number
  temperatureStableSeconds: number
  voltageSettleSeconds: number
  halfLoadSettleSeconds: number
  fullLoadSettleSeconds: number
  halfLoad: RectifierLoadConfig
  fullLoad: RectifierLoadConfig
  output48VoltageRange: RectifierVoltageRange
  output90VoltageRange: RectifierVoltageRange
  currentUnit: 'A'
}

export function createDefaultRectifierProcessConfig(): RectifierProcessConfig {
  return {
    inputVoltageSteps: [150, 200, 250, 300, 350, 400],
    sourceCurrentLimitA: 5,
    temperatureToleranceC: 5,
    temperatureStableSeconds: 120,
    voltageSettleSeconds: 3,
    halfLoadSettleSeconds: 3,
    fullLoadSettleSeconds: 3,
    halfLoad: {
      load48Ohm: 15.36,
      load90Ohm: 56,
    },
    fullLoad: {
      load48Ohm: 7.68,
      load90Ohm: 28,
    },
    output48VoltageRange: {
      min: 45.6,
      max: 50.4,
    },
    output90VoltageRange: {
      min: 85.5,
      max: 94.5,
    },
    currentUnit: 'A',
  }
}

export interface SdsTemperatureTriggerConfig {
  toleranceC: number
  stableDurationSeconds: number
  mqttTimeoutSeconds: number
  stageIdentityFields: Array<'sequence' | 'TotalTime'>
}

export interface SdsPowerConfig {
  voltage: number
  currentLimit: number
}

export interface SdsSerialConfig {
  baudRate: number
  responseTimeoutSeconds: number
}

export interface SdsCommunicationCheck {
  role: string
  label: string
  expectedValue: string
  protocolCommand?: string
  implemented: boolean
}

export interface SdsProcessConfig {
  method: 'full_hydraulic'
  executionReady: boolean
  power: SdsPowerConfig
  serial: SdsSerialConfig
  temperatureTrigger: SdsTemperatureTriggerConfig
  communicationChecks: SdsCommunicationCheck[]
  pressurePointsMpa: number[]
  pointHoldSeconds: number
  ignoredSfuFields: string[]
  pendingProtocolItems: string[]
}

export function createDefaultSdsProcessConfig(): SdsProcessConfig {
  return {
    method: 'full_hydraulic',
    executionReady: false,
    power: {
      voltage: 48,
      currentLimit: 6,
    },
    serial: {
      baudRate: 19200,
      responseTimeoutSeconds: 0.35,
    },
    temperatureTrigger: {
      toleranceC: 2,
      stableDurationSeconds: 120,
      mqttTimeoutSeconds: 10,
      stageIdentityFields: ['sequence', 'TotalTime'],
    },
    communicationChecks: [
      { role: 'main_controller', label: '主控电路板', expectedValue: '0026', implemented: false },
      { role: 'motor_m1', label: '电机控制板 M1', expectedValue: '00C4', implemented: false },
      { role: 'motor_m2', label: '电机控制板 M2', expectedValue: '00C4', implemented: false },
      { role: 'motor_m3', label: '电机控制板 M3', expectedValue: '00C4', implemented: false },
      { role: 'tbus_echo', label: 'TBUS echo', expectedValue: '005C', protocolCommand: 'F9810002067C', implemented: true },
      { role: 'primary_comm_echo', label: '初级通讯板 echo', expectedValue: '0062', protocolCommand: 'D8810002267C', implemented: true },
      { role: 'secondary_comm_echo', label: '次级通讯板 echo', expectedValue: '0062', protocolCommand: 'D9810002257C', implemented: true },
    ],
    pressurePointsMpa: [2, 5, 10, 15, 20],
    pointHoldSeconds: 120,
    ignoredSfuFields: ['A2', 'B2', 'A3', 'B3', 'K2', 'K3', 'PID'],
    pendingProtocolItems: [
      '主控电路板 0026 查询指令',
      'M1/M2/M3 电机控制板 00C4 查询指令',
      '六个液压位置的控制码及切换顺序',
      'SFU 参数完整读写指令与比对规则',
    ],
  }
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
  // 产品大类（HSVP、SDS 等）
  productModel: HaltHassProductModel | null
  // HALT/HASS 实验模式
  experimentMode: HaltHassExperimentMode | ''
  // 工艺适用型号；目标板数量由工单决定
  applicableBoardModels: HaltHassApplicableBoardModel[]
  // 台架装配规则；与工单目标板数量分离
  assemblyRule: HaltHassAssemblyRule
  // 报告业务类型；不作为工单测试类型使用
  reportType: HaltHassReportType
  // 整流稳压工艺运行参数；仅 reportType=rectifier_regulator 时使用
  rectifierConfig?: RectifierProcessConfig
  // 描述/说明
  description: string
  // 旧版本曲线文件引用，仅用于读取历史工艺；新流程由 MQTT ListTest 选择。
  curveFile?: HaltHassCurveFile
  // SDS 全套液压工艺运行参数；仅 clientTestType=2 时使用
  sdsConfig?: SdsProcessConfig
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

export type HaltHassFlowType = 'test' | 'cycle'

export function createEmptyHaltHassFlowchart(): HaltHassFlowchart {
  return {
    nodes: [],
    edges: [],
    observeBlocks: [],
    runSettings: { ...defaultRunSettings },
  }
}

// HALT-HASS 工艺完整 JSON 结构
export interface HaltHassProcessJson {
  // 双流程结构版本
  schemaVersion: 2
  // 元信息
  metadata: HaltHassMetadata
  // 安装指导
  installGuide: InstallationGuide
  // 测试流：验证设备通断和是否具备测试状态
  testFlow: HaltHassFlowchart
  // 循环流：按工单总时长持续采集设备状态和曲线
  cycleFlow: HaltHassFlowchart
  // 审核反馈（可选）
  feedback?: string[]
}

// 创建空的 HALT-HASS 工艺 JSON
export function createEmptyHaltHassJson(): HaltHassProcessJson {
  return {
    schemaVersion: 2,
    metadata: {
      name: '',
      version: '1.0.0',
      boardGroup: [],
      productModel: null,
      experimentMode: '',
      applicableBoardModels: [],
      assemblyRule: {
        slotCount: 5,
        minimumTargetBoards: 1,
        allowCompanionBoards: true,
        allowEmptySlots: false,
        slots: Array.from({ length: 5 }, (_, index) => ({
          slotNo: index + 1,
          name: `板位 ${index + 1}`,
          required: true,
          allowCompanion: true,
          allowedBoardModelIds: [],
        })),
      },
      reportType: 'drive_control',
      description: '',
    },
    installGuide: {
      steps: [],
    },
    testFlow: createEmptyHaltHassFlowchart(),
    cycleFlow: createEmptyHaltHassFlowchart(),
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
