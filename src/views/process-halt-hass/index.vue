<script setup lang="ts">
/**
 * HALT-HASS 工艺编辑页面
 * 使用 Vue Flow 实现流程图编辑
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// 导入自定义组件
import AppDrawer from '@/components/common/AppDrawer.vue'
import type { Node, Edge } from '@vue-flow/core'
import { v4 as uuidv4 } from 'uuid'

// 导入流程图组件
import { FlowchartEditor, BlockSidebar, ControlBar } from '@/components/flowchart'

// 导入新增组件
import BoardGroupSelector from './components/BoardGroupSelector.vue'
import InstallGuideEditor from './components/InstallGuideEditor.vue'

// 导入 composables
import { useHaltHassProcess } from './composables/useHaltHassProcess'
import { useLayout } from '@/composables/useLayout'
import { useFlojoyBackend } from '@/composables/useFlojoyBackend'
import { useFlojoySocket } from '@/composables/useFlojoySocket'
import { runFlowchart, cancelFlowchartRun, configureApi } from '@/services/flojoy-api'

// 导入类型和适配器
import type { BlockData } from './types'
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

// 使用 HALT-HASS 工艺管理
const {
  processJson,
  editForm,
  canSave,
  isSaving,
  errorMessage,
  treeData,
  isOnline,
  tempList,
  resetProcess,
  updateMetadata,
  updateFlowchart,
  getRunSettings,
  getObserveBlocks,
  resetNodeStatuses,
  fetchTreeData,
  fetchTempList,
  loadFromTemp,
  uploadProcess,
  fetchProcess,
  submitToCheck,
} = useHaltHassProcess()

// 流程图编辑器引用
const editorRef = ref<InstanceType<typeof FlowchartEditor>>()

// 页面状态
const currentStep = ref(0)
const showSidebar = ref(true)
const showDraftDrawer = ref(false)
const currentJobId = ref<string | null>(null)

// 步骤配置（新流程：选择页 -> 安装指导 -> 流程图 -> 预览）
const steps = [
  { key: 'select', label: '选择工艺' },
  { key: 'install', label: '安装指导' },
  { key: 'flowchart', label: '流程图编辑' },
  { key: 'preview', label: '预览确认' },
]

// 基于版本迭代
const existingVersions = ref<{ id: number; name: string; version: string }[]>([])
const selectedBaseVersion = ref<number | null>(null)

// 流程图数据
const flowchartNodes = ref<Node[]>([])
const flowchartEdges = ref<Edge[]>([])

// 计算属性
const canRun = computed(() => backendRunning.value && socketConnected.value)

// 预览 JSON
const previewJson = computed(() => {
  return JSON.stringify({
    ...processJson.value,
    flowchart: {
      nodes: flowchartNodes.value,
      edges: flowchartEdges.value,
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

// 选择基础版本
function selectBaseVersion(row: { id: number; name: string; version: string }) {
  selectedBaseVersion.value = row.id
  updateMetadata({
    baseVersion: {
      processId: row.id,
      version: row.version,
    }
  })
  // TODO: 从后端加载该版本的数据
  ElMessage.info(`已选择基础版本: ${row.name} v${row.version}`)
}

// 清除基础版本选择
function clearBaseVersionSelection() {
  selectedBaseVersion.value = null
  updateMetadata({ baseVersion: undefined })
}

// 获取已有版本列表（TODO: 从后端获取）
async function fetchExistingVersions() {
  // TODO: 调用后端 API 获取已有版本
  // const response = await http.get('/test/addprocess/halt-hass/list/', ...)
  // existingVersions.value = response.data
  console.log('TODO: 获取已有版本列表')
}

// 新建工艺（保留已填写的 metadata）
function handleNew() {
  // 注意：不调用 resetProcess()，因为用户已经在选择页填写了 metadata
  // 只重置流程图数据
  flowchartNodes.value = []
  flowchartEdges.value = []
  currentStep.value = 1
}

// 加载暂存工艺
async function handleLoadDraft(fileName: string) {
  const success = await loadFromTemp(fileName)
  if (success) {
    // 恢复流程图数据
    if (processJson.value.flowchart.nodes.length > 0) {
      flowchartNodes.value = processJson.value.flowchart.nodes
      flowchartEdges.value = processJson.value.flowchart.edges
    }
    showDraftDrawer.value = false
    currentStep.value = 1
    ElMessage.success('加载成功')
  } else {
    ElMessage.error('加载失败')
  }
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
      
      console.log('[handleLoad] Studio 格式解析成功:', { nodes: nodes.length, edges: edges.length })
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

// 保存工艺到后端
async function handleSave() {
  if (!canSave.value) {
    ElMessage.warning('请先填写工艺名称')
    return
  }

  const success = await uploadProcess()
  if (success) {
    ElMessage.success('保存成功')
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

  // 获取已有版本列表（后端 API 待对接）
  fetchExistingVersions()
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
            <button class="work-btn" @click="showDraftDrawer = true">
              <Icon icon="mdi:briefcase-outline" />
              <span>工作</span>
              <span v-if="tempList.length > 0" class="badge">{{ tempList.length }}</span>
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

        <!-- 主内容区：电路板选择和版本配置 -->
        <div class="selection-content">
          <div class="selection-main">
            <!-- 左侧：电路板型号树 -->
            <div class="tree-panel-wrapper">
              <BoardGroupSelector
                v-model="processJson.metadata.boardGroup"
                :tree-data="treeData"
                :is-online="isOnline"
              />
            </div>

            <!-- 右侧：已选电路板 + 工艺信息配置 -->
            <div class="right-panel-wrapper">
              <!-- 已选择的电路板标签 -->
              <div class="config-section">
                <div class="section-header">
                  <Icon icon="mdi:check-circle-outline" class="section-icon success" />
                  <span>已选择的电路板组</span>
                  <span v-if="processJson.metadata.boardGroup.length > 0" class="board-count">
                    {{ processJson.metadata.boardGroup.length }}
                  </span>
                </div>
                <div class="section-content">
                  <template v-if="processJson.metadata.boardGroup.length > 0">
                    <div class="selected-tags">
                      <div v-for="board in processJson.metadata.boardGroup" :key="board.id" class="board-tag">
                        <Icon icon="mdi:chip" class="tag-icon" />
                        <span>{{ board.name }}</span>
                        <button class="tag-remove" @click="processJson.metadata.boardGroup = processJson.metadata.boardGroup.filter(b => b.id !== board.id)">
                          <Icon icon="mdi:close" />
                        </button>
                      </div>
                    </div>
                  </template>
                  <div v-else class="empty-boards">
                    <Icon icon="mdi:arrow-left-bold" />
                    <span>请从左侧选择电路板型号</span>
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

                  <!-- 版本迭代选择 -->
                  <div v-if="existingVersions.length > 0" class="version-section">
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
                    <p class="version-section-desc">单击表格内容选择基础版本</p>
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
                            v-for="row in existingVersions"
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
            :disabled="processJson.metadata.boardGroup.length === 0 || !processJson.metadata.name.trim() || !processJson.metadata.version"
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
            <button class="action-btn" @click="handleExport" :disabled="!canSave">
              <Icon icon="mdi:download" />
              导出
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

    <!-- 暂存列表抽屉 -->
    <AppDrawer
      v-model="showDraftDrawer"
      title="暂存列表"
      direction="rtl"
      size="400px"
    >
      <div class="draft-list">
        <template v-if="tempList.length > 0">
          <div
            v-for="item in tempList"
            :key="item.fileName"
            class="draft-item"
            @click="handleLoadDraft(item.fileName)"
          >
            <div class="draft-info">
              <span class="draft-name">{{ item.name }}</span>
              <span class="draft-version">v{{ item.version }}</span>
            </div>
            <span class="draft-mode">{{ item.mode }}</span>
          </div>
        </template>
        <p v-else class="empty-text">暂无暂存的工艺</p>
      </div>
    </AppDrawer>
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
  overflow: auto;
  height: 100%;
}

.step-content {
  height: 100%;
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
