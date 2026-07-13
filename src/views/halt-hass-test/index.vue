<script setup lang="ts">
/**
 * HALT-HASS 测试页面
 * 完整的测试流程：设备检测 -> 扫码 -> 下载工艺 -> 安装指导 -> 流程图运行 -> 上传报告 -> 完成
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// 导入组件
import DeviceCheckOverlay from '@/components/visual-test/DeviceCheckOverlay.vue'
import ScanProgress from './components/ScanProgress.vue'
import InstallGuideViewer from './components/InstallGuideViewer.vue'
import FlowchartRunner from './components/FlowchartRunner.vue'
import TestResultPanel from './components/TestResultPanel.vue'
import ReportUploader from './components/ReportUploader.vue'
import HaltHassScheduleDashboard from './components/HaltHassScheduleDashboard.vue'

// 导入 composables
import { useHaltHassTest } from './composables/useHaltHassTest'
import { useHaltHassSchedule } from './composables/useHaltHassSchedule'
import { useMultiBoardScan } from './composables/useMultiBoardScan'
import { useHaltHassReport } from './composables/useHaltHassReport'
import { useScanner } from '@/composables/useScanner'
import { useFlojoyBackend } from '@/composables/useFlojoyBackend'
import { useFlojoySocket } from '@/composables/useFlojoySocket'
import { useLayout } from '@/composables/useLayout'
import { runFlowchart, cancelFlowchartRun, configureApi } from '@/services/flojoy-api'
import { prepareRunFlowchartArgs } from '@/services/flojoy-adapter'
import { v4 as uuidv4 } from 'uuid'
import { getMockScannedBoards, isMockHaltHassOrder } from './mock-halt-hass-fixture'

// 导入类型
import type { HaltHassOrder, PagePhase } from './types'
import type { BlockData } from '@/views/process-halt-hass/types'
import type { Node } from '@vue-flow/core'

// 布局控制
const { enterEditMode, exitEditMode } = useLayout()

// 测试流程管理
const {
  phase,
  currentOrder,
  processJson,
  deviceStatus,
  installStep,
  isFlowchartRunning,
  flowchartStartTime,
  nodeResults,
  completedNodes,
  currentNodeId,
  errorMessage,
  isDeviceReady,
  setPhase,
  updateDeviceStatus,
  onDeviceCheckPass,
  setOrder,
  startTest,
  downloadProcess,
  prevInstallStep,
  nextInstallStep,
  goToInstallStep,
  startFlowchartTest,
  updateNodeResult,
  onFlowchartComplete,
  stopFlowchart,
  saveTemp,
  restoreTemp,
  loadFeedback,
  reset: resetTest,
} = useHaltHassTest()

const schedule = useHaltHassSchedule()

// 多板扫码
const {
  currentOrder: scannedOrder,
  scannedBoards,
  lastScanError,
  isComplete: isScanComplete,
  handleScan,
  removeScannedBoard,
  reset: resetScan,
  setOrder: setScanOrder,
  getAllSerials,
} = useMultiBoardScan()

// 报告管理
const {
  reportJson,
  testResult,
  remark,
  isUploading,
  uploadProgress,
  uploadError,
  uploadedReportId,
  generateReport,
  setTestResult,
  setRemark,
  upload: uploadReport,
  reset: resetReport,
} = useHaltHassReport()

// 扫码枪
const {
  isConnected: scannerConnected,
  isScanning,
  startScanning,
  stopScanning,
  checkScanner,
} = useScanner()

// Flojoy 后端
const {
  start: startBackend,
  isRunning: backendRunning,
  port: backendPort,
} = useFlojoyBackend()

// Flojoy WebSocket
const {
  connect: connectSocket,
  disconnect: disconnectSocket,
  isConnected: socketConnected,
  serverStatus,
  runningBlock,
  failedBlocks,
  clearNodeStatuses,
} = useFlojoySocket()

// 设备检测状态
const deviceCheckStatus = ref<'checking' | 'success' | 'error'>('checking')
const deviceCheckError = ref('')

// 当前运行的 Job ID
const currentJobId = ref<string>('')

// 阶段标签配置
const phaseLabels: Record<PagePhase, { label: string; icon: string }> = {
  schedule: { label: '排程管理', icon: 'mdi:calendar-clock' },
  detect: { label: '设备检测', icon: 'mdi:radar' },
  scan: { label: '扫描电路板', icon: 'mdi:barcode-scan' },
  download: { label: '下载工艺', icon: 'mdi:cloud-download-outline' },
  install: { label: '安装指导', icon: 'mdi:clipboard-list-outline' },
  test: { label: '执行测试', icon: 'mdi:play-circle-outline' },
  upload: { label: '上传报告', icon: 'mdi:cloud-upload-outline' },
  complete: { label: '测试完成', icon: 'mdi:check-circle-outline' },
}

// 计算属性
const currentPhaseLabel = computed(() => phaseLabels[phase.value])

// ==================== 设备检测 ====================

async function checkDevices() {
  deviceCheckStatus.value = 'checking'
  deviceCheckError.value = ''

  // 检查 Flojoy 后端
  if (!backendRunning.value) {
    await startBackend()
  }

  // 配置 API
  configureApi('127.0.0.1', backendPort.value)

  // 连接 WebSocket
  connectSocket()

  // 等待连接建立
  await new Promise(resolve => setTimeout(resolve, 1500))

  // 检查扫码枪
  const scannerOk = await checkScanner()

  // 更新状态
  updateDeviceStatus({
    flojoyBackend: socketConnected.value,
    scanner: scannerOk,
  })

  if (socketConnected.value && scannerOk) {
    deviceCheckStatus.value = 'success'
  } else {
    deviceCheckStatus.value = 'error'
    deviceCheckError.value = !socketConnected.value
      ? 'Flojoy 后端连接失败'
      : '扫码枪未连接'
  }
}

function onDeviceCheckEnter() {
  if (isDeviceReady.value) {
    onDeviceCheckPass()
    // 开始扫码监听
    startScanning(onScanData)
  }
}

function onDeviceCheckRecheck() {
  checkDevices()
}

function onDeviceCheckSkip() {
  // 跳过设备检测，直接进入扫码阶段
  setPhase('scan')
  startScanning(onScanData)
}

// ==================== 扫码处理 ====================

async function onScanData(data: string) {
  const result = await handleScan(data)

  if (result.success) {
    ElMessage.success(result.message)

    if (scannedOrder.value && (!currentOrder.value || currentOrder.value.id !== scannedOrder.value.id)) {
      setOrder(scannedOrder.value)
    }
  } else {
    ElMessage.warning(result.message)
  }
}

async function handleStartScheduledTest(order: HaltHassOrder) {
  stopScanning()
  resetTest()
  resetScan()
  resetReport()

  if (isMockHaltHassOrder(order)) {
    const boards = getMockScannedBoards(order)
    const hydratedOrder = { ...order, scannedBoards: boards }
    setOrder(hydratedOrder)
    setScanOrder(hydratedOrder, boards)
    setPhase('scan')
    ElMessage.success('已载入演示工单 HH-DEMO-001，可直接测试全流程')
    return
  }

  if (order.status === 7) {
    setScanOrder(order, order.scannedBoards || [])
    const restored = await restoreTemp(order)
    if (restored) {
      ElMessage.success('已恢复 HALT-HASS 暂存测试')
    } else {
      ElMessage.error(errorMessage.value || '恢复暂存测试失败')
      setPhase('schedule')
    }
    return
  }

  if (order.status === 4) {
    setScanOrder(order, order.scannedBoards || [])
    const loaded = await loadFeedback(order)
    if (loaded) {
      ElMessage.success('已加载 HALT-HASS 打回反馈')
    } else {
      ElMessage.error(errorMessage.value || '加载打回反馈失败')
      setPhase('schedule')
    }
    return
  }

  setOrder(order)
  setScanOrder(order)
  setPhase('detect')
  void checkDevices()
}

function handleRemoveBoard(serial: string) {
  removeScannedBoard(serial)
}

async function handleStartTest() {
  if (!isScanComplete.value) {
    ElMessage.warning('请先完成所有电路板的扫码')
    return
  }

  const serials = getAllSerials()
  const success = await startTest(serials)

  if (success) {
    // 停止扫码
    stopScanning()
    // 下载工艺
    await downloadProcess()
  }
}

// ==================== 安装指导 ====================

function handlePrevInstallStep() {
  prevInstallStep()
}

function handleNextInstallStep() {
  nextInstallStep()
}

function handleStartFlowchartTest() {
  startFlowchartTest()
}

// ==================== 流程图运行 ====================

async function simulateMockFlowchartRun() {
  if (!processJson.value || !currentOrder.value || !flowchartStartTime.value) {
    ElMessage.warning('演示工单数据不存在')
    return
  }

  clearNodeStatuses()
  const nodes = processJson.value.flowchart.nodes

  for (const node of nodes) {
    const startTime = new Date()
    await new Promise(resolve => setTimeout(resolve, 180))
    const endTime = new Date()
    const nodeData = node.data as { label?: unknown } | undefined
    const nodeName = typeof nodeData?.label === 'string' ? nodeData.label : node.id

    updateNodeResult({
      nodeId: node.id,
      nodeName,
      status: 'success',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: endTime.getTime() - startTime.getTime(),
      output: { source: 'mock' },
    })
  }

  onFlowchartComplete(true)
  generateReport({
    order: currentOrder.value,
    boards: [...scannedBoards.value],
    startTime: flowchartStartTime.value,
    endTime: new Date(),
    nodeResults: [...nodeResults.value],
    testData: {
      mode: 'mock',
      note: 'HALT-HASS 演示工单模拟完成',
    },
  })
  ElMessage.success('演示流程图运行完成')
}

async function handleRunFlowchart() {
  if (!processJson.value) {
    ElMessage.warning('工艺数据不存在')
    return
  }

  if (isMockHaltHassOrder(currentOrder.value)) {
    await simulateMockFlowchartRun()
    return
  }

  const jobId = uuidv4()
  currentJobId.value = jobId
  clearNodeStatuses()

  try {
    const flowchartData = processJson.value.flowchart
    const runArgs = prepareRunFlowchartArgs(
      flowchartData.nodes as Node<BlockData>[],
      flowchartData.edges,
      jobId,
      flowchartData.observeBlocks,
      flowchartData.runSettings
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

async function handleStopFlowchart() {
  if (currentJobId.value) {
    try {
      await cancelFlowchartRun(currentJobId.value)
      stopFlowchart()
      ElMessage.info('已停止运行')
    } catch (e) {
      ElMessage.error('停止失败')
    }
  }
}

async function handleSaveTemp() {
  const success = await saveTemp()
  if (success) {
    ElMessage.success('已暂存测试数据')
  } else {
    ElMessage.error(errorMessage.value || '暂存失败')
  }
}

// 监听 WebSocket 状态变化
watch(runningBlock, (nodeId) => {
  if (nodeId) {
    updateNodeResult({
      nodeId,
      nodeName: nodeId,
      status: 'success',
    })
  }
})

watch(failedBlocks, (failed) => {
  for (const [nodeId, error] of Object.entries(failed)) {
    updateNodeResult({
      nodeId,
      nodeName: nodeId,
      status: 'error',
      error,
    })
  }
})

// 检查流程图是否运行完成
watch([completedNodes, () => processJson.value?.flowchart?.nodes?.length], ([completed, total]) => {
  if (total && completed.length >= total && isFlowchartRunning.value) {
    // 运行完成
    const hasError = Object.keys(failedBlocks.value).length > 0
    onFlowchartComplete(!hasError)

    // 生成报告
    if (currentOrder.value && flowchartStartTime.value) {
      generateReport({
        order: currentOrder.value,
        boards: [...scannedBoards.value],
        startTime: flowchartStartTime.value,
        endTime: new Date(),
        nodeResults: [...nodeResults.value],
      })
    }
  }
})

// ==================== 报告上传 ====================

async function handleUploadReport() {
  const success = await uploadReport()
  if (success) {
    ElMessage.success('报告上传成功')
  } else {
    ElMessage.error(uploadError.value || '上传失败')
  }
}

function handleRetryUpload() {
  handleUploadReport()
}

function handleComplete() {
  setPhase('complete')
}

// ==================== 退出和重置 ====================

async function handleExit() {
  const confirmed = await ElMessageBox.confirm(
    '确定要退出测试吗？未保存的数据将丢失。',
    '退出确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).catch(() => false)

  if (!confirmed) return

  // 停止所有操作
  stopScanning()
  disconnectSocket()

  // 重置状态
  resetTest()
  resetScan()
  resetReport()

  // 退出编辑模式
  exitEditMode()
}

function handleNewTest() {
  resetTest()
  resetScan()
  resetReport()
  setPhase('schedule')
  void schedule.refreshWorkOrders()
}

// ==================== 生命周期 ====================

// 监听阶段变化，只在特定阶段隐藏侧边栏
watch(phase, (newPhase) => {
  if (newPhase === 'install' || newPhase === 'test' || newPhase === 'upload') {
    enterEditMode()
  } else {
    exitEditMode()
  }
})

onMounted(() => {
  // 排程页不提前弹出设备检测，进入已排程工单后再检测设备。
  if (phase.value !== 'schedule') {
    checkDevices()
  }
})

onUnmounted(() => {
  stopScanning()
  disconnectSocket()
  exitEditMode()
})
</script>

<template>
  <div class="page-container">
    <!-- 设备检测遮罩 - 覆盖整个页面 -->
    <DeviceCheckOverlay
      :visible="phase === 'detect'"
      :status="deviceCheckStatus"
      :scanner-ok="deviceStatus.scanner"
      :camera-ok="deviceStatus.flojoyBackend"
      :error-msg="deviceCheckError"
      accent-color="orange"
      @enter="onDeviceCheckEnter"
      @recheck="onDeviceCheckRecheck"
      @skip="onDeviceCheckSkip"
    />

    <!-- 排程阶段 -->
    <template v-if="phase === 'schedule'">
      <header class="page-header">
        <div class="header-left">
          <div class="header-icon">
            <Icon icon="mdi:snowflake-thermometer" />
          </div>
          <div>
            <h1 class="header-title">HALT-HASS 测试</h1>
            <p class="header-subtitle">HALT-HASS 测试排程管理</p>
          </div>
        </div>
      </header>

      <HaltHassScheduleDashboard
        :ctx="schedule"
        @start-scheduled-test="handleStartScheduledTest"
      />
    </template>

    <!-- 准备阶段：扫码、下载 - 显示侧边栏 -->
    <template v-else-if="phase === 'scan' || phase === 'download' || phase === 'detect'">
      <!-- 页面头部 -->
      <header class="page-header">
        <div class="header-left">
          <div class="header-icon">
            <Icon icon="mdi:snowflake-thermometer" />
          </div>
          <div>
            <h1 class="header-title">HALT-HASS 测试</h1>
            <p class="header-subtitle">
              <span v-if="isScanning && !isScanComplete" class="scan-status">
                <span class="scan-dot"></span>
                等待扫描电路板
              </span>
              <span v-else-if="isScanComplete" class="scan-status complete">
                <Icon icon="mdi:check-circle" />
                扫码完成
              </span>
              <span v-else>{{ currentPhaseLabel.label }}</span>
            </p>
          </div>
        </div>
        <div class="header-actions">
          <div class="status-chip" :class="{ ok: socketConnected }">
            <Icon :icon="socketConnected ? 'mdi:check-circle' : 'mdi:alert-circle'" />
            <span>Flojoy</span>
          </div>
          <div class="status-chip" :class="{ ok: scannerConnected }">
            <Icon :icon="scannerConnected ? 'mdi:check-circle' : 'mdi:alert-circle'" />
            <span>扫码枪</span>
          </div>
        </div>
      </header>

      <!-- 主布局 -->
      <div class="main-layout">
        <!-- 左侧：扫码区域 -->
        <div class="scan-section">
          <div class="section-card">
            <div class="card-header">
              <Icon icon="mdi:barcode-scan" />
              <span>扫描电路板</span>
            </div>
            <div class="card-content">
              <ScanProgress
                :order="currentOrder"
                :scanned-boards="scannedBoards"
                :is-scanning="isScanning"
                :last-error="lastScanError"
                @remove="handleRemoveBoard"
              />
            </div>
          </div>
        </div>

        <!-- 右侧：信息区域 -->
        <div class="info-section">
          <!-- 工单信息 -->
          <div class="section-card info-card">
            <div class="card-header">
              <Icon icon="mdi:clipboard-text-outline" />
              <span>工单信息</span>
            </div>
            <div class="card-content">
              <div v-if="currentOrder" class="info-list">
                <div class="info-item">
                  <span class="info-label">工单号</span>
                  <span class="info-value code">{{ currentOrder.orderNo }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">电路板组</span>
                  <span class="info-value">{{ currentOrder.boardGroup?.name || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">工艺</span>
                  <span class="info-value">{{ currentOrder.process?.name || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">需扫描数量</span>
                  <span class="info-value">{{ currentOrder.boardCount }} 块</span>
                </div>
                <div class="info-item">
                  <span class="info-label">循环次数</span>
                  <span class="info-value">{{ currentOrder.cycleCount }} 次</span>
                </div>
                <div class="info-item">
                  <span class="info-label">单循环时长</span>
                  <span class="info-value">{{ currentOrder.singleCycleDurationHours.toFixed(2) }} 小时</span>
                </div>
                <div class="info-item">
                  <span class="info-label">循环总时长</span>
                  <span class="info-value">{{ currentOrder.totalCycleDurationHours.toFixed(2) }} 小时</span>
                </div>
              </div>
              <div v-else class="empty-state">
                <Icon icon="mdi:information-outline" />
                <span>扫描电路板后显示工单信息</span>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="action-section">
            <button
              class="btn-primary btn-lg"
              :disabled="!isScanComplete || phase === 'download'"
              @click="handleStartTest"
            >
              <Icon v-if="phase === 'download'" icon="mdi:loading" class="spin" />
              <Icon v-else icon="mdi:arrow-right" />
              {{ phase === 'download' ? '下载工艺中...' : '开始测试' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 测试阶段：安装、测试、上传、完成 - 隐藏侧边栏 -->
    <template v-else>
      <!-- 顶部状态栏 -->
      <div class="top-bar">
        <div class="top-left">
          <button class="exit-btn" @click="handleExit">
            <Icon icon="mdi:arrow-left" />
            退出
          </button>
          <div class="phase-indicator">
            <Icon :icon="currentPhaseLabel.icon" />
            <span>{{ currentPhaseLabel.label }}</span>
          </div>
        </div>

        <div class="top-center">
          <h1>HALT-HASS 测试</h1>
          <span v-if="currentOrder" class="order-badge">{{ currentOrder.orderNo }}</span>
        </div>

        <div class="top-right">
          <div class="status-item" :class="{ ok: socketConnected }">
            <Icon :icon="socketConnected ? 'mdi:wifi' : 'mdi:wifi-off'" />
            <span>后端</span>
          </div>
          <div class="status-item" :class="{ ok: scannerConnected }">
            <Icon :icon="scannerConnected ? 'mdi:barcode-scan' : 'mdi:barcode-off'" />
            <span>扫码枪</span>
          </div>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="main-content">
        <!-- 安装指导阶段 -->
        <div v-if="phase === 'install'" class="phase-content install-phase">
          <InstallGuideViewer
          :process-json="processJson"
          :current-step="installStep"
          @update:current-step="goToInstallStep"
          @prev="handlePrevInstallStep"
          @next="handleNextInstallStep"
          @start="handleStartFlowchartTest"
        />
      </div>

      <!-- 流程图运行阶段 -->
      <div v-if="phase === 'test'" class="phase-content test-phase">
        <FlowchartRunner
          :process-json="processJson"
          :is-running="isFlowchartRunning"
          :current-node-id="currentNodeId"
          :completed-nodes="completedNodes"
          :node-results="nodeResults"
          :server-status="serverStatus"
          @run="handleRunFlowchart"
          @stop="handleStopFlowchart"
          @save="handleSaveTemp"
        />
      </div>

      <!-- 上传报告阶段 -->
      <div v-if="phase === 'upload'" class="phase-content upload-phase">
        <div class="upload-layout">
          <TestResultPanel
            :report="reportJson"
            :test-result="testResult"
            :remark="remark"
            @update:test-result="setTestResult"
            @update:remark="setRemark"
          />
          <ReportUploader
            :is-uploading="isUploading"
            :upload-progress="uploadProgress"
            :upload-error="uploadError"
            :upload-success="!!uploadedReportId"
            :cycle-count="currentOrder?.cycleCount || 1"
            :single-cycle-duration-hours="currentOrder?.singleCycleDurationHours || 0"
            :total-cycle-duration-hours="currentOrder?.totalCycleDurationHours || 0"
            @upload="handleUploadReport"
            @retry="handleRetryUpload"
            @complete="handleComplete"
          />
        </div>
      </div>

      <!-- 完成阶段 -->
      <div v-if="phase === 'complete'" class="phase-content complete-phase">
        <div class="complete-card">
          <div class="complete-icon">
            <Icon icon="mdi:check-circle" />
          </div>
          <h2>测试完成</h2>
          <p>报告已成功上传，请等待审核</p>
          <div class="complete-actions">
            <button class="btn-primary" @click="handleNewTest">
              <Icon icon="mdi:plus" />
              开始新测试
            </button>
            <button class="btn-secondary" @click="handleExit">
              <Icon icon="mdi:arrow-left" />
              返回首页
            </button>
          </div>
        </div>
      </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ==================== 页面容器 ==================== */
