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
import {
  ServerStatus,
  useFlojoySocket,
} from '@/composables/useFlojoySocket'
import { useLayout } from '@/composables/useLayout'
import {
  runFlowchart,
  cancelFlowchartRun,
  cancelCurrentFlowchartRun,
  configureApi,
  checkHealth,
  runHassHardwarePreflight,
  runHassHardwareShutdown,
  type HassHardwarePreflightResponse,
} from '@/services/flojoy-api'
import {
  buildHassCycleRunSettings,
  hasHassDurationLoop,
  resolveRemainingRuntimeSeconds,
} from '@/services/hass-cycle-runtime'
import { prepareRunFlowchartArgs } from '@/services/flojoy-adapter'
import { getOrderDetail, resetRunningOrderExecution } from '@/services/halt-hass-order'
import { v4 as uuidv4 } from 'uuid'
import {
  getMockScannedBoards,
  isMockHaltHassOrder,
  MOCK_HALT_HASS_ORDER,
} from './mock-halt-hass-fixture'

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
  activeFlowType,
  testFlowPassed,
  testFlowResults,
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
  beginFlowchartRun,
  activateCycleRuntime,
  pauseCycleRuntime,
  updateNodeResult,
  advanceToCycleFlow,
  onFlowchartComplete,
  stopFlowchart,
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
  port: backendPort,
} = useFlojoyBackend()

// Flojoy WebSocket
const {
  connect: connectSocket,
  disconnect: disconnectSocket,
  isConnected: socketConnected,
  serverStatus,
  blockResults,
  runningBlock,
  failedBlocks,
  lastMessage,
  clearNodeStatuses,
} = useFlojoySocket()

// 设备检测状态
const deviceCheckStatus = ref<'checking' | 'success' | 'error'>('checking')
const deviceCheckError = ref('')

// 当前运行的 Job ID
const currentJobId = ref<string>('')
let mockFlowchartRunToken = 0

type CycleFinishState = 'idle' | 'running' | 'finishing' | 'recovering'

// 循环流由软件总时长统一收口。倒计时归零后立即取消当前拓扑并执行
// 独立关闭流程，不等待工艺 end 分支自行结束。
const cycleRemainingSeconds = ref<number | null>(null)
const cycleFinishState = ref<CycleFinishState>('idle')
let cycleDeadlineMs: number | null = null
let cycleCountdownTimer: ReturnType<typeof setInterval> | null = null
let cycleRecoveryActive = false
let flowchartCompletionActive = false

// 正式测试流之前的设备通信门禁
const hardwarePreflightResult = ref<HassHardwarePreflightResponse | null>(null)
const isHardwarePreflightChecking = ref(false)
const isHardwarePreflightReady = computed(() => {
  if (isMockHaltHassOrder(currentOrder.value)) {
    return hardwarePreflightResult.value?.ready === true
  }
  return hardwarePreflightResult.value?.ready === true && socketConnected.value
})

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
const flowchartStatusText = computed(() => {
  if (!isMockHaltHassOrder(currentOrder.value)) return serverStatus.value
  return isFlowchartRunning.value ? '本地演示运行中' : '演示流程就绪'
})
const activeFlowchart = computed(() => {
  if (!processJson.value) return null
  return activeFlowType.value === 'test'
    ? processJson.value.testFlow
    : processJson.value.cycleFlow
})
const cycleTotalSeconds = computed(() => {
  const requiredSeconds = Number(currentOrder.value?.requiredRuntimeSeconds)
  if (Number.isFinite(requiredSeconds) && requiredSeconds > 0) {
    return Math.ceil(requiredSeconds)
  }

  const totalHours = Number(currentOrder.value?.totalCycleDurationHours)
  return Number.isFinite(totalHours) && totalHours > 0
    ? Math.ceil(totalHours * 3600)
    : null
})

