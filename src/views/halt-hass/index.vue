<script setup lang="ts">
/**
 * HALT-HASS 测试运行页面
 * 加载工艺、运行测试、显示结果
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'

// 导入自定义组件
import AppDrawer from '@/components/common/AppDrawer.vue'
import AppProgress from '@/components/common/AppProgress.vue'
import type { Node, Edge } from '@vue-flow/core'
import { v4 as uuidv4 } from 'uuid'

// 导入流程图组件
import { FlowchartViewer, ControlBar } from '@/components/flowchart'

// 导入 composables
import { useFlojoyBackend } from '@/composables/useFlojoyBackend'
import { useFlojoySocket, ServerStatus } from '@/composables/useFlojoySocket'
import { useHaltHassProcess } from '@/views/process-halt-hass/composables/useHaltHassProcess'
import { useLayout } from '@/composables/useLayout'
import { runFlowchart, cancelFlowchartRun, configureApi } from '@/services/flojoy-api'

// 导入类型和适配器
import type { BlockData } from '@/views/process-halt-hass/types'
import { prepareRunFlowchartArgs } from '@/services/flojoy-adapter'

// 布局控制
const { enterEditMode, exitEditMode } = useLayout()

// 使用 Flojoy 后端管理
const {
  status: backendStatus,
  isRunning: isBackendRunning,
  port: backendPort,
  start: startBackend,
  stop: stopBackend,
} = useFlojoyBackend()

// WebSocket 连接
const {
  connect: connectSocket,
  disconnect: disconnectSocket,
  isConnected: socketConnected,
  isRunning: flowchartRunning,
  nodeStatuses,
  clearNodeStatuses,
  lastMessage,
  serverStatus,
  socketId,
  blockResults,
  runningBlock,
  failedBlocks,
} = useFlojoySocket()

// 使用 HALT-HASS 工艺管理
const {
  processJson,
  isLoading,
  importFromFile,
  tempList,
  fetchTempList,
  getRunSettings,
  getObserveBlocks,
  resetNodeStatuses,
} = useHaltHassProcess()

// 流程图查看器引用
const viewerRef = ref<InstanceType<typeof FlowchartViewer>>()

// 状态
const isTestRunning = ref(false)
const testProgress = ref(0)
const testLogs = ref<string[]>([])
const currentJobId = ref<string | null>(null)
const showLogDrawer = ref(false)
const showProcessDrawer = ref(false)

// 流程图数据
const flowchartNodes = ref<Node[]>([])
const flowchartEdges = ref<Edge[]>([])

// 计算属性
const canRun = computed(() => isBackendRunning.value && socketConnected.value && flowchartNodes.value.length > 0)

const hasProcess = computed(() => processJson.value.metadata?.name)

const testStatus = computed(() => {
  if (isTestRunning.value) return 'running'
  if (testProgress.value === 100) return 'completed'
  if (testProgress.value > 0) return 'paused'
  return 'idle'
})

// ========== 方法 ==========

// 加载工艺文件
async function handleLoadProcess() {
  try {
    await importFromFile()
    if (processJson.value.flowchart) {
      flowchartNodes.value = processJson.value.flowchart.nodes || []
      flowchartEdges.value = processJson.value.flowchart.edges || []
    }
    ElMessage.success('工艺加载成功')
  } catch (e) {
    ElMessage.error('加载工艺失败')
  }
}

// 开始测试（使用适配层对齐 Studio）
async function startTest() {
  if (!canRun.value) {
    ElMessage.warning('请先加载工艺并确保后端已连接')
    return
  }
  
  isTestRunning.value = true
  testProgress.value = 0
  testLogs.value = []
  clearNodeStatuses()
  resetNodeStatuses()
  enterEditMode()
  
  const jobId = socketId.value || uuidv4()
  currentJobId.value = jobId
  
  addLog('开始运行 HALT-HASS 测试...')
  
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
    addLog('流程图已提交运行')
  } catch (e) {
    addLog(`运行失败: ${e}`)
    ElMessage.error('运行失败')
    isTestRunning.value = false
  }
}

// 停止测试
async function stopTest() {
  if (currentJobId.value) {
    try {
      await cancelFlowchartRun(currentJobId.value)
      addLog('测试已停止')
      isTestRunning.value = false
      exitEditMode()
    } catch (e) {
      ElMessage.error('停止失败')
    }
  }
}

// 添加日志
function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString()
  testLogs.value.push(`[${timestamp}] ${message}`)
}

// 适应视图
function handleFitView() {
  viewerRef.value?.fitToView()
}

// 监听 WebSocket 消息（对齐 Studio worker_response 格式）
watch(lastMessage, (message) => {
  if (!message) return
  
  switch (message.type) {
    case 'connection_established':
      addLog('WebSocket 连接已建立')
      break
      
    case 'worker_response':
      // 处理节点运行状态
      if (message.RUNNING_NODE) {
        addLog(`节点 ${message.RUNNING_NODE} 开始执行`)
        viewerRef.value?.updateNodeStatus(message.RUNNING_NODE, 'running')
      }
      
      // 处理节点结果
      if (message.NODE_RESULTS) {
        const { id, result } = message.NODE_RESULTS
        addLog(`节点 ${id} 执行完成`)
        viewerRef.value?.updateNodeStatus(id, 'success', result)
        
        // 更新进度
        const completedCount = Object.keys(blockResults.value).length
        testProgress.value = Math.round((completedCount / flowchartNodes.value.length) * 100)
      }
      
      // 处理失败节点
      if (message.FAILED_NODES) {
        for (const [nodeId, error] of Object.entries(message.FAILED_NODES)) {
          addLog(`节点 ${nodeId} 执行失败: ${error}`)
          viewerRef.value?.updateNodeStatus(nodeId, 'error')
        }
      }
      
      // 处理系统状态变化
      if (message.SYSTEM_STATUS) {
        addLog(`系统状态: ${message.SYSTEM_STATUS}`)
        
        // 检查是否运行完成或出错
        if (message.SYSTEM_STATUS === ServerStatus.STANDBY) {
          // 运行完成
          isTestRunning.value = false
          testProgress.value = 100
          exitEditMode()
          ElMessage.success('测试完成')
        } else if (
          message.SYSTEM_STATUS === ServerStatus.FAILED_BLOCK ||
          message.SYSTEM_STATUS === ServerStatus.PRE_JOB_OP_FAILED ||
          message.SYSTEM_STATUS === ServerStatus.IMPORTING_BLOCK_FUNCTIONS_FAILED ||
          message.SYSTEM_STATUS === ServerStatus.MAXIMUM_RUNTIME_EXCEEDED
        ) {
          // 运行出错
          isTestRunning.value = false
          exitEditMode()
          ElMessage.error(`测试运行错误: ${message.SYSTEM_STATUS}`)
        }
      }
      break
      
    case 'manifest_update':
      addLog('Blocks 清单已更新')
      break
  }
})

// 初始化
onMounted(async () => {
  // 配置 API
  configureApi('127.0.0.1', backendPort.value)
  
  // 启动后端
  if (!isBackendRunning.value) {
    await startBackend()
  }
  
  // 连接 WebSocket
  connectSocket()
  
  // 获取暂存列表
  fetchTempList()
})

// 清理
onUnmounted(() => {
  disconnectSocket()
  exitEditMode()
})
</script>

<template>
  <div class="halt-hass-page">
    <!-- 顶部状态栏 -->
    <div class="status-bar">
      <div class="status-left">
        <h1 class="page-title">
          <Icon icon="mdi:flask-outline" />
          HALT-HASS 测试
        </h1>
        
        <!-- 后端状态 -->
        <div class="status-badge" :class="isBackendRunning ? 'success' : 'warning'">
          <Icon :icon="isBackendRunning ? 'mdi:check-circle' : 'mdi:alert-circle'" />
          {{ isBackendRunning ? '后端已连接' : '后端未连接' }}
        </div>
        
        <!-- WebSocket 状态 -->
        <div class="status-badge" :class="socketConnected ? 'success' : 'warning'">
          <Icon :icon="socketConnected ? 'mdi:wifi' : 'mdi:wifi-off'" />
          {{ socketConnected ? 'WS 已连接' : 'WS 未连接' }}
        </div>
      </div>
      
      <div class="status-right">
        <button class="action-btn" @click="showProcessDrawer = true">
          <Icon icon="mdi:folder-open" />
          加载工艺
        </button>
        
        <button class="action-btn" @click="showLogDrawer = true">
          <Icon icon="mdi:text-box-outline" />
          日志
          <span v-if="testLogs.length" class="log-count">{{ testLogs.length }}</span>
        </button>
      </div>
    </div>
    
    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧：工艺信息 -->
      <div class="info-panel">
        <div class="panel-section">
          <h3 class="section-title">当前工艺</h3>
          <div v-if="hasProcess" class="process-info">
            <div class="info-item">
              <span class="label">名称</span>
              <span class="value">{{ processJson.metadata?.name }}</span>
            </div>
            <div class="info-item">
              <span class="label">版本</span>
              <span class="value">{{ processJson.metadata?.version || '1.0.0' }}</span>
            </div>
            <div class="info-item">
              <span class="label">节点数</span>
              <span class="value">{{ flowchartNodes.length }}</span>
            </div>
          </div>
          <div v-else class="empty-state">
            <Icon icon="mdi:file-document-outline" />
            <p>未加载工艺</p>
            <button class="btn-primary" @click="handleLoadProcess">
              <Icon icon="mdi:folder-open" />
              加载工艺文件
            </button>
          </div>
        </div>
        
        <!-- 测试进度 -->
        <div class="panel-section">
          <h3 class="section-title">测试进度</h3>
          <AppProgress
            :percentage="testProgress"
            :status="testStatus === 'completed' ? 'success' : undefined"
            :stroke-width="12"
          />
          <div class="progress-info">
            <span>{{ testStatus === 'running' ? '运行中...' : testStatus === 'completed' ? '已完成' : '等待开始' }}</span>
            <span>{{ testProgress }}%</span>
          </div>
        </div>
        
        <!-- 控制按钮 -->
        <div class="panel-section">
          <div class="control-buttons">
            <button
              class="btn-run"
              :class="{ running: isTestRunning }"
              :disabled="!canRun && !isTestRunning"
              @click="isTestRunning ? stopTest() : startTest()"
            >
              <Icon :icon="isTestRunning ? 'mdi:stop' : 'mdi:play'" />
              {{ isTestRunning ? '停止测试' : '开始测试' }}
            </button>
          </div>
        </div>
      </div>
      
      <!-- 右侧：流程图查看器 -->
      <div class="flowchart-panel">
        <div class="panel-header">
          <h3>流程图</h3>
          <button class="icon-btn" @click="handleFitView">
            <Icon icon="mdi:fit-to-screen" />
          </button>
        </div>
        
        <FlowchartViewer
          ref="viewerRef"
          :nodes="flowchartNodes"
          :edges="flowchartEdges"
          height="100%"
        />
      </div>
    </div>
    
    <!-- 工艺选择抽屉 -->
    <AppDrawer
      v-model="showProcessDrawer"
      title="选择工艺"
      direction="ltr"
      size="400px"
    >
      <div class="process-list">
        <button class="process-item highlight" @click="handleLoadProcess">
          <Icon icon="mdi:file-import" />
          <span>从文件导入</span>
        </button>
        
        <div class="divider">暂存的工艺</div>
        
        <div v-if="tempList.length === 0" class="empty-text">
          暂无暂存的工艺
        </div>
        
        <div
          v-for="item in tempList"
          :key="item.id"
          class="process-item"
        >
          <Icon icon="mdi:file-document" />
          <span>{{ item.name }}</span>
        </div>
      </div>
    </AppDrawer>
    
    <!-- 日志抽屉 -->
    <AppDrawer
      v-model="showLogDrawer"
      title="运行日志"
      direction="rtl"
      size="500px"
    >
      <div class="log-panel">
        <div v-if="testLogs.length === 0" class="empty-text">
          暂无日志
        </div>
        <div v-else class="log-list">
          <div v-for="(log, index) in testLogs" :key="index" class="log-item">
            {{ log }}
          </div>
        </div>
      </div>
    </AppDrawer>
  </div>
</template>

<style scoped>
.halt-hass-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-1, #f8fafc);
}

/* 状态栏 */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--color-bg-2, #fff);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.status-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-1, #1e293b);
  margin: 0;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
}

