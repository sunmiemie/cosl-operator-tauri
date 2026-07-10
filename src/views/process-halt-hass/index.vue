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
import { runFlowchart, cancelFlowchartRun, configureApi } from '@/services/flojoy-api'

// 导入类型和适配器
import type { BlockData, HaltHassJob, CreateBoardGroupParams } from './types'
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
  isCurveUploading,
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
  uploadCurveFile,
  removeCurveFile,
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
const curveFileInputRef = ref<HTMLInputElement | null>(null)

// 步骤配置（新流程：选择页 -> 安装指导 -> 流程图 -> 预览）
const steps = [
  { key: 'select', label: '选择工艺' },
  { key: 'install', label: '安装指导' },
  { key: 'flowchart', label: '流程图编辑' },
  { key: 'preview', label: '预览确认' },
]

// 基于版本迭代
const selectedBaseVersion = ref<number | null>(null)

// 流程图数据
const flowchartNodes = ref<Node[]>([])
const flowchartEdges = ref<Edge[]>([])

// 计算属性
const canRun = computed(() => backendRunning.value && socketConnected.value)
const canStartEditing = computed(() => {
  return Boolean(
    selectedBoardGroup.value
      && processJson.value.metadata.name.trim()
      && processJson.value.metadata.version.trim()
      && isRuntimeConfigComplete.value
      && !isCurveUploading.value
  )
})

const durationValidationError = computed(() => {
  const duration = processJson.value.metadata.durationHours
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return '请填写试验时长'
  }
  if (Math.abs(duration * 100 - Math.round(duration * 100)) >= 1e-8) {
    return '试验时长最多保留两位小数'
  }
  return ''
})