.page-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100% + 48px); /* 抵消父元素的 padding */
  margin: -24px; /* 抵消父元素的 padding */
  padding: 24px; /* 恢复内部 padding */
  background: var(--color-bg-primary, #0f172a);
  overflow: hidden;
}

/* DeviceCheckOverlay 需要覆盖整个容器 */
.page-container :deep(.device-overlay) {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
}

/* ==================== 准备阶段 - 页面头部 ==================== */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 20px;
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 88, 12, 0.15));
  color: rgb(251, 146, 60);
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary, #f1f5f9);
  margin: 0;
}

.header-subtitle {
  font-size: 13px;
  color: var(--color-text-secondary, #94a3b8);
  margin-top: 2px;
}

.scan-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgb(251, 146, 60);
}

.scan-status.complete {
  color: rgb(74, 222, 128);
}

.scan-dot {
  width: 6px;
  height: 6px;
  background: rgb(251, 146, 60);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 16px;
  font-size: 12px;
  color: rgb(248, 113, 113);
}

.status-chip.ok {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.3);
  color: rgb(74, 222, 128);
}

/* ==================== 准备阶段 - 主布局 ==================== */
.main-layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.scan-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 卡片样式 */
.section-card {
  background: var(--color-bg-secondary, #1e293b);
  border: 1px solid var(--color-border, #334155);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.info-card {
  flex: none;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border, #334155);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #f1f5f9);
}

.card-header :deep(svg) {
  font-size: 18px;
  color: rgb(249, 115, 22);
}

.card-content {
  padding: 18px;
  flex: 1;
  overflow: auto;
}

/* 工单信息列表 */
.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--color-bg-tertiary, #0f172a);
  border-radius: 8px;
}

.info-label {
  font-size: 13px;
  color: var(--color-text-secondary, #94a3b8);
}

.info-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary, #f1f5f9);
}

.info-value.code {
  font-family: 'JetBrains Mono', monospace;
  color: rgb(251, 146, 60);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-text-muted, #64748b);
  font-size: 13px;
}

.empty-state :deep(svg) {
  font-size: 32px;
  opacity: 0.5;
}

/* 操作区域 */
.action-section {
  margin-top: auto;
}

.btn-lg {
  width: 100%;
  justify-content: center;
  padding: 14px 24px;
  font-size: 15px;
}

/* ==================== 测试阶段 - 顶部状态栏 ==================== */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--color-bg-secondary, #1e293b);
  border-bottom: 1px solid var(--color-border, #334155);
  margin: -24px -24px 20px -24px;
}

.top-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.exit-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: transparent;
  border: 1px solid var(--color-border, #334155);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-secondary, #94a3b8);
  cursor: pointer;
  transition: all 0.2s;
}

.exit-btn:hover {
  background: var(--color-bg-hover, #334155);
  color: var(--color-text-primary, #f1f5f9);
}

.phase-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: rgba(249, 115, 22, 0.15);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  color: rgb(251, 146, 60);
}

.top-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-center h1 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, #f1f5f9);
  margin: 0;
}

.order-badge {
  padding: 4px 12px;
  background: var(--color-bg-tertiary, #0f172a);
  border-radius: 16px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text-secondary, #94a3b8);
}

.top-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: rgba(239, 68, 68, 0.15);
  border-radius: 16px;
  font-size: 11px;
  color: rgb(248, 113, 113);
}

.status-item.ok {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

/* ==================== 测试阶段 - 主内容区 ==================== */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.phase-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 安装指导阶段 */
.install-phase {
  flex: 1;
}

/* 测试阶段 */
.test-phase {
  flex: 1;
}

/* 上传阶段 */
.upload-phase {
  flex: 1;
}

.upload-layout {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 20px;
  height: 100%;
}

/* 完成阶段 */
.complete-phase {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.complete-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px;
  background: var(--color-bg-secondary, #1e293b);
  border: 1px solid var(--color-border, #334155);
  border-radius: 16px;
  text-align: center;
}

.complete-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.15);
  margin-bottom: 24px;
}

.complete-icon :deep(svg) {
  font-size: 40px;
  color: rgb(74, 222, 128);
}

.complete-card h2 {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-primary, #f1f5f9);
  margin: 0 0 8px;
}

.complete-card p {
  font-size: 14px;
  color: var(--color-text-secondary, #94a3b8);
  margin: 0 0 24px;
}

.complete-actions {
  display: flex;
  gap: 12px;
}

/* ==================== 通用按钮样式 ==================== */
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
  background: rgb(249, 115, 22);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: rgb(234, 88, 12);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-bg-tertiary, #0f172a);
  color: var(--color-text-secondary, #94a3b8);
  border: 1px solid var(--color-border, #334155);
}

.btn-secondary:hover {
  background: var(--color-bg-hover, #334155);
  color: var(--color-text-primary, #f1f5f9);
}

/* ==================== 动画 ==================== */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
