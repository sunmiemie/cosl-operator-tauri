<script setup lang="ts">
/**
 * HALT-HASS 测试页面
 * 完整的测试流程：设备检测 -> 扫码 -> 下载工艺 -> 安装指导 -> 流程图运行 -> 上传报告 -> 完成
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// 导入组件
import DeviceCheckOverlay from '@/components/visual-test/DeviceCheckOverlay.vue'
import SessionBoardSelector from './components/SessionBoardSelector.vue'
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
import { useAuth } from '@/composables/useAuth'
import {
  runFlowchart,
  cancelFlowchartRun,
  gracefulStopCurrentFlowchartRun,
  configureApi,
  checkHealth,
  runHassHardwarePreflight,
  runHassHardwareShutdown,
  appendExecutionLog,
  resolveHassRectifierBindings,
  runHassRectifierCommand,
  type HassHardwarePreflightResponse,
} from '@/services/flojoy-api'
import {
  buildWorkbenchControlledCycleRunSettings,
  hasHassDurationLoop,
} from '@/services/hass-cycle-runtime'
import { prepareRunFlowchartArgs } from '@/services/flojoy-adapter'
import {
  completeHaltHassSession,
  cancelHaltHassSession,
  getHaltHassSessionByClientId,
  getOrderDetail,
  listExecutionProcessOptions,
} from '@/services/halt-hass-order'
import { v4 as uuidv4 } from 'uuid'
import {
  clearHaltHassLocalSession,
  loadHaltHassLocalSession,
  saveHaltHassLocalSession,
} from './utils/sessionState'
import { registerActiveSafeExitHandler } from '@/services/active-safe-exit'

// 导入类型
import type {
  HaltHassExecutionProcessOption,
  HaltHassOrder,
  PagePhase,
} from './types'
import type { BlockData } from '@/views/process-halt-hass/types'
import type { Node } from '@vue-flow/core'

// 布局控制
const { enterEditMode, exitEditMode } = useLayout()
const { userInfo } = useAuth()
const router = useRouter()

// 测试流程管理
const {
  phase,
  currentOrder,
  currentSession,
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
  setSession,
  setProcess,
  startTest,
  downloadProcess,
  prevInstallStep,
  nextInstallStep,
  goToInstallStep,
  startFlowchartTest,
  beginFlowchartRun,
  updateNodeResult,
  advanceToCycleFlow,
  onFlowchartComplete,
  stopFlowchart,
  restoreLocalExecution,
  reset: resetTest,
} = useHaltHassTest()

const schedule = useHaltHassSchedule()

// 多板扫码
const {
  currentOrder: scannedOrder,
  eligibleBoards,
  availableOrders,
  selectedOrderIds,
  assignments,
  scannedBoards,
  confirmedSerials,
  lastScanError,
  isComplete: isScanComplete,
  validation: sessionSelectionValidation,
  isProcessing: isSessionSelectionLoading,
  initializeSelection,
  updateAssignment,
  setRole: setAssignmentRole,
  toggleSelectedOrder,
  createSession,
  restoreSessionSelection,
  handleScan,
  reset: resetScan,
  setOrder: setScanOrder,
} = useMultiBoardScan()

// 报告管理
const {
  reportJson,
  reportJobs,
  testResult,
  isUploading,
  uploadProgress,
  uploadError,
  uploadedReportId,
  uploadedCount,
  activeReportIndex,
  reportStage,
  reviewConfirmed,
  completedReportCount,
  allReportsCompleted,
  canUploadReports,
  generateReport,
  upload: uploadReport,
  retryPending: retryPendingReports,
  restorePendingForSession,
  selectReport,
  updateActiveResult,
  updateActiveRecordStatus,
  updateActiveRectifierRecordStatus,
  updateActiveBoardConclusion,
  completeActiveReport,
  enterReportReview,
  editReportFromReview,
  setReviewConfirmed,
  reset: resetReport,
} = useHaltHassReport()

const flowchartRunnerRef = ref<{
  finalizeTelemetry: () => import('./types').HaltHassTelemetrySnapshot | null
  waitForRectifierStages: () => Promise<void>
} | null>(null)

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
  socketId,
  executionLogs,
  clearNodeStatuses,
} = useFlojoySocket()

// 设备检测状态
const deviceCheckStatus = ref<'checking' | 'success' | 'error'>('checking')
const deviceCheckError = ref('')

// 当前运行的 Job ID
const currentJobId = ref<string>('')
// 当前流程停止后仍保留最后一次 Job ID，方便日志小窗继续查看和定位落盘记录。
const latestExecutionJobId = ref<string>('')
let criticalPulserAbortActive = false
let rectifierAbortActive = false

const CRITICAL_PULSER_SETUP_FUNCTIONS = new Set([
  'READ_ZERO_POSITION',
  'SET_ZERO_POSITION',
  'SET_STARTEND_ANGLES',
])

type CycleFinishState = 'idle' | 'running' | 'finishing' | 'recovering'

// 循环流时长由工作台曲线控制；客户端只展示 MQTT 时间并在 Stopped 后收尾。
const cycleRemainingSeconds = ref<number | null>(null)
const cycleFinishState = ref<CycleFinishState>('idle')
let cycleRecoveryActive = false
let flowchartCompletionActive = false
const isSafeExitInProgress = ref(false)
let flojoyConnectPromise: Promise<boolean> | null = null
let deviceCheckGeneration = 0
let enteringScan = false
let safeExitPromise: Promise<boolean> | null = null
let safeExitCompleted = false
let unregisterActiveSafeExit: (() => void) | null = null

const processSelectorVisible = ref(false)
const processSelectorLoading = ref(false)
const processOptions = ref<HaltHassExecutionProcessOption[]>([])
const selectedProcessId = ref<number | null>(null)
const selectedProcessDescription = computed(() =>
  processOptions.value.find(item => item.id === selectedProcessId.value)?.description?.trim() || ''
)
const pendingExecutionOrder = ref<HaltHassOrder | null>(null)

// 正式测试流之前的设备通信门禁
const hardwarePreflightResult = ref<HassHardwarePreflightResponse | null>(null)
const isHardwarePreflightChecking = ref(false)
const isHardwarePreflightReady = computed(() => hardwarePreflightResult.value?.ready === true && socketConnected.value)

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
const flowchartStatusText = computed(() => serverStatus.value)
const activeFlowchart = computed(() => {
  if (!processJson.value) return null
  return activeFlowType.value === 'test'
    ? processJson.value.testFlow
    : processJson.value.cycleFlow
})

// ==================== 设备检测 ====================

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function ensureFlojoyConnected(): Promise<boolean> {
  if (flojoyConnectPromise) return flojoyConnectPromise

  const connectionAttempt = (async () => {
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
  })()

  flojoyConnectPromise = connectionAttempt
  try {
    return await connectionAttempt
  } finally {
    if (flojoyConnectPromise === connectionAttempt) {
      flojoyConnectPromise = null
    }
  }
}

function clearCycleRuntimeTimers(resetDisplay = true) {
  if (resetDisplay) {
    cycleRemainingSeconds.value = null
    cycleFinishState.value = 'idle'
  }
}

async function recoverTimedOutCycleFlow(completionMode = 'software-runtime-complete') {
  if (
    cycleRecoveryActive
    || isSafeExitInProgress.value
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
  const finishingJobId = currentJobId.value || latestExecutionJobId.value
  ElMessage.info(
    completionMode === 'workbench-auto-stop'
      ? '工作台测试已结束，正在停止循环采集并执行设备下电'
      : '工艺自然收尾等待超时，正在停止新任务并等待当前节点释放连接'
  )

  try {
    const flojoyReady = await ensureFlojoyConnected()
    if (!flojoyReady) {
      throw new Error('Flojoy 后端无法恢复，不能确认设备已安全下电')
    }

    const stopResult = await gracefulStopCurrentFlowchartRun(
      finishingJobId || null,
      CYCLE_IN_FLIGHT_STOP_TIMEOUT_SECONDS,
    )
    if (!stopResult.success) {
      throw new Error(stopResult.message || 'Flojoy 循环流停止失败')
    }
    currentJobId.value = ''
    if (stopResult.forced) {
      console.warn('[HALT-HASS] 当前节点未在期限内结束，已强制释放连接:', stopResult)
    }

    const cycleNodes = processJson.value?.cycleFlow.nodes || []
    const shutdown = await runHassHardwareShutdown(
      cycleNodes as any,
      finishingJobId,
      processJson.value?.metadata.reportType || 'drive_control',
    )
    if (!shutdown.success) {
      const failedMessages = shutdown.results
        .filter(item => !item.success)
        .map(item => `${item.displayName}：${item.message}`)
        .join('；')
      throw new Error(failedMessages || shutdown.message)
    }

    await completeActiveFlowchartRun({
      completionMode,
      cycleNodeErrors,
      flowchartStop: stopResult,
      shutdownResults: shutdown.results,
    }, {
      completionSuccess: true,
    })
    ElMessage.success('下电完成，已进入报告保存阶段')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    stopFlowchart()
    clearCycleRuntimeTimers()
    ElMessage.error(`循环流关闭失败：${message}`)
    console.error('[HALT-HASS] 循环流关闭失败:', error)
  } finally {
    cycleRecoveryActive = false
  }
}

async function checkDevices() {
  const generation = ++deviceCheckGeneration
  deviceCheckStatus.value = 'checking'
  deviceCheckError.value = ''
  updateDeviceStatus({ flojoyBackend: false, scanner: false })

  // Flojoy 启动与 USB 扫码枪检测互不依赖，并行执行，避免 Flojoy 冷启动
  // 把扫码枪检测串行阻塞十几秒。
  const flojoyPromise = ensureFlojoyConnected().then((ok) => {
    if (generation === deviceCheckGeneration) updateDeviceStatus({ flojoyBackend: ok })
    return ok
  })
  const scannerPromise = checkScanner().then((ok) => {
    if (generation === deviceCheckGeneration) updateDeviceStatus({ scanner: ok })
    return ok
  })
  const [flojoyOk, scannerOk] = await Promise.all([flojoyPromise, scannerPromise])
  if (generation !== deviceCheckGeneration) return

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

async function prepareSessionSelection() {
  if (!currentOrder.value) {
    ElMessage.error('未选择工单，无法准备测试')
    return false
  }
  const loaded = await downloadProcess(false)
  if (!loaded || !processJson.value) {
    ElMessage.error(errorMessage.value || '下载工艺失败')
    return false
  }
  const initialized = await initializeSelection(currentOrder.value, processJson.value)
  if (!initialized) {
    ElMessage.error(lastScanError.value || '加载可测试目标板失败')
    return false
  }
  return true
}

async function handleWorkbenchFinished(payload: {
  status: string
  elapsedSeconds: number
  remainingSeconds: number
}) {
  if (!isFlowchartRunning.value || activeFlowType.value !== 'cycle') return
  await flowchartRunnerRef.value?.waitForRectifierStages()
  cycleRemainingSeconds.value = Math.max(0, payload.remainingSeconds)
  cycleFinishState.value = 'finishing'
  await appendExecutionLog({
    eventType: 'workbench-test-finished',
    message: `工作台状态变为 ${payload.status || 'Stopped'}，开始停止采集并下电`,
    jobsetId: currentJobId.value || latestExecutionJobId.value,
    function: 'HALT_HASS_WORKBENCH_FINISH',
    data: payload,
  }).catch(error => console.warn('[HALT-HASS] 工作台结束日志写入失败:', error))
  await recoverTimedOutCycleFlow('workbench-auto-stop')
}

async function handleRectifierFailure(payload: { message: string }) {
  if (rectifierAbortActive) return
  rectifierAbortActive = true
  try {
    if (currentJobId.value) {
      await cancelFlowchartRun(currentJobId.value).catch(error => {
        console.warn('[HALT-HASS] 整流稳压采集失败后停止流程失败:', error)
      })
    }
    stopFlowchart()
    clearCycleRuntimeTimers()
    const shutdown = await shutdownHardwareForSafeExit()
    const suffix = shutdown.success
      ? '两路负载和输入源已执行关闭。'
      : `自动关闭未完全成功：${shutdown.message || '未知错误'}，请由工作人员现场处置。`
    await ElMessageBox.alert(
      `整流稳压测试已停止：${payload.message}。${suffix}`,
      '整流稳压测试异常',
      { confirmButtonText: '知道了', type: 'error' },
    )
  } finally {
    rectifierAbortActive = false
  }
}

async function onDeviceCheckEnter() {
  if (!isDeviceReady.value || enteringScan) return
  enteringScan = true
  try {
    if (await prepareSessionSelection()) {
      const scannerStarted = await startScanning(onScanData)
      if (!scannerStarted) {
        updateDeviceStatus({ scanner: false })
        deviceCheckStatus.value = 'error'
        deviceCheckError.value = '扫码枪监听启动失败，请重新检测'
        return
      }
      // 只有扫码监听真正就绪后才显示扫码页面，避免用户在 USB 监听尚未
      // 建立时扫码，数据滞留到下一次进入工单才被消费。
      onDeviceCheckPass()
    }
  } finally {
    enteringScan = false
  }
}

const CYCLE_IN_FLIGHT_STOP_TIMEOUT_SECONDS = 15

function onDeviceCheckRecheck() {
  checkDevices()
}

async function onDeviceCheckSkip() {
  // 跳过设备检测，直接进入扫码阶段
  if (await prepareSessionSelection()) {
    await startScanning(onScanData)
    setPhase('scan')
  }
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
  safeExitCompleted = false
  let targetOrder = order
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

  if (![1, 2].includes(Number(targetOrder.clientTestType)) || !targetOrder.productModel?.id) {
    ElMessage.error('工单缺少产品型号或客户端测试类型，不能开始测试')
    return
  }

  processSelectorLoading.value = true
  const result = await listExecutionProcessOptions(targetOrder)
  processSelectorLoading.value = false
  if (!result.success || !result.data) {
    ElMessage.error(result.error || '读取可执行工艺版本失败')
    return
  }
  if (!result.data.length) {
    ElMessage.error('当前产品、测试类型和目标板没有已审核的适用工艺版本')
    return
  }

  pendingExecutionOrder.value = targetOrder
  processOptions.value = result.data
  selectedProcessId.value = (
    result.data.find(item => item.active === 1) || result.data[0]
  ).id
  processSelectorVisible.value = true
}

async function confirmExecutionProcess() {
  const targetOrder = pendingExecutionOrder.value
  const selected = processOptions.value.find(item => item.id === selectedProcessId.value)
  if (!targetOrder || !selected) {
    ElMessage.warning('请选择本次执行的工艺版本')
    return
  }

  targetOrder.process = {
    id: selected.id,
    name: selected.name,
    version: selected.version,
  }
  processSelectorVisible.value = false

  if (targetOrder.clientTestType === 2) {
    await router.push({
      name: 'HaltHassSdsTest',
      query: {
        orderId: String(targetOrder.id),
        processId: String(selected.id),
      },
    })
    return
  }

  resetHardwarePreflight()
  clearCycleRuntimeTimers()
  await stopScanning()
  resetTest()
  resetScan()
  resetReport()

  setOrder(targetOrder)
  setScanOrder(targetOrder)
  setPhase('detect')
  void checkDevices()
}

async function handleStartTest() {
  if (!isScanComplete.value) {
    ElMessage.warning(sessionSelectionValidation.value.message)
    return
  }

  const session = await createSession(userInfo.value?.id)
  if (!session) {
    ElMessage.error(lastScanError.value || '准备测试数据失败')
    return
  }
  setSession(session)
  const success = await startTest(session)

  if (success) {
    await stopScanning()
    ElMessage.success(`${scannedBoards.value.length} 块电路板扫码完成，已开始测试`)
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
  if (!socketConnected.value) {
    ElMessage.warning('Flojoy 后端未连接，请先恢复后端连接')
    return
  }

  isHardwarePreflightChecking.value = true
  hardwarePreflightResult.value = null

  try {
    const result = await runHassHardwarePreflight(
      [
        ...processJson.value.testFlow.nodes,
        ...processJson.value.cycleFlow.nodes,
      ] as any,
      processJson.value.metadata.reportType || 'drive_control',
    )
    hardwarePreflightResult.value = result

    if (result.ready) {
      ElMessage.success('全部设备在线且端口可用，可以运行测试流')
    } else {
      ElMessage.error(result.message || '存在未枚举或端口无法打开的设备')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '设备通信检测失败'
    hardwarePreflightResult.value = {
      ready: false,
      powerMaintained: false,
      powerResource: '',
      results: [],
      message,
    }
    ElMessage.error(message)
    console.error('[HALT-HASS] 设备通信检测失败:', error)
  } finally {
    isHardwarePreflightChecking.value = false
  }
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
  let runSettings = flowchartData.runSettings

  if (isCycleFlow) {
    if (!testFlowPassed.value) {
      ElMessage.warning('测试流尚未通过，不能运行循环流')
      return
    }
    if (!hasHassDurationLoop(flowchartData.nodes as any)) {
      ElMessage.warning('循环流缺少 HALT_HASS_DURATION_LOOP 循环控制节点')
      return
    }
    // 台架曲线携带完整试验时长。客户端持续采集，直到 MQTT
    // RequestTestStatus 返回非 Running，再取消拓扑并安全下电。
    runSettings = buildWorkbenchControlledCycleRunSettings(flowchartData.runSettings)
  }

  if (!isCycleFlow) {
    clearCycleRuntimeTimers()
  } else {
    cycleRemainingSeconds.value = null
    cycleFinishState.value = 'running'
  }
  beginFlowchartRun()

  const jobId = uuidv4()
  currentJobId.value = jobId
  latestExecutionJobId.value = jobId
  criticalPulserAbortActive = false
  clearNodeStatuses()

  try {
    if (
      !isCycleFlow
      && processJson.value.metadata.reportType === 'rectifier_regulator'
    ) {
      const bindings = await resolveHassRectifierBindings()
      const initialized = await runHassRectifierCommand(
        'initialize',
        bindings,
        {
          sourceCurrentLimitA: processJson.value.metadata.rectifierConfig?.sourceCurrentLimitA ?? 5,
        },
        jobId,
      )
      if (!initialized.success) {
        throw new Error(initialized.message || '整流稳压设备初始化失败')
      }
    }

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
    })

    ElMessage.success(
      activeFlowType.value === 'test'
        ? '测试流开始运行'
        : '循环流开始运行，测试时间由工作台曲线控制'
    )
  } catch (e) {
    if (processJson.value.metadata.reportType === 'rectifier_regulator') {
      await runHassHardwareShutdown(
        (processJson.value.cycleFlow.nodes || []) as any,
        jobId,
        'rectifier_regulator',
      ).catch(error => console.error('[HALT-HASS] 整流稳压启动失败后的下电操作失败:', error))
    }
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
  if (currentJobId.value) {
    try {
      await cancelFlowchartRun(currentJobId.value)
      stopFlowchart()
      currentJobId.value = ''
      if (activeFlowType.value === 'cycle') {
        clearCycleRuntimeTimers()
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
  // 当前节点只以 Flojoy 的 RUNNING_NODE 为准。节点结果消息可能与下一节点
  // 启动消息连续到达，不能让“刚完成节点”覆盖正在执行的节点。
  currentNodeId.value = nodeId
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

async function abortOnCriticalPulserSetupFailure(
  functionName: string,
  error: string,
): Promise<void> {
  if (
    criticalPulserAbortActive
    || !isFlowchartRunning.value
    || activeFlowType.value !== 'test'
  ) return

  criticalPulserAbortActive = true
  try {
    if (currentJobId.value) {
      try {
        await cancelFlowchartRun(currentJobId.value)
      } catch (cancelError) {
        console.warn('[HALT-HASS] 脉冲器关键节点失败后停止 Flojoy 失败:', cancelError)
      }
    }
    currentJobId.value = ''
    stopFlowchart()
    await wait(600)

    const shutdown = await shutdownHardwareForSafeExit()
    const shutdownMessage = shutdown.success
      ? '设备已执行安全下电。'
      : `安全下电未完全成功：${shutdown.message || '未知错误'}。`
    await ElMessageBox.alert(
      `${functionName} 执行失败：${error || '未收到有效设备回执'}。`
      + '零位读取、零位写入和起止角写入是必做步骤，本次测试已中止，不能进入后续流程。'
      + shutdownMessage,
      '脉冲器初始化失败',
      { confirmButtonText: '知道了', type: 'error' },
    )
  } finally {
    criticalPulserAbortActive = false
  }
}

watch(failedBlocks, (failed) => {
  for (const [nodeId, error] of Object.entries(failed)) {
    updateNodeResult({
      flowType: activeFlowType.value,
      nodeId,
      nodeName: nodeId,
      status: 'error',
      error,
    })

    const node = activeFlowchart.value?.nodes.find(item => item.id === nodeId)
    const functionName = String(node?.data?.func || '').toUpperCase()
    if (CRITICAL_PULSER_SETUP_FUNCTIONS.has(functionName)) {
      void abortOnCriticalPulserSetupFailure(functionName, error)
    }
  }
})

interface FlowchartCompletionOptions {
  completionSuccess?: boolean
}

async function completeActiveFlowchartRun(
  testData?: Record<string, unknown>,
  options: FlowchartCompletionOptions = {},
) {
  if (!isFlowchartRunning.value || flowchartCompletionActive) return

  flowchartCompletionActive = true
  try {
    const hasRecordedNodeError = nodeResults.value.some(
      result => result.flowType === activeFlowType.value && result.status === 'error'
    )
    const hasError = options.completionSuccess === undefined
      ? hasRecordedNodeError || Object.keys(failedBlocks.value).length > 0
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
    let completionData: Record<string, unknown> = { ...(testData || {}) }
    const telemetrySnapshot = flowchartRunnerRef.value?.finalizeTelemetry()
    if (telemetrySnapshot) {
      completionData = {
        ...completionData,
        periodicRecords: telemetrySnapshot.periodicRecords,
        chartSummary: telemetrySnapshot.chartSummary,
        rectifierReport: telemetrySnapshot.rectifierReport,
        telemetryGeneratedAt: telemetrySnapshot.generatedAt,
      }
    }
    if (!completionData.shutdownResults) {
      const shutdown = await runHassHardwareShutdown(
        (processJson.value?.cycleFlow.nodes || []) as any,
        currentJobId.value || latestExecutionJobId.value,
        processJson.value?.metadata.reportType || 'drive_control',
      )
      if (!shutdown.success) {
        stopFlowchart()
        clearCycleRuntimeTimers()
        ElMessage.error(shutdown.message || '设备下电失败，场次尚未结束')
        return
      }
      completionData = { ...completionData, shutdownResults: shutdown.results }
    }

    if (currentSession.value) {
      const endTime = new Date()
      const elapsedRuntimeSeconds = flowchartStartTime.value
        ? Math.max(0, Math.floor((endTime.getTime() - flowchartStartTime.value.getTime()) / 1000))
        : 0
      const sessionResult = await completeHaltHassSession(currentSession.value.id, {
        powerOffCompleted: true,
        success: !hasError,
        elapsedRuntimeSeconds,
        flowResult: {
          nodes: [...testFlowResults.value, ...nodeResults.value],
          failedBlocks: { ...failedBlocks.value },
        },
        testData: completionData,
        failureReason: hasError ? '循环流存在失败节点' : '',
      })
      if (!sessionResult.success || !sessionResult.data) {
        stopFlowchart()
        clearCycleRuntimeTimers()
        ElMessage.error(sessionResult.error || '场次结束状态保存失败')
        return
      }
      setSession(sessionResult.data)
    }

    onFlowchartComplete(!hasError)
    clearCycleRuntimeTimers()

    if (currentOrder.value && currentSession.value && processJson.value && flowchartStartTime.value) {
      generateReport({
        order: currentOrder.value,
        session: currentSession.value,
        process: processJson.value,
        boards: [...scannedBoards.value],
        startTime: flowchartStartTime.value,
        endTime: new Date(),
        nodeResults: [...testFlowResults.value, ...nodeResults.value],
        testData: completionData,
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
      // 循环流由工作台 MQTT 状态决定结束。工作台尚未确认 Stopped 时，
      // Flojoy 进入 STANDBY 只能视为拓扑提前退出，不能误判为测试完成。
      if (activeFlowType.value === 'cycle') {
        clearCycleRuntimeTimers()
        stopFlowchart()
        ElMessage.error(
          Object.keys(failedBlocks.value).length > 0
            ? '循环流执行失败，工作台测试未判定为完成'
            : '循环流在工作台结束前提前退出，未判定为测试完成'
        )
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
    clearHaltHassLocalSession()
    ElMessage.success('报告上传成功')
  } else {
    ElMessage.error(uploadError.value || '上传失败')
  }
}

function handleRetryUpload() {
  handleUploadReport()
}

function handleComplete() {
  clearHaltHassLocalSession()
  setPhase('complete')
}

function handleCompleteReportReview() {
  if (!completeActiveReport()) {
    ElMessage.warning(uploadError.value || '当前报告尚未完成复核')
    return
  }
  ElMessage.success(allReportsCompleted.value ? '全部报告已复核，请确认审核汇总' : '本份报告已保存')
}

function handleEnterReportReview() {
  if (!enterReportReview()) {
    ElMessage.warning(uploadError.value || '请先完成全部逐板报告复核')
  }
}

function handleReviewConfirmed(confirmed: boolean) {
  if (!setReviewConfirmed(confirmed)) return
  if (confirmed) ElMessage.success('测试人员审核已确认，可以上传报告')
}

// ==================== 退出和重置 ====================

function hasProtectedTestContext(): boolean {
  return !safeExitCompleted
    && phase.value !== 'schedule'
    && phase.value !== 'complete'
    && Boolean(currentOrder.value || currentSession.value)
}

async function confirmSafeExit(): Promise<boolean> {
  if (!hasProtectedTestContext()) return true

  return ElMessageBox.confirm(
    currentSession.value?.status === 5
      ? '当前场次已完成下电，未上传的逐板报告将保留在本机并在联网后重传。确定退出吗？'
      : '测试流程不允许中途继续。安全退出后将停止当前流程并完成下电，当前场次会取消，相关工单退回待重做；下次必须重新扫码并从头测试。',
    'HALT-HASS 安全退出确认',
    {
      confirmButtonText: '安全退出',
      cancelButtonText: '继续测试',
      type: 'warning',
      closeOnClickModal: false,
      closeOnPressEscape: false,
    },
  ).then(() => true).catch(() => false)
}

function formatShutdownFailure(
  shutdown: Awaited<ReturnType<typeof runHassHardwareShutdown>>,
): string {
  const details = shutdown.results
    .filter(item => !item.success)
    .map(item => `${item.displayName}：${item.message}`)
    .join('；')
  return details || shutdown.message || '无法确认设备已安全下电'
}

async function ensureFlojoyBackendForSafeExit(): Promise<boolean> {
  configureApi('127.0.0.1', backendPort.value)
  let healthy = await checkHealth()
  if (healthy) return true

  await startBackend()
  for (let attempt = 0; attempt < 12 && !healthy; attempt++) {
    await wait(500)
    healthy = await checkHealth()
  }
  return healthy
}

async function shutdownHardwareForSafeExit(): Promise<{
  success: boolean
  message?: string
}> {
  if (!await ensureFlojoyBackendForSafeExit()) {
    return { success: false, message: 'Flojoy 后端无法启动，不能执行设备安全下电' }
  }

  let lastFailure = '设备安全下电失败'
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const shutdown = await runHassHardwareShutdown(
        (processJson.value?.cycleFlow.nodes || []) as any,
        currentJobId.value || latestExecutionJobId.value,
        processJson.value?.metadata.reportType || 'drive_control',
      )
      if (shutdown.success) return { success: true }
      lastFailure = formatShutdownFailure(shutdown)
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
    if (attempt === 0) await wait(800)
  }
  return { success: false, message: lastFailure }
}

async function confirmForcedExitAfterShutdownFailure(message: string): Promise<boolean> {
  return ElMessageBox.confirm(
    `自动安全收尾未完成：${message || '无法确认设备已安全下电'}。`
    + '如果现场已经处理完毕，可以坚持退出；当前场次将取消，工单退回待重做，下次必须重新扫码并从头测试。',
    '安全退出存在失败项',
    {
      confirmButtonText: '坚持退出',
      cancelButtonText: '返回检查',
      type: 'warning',
      closeOnClickModal: false,
      closeOnPressEscape: false,
    },
  ).then(() => true).catch(() => false)
}

async function performSafeExit(): Promise<boolean> {
  if (safeExitPromise) return safeExitPromise

  safeExitPromise = (async () => {
    isSafeExitInProgress.value = true
    clearCycleRuntimeTimers(false)

    const session = currentSession.value
    if (session) {
      if ([2, 3, 4].includes(session.status)) {
        try {
          const stopResult = await gracefulStopCurrentFlowchartRun(
            currentJobId.value || latestExecutionJobId.value || null,
            CYCLE_IN_FLIGHT_STOP_TIMEOUT_SECONDS,
          )
          if (!stopResult.success) throw new Error(stopResult.message)
        } catch (error) {
          // 独立安全下电接口不依赖运行拓扑。流程已经结束时停止接口可能返回失败，
          // 这里只记录日志，避免把幂等停止误报给用户。
          console.warn('[HALT-HASS] 退出前停止 Flojoy 失败，继续执行独立下电:', error)
        }

        const shutdown = await shutdownHardwareForSafeExit()
        const powerOffCompleted = shutdown.success
        let forceExitConfirmed = false
        if (!shutdown.success) {
          forceExitConfirmed = await confirmForcedExitAfterShutdownFailure(shutdown.message || '')
          if (!forceExitConfirmed) return false
        }

        const cancelled = await cancelHaltHassSession(session.id, {
          reason: powerOffCompleted
            ? '用户中途退出，场次作废并从头重测'
            : `用户查看安全收尾失败原因后坚持退出，场次作废并从头重测：${shutdown.message || '无法确认设备已安全下电'}`,
          powerOffCompleted,
          forceExitConfirmed,
        })
        if (!cancelled.success) {
          ElMessage.error(cancelled.error || '场次取消状态保存失败，已取消退出')
          return false
        }
        clearHaltHassLocalSession()
        if (!powerOffCompleted) {
          ElMessage.warning('已按坚持退出处理；本次未能自动确认设备下电状态，工单已退回待重做')
        }
      } else if ([0, 1].includes(session.status)) {
        const cancelled = await cancelHaltHassSession(session.id, {
          reason: '用户退出未开始场次，重新扫码测试',
        })
        if (!cancelled.success) {
          ElMessage.error(cancelled.error || '场次取消失败，已取消退出')
          return false
        }
        clearHaltHassLocalSession()
      }
    }

    clearCycleRuntimeTimers()
    await stopScanning()
    disconnectSocket()
    safeExitCompleted = true
    return true
  })()

  try {
    return await safeExitPromise
  } finally {
    safeExitPromise = null
    isSafeExitInProgress.value = false
  }
}

async function requestSafeExit(): Promise<boolean> {
  if (safeExitPromise) return safeExitPromise
  if (!await confirmSafeExit()) return false
  return performSafeExit()
}

async function handleExit() {
  const isCompletedReturn = phase.value === 'complete'
  if (!isCompletedReturn && !await requestSafeExit()) return
  if (isCompletedReturn && !await performSafeExit()) return

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

watch(
  [
    currentSession,
    phase,
    installStep,
    activeFlowType,
    testFlowPassed,
    testFlowResults,
    nodeResults,
    completedNodes,
    currentNodeId,
    flowchartStartTime,
  ],
  () => {
    if (
      !currentOrder.value
      || !currentSession.value
      || !processJson.value
      || phase.value === 'schedule'
      || phase.value === 'complete'
    ) return
    saveHaltHassLocalSession({
      order: currentOrder.value,
      session: currentSession.value,
      processJson: processJson.value,
      phase: phase.value,
      installStep: installStep.value,
      activeFlowType: activeFlowType.value,
      testFlowPassed: testFlowPassed.value,
      testFlowResults: [...testFlowResults.value],
      nodeResults: [...nodeResults.value],
      completedNodes: [...completedNodes.value],
      currentNodeId: currentNodeId.value,
      flowchartStartTime: flowchartStartTime.value?.toISOString() || null,
      savedAt: new Date().toISOString(),
    })
  },
  { deep: true },
)

async function restoreLocalSessionIfAvailable() {
  const saved = loadHaltHassLocalSession()
  if (!saved) return

  let session = saved.session
  const result = await getHaltHassSessionByClientId(saved.session.clientSessionId)
  if (result.success && result.data) session = result.data
  if ([6, 7, 8].includes(session.status)) {
    clearHaltHassLocalSession()
    ElMessage.info('该场次已在服务端关闭，本地运行状态已清理')
    return
  }

  setOrder(saved.order)
  setSession(session)
  setProcess(saved.processJson)
  setScanOrder(saved.order)
  restoreSessionSelection(saved.order, saved.processJson, session)
  restoreLocalExecution(saved)

  if (session.status === 5 && saved.phase === 'upload') {
    restorePendingForSession(session.id)
    ElMessage.info('已恢复完成下电的待上传报告，可继续重传报告')
    return
  }

  await ElMessageBox.alert(
    `检测到异常中断的场次 ${session.sessionNo}。HALT-HASS 不允许从中断位置续跑，将先执行安全下电并把工单退回待重做。`,
    '需要安全复位',
    { confirmButtonText: '执行安全复位', type: 'warning', closeOnPressEscape: false },
  )
  if (!await performSafeExit()) return

  await schedule.refreshWorkOrders()
  resetTest()
  resetScan()
  resetReport()
  exitEditMode()
  ElMessage.success('异常场次已安全退出，请重新扫码并从头测试')
}

async function retryReportsWhenOnline() {
  if (!userInfo.value) return
  try {
    await retryPendingReports()
  } catch (error) {
    console.warn('[HALT-HASS] 网络恢复后重传逐板报告失败:', error)
  }
}

onBeforeRouteLeave(async () => {
  if (!hasProtectedTestContext()) return true
  return requestSafeExit()
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasProtectedTestContext() || isSafeExitInProgress.value) return
  event.preventDefault()
  event.returnValue = ''
}

// 监听阶段变化，只在特定阶段隐藏侧边栏
watch(phase, (newPhase) => {
  if (newPhase === 'install' || newPhase === 'test' || newPhase === 'upload') {
    enterEditMode()
  } else {
    exitEditMode()
  }
})

onMounted(() => {
  window.addEventListener('online', retryReportsWhenOnline)
  window.addEventListener('beforeunload', handleBeforeUnload)
  unregisterActiveSafeExit = registerActiveSafeExitHandler(async () => {
    if (!hasProtectedTestContext()) return null
    return requestSafeExit()
  })
  void restoreLocalSessionIfAvailable()
  // 用户停留在排程页时后台预热 Flojoy；进入工单后通常只剩一次快速健康检查。
  void ensureFlojoyConnected().catch(error => {
    console.warn('[HALT-HASS] Flojoy 后台预热失败，将在进入工单时重试:', error)
  })
  // 排程页不提前弹出设备检测，进入已排程工单后再检测设备。
  if (phase.value !== 'schedule') {
    void checkDevices()
  }
})

onUnmounted(() => {
  deviceCheckGeneration += 1
  window.removeEventListener('online', retryReportsWhenOnline)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  unregisterActiveSafeExit?.()
  unregisterActiveSafeExit = null
  clearCycleRuntimeTimers()
  void stopScanning()
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
      :camera-ok="false"
      :show-camera="false"
      :show-service="true"
      :service-ok="deviceStatus.flojoyBackend"
      service-label="Flojoy 后端"
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
                等待扫描测试板卡
              </span>
              <span v-else-if="isScanComplete" class="scan-status complete">
                <Icon icon="mdi:check-circle" />
                电路板扫码完成
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
        <!-- 左侧：扫码确认区域 -->
        <div class="scan-section">
          <div class="section-card">
            <div class="card-header">
              <Icon icon="mdi:view-grid-plus-outline" />
              <span>电路板扫码确认</span>
            </div>
            <div class="card-content">
              <SessionBoardSelector
                :assignments="assignments"
                :eligible-boards="eligibleBoards"
                :available-orders="availableOrders"
                :selected-order-ids="selectedOrderIds"
                :applicable-board-models="processJson?.metadata.applicableBoardModels || []"
                :confirmed-serials="confirmedSerials"
                :valid="isScanComplete"
                :validation-message="lastScanError || sessionSelectionValidation.message"
                :loading="isSessionSelectionLoading"
                @role="setAssignmentRole"
                @update="updateAssignment"
                @order="toggleSelectedOrder"
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
                  <span class="info-label">本次工艺</span>
                  <span class="info-value">
                    {{ currentOrder.process ? `${currentOrder.process.name} · ${currentOrder.process.version}` : '-' }}
                  </span>
                </div>
                <div class="info-item">
                  <span class="info-label">工单目标板总数</span>
                  <span class="info-value">{{ currentOrder.boardCount }} 块</span>
                </div>
                <div class="info-item">
                  <span class="info-label">循环次数</span>
                  <span class="info-value">{{ currentOrder.cycleCount }} 次</span>
                </div>
                <div class="info-item task-flow-info">
                  <span class="info-label">任务执行流程</span>
                  <span class="info-value">{{ currentOrder.taskExecutionDescription || '-' }}</span>
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
              :disabled="!isScanComplete || phase === 'download' || isSessionSelectionLoading"
              @click="handleStartTest"
            >
              <Icon v-if="phase === 'download'" icon="mdi:loading" class="spin" />
              <Icon v-else icon="mdi:arrow-right" />
              {{ phase === 'download' || isSessionSelectionLoading ? '正在开始...' : '开始测试' }}
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
          <button class="exit-btn" :disabled="isSafeExitInProgress" @click="handleExit">
            <Icon :icon="isSafeExitInProgress ? 'mdi:loading' : 'mdi:arrow-left'" :class="{ spin: isSafeExitInProgress }" />
            {{ isSafeExitInProgress ? '安全退出中...' : '退出' }}
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
          ref="flowchartRunnerRef"
          :process-json="processJson"
          :active-flow-type="activeFlowType"
          :test-flow-passed="testFlowPassed"
          :is-running="isFlowchartRunning"
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
          :jobset-id="latestExecutionJobId"
          :session-id="currentSession?.id ?? null"
          :default-workbench-test-name="currentOrder?.workbenchTestName || ''"
          :socket-id="socketId"
          :execution-logs="executionLogs"
          @preflight="handleHardwarePreflight"
          @hardware-config-changed="resetHardwarePreflight"
          @run="handleRunFlowchart"
          @stop="handleStopFlowchart"
          @workbench-finished="handleWorkbenchFinished"
          @rectifier-failure="handleRectifierFailure"
        />
      </div>

      <!-- 上传报告阶段 -->
      <div v-if="phase === 'upload'" class="phase-content upload-phase">
        <div class="upload-layout">
          <TestResultPanel
            :report="reportJson"
            :report-jobs="reportJobs"
            :active-report-index="activeReportIndex"
            :report-stage="reportStage"
            :review-confirmed="reviewConfirmed"
            :completed-report-count="completedReportCount"
            :all-reports-completed="allReportsCompleted"
            :test-result="testResult"
            @select-report="selectReport"
            @update-result="updateActiveResult"
            @update-record-status="updateActiveRecordStatus"
            @update-rectifier-record-status="updateActiveRectifierRecordStatus"
            @update-board-conclusion="updateActiveBoardConclusion"
            @complete-report="handleCompleteReportReview"
            @enter-review="handleEnterReportReview"
            @edit-report="editReportFromReview"
            @update-review-confirmed="handleReviewConfirmed"
          />
          <ReportUploader
            :is-uploading="isUploading"
            :upload-progress="uploadProgress"
            :upload-error="uploadError"
            :upload-success="!!uploadedReportId"
            :cycle-count="currentOrder?.cycleCount || 1"
            :report-count="reportJobs.length || uploadedCount"
            :uploaded-count="uploadedCount"
            :can-upload="canUploadReports"
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
            <button class="btn-secondary" :disabled="isSafeExitInProgress" @click="handleExit">
              <Icon icon="mdi:arrow-left" />
              返回首页
            </button>
          </div>
        </div>
      </div>
      </div>
    </template>

    <el-dialog
      v-model="processSelectorVisible"
      title="选择本次执行工艺"
      width="620px"
      :close-on-click-modal="false"
    >
      <div v-if="pendingExecutionOrder" class="process-selector-summary">
        <div><span>工单</span><strong>{{ pendingExecutionOrder.orderNo }}</strong></div>
        <div><span>产品类型</span><strong>{{ pendingExecutionOrder.productModel?.name || '-' }}</strong></div>
        <div><span>测试类型</span><strong>{{ pendingExecutionOrder.clientTestTypeName || '-' }}</strong></div>
        <div><span>实验模式</span><strong>{{ pendingExecutionOrder.experimentType.toUpperCase() || '-' }}</strong></div>
        <div class="task-description">
          <span>工艺描述</span>
          <p>{{ selectedProcessDescription || '所选工艺暂未填写试验执行说明' }}</p>
        </div>
      </div>
      <el-form label-width="100px" class="process-selector-form">
        <el-form-item label="工艺版本" required>
          <el-select
            v-model="selectedProcessId"
            filterable
            style="width: 100%"
            placeholder="请选择本次实际执行的工艺版本"
            :loading="processSelectorLoading"
          >
            <el-option
              v-for="item in processOptions"
              :key="item.id"
              :value="item.id"
              :label="`${item.name} · ${item.version}${item.active === 1 ? '（当前版本）' : ''}`"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="process-selector-actions">
        <button class="btn-secondary" @click="processSelectorVisible = false">取消</button>
        <button class="btn-primary" :disabled="!selectedProcessId" @click="confirmExecutionProcess">
          确认并进入测试
        </button>
        </div>
      </template>
    </el-dialog>
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

.process-selector-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.process-selector-summary > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--color-border, #334155);
  border-radius: 8px;
  background: var(--color-bg-secondary, #172033);
}

.process-selector-summary span {
  color: var(--color-text-secondary, #94a3b8);
  font-size: 12px;
}

.process-selector-summary strong,
.process-selector-summary p {
  margin: 0;
  color: var(--color-text-primary, #f1f5f9);
}

.process-selector-summary .task-description {
  grid-column: 1 / -1;
}

.task-description p {
  line-height: 1.65;
  white-space: pre-wrap;
}

.process-selector-form {
  margin-top: 4px;
}

.process-selector-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  flex-wrap: nowrap;
}

.process-selector-actions > button {
  flex-shrink: 0;
  white-space: nowrap;
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