// ==================== 设备检测 ====================

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function ensureFlojoyConnected(): Promise<boolean> {
  configureApi('127.0.0.1', backendPort.value)

  let backendHealthy = await checkHealth()
  if (!backendHealthy) {
    await startBackend()
    for (let attempt = 0; attempt < 12 && !backendHealthy; attempt++) {
      await wait(500)
      backendHealthy = await checkHealth()
    }
  }

  if (!backendHealthy) {
    return false
  }

  if (!socketConnected.value) {
    connectSocket()
  }

  for (let attempt = 0; attempt < 20 && !socketConnected.value; attempt++) {
    await wait(250)
  }

  return socketConnected.value
}

function clearCycleRuntimeTimers(resetDisplay = true) {
  if (cycleCountdownTimer) {
    clearInterval(cycleCountdownTimer)
    cycleCountdownTimer = null
  }
  cycleDeadlineMs = null
  if (resetDisplay) {
    cycleRemainingSeconds.value = null
    cycleFinishState.value = 'idle'
  }
}

function updateCycleRuntimeCountdown() {
  if (
    !isFlowchartRunning.value
    || activeFlowType.value !== 'cycle'
    || cycleDeadlineMs === null
  ) {
    return
  }

  const remaining = Math.max(
    0,
    Math.ceil((cycleDeadlineMs - Date.now()) / 1000)
  )
  cycleRemainingSeconds.value = remaining
  if (remaining > 0 || cycleFinishState.value !== 'running') return

  cycleFinishState.value = 'finishing'
  if (cycleCountdownTimer) {
    clearInterval(cycleCountdownTimer)
    cycleCountdownTimer = null
  }
  ElMessage.info('循环时长已到，正在执行停止、下电和连接释放流程')
  void recoverTimedOutCycleFlow()
}

function startCycleRuntimeCountdown(durationSeconds: number) {
  clearCycleRuntimeTimers(false)
  const duration = Math.max(0, Math.ceil(durationSeconds))
  cycleRemainingSeconds.value = duration
  cycleFinishState.value = duration > 0 ? 'running' : 'finishing'
  cycleDeadlineMs = Date.now() + duration * 1000

  if (duration === 0) {
    void recoverTimedOutCycleFlow()
    return
  }

  cycleCountdownTimer = setInterval(updateCycleRuntimeCountdown, 250)
}

async function recoverTimedOutCycleFlow() {
  if (
    cycleRecoveryActive
    || !isFlowchartRunning.value
    || activeFlowType.value !== 'cycle'
  ) {
    return
  }

  cycleRecoveryActive = true
  cycleFinishState.value = 'recovering'
  const cycleNodeErrors = Object.entries(failedBlocks.value).map(
    ([nodeId, error]) => ({ nodeId, error })
  )
  ElMessage.info('循环测试已完成，软件正在停止流程并执行下电')

  try {
    const flojoyReady = await ensureFlojoyConnected()
    if (!flojoyReady) {
      throw new Error('Flojoy 后端无法恢复，不能确认设备已安全下电')
    }

    // jobId 为 null 时只取消当前拓扑，不提前广播 STANDBY。取消动作可能
    // 写入节点失败状态，因此测试结论已在取消前冻结到 cycleNodeErrors。
    await cancelCurrentFlowchartRun()
    currentJobId.value = ''
    // cancel_fc 返回后拓扑清理是异步的，给 DeviceManager 一个很短的释放窗口，
    // 随后立即由独立关闭接口重新枚举设备并下电。
    await wait(600)

    const cycleNodes = processJson.value?.cycleFlow.nodes || []
    const shutdown = await runHassHardwareShutdown(cycleNodes as any)
    if (!shutdown.success) {
      const failedMessages = shutdown.results
        .filter(item => !item.success)
        .map(item => `${item.displayName}：${item.message}`)
        .join('；')
      throw new Error(failedMessages || shutdown.message)
    }

    await completeActiveFlowchartRun({
      completionMode: 'software-runtime-complete',
      cycleNodeErrors,
      shutdownResults: shutdown.results,
    }, {
      completionSuccess: true,
      allowRuntimePauseFailure: true,
    })
    ElMessage.success('下电完成，已进入报告保存阶段')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    try {
      await pauseCycleRuntime()
    } catch (pauseError) {
      console.error('[HALT-HASS] 安全收尾失败后冻结计时失败:', pauseError)
    }
    stopFlowchart()
    clearCycleRuntimeTimers()
    ElMessage.error(`循环流关闭失败：${message}`)
    console.error('[HALT-HASS] 循环流关闭失败:', error)
  } finally {
    cycleRecoveryActive = false
  }
}