// 预览 JSON
const previewJson = computed(() => {
  return JSON.stringify({
    ...processJson.value,
    flowchart: {
      nodes: flowchartNodes.value,
      edges: flowchartEdges.value,
      observeBlocks: processJson.value.flowchart.observeBlocks,
      runSettings: processJson.value.flowchart.runSettings,
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
    flowchartNodes.value = []
    flowchartEdges.value = []
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
    const nodes = processJson.value.flowchart?.nodes || []
    const edges = processJson.value.flowchart?.edges || []
    if (nodes.length > 0) {
      flowchartNodes.value = nodes
      flowchartEdges.value = edges
    }
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

  // 注意：不调用 resetProcess()，因为用户已经在选择页填写了 metadata
  // 如果已选择基础版本进行迭代，保留已加载的流程图数据
  if (!selectedBaseVersion.value) {
    // 只有新建时才重置流程图数据
    flowchartNodes.value = []
    flowchartEdges.value = []
  }
  currentStep.value = 1
}

function handleDurationInput(event: Event) {
  const rawValue = (event.target as HTMLInputElement).value
  if (!rawValue.trim()) {
    updateMetadata({ durationHours: undefined })
    return
  }
  const duration = Number(rawValue)
  updateMetadata({ durationHours: Number.isFinite(duration) ? duration : undefined })
}

function chooseCurveFile() {
  if (!isCurveUploading.value) {
    curveFileInputRef.value?.click()
  }
}

async function handleCurveFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const success = await uploadCurveFile(file)
  input.value = ''
  if (success) {
    ElMessage.success('曲线文件上传成功')
  } else {
    ElMessage.error(errorMessage.value || '曲线文件上传失败')
  }
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// 加载/导入流程图文件（支持 Studio 原生格式）
async function handleLoad() {
  try {
    // 打开文件选择对话框
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    
    if (!selected) return // 用户取消
    
    // 读取文件内容
    const content = await readTextFile(selected as string)
    const data = JSON.parse(content)
    
    let loadedNodes: Node[] = []
    let loadedEdges: Edge[] = []
    
    // 检测格式并解析
    if (isStudioFormat(data)) {
      // Studio 原生格式（rfInstance 包装）
      const { nodes, edges } = deserializeFromStudioFormat(data)
      loadedNodes = nodes
      loadedEdges = edges
      
      // 更新流程图名称
      if (data.name) {
        processJson.value.metadata.name = data.name
      }
    } else if (data.flowchart) {
      // 我们自己的格式（带 flowchart 字段）
      loadedNodes = data.flowchart.nodes || []
      loadedEdges = data.flowchart.edges || []

      // 恢复元数据
      if (data.metadata) {
        processJson.value.metadata = data.metadata
      }
      // 恢复安装指导
      if (data.installGuide) {
        processJson.value.installGuide = data.installGuide
      }
    } else if (data.nodes && data.edges) {
      // 纯节点/边格式
      loadedNodes = data.nodes || []
      loadedEdges = data.edges || []
    } else {
      ElMessage.warning('无法识别的文件格式')
      return
    }
    
    // 更新本地状态
    flowchartNodes.value = loadedNodes
    flowchartEdges.value = loadedEdges
    
    // 直接调用编辑器的 setFlowchartData 方法更新画布
    if (editorRef.value) {
      editorRef.value.setFlowchartData(loadedNodes, loadedEdges)
      // 延迟适应视图
      setTimeout(() => {
        editorRef.value?.fitToView()
      }, 100)
    }
    
    ElMessage.success(`成功导入流程图，共 ${loadedNodes.length} 个节点`)
  } catch (e) {
    console.error('导入失败:', e)
    ElMessage.error('导入失败: ' + (e instanceof Error ? e.message : '未知错误'))
  }
}

// 导出工艺（支持 Studio 原生格式）
async function handleExport() {
  try {
    // 打开保存对话框
    const filePath = await save({
      defaultPath: `${processJson.value.metadata.name || 'halt-hass-process'}.json`,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
      ],
    })
    
    if (!filePath) return // 用户取消
    
    // 序列化为 Studio 原生格式
    const studioData = serializeToStudioFormat(
      processJson.value.metadata.name || '',
      flowchartNodes.value,
      flowchartEdges.value
    )
    
    // 写入文件
    await writeTextFile(filePath, JSON.stringify(studioData, null, 2))
    
    ElMessage.success('导出成功')
  } catch (e) {
    console.error('导出失败:', e)
    
    // 如果 Tauri 保存失败，回退到浏览器下载
    const studioData = serializeToStudioFormat(
      processJson.value.metadata.name || '',
      flowchartNodes.value,
      flowchartEdges.value
    )
    
    const blob = new Blob([JSON.stringify(studioData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${processJson.value.metadata.name || 'halt-hass-process'}.json`
    a.click()
    URL.revokeObjectURL(url)
    
    ElMessage.success('导出成功（使用浏览器下载）')
  }
}

// 暂存工艺到本地
async function handleSaveTemp() {
  if (!canSave.value) {
    ElMessage.warning(
      isCurveUploading.value
        ? '曲线文件正在上传，请稍候'
        : getRuntimeConfigError() || '请先填写工艺名称'
    )
    return
  }

  // 暂存前同步流程图数据到 processJson
  updateFlowchart(flowchartNodes.value as Node<BlockData>[], flowchartEdges.value)

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
    ElMessage.warning(
      isCurveUploading.value
        ? '曲线文件正在上传，请稍候'
        : getRuntimeConfigError() || '请先填写工艺名称'
    )
    return
  }

  // 保存前同步流程图数据到 processJson
  updateFlowchart(flowchartNodes.value as Node<BlockData>[], flowchartEdges.value)

  // 传递当前用户 ID
  const success = await uploadProcess(userInfo.value?.id)
  if (success) {
    ElMessage.success('保存成功')
    // 返回选择页
    currentStep.value = 0
    resetProcess()
    flowchartNodes.value = []
    flowchartEdges.value = []
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
  flowchartNodes.value = nodes
  flowchartEdges.value = edges
  // 同步更新到 processJson（使用适配层）
  updateFlowchart(nodes as Node<BlockData>[], edges)
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
  resetNodeStatuses()
  
  try {
    // 使用适配层准备运行参数
    const runArgs = prepareRunFlowchartArgs(
      flowchartNodes.value as Node<BlockData>[],
      flowchartEdges.value,
      jobId,
      getObserveBlocks(),
      getRunSettings()
    )
    
    await runFlowchart({
      nodes: runArgs.nodes as any,
      edges: runArgs.edges as any,
      jobId: runArgs.jobId,
      observeBlocks: runArgs.observeBlocks,
      settings: runArgs.settings,
    })
    ElMessage.success('流程图开始运行')
  } catch (e) {
    ElMessage.error('运行失败')
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
    flowchartNodes.value = []
    flowchartEdges.value = []
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
    // 恢复流程图数据（使用可选链确保安全访问）
    const nodes = processJson.value.flowchart?.nodes || []
    const edges = processJson.value.flowchart?.edges || []
    if (nodes.length > 0) {
      flowchartNodes.value = nodes
      flowchartEdges.value = edges
    }
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
    // 恢复流程图数据（使用可选链确保安全访问）
    const nodes = processJson.value.flowchart?.nodes || []
    const edges = processJson.value.flowchart?.edges || []
    if (nodes.length > 0) {
      flowchartNodes.value = nodes
      flowchartEdges.value = edges
    }
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
  // 同步更新 processJson.metadata.boardGroup
  if (group) {
    processJson.value.metadata.boardGroup = [{
      id: group.id,
      name: group.name,
    }]
    editForm.hasUnsavedChanges = true
    await fetchVersionsByBoardGroup(group.id)
  } else {
    processJson.value.metadata.boardGroup = []
  }
})

// 初始化后端连接
onMounted(async () => {
  // 配置 API
  configureApi('127.0.0.1', backendPort.value)

  // 启动后端
  if (!backendRunning.value) {
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
                        <span class="boards-label">包含电路板型号：</span>
                        <div class="board-tags">
                          <span
                            v-for="board in selectedBoardGroup.boards"
                            :key="board.id"
                            class="board-tag-small"
                          >
                            <Icon icon="mdi:chip" />
                            {{ board.name }}
                          </span>
                        </div>
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

                  <div class="runtime-config-grid">
                    <div class="form-row">
                      <label for="halt-hass-duration" class="required-label">试验时长</label>
                      <div class="duration-input">
                        <input
                          id="halt-hass-duration"
                          type="number"
                          min="0.01"
                          step="0.01"
                          inputmode="decimal"
                          :value="processJson.metadata.durationHours ?? ''"
                          placeholder="请输入试验时长"
                          @input="handleDurationInput"
                        />
                        <span class="input-suffix">小时</span>
                      </div>
                      <p v-if="durationValidationError" class="field-error">
                        {{ durationValidationError }}
                      </p>
                      <p v-else class="field-hint">最多保留两位小数</p>
                    </div>

                    <div class="form-row curve-file-row">
                      <label for="halt-hass-curve-file" class="required-label">HALT-HASS 曲线文件</label>
                      <input
                        id="halt-hass-curve-file"
                        ref="curveFileInputRef"
                        class="visually-hidden-input"
                        type="file"
                        @change="handleCurveFileSelected"
                      />

                      <div v-if="processJson.metadata.curveFile" class="curve-file-card">
                        <div class="curve-file-icon">
                          <Icon icon="mdi:file-chart-outline" />
                        </div>
                        <div class="curve-file-info">
                          <strong :title="processJson.metadata.curveFile.fileName">
                            {{ processJson.metadata.curveFile.fileName }}
                          </strong>
                          <span>
                            {{ formatFileSize(processJson.metadata.curveFile.fileSize) }}
                            · SHA-256 已校验
                          </span>
                        </div>
                        <div class="curve-file-actions">
                          <button
                            type="button"
                            class="icon-action-btn"
                            title="替换曲线文件"
                            :disabled="isCurveUploading"
                            @click="chooseCurveFile"
                          >
                            <Icon icon="mdi:file-replace-outline" />
                          </button>
                          <button
                            type="button"
                            class="icon-action-btn danger"
                            title="移除曲线文件"
                            :disabled="isCurveUploading"
                            @click="removeCurveFile"
                          >
                            <Icon icon="mdi:delete-outline" />
                          </button>
                        </div>
                      </div>

                      <button
                        v-else
                        type="button"
                        class="curve-upload-btn"
                        :disabled="isCurveUploading"
                        @click="chooseCurveFile"
                      >
                        <Icon
                          :icon="isCurveUploading ? 'mdi:loading' : 'mdi:upload-outline'"
                          :class="{ spinning: isCurveUploading }"
                        />
                        {{ isCurveUploading ? '正在上传...' : '上传曲线文件' }}
                      </button>
                      <p v-if="!processJson.metadata.curveFile" class="field-error">
                        请上传 HALT-HASS 曲线文件
                      </p>
                      <p class="field-hint">支持设备可识别的曲线文件，单文件不超过 100 MB</p>
                    </div>
                  </div>

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

          <!-- 步骤 2: 流程图编辑 -->
          <div v-if="currentStep === 2" class="step-content step-2">
            <div class="flowchart-layout">
              <!-- 左侧 Block 侧边栏 -->
              <BlockSidebar :visible="showSidebar" />
              
              <!-- 右侧流程图区域 -->
              <div class="flowchart-main">
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
                  @export="handleExport"
                />
                
                <!-- 流程图编辑器 -->
                <FlowchartEditor
                  ref="editorRef"
                  :initial-nodes="flowchartNodes"
                  :initial-edges="flowchartEdges"
                  height="calc(100vh - 220px)"
                  @change="handleFlowchartChange"
                />
              </div>
            </div>
          </div>

          <!-- 步骤 3: 预览确认 -->
          <div v-if="currentStep === 3" class="step-content step-3">
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
            <button class="btn-secondary" @click="handleExport" :disabled="isSaving">
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
  flex: 1;
  min-height: 0;
}

.selection-main {
  display: flex;
  gap: 20px;
  height: 100%;
}

.tree-panel-wrapper {
  width: 320px;
  flex-shrink: 0;
  height: 100%;
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
}

.board-tag-small :deep(svg) {
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
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
.form-row textarea {
  padding: 10px 14px;
  background: var(--color-bg-tertiary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary, #1e293b);
  transition: all 0.2s ease;
}

.form-row input:focus,
.form-row textarea:focus {
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

.visually-hidden-input {
  display: none;
}

.curve-upload-btn {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 14px;
  background: #eff6ff;
  border: 1px dashed #93c5fd;
  border-radius: 8px;
  color: var(--color-primary, #2563eb);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.curve-upload-btn:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #60a5fa;
}

.curve-upload-btn:disabled,
.icon-action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.curve-file-card {
  min-height: 48px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #dbe4ee;
  border-radius: 8px;
}

.curve-file-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e0f2fe;
  border-radius: 6px;
  color: #0284c7;
  font-size: 20px;
}

.curve-file-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.curve-file-info strong {
  overflow: hidden;
  color: var(--color-text-primary, #1e293b);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.curve-file-info span {
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 11px;
}

.curve-file-actions {
  display: flex;
  gap: 4px;
}

.icon-action-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
}

.icon-action-btn:hover:not(:disabled) {
  background: #e2e8f0;
  color: var(--color-primary, #2563eb);
}

.icon-action-btn.danger:hover:not(:disabled) {
  background: #fee2e2;
  color: var(--color-error, #dc2626);
}

.spinning {
  animation: halt-hass-spin 0.8s linear infinite;
}

@keyframes halt-hass-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .runtime-config-grid {
    grid-template-columns: 1fr;
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
