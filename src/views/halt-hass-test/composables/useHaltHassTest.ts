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
import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'
import {
  startOrder,
  uploadTempData,
  downloadTempData,
  downloadFeedbackData,
  downloadProcessData,
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
    const totalNodes = processJson.value?.flowchart?.nodes?.length ?? 0
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

      const result = await startOrder(currentOrder.value.id, {
        operatorId: userInfo.value!.id,
        boardSerials,
      })

      if (!result.success) {
        errorMessage.value = result.error || '开始测试失败'
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
    isFlowchartRunning.value = true
    flowchartStartTime.value = new Date()
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

      // 恢复状态
      currentOrder.value = order
      testMode.value = 'continue'
      phase.value = tempData.phase
      installStep.value = tempData.installStep

      if (tempData.flowchartState) {
        currentNodeId.value = tempData.flowchartState.currentNodeId || ''
        completedNodes.value = tempData.flowchartState.completedNodes || []
        nodeResults.value = tempData.flowchartState.nodeResults || []
      }

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
    installStep.value = 0
    isFlowchartRunning.value = false
    flowchartStartTime.value = null
    flowchartEndTime.value = null
    nodeResults.value = []
    completedNodes.value = []
    currentNodeId.value = ''
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
    updateNodeResult,
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
