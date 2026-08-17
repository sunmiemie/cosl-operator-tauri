/**
 * HALT-HASS 测试流程管理
 * 管理完整的测试流程阶段和状态
 */
import { ref, computed } from 'vue'
import type {
  PagePhase,
  TestMode,
  HaltHassOrder,
  HaltHassTempData,
  DeviceStatus,
  NodeRunResult,
} from '@/views/halt-hass-test/types'
import type {
  HaltHassFlowType,
  HaltHassProcessJson,
} from '@/views/process-halt-hass/types'
import {
  startOrder,
  startOrderCycleRuntime,
  pauseOrderCycleRuntime,
  uploadTempData,
  downloadTempData,
  downloadFeedbackData,
  downloadProcessData,
  type HaltHassStartResult,
} from '@/services/halt-hass-order'
import { useAuth } from '@/composables/useAuth'
import { isMockHaltHassOrder, MOCK_HALT_HASS_PROCESS } from '../mock-halt-hass-fixture'

export function useHaltHassTest() {
  const { userInfo } = useAuth()

  // ==================== 核心状态 ====================

  // 当前阶段
  const phase = ref<PagePhase>('schedule')

  // 测试模式
  const testMode = ref<TestMode>('normal')

  // 当前工单
  const currentOrder = ref<HaltHassOrder | null>(null)

  // 工艺数据
  const processJson = ref<HaltHassProcessJson | null>(null)

  // 设备状态
  const deviceStatus = ref<DeviceStatus>({
    flojoyBackend: false,
    scanner: false,
    camera: false,
  })

  // ==================== 安装指导状态 ====================

  const installStep = ref(0)
  const totalInstallSteps = computed(() => processJson.value?.installGuide?.steps?.length ?? 0)

  // ==================== 流程图运行状态 ====================

  const isFlowchartRunning = ref(false)
  const flowchartStartTime = ref<Date | null>(null)
  const flowchartEndTime = ref<Date | null>(null)
  const nodeResults = ref<NodeRunResult[]>([])
  const completedNodes = ref<string[]>([])
  const currentNodeId = ref<string>('')
  const activeFlowType = ref<HaltHassFlowType>('test')
  const testFlowPassed = ref(false)
  const testFlowResults = ref<NodeRunResult[]>([])

  // ==================== 错误和加载状态 ====================

  const isLoading = ref(false)
  const errorMessage = ref('')

  // ==================== 计算属性 ====================

  const isDeviceReady = computed(() =>
    deviceStatus.value.flojoyBackend && deviceStatus.value.scanner
  )

  const canStartTest = computed(() =>
    phase.value === 'install' &&
    installStep.value >= totalInstallSteps.value - 1
  )

  const testDuration = computed(() => {
    if (!flowchartStartTime.value) return 0
    const end = flowchartEndTime.value || new Date()
    return Math.floor((end.getTime() - flowchartStartTime.value.getTime()) / 1000)
  })

  const flowchartProgress = computed(() => {
    const flow = activeFlowType.value === 'test'
      ? processJson.value?.testFlow
      : processJson.value?.cycleFlow
    const totalNodes = flow?.nodes.length ?? 0
    if (totalNodes === 0) return 0
    return Math.round((completedNodes.value.length / totalNodes) * 100)
  })

  // ==================== 阶段控制方法 ====================

  /**
   * 设置当前阶段
   */
  function setPhase(newPhase: PagePhase): void {
    phase.value = newPhase
  }

  /**
   * 进入下一阶段
   */
  function nextPhase(): void {
    const phases: PagePhase[] = ['schedule', 'detect', 'scan', 'download', 'install', 'test', 'upload', 'complete']
    const currentIndex = phases.indexOf(phase.value)
    if (currentIndex < phases.length - 1) {
      phase.value = phases[currentIndex + 1]
    }
  }

  /**
   * 返回上一阶段
   */
  function prevPhase(): void {
    const phases: PagePhase[] = ['schedule', 'detect', 'scan', 'download', 'install', 'test', 'upload', 'complete']
    const currentIndex = phases.indexOf(phase.value)
    if (currentIndex > 0) {
      phase.value = phases[currentIndex - 1]
    }
  }

  // ==================== 设备检测方法 ====================

  /**
   * 更新设备状态
   */
  function updateDeviceStatus(status: Partial<DeviceStatus>): void {
    deviceStatus.value = { ...deviceStatus.value, ...status }
  }

  /**
   * 设备检测通过，进入扫码阶段
   */
  function onDeviceCheckPass(): void {
    if (isDeviceReady.value) {
      setPhase('scan')
    }
  }

  // ==================== 工单和工艺方法 ====================

  /**
   * 设置当前工单
   */
  function setOrder(order: HaltHassOrder): void {
    currentOrder.value = order
  }

  function getOrderSerials(order: HaltHassOrder): string[] {
    const scannedSerials = (order.scannedBoards || []).map(board => board.serial.trim()).filter(Boolean)
    if (scannedSerials.length) return scannedSerials

    return (order.boardSerials || [])
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        return String(item.serial || item.sn || item.serialNumber || item.serial_num || '').trim()
      })
      .filter(Boolean)
  }

  function applyRuntimeState(order: HaltHassOrder, runtime?: HaltHassStartResult): void {
    if (!runtime) return
    order.status = 2
    order.startedAt = runtime.startedAt || order.startedAt
    order.cycleCount = runtime.cycleCount ?? order.cycleCount
    order.singleCycleDurationHours = runtime.singleCycleDurationHours ?? order.singleCycleDurationHours
    order.totalCycleDurationHours = runtime.totalCycleDurationHours ?? order.totalCycleDurationHours
    order.requiredRuntimeSeconds = runtime.requiredRuntimeSeconds ?? order.requiredRuntimeSeconds
    order.elapsedRuntimeSeconds = runtime.elapsedRuntimeSeconds ?? order.elapsedRuntimeSeconds
    order.remainingRuntimeSeconds = runtime.remainingRuntimeSeconds ?? order.remainingRuntimeSeconds
    order.runtimeProgress = runtime.runtimeProgress ?? order.runtimeProgress
    order.runtimeConfigured = runtime.runtimeConfigured ?? order.runtimeConfigured
    order.runtimeCompleted = runtime.runtimeCompleted ?? order.runtimeCompleted
    if (runtime.currentRunStartedAt !== undefined) {
      order.currentRunStartedAt = runtime.currentRunStartedAt
    }
  }

  async function activateOrderRuntime(
    order: HaltHassOrder,
    serials = getOrderSerials(order),
  ): Promise<boolean> {
    if (isMockHaltHassOrder(order)) return true
    if (!userInfo.value) {
      errorMessage.value = '用户信息不存在'
      return false
    }
    if (serials.length !== order.boardCount) {
      errorMessage.value = `需要 ${order.boardCount} 个有效电路板序列号，当前仅有 ${serials.length} 个`
      return false
    }

    const result = await startOrder(order.id, {
      operatorId: userInfo.value.id,
      boardSerials: serials,
    })
    if (!result.success) {
      errorMessage.value = result.error || '开始测试失败'
      return false
    }
    applyRuntimeState(order, result.data)
    return true
  }

  async function activateCycleRuntime(): Promise<boolean> {
    if (!currentOrder.value) {
      errorMessage.value = '工单不存在'
      return false
    }
    if (isMockHaltHassOrder(currentOrder.value)) return true

    const result = await startOrderCycleRuntime(currentOrder.value.id)
    if (!result.success) {
      errorMessage.value = result.error || '启动循环流计时失败'
      return false
    }
    applyRuntimeState(currentOrder.value, result.data)
    return true
  }

  async function pauseCycleRuntime(): Promise<boolean> {
    if (!currentOrder.value || isMockHaltHassOrder(currentOrder.value)) {
      return true
    }

    const result = await pauseOrderCycleRuntime(currentOrder.value.id)
    if (!result.success) {
      errorMessage.value = result.error || '暂停循环流计时失败'
      return false
    }
    applyRuntimeState(currentOrder.value, result.data)
    return true
  }

  function resetExecutionState(): void {
    installStep.value = 0
    isFlowchartRunning.value = false
    flowchartStartTime.value = null
    flowchartEndTime.value = null
    nodeResults.value = []
    completedNodes.value = []
    currentNodeId.value = ''
    activeFlowType.value = 'test'
    testFlowPassed.value = false
    testFlowResults.value = []
  }

  /**
   * 开始测试（调用 API）
   */
  async function startTest(boardSerials: string[]): Promise<boolean> {
    if (!currentOrder.value) {
      errorMessage.value = '工单不存在'
      return false
    }

    if (!isMockHaltHassOrder(currentOrder.value) && !userInfo.value) {
      errorMessage.value = '用户信息不存在'
      return false
    }

    isLoading.value = true
    errorMessage.value = ''

    try {
      if (isMockHaltHassOrder(currentOrder.value)) {
        setPhase('download')
        return true
      }

      const activated = await activateOrderRuntime(currentOrder.value, boardSerials)
      if (!activated) {
        return false
      }

      setPhase('download')
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '未知错误'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 下载工艺数据
   */
  async function downloadProcess(): Promise<boolean> {
    if (!currentOrder.value) {
      errorMessage.value = '工单不存在'
      return false
    }

    isLoading.value = true
    errorMessage.value = ''

    try {
      if (isMockHaltHassOrder(currentOrder.value)) {
        processJson.value = MOCK_HALT_HASS_PROCESS
        setPhase('install')
        return true
      }

      const result = await downloadProcessData(currentOrder.value.process.id)

      if (!result.success || !result.data) {
        errorMessage.value = result.error || '下载工艺失败'
        return false
      }

      processJson.value = result.data
      setPhase('install')
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '未知错误'
      return false
    } finally {
      isLoading.value = false
    }
  }

  // ==================== 安装指导方法 ====================

  /**
   * 上一步安装指导
   */
  function prevInstallStep(): void {
    if (installStep.value > 0) {
      installStep.value--
    }
  }

  /**
   * 下一步安装指导
   */
  function nextInstallStep(): void {
    if (installStep.value < totalInstallSteps.value - 1) {
      installStep.value++
    }
  }

  /**
   * 跳转到指定安装步骤
   */
  function goToInstallStep(step: number): void {
    if (step >= 0 && step < totalInstallSteps.value) {
      installStep.value = step
    }
  }

  /**
   * 开始流程图测试
   */
  function startFlowchartTest(): void {
    setPhase('test')
    isFlowchartRunning.value = false
    flowchartStartTime.value = null
    flowchartEndTime.value = null
    nodeResults.value = []
    completedNodes.value = []
    currentNodeId.value = ''
    activeFlowType.value = 'test'
    testFlowPassed.value = false
    testFlowResults.value = []
  }

  /**
   * 设备通信预检通过后，正式标记流程图开始运行。
   */
  function beginFlowchartRun(): void {
    isFlowchartRunning.value = true
    if (activeFlowType.value === 'test' || !flowchartStartTime.value) {
      flowchartStartTime.value = new Date()
    }
    flowchartEndTime.value = null
    nodeResults.value = []
    completedNodes.value = []
    currentNodeId.value = ''
  }

  // ==================== 流程图运行方法 ====================

  /**
   * 更新节点运行结果
   */
  function updateNodeResult(result: NodeRunResult): void {
    const existingIndex = nodeResults.value.findIndex(r => r.nodeId === result.nodeId)
    if (existingIndex >= 0) {
      nodeResults.value[existingIndex] = result
    } else {
      nodeResults.value.push(result)
    }

    if (result.status === 'success' || result.status === 'error') {
      if (!completedNodes.value.includes(result.nodeId)) {
        completedNodes.value.push(result.nodeId)
      }
    }

    currentNodeId.value = result.nodeId
  }

  /**
   * 测试流成功后进入循环流。测试流结果单独保留，供最终报告合并。
   */
  function advanceToCycleFlow(): void {
    testFlowResults.value = nodeResults.value.map(result => ({ ...result }))
    testFlowPassed.value = true
    activeFlowType.value = 'cycle'
    isFlowchartRunning.value = false
    nodeResults.value = []
    completedNodes.value = []
    currentNodeId.value = ''
  }

  /**
   * 流程图运行完成
   */
  function onFlowchartComplete(success: boolean): void {
    isFlowchartRunning.value = false
    flowchartEndTime.value = new Date()

    if (success) {
      setPhase('upload')
    }
  }

  /**
   * 停止流程图运行
   */
  function stopFlowchart(): void {
    isFlowchartRunning.value = false
    flowchartEndTime.value = new Date()
  }

  // ==================== 暂存和恢复方法 ====================

  /**
   * 暂存当前测试数据
   */
  async function saveTemp(): Promise<boolean> {
    if (!currentOrder.value) {
      errorMessage.value = '工单不存在'
      return false
    }

    isLoading.value = true
    errorMessage.value = ''

    try {
      const tempData: HaltHassTempData = {
        phase: phase.value,
        installStep: installStep.value,
        flowchartState: {
          activeFlowType: activeFlowType.value,
          testFlowPassed: testFlowPassed.value,
          testFlowResults: testFlowResults.value,
          currentNodeId: currentNodeId.value,
          completedNodes: completedNodes.value,
          nodeResults: nodeResults.value,
        },
        updatedAt: new Date().toISOString(),
      }

      const result = await uploadTempData(currentOrder.value.id, tempData)

      if (!result.success) {
        errorMessage.value = result.error || '暂存失败'
        return false
      }

      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '未知错误'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 恢复暂存的测试数据
   */
  async function restoreTemp(order: HaltHassOrder): Promise<boolean> {
    isLoading.value = true
    errorMessage.value = ''

    try {
      const result = await downloadTempData(order.id)

      if (!result.success || !result.data) {
        errorMessage.value = result.error || '恢复暂存数据失败'
        return false
      }

      const tempData = result.data

      const activated = await activateOrderRuntime(order)
      if (!activated) return false

      // 恢复状态
      currentOrder.value = order
      testMode.value = 'continue'
      phase.value = tempData.phase
      installStep.value = tempData.installStep

      if (tempData.flowchartState) {
        activeFlowType.value = tempData.flowchartState.activeFlowType
        testFlowPassed.value = tempData.flowchartState.testFlowPassed
        testFlowResults.value = tempData.flowchartState.testFlowResults
        currentNodeId.value = tempData.flowchartState.currentNodeId || ''
        completedNodes.value = tempData.flowchartState.completedNodes || []
        nodeResults.value = tempData.flowchartState.nodeResults || []
      }

      // 下载工艺后恢复到暂存时所在阶段。
      const savedPhase = tempData.phase
      const processLoaded = await downloadProcess()
      if (!processLoaded) return false
      phase.value = savedPhase

      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '未知错误'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 加载反馈数据（审核打回后重做）
   */
  async function loadFeedback(order: HaltHassOrder): Promise<boolean> {
    isLoading.value = true
    errorMessage.value = ''

    try {
      const result = await downloadFeedbackData(order.id)

      if (!result.success || !result.data) {
        errorMessage.value = result.error || '加载反馈数据失败'
        return false
      }

      const activated = await activateOrderRuntime(order)
      if (!activated) return false

      currentOrder.value = order
      testMode.value = 'feedback'
      // 从头开始测试
      phase.value = 'install'
      installStep.value = 0

      // 下载工艺
      await downloadProcess()

      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '未知错误'
      return false
    } finally {
      isLoading.value = false
    }
  }

  // ==================== 重置方法 ====================

  /**
   * 重置所有状态
   */
  function reset(): void {
    phase.value = 'schedule'
    testMode.value = 'normal'
    currentOrder.value = null
    processJson.value = null
    deviceStatus.value = { flojoyBackend: false, scanner: false, camera: false }
    resetExecutionState()
    isLoading.value = false
    errorMessage.value = ''
  }

  return {
    // 状态（只读）
    phase,
    testMode,
    currentOrder,
    processJson,
    deviceStatus,
    installStep,
    isFlowchartRunning,
    flowchartStartTime,
    flowchartEndTime,
    nodeResults,
    completedNodes,
    currentNodeId,
    activeFlowType,
    testFlowPassed,
    testFlowResults,
    isLoading,
    errorMessage,

    // 计算属性
    isDeviceReady,
    canStartTest,
    testDuration,
    flowchartProgress,
    totalInstallSteps,

    // 阶段控制
    setPhase,
    nextPhase,
    prevPhase,

    // 设备检测
    updateDeviceStatus,
    onDeviceCheckPass,

    // 工单和工艺
    setOrder,
    startTest,
    downloadProcess,

    // 安装指导
    prevInstallStep,
    nextInstallStep,
    goToInstallStep,
    startFlowchartTest,

    // 流程图运行
    beginFlowchartRun,
    activateCycleRuntime,
    pauseCycleRuntime,
    updateNodeResult,
    advanceToCycleFlow,
    onFlowchartComplete,
    stopFlowchart,

    // 暂存和恢复
    saveTemp,
    restoreTemp,
    loadFeedback,

    // 重置
    reset,
  }
}