.status-badge.success {
  background: var(--color-success-light, #dcfce7);
  color: var(--color-success, #22c55e);
}

.status-badge.warning {
  background: var(--color-warning-light, #fef3c7);
  color: var(--color-warning, #f59e0b);
}

.status-right {
  display: flex;
  gap: 12px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-bg-3, #f1f5f9);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-2, #64748b);
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--color-primary-light, #dbeafe);
  color: var(--color-primary, #3b82f6);
}

.log-count {
  padding: 2px 8px;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  border-radius: 10px;
  font-size: 12px;
}

/* 主内容 */
.main-content {
  flex: 1;
  display: flex;
  gap: 24px;
  padding: 24px;
  overflow: hidden;
}

/* 信息面板 */
.info-panel {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-section {
  background: var(--color-bg-2, #fff);
  border-radius: 12px;
  padding: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1, #1e293b);
  margin: 0 0 16px 0;
}

.process-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-item .label {
  font-size: 14px;
  color: var(--color-text-3, #94a3b8);
}

.info-item .value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-1, #1e293b);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  color: var(--color-text-3, #94a3b8);
}

.empty-state .iconify {
  font-size: 48px;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--color-primary, #3b82f6);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: var(--color-primary-dark, #2563eb);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 13px;
  color: var(--color-text-3, #94a3b8);
}

.control-buttons {
  display: flex;
  gap: 12px;
}

.btn-run {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 24px;
  background: var(--color-success, #22c55e);
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-run:hover:not(:disabled) {
  background: var(--color-success-dark, #16a34a);
}

.btn-run.running {
  background: var(--color-danger, #ef4444);
}

.btn-run.running:hover {
  background: var(--color-danger-dark, #dc2626);
}

.btn-run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 流程图面板 */
.flowchart-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-2, #fff);
  border-radius: 12px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.panel-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1, #1e293b);
  margin: 0;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-3, #f1f5f9);
  border: none;
  border-radius: 6px;
  color: var(--color-text-2, #64748b);
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: var(--color-primary-light, #dbeafe);
  color: var(--color-primary, #3b82f6);
}

/* 抽屉样式 */
.process-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.process-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-1, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-1, #1e293b);
  cursor: pointer;
  transition: all 0.2s;
}

.process-item:hover {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #dbeafe);
}

.process-item.highlight {
  background: var(--color-primary-light, #dbeafe);
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.divider {
  padding: 12px 0;
  font-size: 13px;
  color: var(--color-text-3, #94a3b8);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  margin-bottom: 8px;
}

.empty-text {
  text-align: center;
  color: var(--color-text-3, #94a3b8);
  padding: 40px;
}

.log-panel {
  height: 100%;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: 'Fira Code', monospace;
  font-size: 13px;
}

.log-item {
  padding: 8px 12px;
  background: var(--color-bg-1, #f8fafc);
  border-radius: 4px;
  color: var(--color-text-2, #64748b);
}
</style>
