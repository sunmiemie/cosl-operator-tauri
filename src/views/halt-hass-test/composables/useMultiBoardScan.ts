/**
 * 多板扫码逻辑
 * 处理 HALT-HASS 测试中的多块电路板扫码流程
 */
import { ref, computed } from 'vue'
import type { HaltHassOrder, ScannedBoard } from '@/views/halt-hass-test/types'
import {
  getOrderBySerial,
  validateSerialBelongsToGroup,
  isSerialAlreadyScanned,
  isAllBoardsScanned,
} from '@/services/halt-hass-order'

export type ScanPhase = 'idle' | 'first_scan' | 'scanning' | 'complete'

export function useMultiBoardScan() {
  // 状态
  const phase = ref<ScanPhase>('idle')
  const currentOrder = ref<HaltHassOrder | null>(null)
  const scannedBoards = ref<ScannedBoard[]>([])
  const lastScanError = ref<string>('')
  const isProcessing = ref(false)

  // 计算属性
  const requiredBoardCount = computed(() => currentOrder.value?.boardCount ?? 0)
  const scannedCount = computed(() => scannedBoards.value.length)
  const remainingCount = computed(() => Math.max(0, requiredBoardCount.value - scannedCount.value))
  const isComplete = computed(() => isAllBoardsScanned(scannedBoards.value, requiredBoardCount.value))
  const progress = computed(() => {
    if (requiredBoardCount.value === 0) return 0
    return Math.round((scannedCount.value / requiredBoardCount.value) * 100)
  })

  /**
   * 处理扫码数据
   * 首次扫码调用 API 查询工单，后续扫码本地验证
   */
  async function handleScan(serial: string): Promise<{
    success: boolean
    message: string
    isComplete?: boolean
  }> {
    if (isProcessing.value) {
      return { success: false, message: '正在处理中，请稍候' }
    }

    isProcessing.value = true
    lastScanError.value = ''

    try {
      const trimmedSerial = serial.trim()
      if (!trimmedSerial) {
        return { success: false, message: '序列号为空' }
      }

      // 首次扫码：调用 API 查询工单
      if (phase.value === 'idle' || phase.value === 'first_scan') {
        phase.value = 'first_scan'
        return await handleFirstScan(trimmedSerial)
      }

      // 后续扫码：本地验证
      return handleSubsequentScan(trimmedSerial)
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * 处理首次扫码
   */
  async function handleFirstScan(serial: string): Promise<{
    success: boolean
    message: string
    isComplete?: boolean
  }> {
    // 调用 API 查询工单
    const result = await getOrderBySerial(serial)

    if (!result.success || !result.data || result.data.length === 0) {
      lastScanError.value = result.error || '未找到相关工单'
      phase.value = 'idle'
      return { success: false, message: lastScanError.value }
    }

    // 假设返回第一个匹配的工单
    const order = result.data[0]
    currentOrder.value = order

    // 添加第一块板
    const newBoard: ScannedBoard = {
      serial,
      scannedAt: new Date(),
    }

    // 尝试匹配型号
    const validation = validateSerialBelongsToGroup(serial, order)
    if (validation.boardModel) {
      newBoard.boardModelId = validation.boardModel.id
      newBoard.boardModelName = validation.boardModel.name
    }

    scannedBoards.value = [newBoard]

    // 检查是否只需要一块板
    if (order.boardCount === 1) {
      phase.value = 'complete'
      return {
        success: true,
        message: `工单 ${order.orderNo} 已匹配，扫码完成`,
        isComplete: true,
      }
    }

    phase.value = 'scanning'
    return {
      success: true,
      message: `工单 ${order.orderNo} 已匹配，还需扫描 ${order.boardCount - 1} 块电路板`,
      isComplete: false,
    }
  }

  /**
   * 处理后续扫码（本地验证）
   */
  function handleSubsequentScan(serial: string): {
    success: boolean
    message: string
    isComplete?: boolean
  } {
    if (!currentOrder.value) {
      lastScanError.value = '工单数据丢失，请重新扫码'
      reset()
      return { success: false, message: lastScanError.value }
    }

    // 检查是否已扫描
    if (isSerialAlreadyScanned(serial, scannedBoards.value)) {
      lastScanError.value = '该电路板已扫描'
      return { success: false, message: lastScanError.value }
    }

    // 验证序列号是否属于该电路板组
    const validation = validateSerialBelongsToGroup(serial, currentOrder.value)
    if (!validation.valid) {
      lastScanError.value = '该序列号不属于当前电路板组'
      return { success: false, message: lastScanError.value }
    }

    // 添加扫描记录
    const newBoard: ScannedBoard = {
      serial,
      scannedAt: new Date(),
    }

    if (validation.boardModel) {
      newBoard.boardModelId = validation.boardModel.id
      newBoard.boardModelName = validation.boardModel.name
    }

    scannedBoards.value = [...scannedBoards.value, newBoard]

    // 检查是否完成
    if (isAllBoardsScanned(scannedBoards.value, currentOrder.value.boardCount)) {
      phase.value = 'complete'
      return {
        success: true,
        message: '所有电路板扫描完成',
        isComplete: true,
      }
    }

    return {
      success: true,
      message: `扫描成功，还需扫描 ${remainingCount.value} 块电路板`,
      isComplete: false,
    }
  }

  /**
   * 移除已扫描的电路板
   */
  function removeScannedBoard(serial: string): void {
    scannedBoards.value = scannedBoards.value.filter(
      board => board.serial.toUpperCase() !== serial.toUpperCase()
    )

    // 如果移除后不再完成，更新状态
    if (phase.value === 'complete' && scannedBoards.value.length > 0) {
      phase.value = 'scanning'
    }
  }

  /**
   * 重置扫码流程
   */
  function reset(): void {
    phase.value = 'idle'
    currentOrder.value = null
    scannedBoards.value = []
    lastScanError.value = ''
    isProcessing.value = false
  }

  /**
   * 设置工单（用于继续测试/重做测试场景）
   */
  function setOrder(order: HaltHassOrder, boards?: ScannedBoard[]): void {
    currentOrder.value = order
    scannedBoards.value = boards || order.scannedBoards || []

    if (isAllBoardsScanned(scannedBoards.value, order.boardCount)) {
      phase.value = 'complete'
    } else if (scannedBoards.value.length > 0) {
      phase.value = 'scanning'
    } else {
      phase.value = 'first_scan'
    }
  }

  /**
   * 获取所有已扫描的序列号
   */
  function getAllSerials(): string[] {
    return scannedBoards.value.map(board => board.serial)
  }

  return {
    // 状态（只读）
    phase,
    currentOrder,
    scannedBoards,
    lastScanError,
    isProcessing,

    // 计算属性
    requiredBoardCount,
    scannedCount,
    remainingCount,
    isComplete,
    progress,

    // 方法
    handleScan,
    removeScannedBoard,
    reset,
    setOrder,
    getAllSerials,
  }
}