async function checkDevices() {
  deviceCheckStatus.value = 'checking'
  deviceCheckError.value = ''

  const flojoyOk = await ensureFlojoyConnected()

  // 检查扫码枪
  const scannerOk = await checkScanner()

  // 更新状态
  updateDeviceStatus({
    flojoyBackend: flojoyOk,
    scanner: scannerOk,
  })

  if (flojoyOk && scannerOk) {
    deviceCheckStatus.value = 'success'
  } else {
    deviceCheckStatus.value = 'error'
    deviceCheckError.value = !flojoyOk
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
  let targetOrder = order
  if (!isMockHaltHassOrder(order)) {
    try {
      const detailResult = await getOrderDetail(order.id)
      if (detailResult.success && detailResult.data) {
        targetOrder = detailResult.data
        if (targetOrder.status !== order.status) {
          void schedule.refreshWorkOrders()
        }
      }
    } catch (error) {
      console.warn('刷新 HALT-HASS 工单详情失败，继续使用当前排程数据:', error)
    }
  }

  if (targetOrder.status === 2) {
    const confirmed = await ElMessageBox.confirm(
      '将停止当前 Flojoy 任务并清空上一轮执行和扫码记录，原有排程保持不变。随后从设备检测和 5 块电路板扫码重新开始。',
      '确认从头开始',
      {
        confirmButtonText: '开始测试',
        cancelButtonText: '取消',
        type: 'warning',
      }
    ).catch(() => false)
    if (!confirmed) return
  }

  resetHardwarePreflight()
  clearCycleRuntimeTimers()
  stopScanning()
  resetTest()
  resetScan()
  resetReport()

  if (isMockHaltHassOrder(targetOrder)) {
    const boards = getMockScannedBoards(targetOrder)
    const hydratedOrder = { ...targetOrder, scannedBoards: boards }
    setOrder(hydratedOrder)
    setScanOrder(hydratedOrder, boards)
    setPhase('scan')
    ElMessage.success('已载入演示工单 HH-DEMO-001，可直接测试全流程')
    return
  }

  if (targetOrder.status === 7) {
    setScanOrder(targetOrder, targetOrder.scannedBoards || [])
    const restored = await restoreTemp(targetOrder)
    if (restored) {
      ElMessage.success('已恢复 HALT-HASS 暂存测试')
    } else {
      ElMessage.error(errorMessage.value || '恢复暂存测试失败')
      setPhase('schedule')
    }
    return
  }

  if (targetOrder.status === 4) {
    setScanOrder(targetOrder, targetOrder.scannedBoards || [])
    const loaded = await loadFeedback(targetOrder)
    if (loaded) {
      ElMessage.success('已加载 HALT-HASS 打回反馈')
    } else {
      ElMessage.error(errorMessage.value || '加载打回反馈失败')
      setPhase('schedule')
    }
    return
  }

  if (targetOrder.status === 2) {
    // 原排程不变，只清空上一轮执行状态；随后按普通待领取工单重新检测和扫码。
    const flojoyReady = await ensureFlojoyConnected()
    updateDeviceStatus({ flojoyBackend: flojoyReady })
    if (!flojoyReady) {
      ElMessage.error('Flojoy 后端连接失败，工单尚未清空')
      setPhase('schedule')
      return
    }

    try {
      await cancelCurrentFlowchartRun()
    } catch (error) {
      console.error('停止 Flojoy 当前任务失败:', error)
      ElMessage.error('无法停止 Flojoy 当前任务，工单尚未清空')
      setPhase('schedule')
      return
    }

    const resetResult = await resetRunningOrderExecution(targetOrder.id)
    if (!resetResult.success) {
      ElMessage.error(resetResult.error || '清空上一轮执行状态失败')
      setPhase('schedule')
      return
    }

    const freshOrder: HaltHassOrder = {
      ...targetOrder,
      status: 1,
      scannedBoards: [],
      startedAt: undefined,
      completedAt: undefined,
      elapsedRuntimeSeconds: 0,
      remainingRuntimeSeconds: targetOrder.requiredRuntimeSeconds,
      runtimeProgress: 0,
      runtimeCompleted: false,
      currentRunStartedAt: null,
    }
    setOrder(freshOrder)
    setScanOrder(freshOrder, [])
    currentJobId.value = ''
    clearNodeStatuses()
    resetHardwarePreflight()
    setPhase('detect')
    void checkDevices()
    ElMessage.success('原排程已保留，请完成设备检测并重新扫描 5 块电路板')
    return
  }

  setOrder(targetOrder)
  setScanOrder(targetOrder)
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

function resetHardwarePreflight() {
  hardwarePreflightResult.value = null
  isHardwarePreflightChecking.value = false
}

async function handleHardwarePreflight() {
  if (!processJson.value) {
    ElMessage.warning('工艺数据不存在，无法执行设备通信检测')
    return
  }
  if (!socketConnected.value && !isMockHaltHassOrder(currentOrder.value)) {
    ElMessage.warning('Flojoy 后端未连接，请先恢复后端连接')
    return
  }

  isHardwarePreflightChecking.value = true
  hardwarePreflightResult.value = null

  try {
    if (isMockHaltHassOrder(currentOrder.value)) {
      hardwarePreflightResult.value = {
        ready: true,
        powerMaintained: false,
        powerResource: '',
        message: '演示设备通信正常',
        results: [
          {
            role: 'itech6723',
            displayName: 'ITECH 6723G',
            success: true,
            message: '演示模式：48 V / 1 A 输出正常',
            details: {},
          },
          {
            role: 'ifbox',
            displayName: 'IFBOX',
            success: true,
            message: '演示模式：设备在线，串口可用',
            details: {},
          },
        ],
      }
      ElMessage.success('演示设备通信检测通过')
      return
    }

    const result = await runHassHardwarePreflight(
      [
        ...processJson.value.testFlow.nodes,
        ...processJson.value.cycleFlow.nodes,
      ] as any
    )
    hardwarePreflightResult.value = result

    if (result.ready) {
      ElMessage.success('全部设备在线且端口可用，可以运行测试流')
    } else {
      ElMessage.error(result.message || '存在未枚举或端口无法打开的设备')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '设备通信检测失败'
    ElMessage.error(message)
    console.error('[HALT-HASS] 设备通信检测失败:', error)
  } finally {
    isHardwarePreflightChecking.value = false
  }
}

async function simulateMockFlowchartRun() {
  if (!processJson.value || !currentOrder.value || !flowchartStartTime.value) {
    ElMessage.warning('演示工单数据不存在')
    return
  }

  const runToken = ++mockFlowchartRunToken
  clearNodeStatuses()
  const nodes = activeFlowchart.value?.nodes || []

  for (const node of nodes) {
    const startTime = new Date()
    await new Promise(resolve => setTimeout(resolve, 800))
    if (runToken !== mockFlowchartRunToken || !isFlowchartRunning.value) return

    const endTime = new Date()
    const nodeData = node.data as { label?: unknown } | undefined
    const nodeName = typeof nodeData?.label === 'string' ? nodeData.label : node.id

    updateNodeResult({
      flowType: activeFlowType.value,
      nodeId: node.id,
      nodeName,
      status: 'success',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: endTime.getTime() - startTime.getTime(),
      output: { source: 'mock' },
    })
  }

  await completeActiveFlowchartRun({
    mode: 'mock',
    note: 'HALT-HASS 演示工单模拟完成',
  })
}

async function handleRunFlowchart() {
  if (!processJson.value) {
    ElMessage.warning('工艺数据不存在')
    return
  }

  if (!isHardwarePreflightReady.value) {
    ElMessage.warning('请先完成设备通信检测，确认全部设备可以通信')
    return
  }

  const flowchartData = activeFlowchart.value
  if (!flowchartData || flowchartData.nodes.length === 0) {
    ElMessage.warning(
      activeFlowType.value === 'test' ? '测试流没有节点' : '循环流没有节点'
    )
    return
  }

  const isCycleFlow = activeFlowType.value === 'cycle'
  let remainingDurationSeconds: number | undefined
  let runSettings = flowchartData.runSettings

  if (isCycleFlow) {
    if (!testFlowPassed.value) {
      ElMessage.warning('测试流尚未通过，不能运行循环流')
      return
    }
    if (!hasHassDurationLoop(flowchartData.nodes as any)) {
      ElMessage.warning('循环流缺少 HALT_HASS_DURATION_LOOP 时长控制节点')
      return
    }
    if (!currentOrder.value?.runtimeConfigured) {
      ElMessage.warning('当前工单没有配置 HALT-HASS 循环总时长')
      return
    }

    remainingDurationSeconds = resolveRemainingRuntimeSeconds(currentOrder.value)
    if (remainingDurationSeconds <= 0) {
      beginFlowchartRun()
      startCycleRuntimeCountdown(0)
      return
    }
    runSettings = buildHassCycleRunSettings(
      flowchartData.runSettings,
      remainingDurationSeconds
    )
  }

  if (!isCycleFlow) {
    clearCycleRuntimeTimers()
  }
  beginFlowchartRun()

  if (isMockHaltHassOrder(currentOrder.value)) {
    await simulateMockFlowchartRun()
    return
  }

  const jobId = uuidv4()
  currentJobId.value = jobId
  clearNodeStatuses()

  try {
    const runArgs = prepareRunFlowchartArgs(
      flowchartData.nodes as Node<BlockData>[],
      flowchartData.edges,
      jobId,
      flowchartData.observeBlocks,
      runSettings
    )

    await runFlowchart({
      nodes: runArgs.nodes as any,
      edges: runArgs.edges as any,
      jobId: runArgs.jobId,
      observeBlocks: runArgs.observeBlocks,
      settings: runArgs.settings,
      haltHassRemainingDurationSeconds: remainingDurationSeconds,
    })

    if (isCycleFlow) {
      const runtimeActivated = await activateCycleRuntime()
      if (!runtimeActivated) {
        try {
          await cancelFlowchartRun(jobId)
        } catch (cancelError) {
          console.error('[HALT-HASS] 循环计时启动失败后停止 Flojoy 失败:', cancelError)
        }
        throw new Error(errorMessage.value || '启动循环流计时失败')
      }

      const runtimeRemaining = currentOrder.value
        ? resolveRemainingRuntimeSeconds(currentOrder.value)
        : remainingDurationSeconds || 0
      startCycleRuntimeCountdown(runtimeRemaining)
    }

    ElMessage.success(
      activeFlowType.value === 'test'
        ? '测试流开始运行'
        : `循环流开始运行，剩余 ${remainingDurationSeconds} 秒`
    )
  } catch (e) {
    stopFlowchart()
    if (isCycleFlow) {
      clearCycleRuntimeTimers()
    }
    const message = e instanceof Error ? e.message : '未知错误'
    ElMessage.error(`运行失败：${message}`)
    console.error(e)
  }
}

async function handleStopFlowchart() {
  if (isMockHaltHassOrder(currentOrder.value)) {
    mockFlowchartRunToken++
    stopFlowchart()
    ElMessage.info('已停止演示流程')
    return
  }

  if (currentJobId.value) {
    try {
      await cancelFlowchartRun(currentJobId.value)
      stopFlowchart()
      currentJobId.value = ''
      if (activeFlowType.value === 'cycle') {
        const paused = await pauseCycleRuntime()
        clearCycleRuntimeTimers()
        if (!paused) {
          ElMessage.error(errorMessage.value || '循环流已停止，但累计时长冻结失败')
          return
        }
      }
      ElMessage.info('已停止运行')
    } catch (e) {
      ElMessage.error('停止失败')
    }
    return
  }

  stopFlowchart()
  ElMessage.info('已停止运行')
}

// Flojoy 将 RUNNING_NODE 清空或切换到下一节点时，上一节点才算执行结束。
watch(runningBlock, (nodeId, previousNodeId) => {
  if (
    previousNodeId
    && previousNodeId !== nodeId
    && !(previousNodeId in failedBlocks.value)
  ) {
    updateNodeResult({
      flowType: activeFlowType.value,
      nodeId: previousNodeId,
      nodeName: previousNodeId,
      status: 'success',
    })
  }
})

// NODE_RESULTS 是节点成功完成的权威消息，同时保留实际输出供报告使用。
watch(
  blockResults,
  (results, previousResults = {}) => {
    for (const [nodeId, output] of Object.entries(results)) {
      if (previousResults[nodeId] === output) continue
      updateNodeResult({
        flowType: activeFlowType.value,
        nodeId,
        nodeName: nodeId,
        status: 'success',
        output,
      })
    }
  },
  { immediate: true }
)

watch(failedBlocks, (failed) => {
  for (const [nodeId, error] of Object.entries(failed)) {
    updateNodeResult({
      flowType: activeFlowType.value,
      nodeId,
      nodeName: nodeId,
      status: 'error',
      error,
    })
  }
})

interface FlowchartCompletionOptions {
  completionSuccess?: boolean
  allowRuntimePauseFailure?: boolean
}

async function completeActiveFlowchartRun(
  testData?: Record<string, unknown>,
  options: FlowchartCompletionOptions = {},
) {
  if (!isFlowchartRunning.value || flowchartCompletionActive) return

  flowchartCompletionActive = true
  try {
    const hasError = options.completionSuccess === undefined
      ? Object.keys(failedBlocks.value).length > 0
      : !options.completionSuccess
    if (activeFlowType.value === 'test') {
      stopFlowchart()
      if (hasError) {
        ElMessage.error('测试流执行失败，请排除设备或通信问题后重新运行')
        return
      }
      advanceToCycleFlow()
      clearNodeStatuses()
      ElMessage.success('测试流通过，已进入循环流')
      return
    }

    clearCycleRuntimeTimers(false)
    const paused = await pauseCycleRuntime()
    if (!paused && !options.allowRuntimePauseFailure) {
      stopFlowchart()
      clearCycleRuntimeTimers()
      ElMessage.error(errorMessage.value || '循环流完成，但累计时长冻结失败')
      return
    }
    if (!paused) {
      console.warn(
        '[HALT-HASS] 循环测试已经到时并完成下电，但累计时长冻结接口失败，继续进入报告阶段',
        errorMessage.value,
      )
    }

    onFlowchartComplete(!hasError)
    clearCycleRuntimeTimers()

    if (currentOrder.value && flowchartStartTime.value) {
      generateReport({
        order: currentOrder.value,
        boards: [...scannedBoards.value],
        startTime: flowchartStartTime.value,
        endTime: new Date(),
        nodeResults: [...testFlowResults.value, ...nodeResults.value],
        testData,
      })
    }
  } finally {
    flowchartCompletionActive = false
  }
}

// 检查流程图是否运行完成
watch(
  [
    () => completedNodes.value.length,
    () => activeFlowchart.value?.nodes.length,
  ],
  ([completedCount, total]) => {
    if (activeFlowType.value === 'cycle') {
      // 循环流会重复执行同一批节点，不能用节点去重数量判断完成。
      return
    }

    if (total && completedCount >= total && isFlowchartRunning.value) {
      void completeActiveFlowchartRun()
    }
  },
  { immediate: true }
)

watch(
  serverStatus,
  (status, previousStatus) => {
    if (
      isFlowchartRunning.value
      && activeFlowType.value === 'cycle'
      && status === ServerStatus.MAXIMUM_RUNTIME_EXCEEDED
    ) {
      cycleRemainingSeconds.value = 0
      cycleFinishState.value = 'finishing'
      void recoverTimedOutCycleFlow()
      return
    }

    if (
      isFlowchartRunning.value
      && !cycleRecoveryActive
      && status === ServerStatus.STANDBY
      && previousStatus !== ServerStatus.STANDBY
    ) {
      // STANDBY 是 Flojoy 整个拓扑完成的最终信号。
      // 测试流用它兜底快速节点的结果同步，循环流等待 end 清理分支结束。
      if (
        activeFlowType.value === 'cycle'
        && (cycleRemainingSeconds.value ?? 0) > 0
        && Object.keys(failedBlocks.value).length === 0
      ) {
        clearCycleRuntimeTimers()
        stopFlowchart()
        void pauseCycleRuntime()
        ElMessage.error('循环流在倒计时结束前提前退出，未判定为测试完成')
        return
      }
      void completeActiveFlowchartRun()
    }
  },
  { immediate: true }
)

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
  const isCompletedReturn = phase.value === 'complete'
  if (!isCompletedReturn) {
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
  }

  // 停止所有操作
  clearCycleRuntimeTimers()
  stopScanning()
  disconnectSocket()

  // 返回排程页前重新读取后端状态，避免已上传报告的工单仍残留在客户端缓存中。
  await schedule.refreshWorkOrders()

  // 重置状态
  resetTest()
  resetScan()
  resetReport()

  // 退出编辑模式
  exitEditMode()
}

async function handleNewTest() {
  resetHardwarePreflight()
  clearCycleRuntimeTimers()
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
  clearCycleRuntimeTimers()
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
        <div class="header-actions">
          <button
            class="btn-secondary schedule-demo-btn"
            type="button"
            @click="handleStartScheduledTest(MOCK_HALT_HASS_ORDER)"
          >
            <Icon icon="mdi:monitor-eye" />
            无扫码枪演示
          </button>
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
              v-if="!scannerConnected && !isMockHaltHassOrder(currentOrder)"
              class="btn-secondary btn-lg"
              type="button"
              @click="handleStartScheduledTest(MOCK_HALT_HASS_ORDER)"
            >
              <Icon icon="mdi:monitor-eye" />
              无扫码枪，进入演示流程
            </button>
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
      <div
        class="top-bar"
        :class="{ 'cycle-mode': phase === 'test' && activeFlowType === 'cycle' }"
      >
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
          :active-flow-type="activeFlowType"
          :test-flow-passed="testFlowPassed"
          :is-running="isFlowchartRunning"
          :cycle-total-seconds="cycleTotalSeconds"
          :cycle-remaining-seconds="cycleRemainingSeconds"
          :cycle-finish-state="cycleFinishState"
          :current-node-id="currentNodeId"
          :completed-nodes="completedNodes"
          :node-results="nodeResults"
          :server-status="flowchartStatusText"
          :preflight-result="hardwarePreflightResult"
          :is-preflight-checking="isHardwarePreflightChecking"
          :preflight-ready="isHardwarePreflightReady"
          :last-socket-message="lastMessage"
          @preflight="handleHardwarePreflight"
          @run="handleRunFlowchart"
          @stop="handleStopFlowchart"
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

.schedule-demo-btn {
  white-space: nowrap;
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
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.top-bar.cycle-mode {
  padding-top: 8px;
  padding-bottom: 8px;
  margin-bottom: 10px;
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
