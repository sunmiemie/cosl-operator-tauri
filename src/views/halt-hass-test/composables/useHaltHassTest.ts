/**
 * HALT-HASS 测试流程管理
 * 管理完整的测试流程阶段和状态
 */
import { ref, computed } from 'vue'
import type {
  PagePhase,
  HaltHassOrder,
  HaltHassTestSession,
  DeviceStatus,
  NodeRunResult,
} from '@/views/halt-hass-test/types'
import type {
  HaltHassFlowType,
  HaltHassProcessJson,
} from '@/views/process-halt-hass/types'
import {
  startHaltHassSession,
  downloadProcessData,
} from '@/services/halt-hass-order'
import { useAuth } from '@/composables/useAuth'

export function useHaltHassTest() {
  const { userInfo } = useAuth()

  // ==================== 核心状态 ====================

  // 当前阶段
  const phase = ref<PagePhase>('schedule')

  // 当前工单
  const currentOrder = ref<HaltHassOrder | null>(null)

  // 当前测试场次。工单只是排程入口，实际执行以场次及其板卡为准。
  const currentSession = ref<HaltHassTestSession | null>(null)

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

  function setSession(session: HaltHassTestSession | null): void {
    currentSession.value = session
  }

  function setProcess(process: HaltHassProcessJson | null): void {
    processJson.value = process
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

  function restoreLocalExecution(snapshot: {
    phase: PagePhase
    installStep: number
    activeFlowType: HaltHassFlowType
    testFlowPassed: boolean
    testFlowResults: NodeRunResult[]
    nodeResults: NodeRunResult[]
    completedNodes: string[]
    currentNodeId: string
    flowchartStartTime?: string | null
  }): void {
    phase.value = snapshot.phase
    installStep.value = snapshot.installStep
    activeFlowType.value = snapshot.activeFlowType
    testFlowPassed.value = snapshot.testFlowPassed
    testFlowResults.value = snapshot.testFlowResults || []
    nodeResults.value = snapshot.nodeResults || []
    completedNodes.value = snapshot.completedNodes || []
    currentNodeId.value = snapshot.currentNodeId || ''
    flowchartStartTime.value = snapshot.flowchartStartTime
      ? new Date(snapshot.flowchartStartTime)
      : null
    // 客户端重启后不能假定 Flojoy worker 仍由当前页面控制，需人工重新运行。
    isFlowchartRunning.value = false
  }

  /**
   * 开始测试（调用 API）
   */
  async function startTest(session: HaltHassTestSession): Promise<boolean> {
    if (!currentOrder.value?.process?.id) {
      errorMessage.value = '请先选择本次执行的工艺版本'
      return false
    }

    if (!userInfo.value) {
      errorMessage.value = '用户信息不存在'
      return false
    }

    isLoading.value = true
    errorMessage.value = ''

    try {
      currentSession.value = session
      const result = await startHaltHassSession(session.id, {
        flojoyBackend: deviceStatus.value.flojoyBackend,
        scanner: deviceStatus.value.scanner,
      })
      if (!result.success || !result.data) {
      errorMessage.value = result.error || '开始测试失败'
        return false
      }
      currentSession.value = result.data
      setPhase('install')
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
  async function downloadProcess(advanceToInstall = true): Promise<boolean> {
    const processId = currentOrder.value?.process?.id
    if (!processId) {
      errorMessage.value = '请先选择本次执行的工艺版本'
      return false
    }

    isLoading.value = true
    errorMessage.value = ''

    try {
      const result = await downloadProcessData(processId)

      if (!result.success || !result.data) {
        errorMessage.value = result.error || '下载工艺失败'
        return false
      }

      processJson.value = result.data
      if (advanceToInstall) setPhase('install')
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

    // 节点结果只负责记录完成状态；当前执行节点由 Flojoy RUNNING_NODE 驱动，
    // 避免完成消息把页面上的“正在执行”回退到上一节点。
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

  // ==================== 重置方法 ====================

  /**
   * 重置所有状态
   */
  function reset(): void {
    phase.value = 'schedule'
    currentOrder.value = null
    currentSession.value = null
    processJson.value = null
    deviceStatus.value = { flojoyBackend: false, scanner: false, camera: false }
    resetExecutionState()
    isLoading.value = false
    errorMessage.value = ''
  }

  return {
    // 状态（只读）
    phase,
    currentOrder,
    currentSession,
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
    setSession,
    setProcess,
    startTest,
    downloadProcess,

    // 安装指导
    prevInstallStep,
    nextInstallStep,
    goToInstallStep,
    startFlowchartTest,

    // 流程图运行
    beginFlowchartRun,
    updateNodeResult,
    advanceToCycleFlow,
    onFlowchartComplete,
    stopFlowchart,
    restoreLocalExecution,

    // 重置
    reset,
  }
}
