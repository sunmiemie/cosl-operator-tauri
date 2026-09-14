<script setup lang="ts">
/**
 * HALT-HASS 工艺编辑页面
 * 使用 Vue Flow 实现流程图编辑
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// 导入自定义组件
import type { Node, Edge } from '@vue-flow/core'
import { v4 as uuidv4 } from 'uuid'

// 导入流程图组件
import { FlowchartEditor, BlockSidebar, ControlBar } from '@/components/flowchart'

// 导入新增组件
import BoardGroupListSelector from './components/BoardGroupListSelector.vue'
import CreateBoardGroupDialog from './components/CreateBoardGroupDialog.vue'
import JobDrawer from './components/JobDrawer.vue'
import InstallGuideEditor from './components/InstallGuideEditor.vue'

// 导入 composables
import { useHaltHassProcess } from './composables/useHaltHassProcess'
import { useLayout } from '@/composables/useLayout'
import { useFlojoyBackend } from '@/composables/useFlojoyBackend'
import { useFlojoySocket } from '@/composables/useFlojoySocket'
import { useAuth } from '@/composables/useAuth'
import { runFlowchart, cancelFlowchartRun, configureApi, checkHealth } from '@/services/flojoy-api'

// 导入类型和适配器
import type {
  BlockData,
  HaltHassJob,
  HaltHassFlowchart,
  HaltHassFlowType,
  HaltHassProcessJson,
  CreateBoardGroupParams,
  BoardModelItem,
  RectifierProcessConfig,
  SdsProcessConfig,
} from './types'
import { createDefaultRectifierProcessConfig, createDefaultSdsProcessConfig } from './types'
import {
  prepareRunFlowchartArgs,
  deserializeFromStudioFormat,
  isStudioFormat,
  serializeToStudioFormat,
} from '@/services/flojoy-adapter'

// 导入 Tauri 插件
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

// 布局控制
const { enterEditMode, exitEditMode } = useLayout()

// 后端控制
const {
  start: startBackend,
  isRunning: backendRunning,
  port: backendPort,
} = useFlojoyBackend()

// WebSocket 连接
const {
  connect: connectSocket,
  disconnect: disconnectSocket,
  isConnected: socketConnected,
  isRunning: flowchartRunning,
  clearNodeStatuses,
  socketId,
  serverStatus,
} = useFlojoySocket()

// 认证信息
const { userInfo } = useAuth()

// 使用 HALT-HASS 工艺管理
const {
  processJson,
  editForm,
  canSave,
  isSaving,
  isRuntimeConfigComplete,
  errorMessage,
  treeData,
  isOnline,
  tempList,
  myJobData,
  boardGroups,
  selectedBoardGroup,
  versionsByBoardGroup,
  resetProcess,
  updateMetadata,
  getRuntimeConfigError,
  updateFlowchart,
  getRunSettings,
  getObserveBlocks,
  resetNodeStatuses,
  fetchTreeData,
  fetchTempList,
  loadFromTemp,
  saveToTemp,
  deleteTempProcess,
  uploadProcess,
  fetchProcess,
  submitToCheck,
  fetchMyJobData,
  deleteProcess,
  fetchBoardGroups,
  createBoardGroup,
  selectBoardGroup,
  fetchVersionsByBoardGroup,
  loadVersionForIteration,
} = useHaltHassProcess()

// 流程图编辑器引用
const editorRef = ref<InstanceType<typeof FlowchartEditor>>()

// 页面状态
const currentStep = ref(0)
const showSidebar = ref(true)
const showJobDrawer = ref(false)
const showCreateBoardGroupDialog = ref(false)
const currentJobId = ref<string | null>(null)
const boardGroupsLoading = ref(false)

// 步骤配置：安装指导、测试流、循环流分别独立编辑。
const steps = [
  { key: 'select', label: '选择工艺' },
  { key: 'install', label: '安装指导' },
  { key: 'test-flow', label: '测试流编辑' },
  { key: 'cycle-flow', label: '循环流编辑' },
  { key: 'preview', label: '预览确认' },
]

// 基于版本迭代
const selectedBaseVersion = ref<number | null>(null)

// 两套画布状态完全隔离，切换步骤时不复用节点或连线引用。
const testFlowNodes = ref<Node[]>([])
const testFlowEdges = ref<Edge[]>([])
const cycleFlowNodes = ref<Node[]>([])
const cycleFlowEdges = ref<Edge[]>([])
const activeFlowType = computed<HaltHassFlowType>(() =>
  currentStep.value === 3 ? 'cycle' : 'test'
)
const activeFlowLabel = computed(() =>
  activeFlowType.value === 'test' ? '测试流' : '循环流'
)
const activeFlowNodes = computed(() =>
  activeFlowType.value === 'test' ? testFlowNodes.value : cycleFlowNodes.value
)
const activeFlowEdges = computed(() =>
  activeFlowType.value === 'test' ? testFlowEdges.value : cycleFlowEdges.value
)

// 计算属性
// WebSocket 已建立即可确认 Flojoy 具备运行能力。
// 后端也可能由外部进程启动，此时 Rust 进程状态不会标记为 running。
const canRun = computed(() => socketConnected.value)
const canStartEditing = computed(() => {
  return Boolean(
    selectedBoardGroup.value
      && processJson.value.metadata.name.trim()
      && processJson.value.metadata.version.trim()
      && isRuntimeConfigComplete.value
  )
})

const applicableBoardModelIds = computed(() => new Set(
  (processJson.value.metadata.applicableBoardModels || []).map(item => item.id)
))

const productModelOptions = computed(() => treeData.value
  .filter(item => item.id !== 1)
  .map(item => ({
    id: item.id,
    name: item.label,
    clientTestType: item.haltHassTestType || null,
    clientTestTypeName: item.haltHassTestTypeName || '',
  })))

const selectedProductClientTestTypeName = computed(() => {
  const productId = processJson.value.metadata.productModel?.id
  return productModelOptions.value.find(item => item.id === productId)?.clientTestTypeName || ''
})

const selectedProductClientTestType = computed(() => {
  const productId = processJson.value.metadata.productModel?.id
  return productModelOptions.value.find(item => item.id === productId)?.clientTestType || null
})

const isSdsProcess = computed(() => selectedProductClientTestType.value === 2)
const isRectifierProcess = computed(() => processJson.value.metadata.reportType === 'rectifier_regulator')

const experimentModeOptions: Array<{ value: 'halt' | 'hass'; label: string }> = [
  { value: 'halt', label: 'HALT' },
  { value: 'hass', label: 'HASS' },
]

const reportTypeOptions = [
  { value: 'drive_control', label: '驱动控制记录表' },
  { value: 'rectifier_regulator', label: '整流稳压记录表' },
] as const

// 预览 JSON
const previewJson = computed(() => {
  return JSON.stringify({
    ...processJson.value,
    testFlow: {
      ...processJson.value.testFlow,
      nodes: testFlowNodes.value,
      edges: testFlowEdges.value,
    },
    cycleFlow: {
      ...processJson.value.cycleFlow,
      nodes: cycleFlowNodes.value,
      edges: cycleFlowEdges.value,
    },
  }, null, 2)
})

// ========== 方法 ==========

// 返回选择页
function handleExit() {
  ElMessageBox.confirm('确定要退出编辑吗？未保存的更改将丢失。', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    currentStep.value = 0
    resetProcess()
    testFlowNodes.value = []
    testFlowEdges.value = []
    cycleFlowNodes.value = []
    cycleFlowEdges.value = []
  }).catch(() => {})
}

// ========== 基于版本迭代 ==========

// 选择基础版本进行迭代
async function selectBaseVersion(row: { id: number; name: string; version: string }) {
  selectedBaseVersion.value = row.id

  // 加载该版本的工艺数据
  const success = await loadVersionForIteration(row.id)
  if (success) {
    // 恢复流程图数据（使用可选链确保安全访问）
    syncFlowStatesFromProcess()
    ElMessage.success(`已加载基础版本: ${row.name} v${row.version}`)
  } else {
    ElMessage.error('加载版本数据失败')
    selectedBaseVersion.value = null
  }
}

// 清除基础版本选择
function clearBaseVersionSelection() {
  selectedBaseVersion.value = null
  updateMetadata({ baseVersion: undefined })
}

// 新建工艺（保留已填写的 metadata）
function handleNew() {
  if (!selectedBoardGroup.value) {
    ElMessage.warning('请选择电路板组')
    return
  }
  if (!processJson.value.metadata.name.trim()) {
    ElMessage.warning('请填写工艺名称')
    return
  }
  if (!processJson.value.metadata.version.trim()) {
    ElMessage.warning('请填写版本号')
    return
  }
  const runtimeError = getRuntimeConfigError()
  if (runtimeError) {
    ElMessage.warning(runtimeError)
    return
  }

  // 选择页可能已导入完整双流程工艺；进入编辑时必须保留两套画布。
  currentStep.value = 1
}

function toggleApplicableBoardModel(board: BoardModelItem) {
  const current = processJson.value.metadata.applicableBoardModels || []
  const exists = current.some(item => item.id === board.id)
  if (exists && current.length === 1) {
    ElMessage.warning('工艺至少需要一种适用电路板型号')
    return
  }
  const nextModels = exists
    ? current.filter(item => item.id !== board.id)
    : [...current, { ...board }]
  const nextModelIds = nextModels.map(item => item.id)
  const assemblyRule = processJson.value.metadata.assemblyRule
  updateMetadata({
    applicableBoardModels: nextModels,
    assemblyRule: {
      ...assemblyRule,
      slots: assemblyRule.slots.map(slot => {
        const allowedIds = slot.allowedBoardModelIds.filter(id => nextModelIds.includes(id))
        return {
          ...slot,
          allowedBoardModelIds: allowedIds.length ? allowedIds : [...nextModelIds],
        }
      }),
    },
  })
}

function handleProductModelChange(event: Event) {
  const productId = Number((event.target as HTMLSelectElement).value)
  const product = productModelOptions.value.find(item => item.id === productId) || null
  updateMetadata({
    productModel: product,
    sdsConfig: product?.clientTestType === 2
      ? processJson.value.metadata.sdsConfig || createDefaultSdsProcessConfig()
      : undefined,
  })
}

function handleReportTypeChange(event: Event) {
  const reportType = (event.target as HTMLSelectElement).value as 'drive_control' | 'rectifier_regulator'
  updateMetadata({
    reportType,
    rectifierConfig: reportType === 'rectifier_regulator'
      ? processJson.value.metadata.rectifierConfig || createDefaultRectifierProcessConfig()
      : undefined,
  })
}

function updateRectifierConfig(patch: Partial<RectifierProcessConfig>) {
  const current = processJson.value.metadata.rectifierConfig || createDefaultRectifierProcessConfig()
  updateMetadata({
    rectifierConfig: {
      ...current,
      ...patch,
    },
  })
}

function updateRectifierVoltageSteps(rawValue: string) {
  const inputVoltageSteps = rawValue
    .split(/[,，\s]+/)
    .map(item => Number(item))
    .filter(value => Number.isFinite(value) && value > 0)
  updateRectifierConfig({ inputVoltageSteps })
}

function updateRectifierLoad(
  stage: 'halfLoad' | 'fullLoad',
  field: 'load48Ohm' | 'load90Ohm',
  value: number,
) {
  const current = processJson.value.metadata.rectifierConfig || createDefaultRectifierProcessConfig()
  updateRectifierConfig({
    [stage]: {
      ...current[stage],
      [field]: value,
    },
  })
}

function updateRectifierVoltageRange(
  channel: 'output48VoltageRange' | 'output90VoltageRange',
  field: 'min' | 'max',
  value: number,
) {
  const current = processJson.value.metadata.rectifierConfig || createDefaultRectifierProcessConfig()
  updateRectifierConfig({
    [channel]: {
      ...current[channel],
      [field]: value,
    },
  })
}

type RectifierBoardRole = 'rectifier' | 'capacitor' | 'regulator90' | 'regulator48'

function findRectifierBoardModel(role: RectifierBoardRole) {
  const matchesRole = (board: BoardModelItem) => {
    const text = `${board.name || ''} ${board.code || ''}`.toUpperCase()
    if (role === 'rectifier') return text.includes('整流') && !text.includes('稳压')
    if (role === 'capacitor') return text.includes('电容')
    if (role === 'regulator90') return text.includes('90') && text.includes('稳压')
    return text.includes('48') && text.includes('稳压')
  }
  return processJson.value.metadata.applicableBoardModels.find(matchesRole)
}

function applyRectifierAssemblyTemplate(regulator48Count: 2 | 3) {
  const models = {
    rectifier: findRectifierBoardModel('rectifier'),
    capacitor: findRectifierBoardModel('capacitor'),
    regulator90: findRectifierBoardModel('regulator90'),
    regulator48: findRectifierBoardModel('regulator48'),
  }
  const missing = Object.entries(models)
    .filter(([, model]) => !model)
    .map(([role]) => ({
      rectifier: '整流板',
      capacitor: '电容板',
      regulator90: '90V 稳压板',
      regulator48: '48V 稳压板',
    }[role]))
  if (missing.length) {
    ElMessage.warning(`请先在适用电路板型号中选择：${missing.join('、')}`)
    return
  }

  const definitions = [
    { name: '整流板', model: models.rectifier! },
    { name: '电容板', model: models.capacitor! },
    { name: '90V 稳压板 1', model: models.regulator90! },
    { name: '90V 稳压板 2', model: models.regulator90! },
    ...Array.from({ length: regulator48Count }, (_, index) => ({
      name: `48V 稳压板 ${index + 1}`,
      model: models.regulator48!,
    })),
  ]
  updateMetadata({
    reportType: 'rectifier_regulator',
    rectifierConfig: processJson.value.metadata.rectifierConfig || createDefaultRectifierProcessConfig(),
    assemblyRule: {
      slotCount: definitions.length,
      minimumTargetBoards: 1,
      allowCompanionBoards: true,
      allowEmptySlots: false,
      slots: definitions.map((item, index) => ({
        slotNo: index + 1,
        name: item.name,
        required: true,
        allowCompanion: true,
        allowedBoardModelIds: [item.model.id],
      })),
    },
  })
  ElMessage.success(`已应用${definitions.length}板整流稳压装配规则`)
}

function updateSdsConfig(patch: Partial<SdsProcessConfig>) {
  const current = processJson.value.metadata.sdsConfig || createDefaultSdsProcessConfig()
  updateMetadata({
    sdsConfig: {
      ...current,
      ...patch,
    },
  })
}

function updateSdsPower(field: 'voltage' | 'currentLimit', value: number) {
  const current = processJson.value.metadata.sdsConfig || createDefaultSdsProcessConfig()
  updateSdsConfig({ power: { ...current.power, [field]: value } })
}

function updateSdsSerial(field: 'baudRate' | 'responseTimeoutSeconds', value: number) {
  const current = processJson.value.metadata.sdsConfig || createDefaultSdsProcessConfig()
  updateSdsConfig({ serial: { ...current.serial, [field]: value } })
}

function updateSdsTemperatureTrigger(
  field: 'toleranceC' | 'stableDurationSeconds' | 'mqttTimeoutSeconds',
  value: number,
) {
  const current = processJson.value.metadata.sdsConfig || createDefaultSdsProcessConfig()
  updateSdsConfig({
    temperatureTrigger: {
      ...current.temperatureTrigger,
      [field]: value,
    },
  })
}

function updateSdsPressurePoints(rawValue: string) {
  const values = rawValue
    .split(/[,，\s]+/)
    .map(item => Number(item))
    .filter(item => Number.isFinite(item) && item > 0)
  updateSdsConfig({ pressurePointsMpa: values })
}

function setExperimentMode(value: 'halt' | 'hass') {
  updateMetadata({ experimentMode: value })
}

function updateAssemblyRule(patch: Partial<HaltHassProcessJson['metadata']['assemblyRule']>) {
  updateMetadata({
    assemblyRule: {
      ...processJson.value.metadata.assemblyRule,
      ...patch,
    },
  })
}

function handleAssemblySlotCount(event: Event) {
  const value = Math.max(1, Math.min(32, Number((event.target as HTMLInputElement).value) || 1))
  const current = processJson.value.metadata.assemblyRule
  const applicableIds = processJson.value.metadata.applicableBoardModels.map(item => item.id)
  updateAssemblyRule({
    slotCount: value,
    minimumTargetBoards: Math.min(current.minimumTargetBoards, value),
    slots: Array.from({ length: value }, (_, index) => {
      const previous = current.slots.find(slot => slot.slotNo === index + 1)
      return previous || {
        slotNo: index + 1,
        name: `板位 ${index + 1}`,
        required: !current.allowEmptySlots,
        allowCompanion: current.allowCompanionBoards,
        allowedBoardModelIds: [...applicableIds],
      }
    }),
  })
}

function updateAssemblySlot(
  slotNo: number,
  patch: Partial<HaltHassProcessJson['metadata']['assemblyRule']['slots'][number]>,
) {
  const current = processJson.value.metadata.assemblyRule
  updateAssemblyRule({
    slots: current.slots.map(slot => slot.slotNo === slotNo ? { ...slot, ...patch } : slot),
  })
}

function toggleSlotBoardModel(slotNo: number, boardModelId: number) {
  const slot = processJson.value.metadata.assemblyRule.slots.find(item => item.slotNo === slotNo)
  if (!slot) return
  const exists = slot.allowedBoardModelIds.includes(boardModelId)
  if (exists && slot.allowedBoardModelIds.length === 1) {
    ElMessage.warning('每个板位至少保留一种允许型号')
    return
  }
  updateAssemblySlot(slotNo, {
    allowedBoardModelIds: exists
      ? slot.allowedBoardModelIds.filter(id => id !== boardModelId)
      : [...slot.allowedBoardModelIds, boardModelId],
  })
}

function isFlowchartData(value: unknown): value is HaltHassFlowchart {
  if (!value || typeof value !== 'object') return false
  const flow = value as Partial<HaltHassFlowchart>
  return Array.isArray(flow.nodes)
    && Array.isArray(flow.edges)
    && Array.isArray(flow.observeBlocks)
    && Boolean(flow.runSettings && typeof flow.runSettings === 'object')
}

function isDualFlowProcess(value: unknown): value is HaltHassProcessJson {
  if (!value || typeof value !== 'object') return false
  const process = value as Partial<HaltHassProcessJson>
  return process.schemaVersion === 2
    && Boolean(process.metadata && process.installGuide)
    && isFlowchartData(process.testFlow)
    && isFlowchartData(process.cycleFlow)
}

function setLocalFlowState(
  flowType: HaltHassFlowType,
  nodes: Node[],
  edges: Edge[],
) {
  if (flowType === 'test') {
    testFlowNodes.value = nodes
    testFlowEdges.value = edges
  } else {
    cycleFlowNodes.value = nodes
    cycleFlowEdges.value = edges
  }
}

function syncFlowStatesFromProcess() {
  testFlowNodes.value = processJson.value.testFlow.nodes
  testFlowEdges.value = processJson.value.testFlow.edges
  cycleFlowNodes.value = processJson.value.cycleFlow.nodes
  cycleFlowEdges.value = processJson.value.cycleFlow.edges
}

function syncAllFlowcharts() {
  updateFlowchart(
    'test',
    testFlowNodes.value as Node<BlockData>[],
    testFlowEdges.value,
    processJson.value.testFlow.observeBlocks,
  )
  updateFlowchart(
    'cycle',
    cycleFlowNodes.value as Node<BlockData>[],
    cycleFlowEdges.value,
    processJson.value.cycleFlow.observeBlocks,
  )
}

function showActiveFlowInEditor() {
  if (!editorRef.value) return
  editorRef.value.setFlowchartData(activeFlowNodes.value, activeFlowEdges.value)
  setTimeout(() => editorRef.value?.fitToView(), 100)
}

// 导入完整双流程工艺，或在流程编辑步骤导入当前流程的 Studio JSON。
async function handleLoad() {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    
    if (!selected) return

    const content = await readTextFile(selected as string)
    const data = JSON.parse(content)

    if (isDualFlowProcess(data)) {
      processJson.value = data
      syncFlowStatesFromProcess()
      restoreSelectedBoardGroupFromProcess()
      showActiveFlowInEditor()
      editForm.hasUnsavedChanges = true
      ElMessage.success(
        `双流程工艺导入成功：测试流 ${data.testFlow.nodes.length} 个节点，循环流 ${data.cycleFlow.nodes.length} 个节点`
      )
      return
    }

    if (currentStep.value !== 2 && currentStep.value !== 3) {
      ElMessage.warning('选择页只能导入 schemaVersion=2 的 HALT-HASS 双流程工艺文件')
      return
    }

    let loadedNodes: Node<BlockData>[] = []
    let loadedEdges: Edge[] = []
    let importedObserveBlocks: string[] | undefined

    if (isStudioFormat(data)) {
      const { nodes, edges } = deserializeFromStudioFormat(data)
      loadedNodes = nodes
      loadedEdges = edges
    } else if (isFlowchartData(data)) {
      loadedNodes = data.nodes
      loadedEdges = data.edges
      importedObserveBlocks = data.observeBlocks.filter(
          (blockId): blockId is string => typeof blockId === 'string'
      )
      processJson.value[
        activeFlowType.value === 'test' ? 'testFlow' : 'cycleFlow'
      ].runSettings = { ...data.runSettings }
    } else if (data.nodes && data.edges) {
      loadedNodes = data.nodes || []
      loadedEdges = data.edges || []
    } else {
      ElMessage.warning('无法识别的流程文件格式')
      return
    }

    setLocalFlowState(activeFlowType.value, loadedNodes, loadedEdges)
    updateFlowchart(
      activeFlowType.value,
      loadedNodes,
      loadedEdges,
      importedObserveBlocks,
    )
    showActiveFlowInEditor()
    ElMessage.success(
      `${activeFlowLabel.value}导入成功，共 ${loadedNodes.length} 个节点`
    )
  } catch (e) {
    console.error('导入失败:', e)
    ElMessage.error('导入失败: ' + (e instanceof Error ? e.message : '未知错误'))
  }
}

// 导出当前正在编辑的单个流程，便于与 Flojoy Studio 交换。
async function handleExportFlow() {
  try {
    const filePath = await save({
      defaultPath: `${processJson.value.metadata.name || 'halt-hass'}-${activeFlowType.value}-flow.json`,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
      ],
    })
    
    if (!filePath) return

    const studioData = serializeToStudioFormat(
      `${processJson.value.metadata.name || ''}-${activeFlowLabel.value}`,
      activeFlowNodes.value,
      activeFlowEdges.value
    )

    await writeTextFile(filePath, JSON.stringify(studioData, null, 2))
    ElMessage.success(`${activeFlowLabel.value}导出成功`)
  } catch (e) {
    console.error('导出失败:', e)

    const studioData = serializeToStudioFormat(
      `${processJson.value.metadata.name || ''}-${activeFlowLabel.value}`,
      activeFlowNodes.value,
      activeFlowEdges.value
    )

    const blob = new Blob([JSON.stringify(studioData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${processJson.value.metadata.name || 'halt-hass'}-${activeFlowType.value}-flow.json`
    a.click()
    URL.revokeObjectURL(url)
    
    ElMessage.success(`${activeFlowLabel.value}导出成功（使用浏览器下载）`)
  }
}

// 导出完整工艺时同时保存测试流和循环流。
async function handleExportProcess() {
  syncAllFlowcharts()
  try {
    const filePath = await save({
      defaultPath: `${processJson.value.metadata.name || 'halt-hass-process'}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    })
    if (!filePath) return
    await writeTextFile(filePath, JSON.stringify(processJson.value, null, 2))
    ElMessage.success('双流程工艺导出成功')
  } catch (error) {
    console.error('完整工艺导出失败:', error)
    ElMessage.error('完整工艺导出失败')
  }
}

// 暂存工艺到本地
async function handleSaveTemp() {
  if (!canSave.value) {
    ElMessage.warning(getRuntimeConfigError() || '请先填写工艺名称')
    return
  }

  syncAllFlowcharts()

  const success = await saveToTemp()
  if (success) {
    ElMessage.success('暂存成功')
    // 刷新暂存列表
    fetchTempList()
  } else {
    ElMessage.error(errorMessage.value || '暂存失败')
  }
}

// 保存工艺到后端
async function handleSave() {
  if (!canSave.value) {
    ElMessage.warning(getRuntimeConfigError() || '请先填写工艺名称')
    return
  }

  syncAllFlowcharts()

  // 传递当前用户 ID
  const success = await uploadProcess(userInfo.value?.id)
  if (success) {
    ElMessage.success('保存成功')
    // 返回选择页
    currentStep.value = 0
    resetProcess()
    testFlowNodes.value = []
    testFlowEdges.value = []
    cycleFlowNodes.value = []
    cycleFlowEdges.value = []
    selectedBaseVersion.value = null
    // 刷新我的待处理列表
    fetchMyJobData()
  } else {
    ElMessage.error(errorMessage.value || '保存失败')
  }
}

// 提交审核
async function handleSubmitCheck() {
  if (editForm.processId <= 0) {
    ElMessage.warning('请先保存工艺到服务器')
    return
  }
  if (isSdsProcess.value && !processJson.value.metadata.sdsConfig?.executionReady) {
    ElMessage.warning('SDS 工艺协议尚未补齐，只能保存草稿，不能提交审核')
    return
  }

  const confirmed = await ElMessageBox.confirm(
    '确认提交工艺进行审核？提交后将无法编辑，需等待审核结果。',
    '提交审核',
    {
      confirmButtonText: '确认提交',
      cancelButtonText: '取消',
      type: 'info',
    }
  ).catch(() => false)

  if (!confirmed) return

  const success = await submitToCheck()
  if (success) {
    ElMessage.success('已提交审核')
  } else {
    ElMessage.error(errorMessage.value || '提交审核失败')
  }
}

// 流程图变化处理
function handleFlowchartChange(nodes: Node[], edges: Edge[]) {
  setLocalFlowState(activeFlowType.value, nodes, edges)
  updateFlowchart(activeFlowType.value, nodes as Node<BlockData>[], edges)
}

// 运行流程图（使用适配层对齐 Studio）
async function handleRun() {
  if (!canRun.value) {
    ElMessage.warning('后端未就绪')
    return
  }
  
  const jobId = socketId.value || uuidv4()
  currentJobId.value = jobId
  clearNodeStatuses()
  resetNodeStatuses(activeFlowType.value)
  
  try {
    // 使用适配层准备运行参数
    const runArgs = prepareRunFlowchartArgs(
      activeFlowNodes.value as Node<BlockData>[],
      activeFlowEdges.value,
      jobId,
      getObserveBlocks(activeFlowType.value),
      getRunSettings(activeFlowType.value)
    )
    
    await runFlowchart({
      nodes: runArgs.nodes as any,
      edges: runArgs.edges as any,
      jobId: runArgs.jobId,
      observeBlocks: runArgs.observeBlocks,
      settings: runArgs.settings,
    })
    ElMessage.success(`${activeFlowLabel.value}开始运行`)
  } catch (e) {
    const message = e instanceof Error ? e.message : '未知错误'
    ElMessage.error(`运行失败：${message}`)
    console.error(e)
  }
}

// 停止运行
async function handleStop() {
  if (currentJobId.value) {
    try {
      await cancelFlowchartRun(currentJobId.value)
      ElMessage.info('已停止运行')
    } catch (e) {
      ElMessage.error('停止失败')
    }
  }
}

// 清空画布
function handleClear() {
  ElMessageBox.confirm('确定要清空画布吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    editorRef.value?.clearCanvas()
    setLocalFlowState(activeFlowType.value, [], [])
    updateFlowchart(activeFlowType.value, [], [])
  }).catch(() => {})
}

// 适应视图
function handleFitView() {
  editorRef.value?.fitToView()
}

// 复制 JSON
function copyJsonToClipboard() {
  navigator.clipboard.writeText(previewJson.value).then(() => {
    ElMessage.success('已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

// 上一步
function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

// 下一步
function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
  }
}

// ========== JobDrawer 相关方法 ==========

// 打开工作抽屉
async function openJobDrawer() {
  showJobDrawer.value = true
  // 刷新我的待处理列表
  await fetchMyJobData()
}

function restoreSelectedBoardGroupFromProcess() {
  const boardGroupId = processJson.value.metadata.boardGroup?.[0]?.id
  if (!boardGroupId) return
  const group = boardGroups.value.find(item => item.id === boardGroupId)
  if (group) selectBoardGroup(group)
}

// 提交审核（从工作抽屉）
async function handleSubmitFromJob(processId: number) {
  const confirmed = await ElMessageBox.confirm(
    '确认提交工艺进行审核？',
    '提交审核',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'info',
    }
  ).catch(() => false)

  if (!confirmed) return

  // 先加载工艺，再提交
  const loadSuccess = await fetchProcess(processId)
  if (!loadSuccess) {
    ElMessage.error('加载工艺失败')
    return
  }

  restoreSelectedBoardGroupFromProcess()
  const runtimeError = getRuntimeConfigError()
  if (runtimeError) {
    showJobDrawer.value = false
    currentStep.value = 0
    ElMessage.warning(`${runtimeError}，补齐后再提交审核`)
    return
  }

  const success = await submitToCheck()
  if (success) {
    ElMessage.success('已提交审核')
    fetchMyJobData() // 刷新列表
  } else {
    ElMessage.error(errorMessage.value || '提交失败')
  }
}

// 编辑工艺（从工作抽屉）
async function handleEditFromJob(row: HaltHassJob) {
  const success = await fetchProcess(row.id)
  if (success) {
    syncFlowStatesFromProcess()
    restoreSelectedBoardGroupFromProcess()
    showJobDrawer.value = false
    const runtimeError = getRuntimeConfigError()
    currentStep.value = runtimeError ? 0 : 1
    if (runtimeError) {
      ElMessage.warning(`已加载工艺，请先补充运行配置：${runtimeError}`)
    } else {
      ElMessage.success(`已加载工艺: ${row.name}`)
    }
  } else {
    ElMessage.error('加载工艺失败')
  }
}

// 删除工艺（从工作抽屉）
async function handleDeleteFromJob(processId: number) {
  const confirmed = await ElMessageBox.confirm(
    '确定要删除这个工艺吗？此操作不可恢复。',
    '删除确认',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    }
  ).catch(() => false)

  if (!confirmed) return

  const success = await deleteProcess(processId)
  if (success) {
    ElMessage.success('删除成功')
  } else {
    ElMessage.error('删除失败')
  }
}

// 继续编辑暂存（从工作抽屉）
async function handleContinueEdit(item: { fileName: string; name: string }) {
  const success = await loadFromTemp(item.fileName)
  if (success) {
    syncFlowStatesFromProcess()
    restoreSelectedBoardGroupFromProcess()
    showJobDrawer.value = false
    const runtimeError = getRuntimeConfigError()
    currentStep.value = runtimeError ? 0 : 1
    if (runtimeError) {
      ElMessage.warning(`已加载暂存工艺，请先补充运行配置：${runtimeError}`)
    } else {
      ElMessage.success('加载成功')
    }
  } else {
    ElMessage.error('加载失败')
  }
}

// 删除暂存文件
async function handleDeleteTemp(fileName: string) {
  try {
    await ElMessageBox.confirm('确定要删除该暂存工艺吗？', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    const success = await deleteTempProcess(fileName)
    if (success) {
      ElMessage.success('删除成功')
    } else {
      ElMessage.error('删除失败')
    }
  } catch {
    // 用户取消
  }
}

// ========== 电路板组相关方法 ==========

// 刷新电路板组列表
async function refreshBoardGroups() {
  boardGroupsLoading.value = true
  await fetchBoardGroups()
  boardGroupsLoading.value = false
}

// 打开创建电路板组对话框
function openCreateBoardGroupDialog() {
  showCreateBoardGroupDialog.value = true
}

// 创建电路板组确认
async function handleCreateBoardGroup(data: CreateBoardGroupParams) {
  const result = await createBoardGroup(data)
  if (result.success) {
    ElMessage.success('电路板组创建成功')
    showCreateBoardGroupDialog.value = false
    // 自动选中新创建的组
    const newGroup = boardGroups.value.find(g => g.id === result.id)
    if (newGroup) {
      selectBoardGroup(newGroup)
    }
  } else {
    ElMessage.error(result.error || '创建失败')
  }
}

// 选择电路板组时获取版本列表，并同步到 processJson
watch(selectedBoardGroup, async (group) => {
  if (group) {
    const metadataGroupId = processJson.value.metadata.boardGroup?.[0]?.id
    if (metadataGroupId !== group.id || !processJson.value.metadata.applicableBoardModels?.length) {
      selectBoardGroup(group)
    }
    await fetchVersionsByBoardGroup(group.id)
  } else {
    if (processJson.value.metadata.boardGroup?.length) {
      selectBoardGroup(null)
    }
  }
})

// 初始化后端连接
onMounted(async () => {
  // 配置 API
  configureApi('127.0.0.1', backendPort.value)

  // 优先检查实际服务，兼容由外部进程启动的 Flojoy。
  const backendHealthy = await checkHealth()
  if (!backendHealthy && !backendRunning.value) {
    await startBackend()
  }

  // 连接 WebSocket
  connectSocket()

  // 获取电路板型号树数据
  fetchTreeData()

  // 获取暂存列表
  fetchTempList()

  // 获取电路板组列表
  refreshBoardGroups()

  // 获取我的待处理列表
  fetchMyJobData()
})

// 清理
onUnmounted(() => {
  disconnectSocket()
})

// 监听步骤变化
watch(currentStep, (step) => {
  if (step >= 1) {
    enterEditMode()
  } else {
    exitEditMode()
  }
})
</script>

<template>
  <div class="process-halt-hass">
    <!-- 选择页面 -->
    <Transition name="fade-slide" mode="out-in">
      <div v-if="currentStep === 0" class="selection-page">
        <!-- 页头 -->
        <div class="page-header">
          <div class="header-left">
            <Icon icon="mdi:thermometer-alert" class="header-icon" />
            <div class="header-text">
              <h1>HALT-HASS 工艺编辑</h1>
              <p>高加速寿命测试与高加速应力筛选流程编辑</p>
            </div>
          </div>

          <div class="header-actions">
            <!-- 工作菜单 -->
            <button class="work-btn" @click="openJobDrawer">
              <Icon icon="mdi:briefcase-outline" />
              <span>工作</span>
              <span v-if="myJobData.length + tempList.length > 0" class="badge">
                {{ myJobData.length + tempList.length }}
              </span>
            </button>

            <!-- 模式切换 -->
            <div class="mode-toggle">
              <button
                class="mode-btn"
                :class="{ active: isOnline }"
                @click="isOnline = true"
              >
                <Icon icon="mdi:cloud-outline" />
                在线模式
              </button>
              <button
                class="mode-btn"
                :class="{ active: !isOnline }"
                @click="isOnline = false"
              >
                <Icon icon="mdi:cloud-off-outline" />
                离线模式
              </button>
            </div>
          </div>
        </div>

        <!-- 主内容区：电路板组选择和版本配置 -->
        <div class="selection-content">
          <div class="selection-main">
            <!-- 左侧：电路板组选择 -->
            <div class="tree-panel-wrapper">
              <BoardGroupListSelector
                v-model="selectedBoardGroup"
                :board-groups="boardGroups"
                :loading="boardGroupsLoading"
                @create="openCreateBoardGroupDialog"
                @refresh="refreshBoardGroups"
              />
            </div>

            <!-- 右侧：工艺信息配置 -->
            <div class="right-panel-wrapper">
              <!-- 已选择的电路板组信息 -->
              <div class="config-section">
                <div class="section-header">
                  <Icon icon="mdi:check-circle-outline" class="section-icon success" />
                  <span>已选择的电路板组</span>
                </div>
                <div class="section-content">
                  <template v-if="selectedBoardGroup">
                    <div class="selected-group-info">
                      <div class="group-name">{{ selectedBoardGroup.name }}</div>
                      <div v-if="selectedBoardGroup.description" class="group-desc">
                        {{ selectedBoardGroup.description }}
                      </div>
                      <div class="group-boards">
                        <span class="boards-label">适用电路板型号（工艺只保存范围，不保存数量或 SN）：</span>
                        <div class="board-tags">
                          <button
                            v-for="board in selectedBoardGroup.boards"
                            :key="board.id"
                            type="button"
                            class="board-tag-small board-type-toggle"
                            :class="{ selected: applicableBoardModelIds.has(board.id) }"
                            :aria-pressed="applicableBoardModelIds.has(board.id)"
                            @click="toggleApplicableBoardModel(board)"
                          >
                            <Icon :icon="applicableBoardModelIds.has(board.id) ? 'mdi:checkbox-marked-circle' : 'mdi:checkbox-blank-circle-outline'" />
                            {{ board.name }}
                          </button>
                        </div>
                        <p class="board-type-hint">目标板数量和具体编号由工单决定，台架板位要求在下方单独配置。</p>
                      </div>
                    </div>
                    <button class="clear-selection-btn" @click="selectBoardGroup(null)">
                      <Icon icon="mdi:close" />
                      取消选择
                    </button>
                  </template>
                  <div v-else class="empty-boards">
                    <Icon icon="mdi:arrow-left-bold" />
                    <span>请从左侧选择电路板组</span>
                  </div>
                </div>
              </div>

              <!-- 工艺信息 -->
              <div class="config-section">
                <div class="section-header">
                  <Icon icon="mdi:file-document-edit-outline" class="section-icon primary" />
                  <span>工艺信息</span>
                </div>
                <div class="section-content">
                  <div class="form-row">
                    <label>工艺名称</label>
                    <input
                      type="text"
                      :value="processJson.metadata.name"
                      placeholder="请输入工艺名称"
                      @input="updateMetadata({ name: ($event.target as HTMLInputElement).value })"
                    />
                  </div>
                  <div class="form-row">
                    <label>版本号</label>
                    <input
                      type="text"
                      :value="processJson.metadata.version"
                      placeholder="如 1.0.0"
                      @input="updateMetadata({ version: ($event.target as HTMLInputElement).value })"
                    />
                  </div>

                  <div class="runtime-config-grid process-classification-grid">
                    <div class="form-row">
                      <label for="halt-hass-product-model" class="required-label">产品大类</label>
                      <select
                        id="halt-hass-product-model"
                        :value="processJson.metadata.productModel?.id || ''"
                        @change="handleProductModelChange"
                      >
                        <option value="" disabled>请选择 HSVP、SDS 等产品大类</option>
                        <option
                          v-for="item in productModelOptions"
                          :key="item.id"
                          :value="item.id"
                        >
                          {{ item.name }}
                        </option>
                      </select>
                      <p class="field-hint">使用现有产品型号主数据，不在工艺中重复维护。</p>
                      <p v-if="selectedProductClientTestTypeName" class="field-hint">
                        客户端测试类型：{{ selectedProductClientTestTypeName }}（由产品型号确定）
                      </p>
                      <p v-else-if="processJson.metadata.productModel?.id" class="field-hint field-error">
                        该产品尚未配置 HALT-HASS 客户端测试类型，工艺无法提交。
                      </p>
                    </div>

                    <div class="form-row">
                      <label for="halt-hass-report-type" class="required-label">报告格式</label>
                      <select
                        id="halt-hass-report-type"
                        :value="processJson.metadata.reportType"
                        @change="handleReportTypeChange"
                      >
                        <option
                          v-for="item in reportTypeOptions"
                          :key="item.value"
                          :value="item.value"
                        >
                          {{ item.label }}
                        </option>
                      </select>
                      <p class="field-hint">只决定执行数据结构和报告渲染，不作为工单发起人的测试类型。</p>
                    </div>

                    <fieldset class="form-row experiment-mode-field">
                      <legend class="required-label">实验模式</legend>
                      <div class="experiment-mode-options" role="radiogroup" aria-label="实验模式">
                        <button
                          v-for="item in experimentModeOptions"
                          :key="item.value"
                          type="button"
                          role="radio"
                          class="experiment-mode-btn"
                          :aria-checked="processJson.metadata.experimentMode === item.value"
                          :class="{ active: processJson.metadata.experimentMode === item.value }"
                          @click="setExperimentMode(item.value)"
                        >
                          {{ item.label }}
                        </button>
                      </div>
                      <p class="field-hint">用于工单匹配，不再通过工艺名称推断。</p>
                    </fieldset>
                  </div>

                  <p class="field-hint">试验时长由工作台 MQTT 状态控制；温度、振动曲线在客户端开始测试时选择。</p>

                  <section
                    v-if="isSdsProcess && processJson.metadata.sdsConfig"
                    class="sds-config-section"
                    aria-labelledby="sds-config-title"
                  >
                    <div class="sds-config-header">
                      <div>
                        <strong id="sds-config-title">SDS 全套液压参数</strong>
                        <p>参数随工艺版本保存，由客户端执行；服务端不参与温度阶段判断。</p>
                      </div>
                      <span
                        class="sds-readiness-badge"
                        :class="{ ready: processJson.metadata.sdsConfig.executionReady }"
                      >
                        {{ processJson.metadata.sdsConfig.executionReady ? '指令完整' : '协议待补充' }}
                      </span>
                    </div>

                    <div class="sds-parameter-grid">
                      <div class="form-row compact-form-row">
                        <label for="sds-power-voltage">供电电压</label>
                        <div class="duration-input">
                          <input
                            id="sds-power-voltage"
                            type="number"
                            min="0.1"
                            step="0.1"
                            :value="processJson.metadata.sdsConfig.power.voltage"
                            @change="updateSdsPower('voltage', Number(($event.target as HTMLInputElement).value))"
                          />
                          <span class="input-suffix">V</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="sds-current-limit">电源限流</label>
                        <div class="duration-input">
                          <input
                            id="sds-current-limit"
                            type="number"
                            min="0.1"
                            step="0.1"
                            :value="processJson.metadata.sdsConfig.power.currentLimit"
                            @change="updateSdsPower('currentLimit', Number(($event.target as HTMLInputElement).value))"
                          />
                          <span class="input-suffix">A</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="sds-baud-rate">TBUS 波特率</label>
                        <input
                          id="sds-baud-rate"
                          type="number"
                          min="1"
                          step="1"
                          :value="processJson.metadata.sdsConfig.serial.baudRate"
                          @change="updateSdsSerial('baudRate', Number(($event.target as HTMLInputElement).value))"
                        />
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="sds-serial-timeout">单次响应超时</label>
                        <div class="duration-input">
                          <input
                            id="sds-serial-timeout"
                            type="number"
                            min="0.05"
                            step="0.05"
                            :value="processJson.metadata.sdsConfig.serial.responseTimeoutSeconds"
                            @change="updateSdsSerial('responseTimeoutSeconds', Number(($event.target as HTMLInputElement).value))"
                          />
                          <span class="input-suffix">秒</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="sds-temperature-tolerance">温度到位容差</label>
                        <div class="duration-input">
                          <input
                            id="sds-temperature-tolerance"
                            type="number"
                            min="0"
                            step="0.1"
                            :value="processJson.metadata.sdsConfig.temperatureTrigger.toleranceC"
                            @change="updateSdsTemperatureTrigger('toleranceC', Number(($event.target as HTMLInputElement).value))"
                          />
                          <span class="input-suffix">°C</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="sds-stable-duration">连续稳定时间</label>
                        <div class="duration-input">
                          <input
                            id="sds-stable-duration"
                            type="number"
                            min="1"
                            step="1"
                            :value="processJson.metadata.sdsConfig.temperatureTrigger.stableDurationSeconds"
                            @change="updateSdsTemperatureTrigger('stableDurationSeconds', Number(($event.target as HTMLInputElement).value))"
                          />
                          <span class="input-suffix">秒</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="sds-mqtt-timeout">MQTT 断流告警</label>
                        <div class="duration-input">
                          <input
                            id="sds-mqtt-timeout"
                            type="number"
                            min="1"
                            step="1"
                            :value="processJson.metadata.sdsConfig.temperatureTrigger.mqttTimeoutSeconds"
                            @change="updateSdsTemperatureTrigger('mqttTimeoutSeconds', Number(($event.target as HTMLInputElement).value))"
                          />
                          <span class="input-suffix">秒</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="sds-point-hold">测试点稳定时间</label>
                        <div class="duration-input">
                          <input
                            id="sds-point-hold"
                            type="number"
                            min="1"
                            step="1"
                            :value="processJson.metadata.sdsConfig.pointHoldSeconds"
                            @change="updateSdsConfig({ pointHoldSeconds: Number(($event.target as HTMLInputElement).value) })"
                          />
                          <span class="input-suffix">秒</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row sds-pressure-field">
                        <label for="sds-pressure-points">压力点（MPa）</label>
                        <input
                          id="sds-pressure-points"
                          type="text"
                          :value="processJson.metadata.sdsConfig.pressurePointsMpa.join(', ')"
                          placeholder="例如 2, 5, 10, 15, 20"
                          @change="updateSdsPressurePoints(($event.target as HTMLInputElement).value)"
                        />
                      </div>
                    </div>

                    <div class="sds-comm-table" role="table" aria-label="SDS 通信角色">
                      <div class="sds-comm-row sds-comm-heading" role="row">
                        <span>通信角色</span>
                        <span>期望值</span>
                        <span>协议指令</span>
                        <span>状态</span>
                      </div>
                      <div
                        v-for="item in processJson.metadata.sdsConfig.communicationChecks"
                        :key="item.role"
                        class="sds-comm-row"
                        role="row"
                      >
                        <span>{{ item.label }}</span>
                        <code>{{ item.expectedValue }}</code>
                        <code>{{ item.protocolCommand || '待补充' }}</code>
                        <span :class="item.implemented ? 'comm-ready' : 'comm-pending'">
                          {{ item.implemented ? '已配置' : '待协议' }}
                        </span>
                      </div>
                    </div>

                    <div v-if="processJson.metadata.sdsConfig.pendingProtocolItems.length" class="sds-pending-note">
                      <Icon icon="mdi:alert-outline" />
                      <div>
                        <strong>提交审核前仍需补齐</strong>
                        <p>{{ processJson.metadata.sdsConfig.pendingProtocolItems.join('；') }}</p>
                      </div>
                    </div>
                  </section>

                  <section
                    v-if="isRectifierProcess && processJson.metadata.rectifierConfig"
                    class="rectifier-config-section"
                    aria-labelledby="rectifier-config-title"
                  >
                    <div class="sds-config-header">
                      <div>
                        <strong id="rectifier-config-title">整流稳压参数</strong>
                        <p>工艺只保存逻辑角色和测试参数。串口、USB、VISA 地址由客户端设备配置绑定。</p>
                      </div>
                      <span class="sds-readiness-badge ready">单位 A</span>
                    </div>

                    <div class="rectifier-template-actions">
                      <span>装配模板</span>
                      <button type="button" @click="applyRectifierAssemblyTemplate(2)">6 板：2 块 48V 稳压板</button>
                      <button type="button" @click="applyRectifierAssemblyTemplate(3)">7 板：3 块 48V 稳压板</button>
                    </div>

                    <div class="sds-parameter-grid rectifier-parameter-grid">
                      <div class="form-row compact-form-row rectifier-wide-field">
                        <label for="rectifier-voltage-steps">输入电压档位</label>
                        <input
                          id="rectifier-voltage-steps"
                          type="text"
                          :value="processJson.metadata.rectifierConfig.inputVoltageSteps.join(', ')"
                          placeholder="150, 200, 250, 300, 350, 400"
                          @change="updateRectifierVoltageSteps(($event.target as HTMLInputElement).value)"
                        />
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="rectifier-current-limit">3123 输入限流</label>
                        <div class="duration-input">
                          <input
                            id="rectifier-current-limit"
                            type="number"
                            min="0.1"
                            step="0.1"
                            :value="processJson.metadata.rectifierConfig.sourceCurrentLimitA"
                            @change="updateRectifierConfig({ sourceCurrentLimitA: Number(($event.target as HTMLInputElement).value) })"
                          />
                          <span class="input-suffix">A</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="rectifier-temperature-tolerance">温度到位容差</label>
                        <div class="duration-input">
                          <input
                            id="rectifier-temperature-tolerance"
                            type="number"
                            min="0.1"
                            step="0.1"
                            :value="processJson.metadata.rectifierConfig.temperatureToleranceC"
                            @change="updateRectifierConfig({ temperatureToleranceC: Number(($event.target as HTMLInputElement).value) })"
                          />
                          <span class="input-suffix">℃</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="rectifier-temperature-stable">温度连续稳定</label>
                        <div class="duration-input">
                          <input
                            id="rectifier-temperature-stable"
                            type="number"
                            min="1"
                            step="1"
                            :value="processJson.metadata.rectifierConfig.temperatureStableSeconds"
                            @change="updateRectifierConfig({ temperatureStableSeconds: Number(($event.target as HTMLInputElement).value) })"
                          />
                          <span class="input-suffix">秒</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="rectifier-voltage-wait">电压切换等待</label>
                        <div class="duration-input">
                          <input
                            id="rectifier-voltage-wait"
                            type="number"
                            min="0.1"
                            step="0.1"
                            :value="processJson.metadata.rectifierConfig.voltageSettleSeconds"
                            @change="updateRectifierConfig({ voltageSettleSeconds: Number(($event.target as HTMLInputElement).value) })"
                          />
                          <span class="input-suffix">秒</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="rectifier-half-wait">半载切换等待</label>
                        <div class="duration-input">
                          <input
                            id="rectifier-half-wait"
                            type="number"
                            min="0.1"
                            step="0.1"
                            :value="processJson.metadata.rectifierConfig.halfLoadSettleSeconds"
                            @change="updateRectifierConfig({ halfLoadSettleSeconds: Number(($event.target as HTMLInputElement).value) })"
                          />
                          <span class="input-suffix">秒</span>
                        </div>
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="rectifier-full-wait">满载切换等待</label>
                        <div class="duration-input">
                          <input
                            id="rectifier-full-wait"
                            type="number"
                            min="0.1"
                            step="0.1"
                            :value="processJson.metadata.rectifierConfig.fullLoadSettleSeconds"
                            @change="updateRectifierConfig({ fullLoadSettleSeconds: Number(($event.target as HTMLInputElement).value) })"
                          />
                          <span class="input-suffix">秒</span>
                        </div>
                      </div>
                    </div>

                    <div class="rectifier-stage-grid">
                      <article class="rectifier-stage-card">
                        <strong>半载</strong>
                        <label>
                          <span>48V 负载</span>
                          <input type="number" min="0.01" step="0.01" :value="processJson.metadata.rectifierConfig.halfLoad.load48Ohm" @change="updateRectifierLoad('halfLoad', 'load48Ohm', Number(($event.target as HTMLInputElement).value))" />
                          <em>Ω</em>
                        </label>
                        <label>
                          <span>90V 负载</span>
                          <input type="number" min="0.01" step="0.01" :value="processJson.metadata.rectifierConfig.halfLoad.load90Ohm" @change="updateRectifierLoad('halfLoad', 'load90Ohm', Number(($event.target as HTMLInputElement).value))" />
                          <em>Ω</em>
                        </label>
                      </article>
                      <article class="rectifier-stage-card">
                        <strong>满载</strong>
                        <label>
                          <span>48V 负载</span>
                          <input type="number" min="0.01" step="0.01" :value="processJson.metadata.rectifierConfig.fullLoad.load48Ohm" @change="updateRectifierLoad('fullLoad', 'load48Ohm', Number(($event.target as HTMLInputElement).value))" />
                          <em>Ω</em>
                        </label>
                        <label>
                          <span>90V 负载</span>
                          <input type="number" min="0.01" step="0.01" :value="processJson.metadata.rectifierConfig.fullLoad.load90Ohm" @change="updateRectifierLoad('fullLoad', 'load90Ohm', Number(($event.target as HTMLInputElement).value))" />
                          <em>Ω</em>
                        </label>
                      </article>
                      <article class="rectifier-stage-card">
                        <strong>48V 合格范围</strong>
                        <label>
                          <span>下限</span>
                          <input type="number" step="0.1" :value="processJson.metadata.rectifierConfig.output48VoltageRange.min" @change="updateRectifierVoltageRange('output48VoltageRange', 'min', Number(($event.target as HTMLInputElement).value))" />
                          <em>V</em>
                        </label>
                        <label>
                          <span>上限</span>
                          <input type="number" step="0.1" :value="processJson.metadata.rectifierConfig.output48VoltageRange.max" @change="updateRectifierVoltageRange('output48VoltageRange', 'max', Number(($event.target as HTMLInputElement).value))" />
                          <em>V</em>
                        </label>
                      </article>
                      <article class="rectifier-stage-card">
                        <strong>90V 合格范围</strong>
                        <label>
                          <span>下限</span>
                          <input type="number" step="0.1" :value="processJson.metadata.rectifierConfig.output90VoltageRange.min" @change="updateRectifierVoltageRange('output90VoltageRange', 'min', Number(($event.target as HTMLInputElement).value))" />
                          <em>V</em>
                        </label>
                        <label>
                          <span>上限</span>
                          <input type="number" step="0.1" :value="processJson.metadata.rectifierConfig.output90VoltageRange.max" @change="updateRectifierVoltageRange('output90VoltageRange', 'max', Number(($event.target as HTMLInputElement).value))" />
                          <em>V</em>
                        </label>
                      </article>
                    </div>

                    <div class="rectifier-role-note">
                      <Icon icon="mdi:information-outline" />
                      <span>设备角色固定为 ITECH 3123 输入电源、48V 负载、90V 负载。48V/90V 负载不是电路板型号，不能按发现顺序绑定。</span>
                    </div>
                  </section>

                  <section class="assembly-rule-section" aria-labelledby="assembly-rule-title">
                    <div class="assembly-rule-header">
                      <div>
                        <strong id="assembly-rule-title">台架装配规则</strong>
                        <p>描述一次物理测试的板位要求，与工单目标板数量分开。同一型号需要多块时，请配置多个允许该型号的板位，扫码后将按板位顺序依次占用。</p>
                      </div>
                      <div class="assembly-rule-toggles">
                        <label class="switch-field">
                          <input
                            type="checkbox"
                            :checked="processJson.metadata.assemblyRule.allowCompanionBoards"
                            @change="updateAssemblyRule({ allowCompanionBoards: ($event.target as HTMLInputElement).checked })"
                          />
                          <span>允许陪测板</span>
                        </label>
                        <label class="switch-field">
                          <input
                            type="checkbox"
                            :checked="processJson.metadata.assemblyRule.allowEmptySlots"
                            @change="updateAssemblyRule({ allowEmptySlots: ($event.target as HTMLInputElement).checked })"
                          />
                          <span>允许空板位</span>
                        </label>
                      </div>
                    </div>

                    <div class="assembly-summary-grid">
                      <div class="form-row compact-form-row">
                        <label for="assembly-slot-count">板位总数</label>
                        <input
                          id="assembly-slot-count"
                          type="number"
                          min="1"
                          max="32"
                          :value="processJson.metadata.assemblyRule.slotCount"
                          @change="handleAssemblySlotCount"
                        />
                      </div>
                      <div class="form-row compact-form-row">
                        <label for="assembly-minimum-targets">最少目标板</label>
                        <input
                          id="assembly-minimum-targets"
                          type="number"
                          min="1"
                          :max="processJson.metadata.assemblyRule.slotCount"
                          :value="processJson.metadata.assemblyRule.minimumTargetBoards"
                          @change="updateAssemblyRule({ minimumTargetBoards: Math.max(1, Math.min(processJson.metadata.assemblyRule.slotCount, Number(($event.target as HTMLInputElement).value) || 1)) })"
                        />
                      </div>
                    </div>

                    <div class="assembly-slot-list">
                      <article
                        v-for="slot in processJson.metadata.assemblyRule.slots"
                        :key="slot.slotNo"
                        class="assembly-slot-card"
                      >
                        <div class="assembly-slot-topline">
                          <span class="slot-index">{{ slot.slotNo }}</span>
                          <input
                            class="slot-name-input"
                            type="text"
                            :value="slot.name"
                            :aria-label="`板位 ${slot.slotNo} 名称`"
                            @input="updateAssemblySlot(slot.slotNo, { name: ($event.target as HTMLInputElement).value })"
                          />
                          <label v-if="processJson.metadata.assemblyRule.allowEmptySlots" class="switch-field small">
                            <input
                              type="checkbox"
                              :checked="slot.required"
                              @change="updateAssemblySlot(slot.slotNo, { required: ($event.target as HTMLInputElement).checked })"
                            />
                            <span>必填</span>
                          </label>
                          <label v-if="processJson.metadata.assemblyRule.allowCompanionBoards" class="switch-field small">
                            <input
                              type="checkbox"
                              :checked="slot.allowCompanion"
                              @change="updateAssemblySlot(slot.slotNo, { allowCompanion: ($event.target as HTMLInputElement).checked })"
                            />
                            <span>可陪测</span>
                          </label>
                        </div>
                        <div class="slot-model-options" aria-label="允许型号">
                          <button
                            v-for="model in processJson.metadata.applicableBoardModels"
                            :key="model.id"
                            type="button"
                            class="slot-model-chip"
                            :class="{ selected: slot.allowedBoardModelIds.includes(model.id) }"
                            :aria-pressed="slot.allowedBoardModelIds.includes(model.id)"
                            @click="toggleSlotBoardModel(slot.slotNo, model.id)"
                          >
                            <Icon :icon="slot.allowedBoardModelIds.includes(model.id) ? 'mdi:check-circle' : 'mdi:circle-outline'" />
                            {{ model.name }}
                          </button>
                        </div>
                      </article>
                    </div>
                  </section>

                  <!-- 版本迭代选择 -->
                  <div v-if="selectedBoardGroup && versionsByBoardGroup.length > 0" class="version-section">
                    <div class="version-section-header">
                      <div class="version-section-title">
                        <Icon icon="mdi:history" />
                        <span>基于版本进行迭代</span>
                      </div>
                      <button
                        v-if="selectedBaseVersion"
                        class="clear-selection-btn"
                        @click="clearBaseVersionSelection"
                      >
                        <Icon icon="mdi:close" />
                        清除选择
                      </button>
                    </div>
                    <p class="version-section-desc">单击表格内容选择基础版本，加载已有工艺数据进行迭代</p>
                    <div class="version-table-wrapper">
                      <table class="version-table">
                        <thead>
                          <tr>
                            <th>工艺ID</th>
                            <th>工艺名称</th>
                            <th>版本</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="row in versionsByBoardGroup"
                            :key="row.id"
                            :class="{ selected: selectedBaseVersion === row.id }"
                            @click="selectBaseVersion(row)"
                          >
                            <td class="mono">{{ row.id }}</td>
                            <td>{{ row.name }}</td>
                            <td class="mono">V{{ row.version }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="bottom-bar">
          <!-- 离线模式：导入按钮 -->
          <button v-if="!isOnline" class="secondary-btn" @click="handleLoad">
            <Icon icon="mdi:file-import-outline" />
            导入JSON
          </button>
          <div v-else></div>

          <button
            class="primary-btn"
            :disabled="!canStartEditing"
            :title="getRuntimeConfigError() || ''"
            @click="handleNew"
          >
            开始编辑
            <Icon icon="mdi:arrow-right" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- 编辑页面 -->
    <Transition name="fade-slide" mode="out-in">
      <div v-if="currentStep > 0" class="edit-page">
        <!-- 顶部导航栏 -->
        <div class="top-bar">
          <button class="exit-btn" @click="handleExit">
            <Icon icon="mdi:arrow-left" />
            退出编辑
          </button>
          
          <!-- 步骤指示器 -->
          <div class="steps">
            <div
              v-for="(step, index) in steps.slice(1)"
              :key="index"
              class="step"
              :class="{
                active: currentStep === index + 1,
                completed: currentStep > index + 1,
              }"
              @click="currentStep = index + 1"
            >
              <div class="step-indicator">
                <Icon v-if="currentStep > index + 1" icon="mdi:check" />
                <span v-else>{{ index + 1 }}</span>
              </div>
              <span class="step-label">{{ step.label }}</span>
            </div>
          </div>
          
          <div class="top-actions">
            <button class="action-btn" @click="handleSaveTemp" :disabled="!canSave || isSaving">
              <Icon icon="mdi:content-save-outline" />
              {{ isSaving ? '暂存中...' : '暂存' }}
            </button>
          </div>
        </div>

        <!-- 主内容区 -->
        <div class="main-content">
          <!-- 步骤 1: 安装指导 -->
          <div v-if="currentStep === 1" class="step-content step-1">
            <InstallGuideEditor
              v-model="processJson.installGuide"
            />
          </div>

          <!-- 步骤 2/3: 测试流与循环流使用相互隔离的画布 -->
          <div v-if="currentStep === 2 || currentStep === 3" class="step-content step-2">
            <div class="flowchart-layout">
              <!-- 左侧 Block 侧边栏 -->
              <BlockSidebar :visible="showSidebar" />
              
              <!-- 右侧流程图区域 -->
              <div class="flowchart-main">
                <div class="flow-editor-banner" :class="activeFlowType">
                  <div>
                    <strong>{{ activeFlowLabel }}编辑</strong>
                    <span v-if="activeFlowType === 'test'">
                      验证设备通断、通信状态和是否具备测试条件
                    </span>
                    <span v-else>
                      按工单剩余总时长持续采集设备状态和实时曲线
                    </span>
                  </div>
                  <span class="flow-node-count">
                    {{ activeFlowNodes.length }} 个节点
                  </span>
                </div>

                <!-- 控制栏 -->
                <ControlBar
                  :is-running="flowchartRunning"
                  :can-run="canRun"
                  :is-connected="socketConnected"
                  :server-status="serverStatus"
                  @run="handleRun"
                  @stop="handleStop"
                  @save="handleSave"
                  @load="handleLoad"
                  @clear="handleClear"
                  @fit-view="handleFitView"
                  @export="handleExportFlow"
                />
                
                <!-- 流程图编辑器 -->
                <FlowchartEditor
                  :key="activeFlowType"
                  ref="editorRef"
                  :initial-nodes="activeFlowNodes"
                  :initial-edges="activeFlowEdges"
                  height="calc(100vh - 220px)"
                  @change="handleFlowchartChange"
                />
              </div>
            </div>
          </div>

          <!-- 步骤 4: 预览确认 -->
          <div v-if="currentStep === 4" class="step-content step-3">
            <div class="section">
              <h3 class="section-title">
                <Icon icon="mdi:code-json" />
                工艺 JSON 预览
              </h3>
              <div class="preview-actions">
                <button class="action-btn" @click="copyJsonToClipboard">
                  <Icon icon="mdi:content-copy" />
                  复制
                </button>
              </div>
              <pre class="json-preview"><code>{{ previewJson }}</code></pre>
            </div>
          </div>
        </div>

        <!-- 底部按钮栏 -->
        <div v-if="currentStep > 0" class="bottom-bar">
          <!-- 审核反馈提示 -->
          <div v-if="processJson.feedback?.length" class="feedback-alert">
            <Icon icon="mdi:comment-alert-outline" class="feedback-icon" />
            <span class="feedback-text">审核反馈: {{ processJson.feedback[processJson.feedback.length - 1] }}</span>
          </div>
          <button v-if="currentStep > 1" class="btn-secondary" @click="prevStep">
            <Icon icon="mdi:arrow-left" />
            上一步
          </button>
          <div class="spacer" />
          <button v-if="currentStep < steps.length - 1" class="btn-primary" @click="nextStep">
            下一步
            <Icon icon="mdi:arrow-right" />
          </button>
          <template v-else>
            <button class="btn-secondary" @click="handleExportProcess" :disabled="isSaving">
              <Icon icon="mdi:download" />
              导出文件
            </button>
            <button class="btn-primary" @click="handleSave" :disabled="isSaving || !canSave">
              <Icon icon="mdi:content-save" />
              {{ isSaving ? '保存中...' : '保存工艺' }}
            </button>
            <button
              v-if="editForm.processId > 0"
              class="btn-primary"
              style="background-color: #67c23a;"
              @click="handleSubmitCheck"
              :disabled="isSaving"
            >
              <Icon icon="mdi:send" />
              提交审核
            </button>
          </template>
        </div>
      </div>
    </Transition>

    <!-- 工作抽屉 -->
    <JobDrawer
      v-model:visible="showJobDrawer"
      :my-job-data="myJobData"
      :temp-process-data="tempList"
      @submit-process="handleSubmitFromJob"
      @edit-process="handleEditFromJob"
      @delete-process="handleDeleteFromJob"
      @continue-edit="handleContinueEdit"
      @delete-temp="handleDeleteTemp"
    />

    <!-- 创建电路板组对话框 -->
    <CreateBoardGroupDialog
      v-model:visible="showCreateBoardGroupDialog"
      :tree-data="treeData"
      :loading="isSaving"
      @confirm="handleCreateBoardGroup"
    />
  </div>
</template>

<style scoped>
.process-halt-hass {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 选择页面 */
.selection-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* 页头 */
.page-header {
  border: 1px solid var(--color-border, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: var(--color-bg-secondary, #fff);
  border-radius: 16px;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  font-size: 36px;
  color: var(--color-primary, #3b82f6);
}

.header-text h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-1, #1e293b);
  margin: 0;
}

.header-text p {
  font-size: 14px;
  color: var(--color-text-3, #94a3b8);
  margin: 4px 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 工作按钮 */
.work-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-3, #f1f5f9);
  border: none;
  border-radius: 10px;
  font-size: 14px;
  color: var(--color-text-1, #1e293b);
  cursor: pointer;
  transition: all 0.2s ease;
}

.work-btn:hover {
  background: var(--color-bg-hover, #e2e8f0);
}

.badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: #ef4444;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

/* 模式切换 */
.mode-toggle {
  display: flex;
  background: var(--color-bg-3, #f1f5f9);
  border-radius: 10px;
  padding: 4px;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: transparent;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-3, #94a3b8);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn.active {
  background: var(--color-primary, #3b82f6);
  color: white;
}

/* 选择内容区域 */
.selection-content {
  flex: 1 0 auto;
  min-height: 0;
}

.selection-main {
  display: flex;
  gap: 20px;
  min-height: 100%;
  align-items: stretch;
}

.tree-panel-wrapper {
  width: 320px;
  flex-shrink: 0;
  align-self: stretch;
}

.right-panel-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* 配置区块通用样式 */
.config-section {
  background: var(--color-bg-secondary, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
}

.section-icon {
  font-size: 20px;
}

.section-icon.success {
  color: var(--color-success, #22c55e);
}

.section-icon.primary {
  color: var(--color-primary, #3b82f6);
}

.board-count {
  margin-left: auto;
  padding: 4px 10px;
  background: var(--color-success, #22c55e);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: white;
}

.section-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.board-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-tertiary, #f1f5f9);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.board-tag:hover {
  border-color: var(--color-primary, #3b82f6);
}

.board-tag .tag-icon {
  font-size: 16px;
  color: var(--color-primary, #3b82f6);
}

.board-tag span {
  font-size: 14px;
  color: var(--color-text-primary, #1e293b);
}

.board-tag .tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 50%;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all 0.2s ease;
}

.board-tag .tag-remove:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.empty-boards {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 80px;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 14px;
}

/* 已选电路板组信息 */
.selected-group-info {
  margin-bottom: 12px;
}

.selected-group-info .group-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
  margin-bottom: 4px;
}

.selected-group-info .group-desc {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  margin-bottom: 8px;
}

.group-boards {
  margin-top: 8px;
}

.boards-label {
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
  display: block;
  margin-bottom: 6px;
}

.board-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.board-tag-small {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--color-bg-tertiary, #f1f5f9);
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  border: 1px solid transparent;
}

.board-tag-small :deep(svg) {
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
}

.board-type-toggle {
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s ease;
}

.board-type-toggle:hover {
  border-color: rgba(59, 130, 246, 0.35);
}

.board-type-toggle.selected {
  color: var(--color-primary, #2563eb);
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.35);
}

.board-type-hint {
  margin: 7px 0 0;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 12px;
}

.section-content .clear-selection-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 8px;
}

.section-content .clear-selection-btn:hover {
  border-color: var(--color-error, #ef4444);
  color: var(--color-error, #ef4444);
}

/* 表单行样式 */
.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-row label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #64748b);
}

.form-row input,
.form-row textarea,
.form-row select {
  padding: 10px 14px;
  background: var(--color-bg-tertiary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary, #1e293b);
  transition: all 0.2s ease;
}

.form-row input:focus,
.form-row textarea:focus,
.form-row select:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-bg-primary, #fff);
}

.form-row input::placeholder,
.form-row textarea::placeholder {
  color: var(--color-text-tertiary, #94a3b8);
}

.runtime-config-grid {
  display: grid;
  grid-template-columns: minmax(200px, 0.75fr) minmax(320px, 1.25fr);
  gap: 16px;
  margin-top: 2px;
}

.runtime-config-grid .form-row {
  min-width: 0;
  margin-bottom: 0;
}

.required-label::after {
  content: ' *';
  color: var(--color-error, #ef4444);
}

.duration-input {
  position: relative;
}

.duration-input input {
  width: 100%;
  padding-right: 58px;
  box-sizing: border-box;
}

.input-suffix {
  position: absolute;
  top: 50%;
  right: 14px;
  transform: translateY(-50%);
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  pointer-events: none;
}

.field-error,
.field-hint {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
}

.field-error {
  color: var(--color-error, #ef4444);
}

.field-hint {
  color: var(--color-text-tertiary, #94a3b8);
}

.process-classification-grid {
  margin: 16px 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.experiment-mode-field {
  padding: 0;
  border: 0;
}

.experiment-mode-field legend {
  margin-bottom: 6px;
  color: var(--color-text-secondary, #64748b);
  font-size: 13px;
  font-weight: 500;
}

.experiment-mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.experiment-mode-btn {
  min-height: 42px;
  color: var(--color-text-secondary, #64748b);
  font-weight: 600;
  background: var(--color-bg-tertiary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.experiment-mode-btn:hover,
.experiment-mode-btn:focus-visible {
  color: var(--color-primary, #2563eb);
  border-color: var(--color-primary, #3b82f6);
  outline: none;
}

.experiment-mode-btn.active {
  color: #fff;
  background: var(--color-primary, #2563eb);
  border-color: var(--color-primary, #2563eb);
}

.sds-config-section,
.rectifier-config-section {
  margin-top: 18px;
  padding: 16px;
  background: #f6fbff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
}

.rectifier-config-section {
  background: #f7fbf8;
  border-color: #bbf7d0;
}

.sds-config-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.sds-config-header strong {
  color: var(--color-text-primary, #1e293b);
  font-size: 14px;
}

.sds-config-header p {
  margin: 4px 0 0;
  color: var(--color-text-tertiary, #64748b);
  font-size: 12px;
}

.sds-readiness-badge {
  flex: 0 0 auto;
  padding: 4px 10px;
  color: #b45309;
  background: #fef3c7;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.sds-readiness-badge.ready {
  color: #047857;
  background: #d1fae5;
}

.sds-parameter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.sds-pressure-field {
  grid-column: span 2;
}

.rectifier-template-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--color-text-secondary, #475569);
  font-size: 12px;
}

.rectifier-template-actions button {
  padding: 7px 10px;
  color: #047857;
  background: #fff;
  border: 1px solid #86efac;
  border-radius: 7px;
  cursor: pointer;
}

.rectifier-template-actions button:hover,
.rectifier-template-actions button:focus-visible {
  background: #ecfdf5;
  border-color: #22c55e;
  outline: none;
}

.rectifier-parameter-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.rectifier-wide-field {
  grid-column: span 2;
}

.rectifier-stage-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.rectifier-stage-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px;
  background: var(--color-bg-primary, #fff);
  border: 1px solid #d1fae5;
  border-radius: 8px;
}

.rectifier-stage-card strong {
  color: var(--color-text-primary, #1e293b);
  font-size: 13px;
}

.rectifier-stage-card label {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) minmax(64px, 0.8fr) 18px;
  gap: 6px;
  align-items: center;
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
}

.rectifier-stage-card input {
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  color: var(--color-text-primary, #1e293b);
  background: var(--color-bg-tertiary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  box-sizing: border-box;
}

.rectifier-stage-card em {
  color: var(--color-text-tertiary, #94a3b8);
  font-style: normal;
}

.rectifier-role-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  color: #166534;
  background: #ecfdf5;
  border-radius: 8px;
  font-size: 12px;
  line-height: 18px;
}

.rectifier-role-note > svg {
  flex: 0 0 auto;
  margin-top: 1px;
  font-size: 17px;
}

.sds-comm-table {
  margin-top: 16px;
  overflow: hidden;
  background: var(--color-bg-primary, #fff);
  border: 1px solid var(--color-border, #dbeafe);
  border-radius: 8px;
}

.sds-comm-row {
  display: grid;
  grid-template-columns: minmax(170px, 1.2fr) minmax(80px, 0.5fr) minmax(180px, 1.3fr) minmax(70px, 0.4fr);
  gap: 10px;
  align-items: center;
  min-height: 38px;
  padding: 0 12px;
  color: var(--color-text-secondary, #475569);
  border-top: 1px solid var(--color-border, #e2e8f0);
  font-size: 12px;
}

.sds-comm-row:first-child {
  border-top: 0;
}

.sds-comm-heading {
  color: var(--color-text-primary, #1e293b);
  background: #eff6ff;
  font-weight: 600;
}

.sds-comm-row code {
  overflow: hidden;
  color: #334155;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comm-ready {
  color: #047857;
}

.comm-pending {
  color: #b45309;
}

.sds-pending-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  font-size: 12px;
}

.sds-pending-note > svg {
  flex: 0 0 auto;
  margin-top: 1px;
  font-size: 18px;
}

.sds-pending-note p {
  margin: 4px 0 0;
  line-height: 18px;
}

.assembly-rule-section {
  margin-top: 18px;
  padding: 16px;
  background: var(--color-bg-tertiary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
}

.assembly-rule-header,
.assembly-rule-toggles,
.assembly-slot-topline,
.switch-field,
.slot-model-chip {
  display: flex;
  align-items: center;
}

.assembly-rule-header {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.assembly-rule-header strong {
  color: var(--color-text-primary, #1e293b);
  font-size: 14px;
}

.assembly-rule-header p {
  margin: 4px 0 0;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 12px;
}

.assembly-rule-toggles {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

.switch-field {
  gap: 6px;
  min-height: 32px;
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
  cursor: pointer;
}

.switch-field input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-primary, #2563eb);
}

.switch-field.small {
  flex: 0 0 auto;
}

.assembly-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(160px, 240px));
  gap: 12px;
  margin-bottom: 14px;
}

.compact-form-row {
  margin-bottom: 0;
}

.compact-form-row input {
  min-height: 40px;
  box-sizing: border-box;
}

.assembly-slot-list {
  display: grid;
  gap: 8px;
}

.assembly-slot-card {
  padding: 10px 12px;
  background: var(--color-bg-primary, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
}

.assembly-slot-topline {
  gap: 10px;
}

.slot-index {
  display: inline-flex;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--color-primary, #2563eb);
  font-size: 12px;
  font-weight: 700;
  background: #eff6ff;
  border-radius: 7px;
}

.slot-name-input {
  min-width: 120px;
  flex: 1;
  min-height: 36px;
  padding: 7px 10px !important;
}

.slot-model-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
  padding-left: 38px;
}

.slot-model-chip {
  gap: 5px;
  min-height: 30px;
  padding: 5px 9px;
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
  background: var(--color-bg-tertiary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.slot-model-chip.selected {
  color: var(--color-primary, #2563eb);
  background: #eff6ff;
  border-color: #93c5fd;
}

.slot-model-chip:focus-visible {
  outline: 2px solid var(--color-primary, #2563eb);
  outline-offset: 2px;
}

@media (max-width: 980px) {
  .runtime-config-grid,
  .process-classification-grid,
  .sds-parameter-grid,
  .rectifier-stage-grid {
    grid-template-columns: 1fr;
  }

  .sds-pressure-field,
  .rectifier-wide-field {
    grid-column: auto;
  }

  .rectifier-template-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .sds-comm-table {
    overflow-x: auto;
  }

  .sds-comm-row {
    min-width: 640px;
  }

  .assembly-rule-header,
  .assembly-slot-topline {
    align-items: flex-start;
    flex-direction: column;
  }

  .assembly-rule-toggles {
    justify-content: flex-start;
  }

  .assembly-summary-grid {
    grid-template-columns: 1fr;
  }

  .slot-model-options {
    padding-left: 0;
  }
}

/* 版本迭代选择区域 */
.version-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--color-border, #e2e8f0);
}

.version-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.version-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary, #64748b);
}

.version-section-title :deep(svg) {
  font-size: 18px;
  color: var(--color-primary, #3b82f6);
}

.version-section-desc {
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
  margin: 0 0 10px 0;
}

.clear-selection-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-selection-btn:hover {
  border-color: var(--color-error, #ef4444);
  color: var(--color-error, #ef4444);
}

/* 版本表格 */
.version-table-wrapper {
  max-height: 180px;
  overflow-y: auto;
  border-radius: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
}

.version-table-wrapper::-webkit-scrollbar {
  width: 4px;
}

.version-table-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.version-table-wrapper::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar, #cbd5e1);
  border-radius: 2px;
}

.version-table {
  width: 100%;
  border-collapse: collapse;
}

.version-table th {
  position: sticky;
  top: 0;
  padding: 10px 14px;
  background: var(--color-bg-tertiary, #f1f5f9);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
  text-align: left;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.version-table td {
  padding: 10px 14px;
  font-size: 14px;
  color: var(--color-text-primary, #1e293b);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}

.version-table tbody tr {
  cursor: pointer;
  transition: background 0.15s ease;
}

.version-table tbody tr:hover {
  background: var(--color-bg-hover, #f8fafc);
}

.version-table tbody tr.selected {
  background: rgba(59, 130, 246, 0.1);
}

.version-table tbody tr.selected td {
  color: var(--color-primary, #3b82f6);
  font-weight: 500;
}

.version-table tbody tr:last-child td {
  border-bottom: none;
}

.version-table .mono {
  font-family: var(--font-mono, monospace);
}

.version-table .empty-row {
  padding: 32px 14px !important;
  cursor: default;
}

.version-table .empty-row:hover {
  background: transparent;
}

/* 底部操作栏 */
.bottom-bar {
  border: 1px solid var(--color-border, #e2e8f0);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--color-bg-secondary, #fff);
  border-radius: 12px;
  margin-top: 8px;
}

.primary-btn,
.secondary-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.primary-btn {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.primary-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.secondary-btn {
  background: var(--color-bg-3, #f1f5f9);
  color: var(--color-text-1, #1e293b);
}

.secondary-btn:hover {
  background: var(--color-bg-hover, #e2e8f0);
}

/* 编辑页面 */
.edit-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 24px;
  background: var(--color-bg-1, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 0.75rem;
}

.exit-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text-2, #64748b);
  cursor: pointer;
  transition: all 0.2s;
}

.exit-btn:hover {
  background: var(--color-bg-3, #f1f5f9);
  color: var(--color-text-1, #1e293b);
}

.steps {
  display: flex;
  gap: 8px;
  flex: 1;
  justify-content: center;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.step:hover {
  background: var(--color-bg-3, #f1f5f9);
}

.step.active {
  background: var(--color-primary-light, #dbeafe);
}

.step.completed .step-indicator {
  background: var(--color-success, #22c55e);
  color: #fff;
}

.step-indicator {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-3, #f1f5f9);
  border-radius: 50%;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-2, #64748b);
}

.step.active .step-indicator {
  background: var(--color-primary, #3b82f6);
  color: #fff;
}

.step-label {
  font-size: 14px;
  color: var(--color-text-2, #64748b);
}

.step.active .step-label {
  color: var(--color-primary, #3b82f6);
  font-weight: 500;
}

.top-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-bg-3, #f1f5f9);
  border: none;
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text-2, #64748b);
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: var(--color-primary-light, #dbeafe);
  color: var(--color-primary, #3b82f6);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 主内容区 */
.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.step-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 0.5rem;
}

.step-2 {
  display: flex;
  flex-direction: column;
}

.section {
  background: var(--color-bg-2, #fff);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-1, #1e293b);
  margin: 0 0 20px 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item.full-width {
  grid-column: 1 / -1;
}

.form-item label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-2, #64748b);
}

.form-item input,
.form-item textarea {
  padding: 10px 14px;
  background: var(--color-bg-1, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-1, #1e293b);
  transition: all 0.2s;
}

.form-item input:focus,
.form-item textarea:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* 流程图布局 */
.step-3 {
  height: 100%;
}

.flowchart-layout {
  display: flex;
  height: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--color-border, #e2e8f0);
}

.flowchart-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.flow-editor-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background: rgba(59, 130, 246, 0.07);
}

.flow-editor-banner.cycle {
  background: rgba(139, 92, 246, 0.08);
}

.flow-editor-banner > div {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.flow-editor-banner strong {
  color: var(--color-text-1, #1e293b);
}

.flow-editor-banner span {
  font-size: 0.8125rem;
  color: var(--color-text-2, #64748b);
}

.flow-node-count {
  white-space: nowrap;
}

/* 预览 */
.preview-actions {
  margin-bottom: 16px;
}

.json-preview {
  background: var(--color-bg-1, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
  max-height: 500px;
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.spacer {
  flex: 1;
}

.btn-primary,
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--color-primary, #3b82f6);
  border: none;
  color: #fff;
}

.btn-primary:hover {
  background: var(--color-primary-dark, #2563eb);
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--color-border, #e2e8f0);
  color: var(--color-text-2, #64748b);
}

.btn-secondary:hover {
  background: var(--color-bg-3, #f1f5f9);
}

/* 审核反馈提示 */
.feedback-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  margin-right: auto;
}

.feedback-icon {
  font-size: 18px;
  color: #f59e0b;
}

.feedback-text {
  font-size: 13px;
  color: #b45309;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 抽屉 */
.draft-list {
  padding: 16px;
}

.empty-text {
  text-align: center;
  color: var(--color-text-3, #94a3b8);
  padding: 40px;
}

/* 暂存列表项 */
.draft-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--color-bg-1, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.draft-item:hover {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #dbeafe);
}

.draft-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.draft-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1, #1e293b);
}

.draft-version {
  font-size: 12px;
  color: var(--color-text-3, #94a3b8);
}

.draft-mode {
  padding: 4px 10px;
  background: var(--color-bg-3, #f1f5f9);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-2, #64748b);
}

/* 过渡动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
