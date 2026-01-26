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
  status: backendStatus, 
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
  nodeStatuses,
  clearNodeStatuses,
  socketId,
  serverStatus,
} = useFlojoySocket()

// 使用 HALT-HASS 工艺管理
const {
  processJson,
  editForm,
  isLoading,
  canSave,
  resetProcess,
  updateMetadata,
  updateTestParams,
  updateFlowchart,
  getRunSettings,
  getObserveBlocks,
  resetNodeStatuses,
} = useHaltHassProcess()

// 流程图编辑器引用
const editorRef = ref<InstanceType<typeof FlowchartEditor>>()

// 页面状态
const currentStep = ref(0)
const showSidebar = ref(true)
const showDraftDrawer = ref(false)
const currentJobId = ref<string | null>(null)

// 步骤配置
const steps = [
  { key: 'select', label: '选择工艺' },
  { key: 'basic', label: '基础信息' },
  { key: 'params', label: '测试参数' },
  { key: 'flowchart', label: '流程图编辑' },
  { key: 'preview', label: '预览确认' },
]

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

// 处理步骤变化
function handleStepChange(step: number) {
  currentStep.value = step
}

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

// 新建工艺
function handleNew() {
  resetProcess()
  flowchartNodes.value = []
  flowchartEdges.value = []
  currentStep.value = 1
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
      if (data.testParams) {
        processJson.value.testParams = data.testParams
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

// 保存工艺
function handleSave() {
  // TODO: 实现保存到后端
  ElMessage.success('保存成功')
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
        <div class="page-header">
          <h1 class="page-title">HALT-HASS 工艺管理</h1>
          <p class="page-subtitle">创建或编辑 HALT-HASS 测试工艺流程</p>
        </div>
        
        <div class="action-cards">
          <div class="action-card" @click="handleNew">
            <Icon icon="mdi:plus-circle" class="card-icon" />
            <h3>新建工艺</h3>
            <p>创建新的 HALT-HASS 测试工艺</p>
          </div>
          
          <div class="action-card" @click="handleLoad">
            <Icon icon="mdi:file-import" class="card-icon" />
            <h3>导入工艺</h3>
            <p>从文件导入已有工艺（支持 Studio 格式）</p>
          </div>
          
          <div class="action-card" @click="showDraftDrawer = true">
            <Icon icon="mdi:history" class="card-icon" />
            <h3>暂存列表</h3>
            <p>查看暂存的工艺草稿</p>
          </div>
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
          <!-- 步骤 1: 基础信息 -->
          <div v-if="currentStep === 1" class="step-content step-1">
            <div class="section">
              <h3 class="section-title">
                <Icon icon="mdi:information-outline" />
                基础信息
              </h3>
              <div class="form-grid">
                <div class="form-item">
                  <label>工艺名称</label>
                  <input
                    :value="processJson.metadata.name"
                    type="text"
                    placeholder="请输入工艺名称"
                    @input="updateMetadata({ name: ($event.target as HTMLInputElement).value })"
                  />
                </div>
                <div class="form-item">
                  <label>工艺版本</label>
                  <input
                    :value="processJson.metadata.version"
                    type="text"
                    placeholder="如 1.0.0"
                    @input="updateMetadata({ version: ($event.target as HTMLInputElement).value })"
                  />
                </div>
                <div class="form-item full-width">
                  <label>工艺描述</label>
                  <textarea
                    :value="processJson.metadata.description"
                    rows="3"
                    placeholder="请输入工艺描述"
                    @input="updateMetadata({ description: ($event.target as HTMLTextAreaElement).value })"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 步骤 2: 测试参数 -->
          <div v-if="currentStep === 2" class="step-content step-2">
            <div class="section">
              <h3 class="section-title">
                <Icon icon="mdi:cog-outline" />
                测试参数配置
              </h3>
              <div class="form-grid">
                <div class="form-item">
                  <label>最大温度 (°C)</label>
                  <input
                    type="number"
                    :value="processJson.testParams?.temperatureMax || 85"
                    @input="updateTestParams({ temperatureMax: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
                <div class="form-item">
                  <label>最小温度 (°C)</label>
                  <input
                    type="number"
                    :value="processJson.testParams?.temperatureMin || -40"
                    @input="updateTestParams({ temperatureMin: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
                <div class="form-item">
                  <label>振动等级 (G)</label>
                  <input
                    type="number"
                    :value="processJson.testParams?.vibrationLevel || 10"
                    @input="updateTestParams({ vibrationLevel: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
                <div class="form-item">
                  <label>测试循环次数</label>
                  <input
                    type="number"
                    :value="processJson.testParams?.cycles || 5"
                    @input="updateTestParams({ cycles: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 步骤 3: 流程图编辑 -->
          <div v-if="currentStep === 3" class="step-content step-3">
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

          <!-- 步骤 4: 预览确认 -->
          <div v-if="currentStep === 4" class="step-content step-4">
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
        <div v-if="currentStep > 0 && currentStep !== 3" class="bottom-bar">
          <button v-if="currentStep > 1" class="btn-secondary" @click="prevStep">
            <Icon icon="mdi:arrow-left" />
            上一步
          </button>
          <div class="spacer" />
          <button v-if="currentStep < steps.length - 1" class="btn-primary" @click="nextStep">
            下一步
            <Icon icon="mdi:arrow-right" />
          </button>
          <button v-else class="btn-primary" @click="handleSave">
            <Icon icon="mdi:check" />
            保存工艺
          </button>
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
        <p class="empty-text">暂无暂存的工艺</p>
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
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.page-header {
  text-align: center;
  margin-bottom: 48px;
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text-1, #1e293b);
  margin: 0 0 12px 0;
}

.page-subtitle {
  font-size: 16px;
  color: var(--color-text-3, #94a3b8);
  margin: 0;
}

.action-cards {
  display: flex;
  gap: 24px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 200px;
  padding: 32px 24px;
  background: var(--color-bg-2, #fff);
  border: 2px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-card:hover {
  border-color: var(--color-primary, #3b82f6);
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.15);
}

.card-icon {
  font-size: 48px;
  color: var(--color-primary, #3b82f6);
  margin-bottom: 16px;
}

.action-card h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-1, #1e293b);
  margin: 0 0 8px 0;
}

.action-card p {
  font-size: 14px;
  color: var(--color-text-3, #94a3b8);
  margin: 0;
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

.step-1,
.step-2,
.step-4 {
  padding: 24px;
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

/* 底部栏 */
.bottom-bar {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  background: var(--color-bg-2, #fff);
  border-top: 1px solid var(--color-border, #e2e8f0);
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
