/**
 * HALT-HASS 场次板卡选择。
 * 目标板来自服务端工单，可跨同一产品和本次所选工艺适用范围选择；陪测板不生成报告。
 */
import { computed, ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'
import type {
  HaltHassOrder,
  HaltHassSessionBoardInput,
  HaltHassSlotAssignment,
  HaltHassTargetBoard,
  HaltHassTestSession,
  ScannedBoard,
} from '@/views/halt-hass-test/types'
import { createHaltHassSession, listEligibleSessionBoards } from '@/services/halt-hass-order'
import { validateScannedSessionAssembly } from '../utils/sessionAssembly'

export type ScanPhase = 'idle' | 'loading' | 'selecting' | 'complete'

function targetFitsSlot(target: HaltHassTargetBoard, slot: HaltHassSlotAssignment): boolean {
  return slot.allowedBoardModelIds.includes(target.boardModelId)
}

function normalizeSerial(serial?: string): string {
  return String(serial || '').trim().toUpperCase()
}

export function useMultiBoardScan() {
  const phase = ref<ScanPhase>('idle')
  const currentOrder = ref<HaltHassOrder | null>(null)
  const allEligibleBoards = ref<HaltHassTargetBoard[]>([])
  const selectedOrderIds = ref<number[]>([])
  const assignments = ref<HaltHassSlotAssignment[]>([])
  const currentSession = ref<HaltHassTestSession | null>(null)
  const clientSessionId = ref('')
  const lastScanError = ref('')
  const isProcessing = ref(false)
  const processSnapshot = ref<HaltHassProcessJson | null>(null)
  const confirmedSerials = ref<string[]>([])

  const eligibleBoards = computed(() => allEligibleBoards.value.filter(
    board => selectedOrderIds.value.includes(board.orderId),
  ))
  const availableOrders = computed(() => {
    const grouped = new Map<number, { id: number; orderNo: string; boardCount: number }>()
    for (const board of allEligibleBoards.value) {
      const current = grouped.get(board.orderId)
      if (current) current.boardCount += 1
      else grouped.set(board.orderId, { id: board.orderId, orderNo: board.orderNo, boardCount: 1 })
    }
    return Array.from(grouped.values())
  })

  const selectedTargetIds = computed(() => new Set(
    assignments.value
      .filter(item => item.role === 'target' && item.targetBoardId)
      .map(item => Number(item.targetBoardId)),
  ))
  const targetCount = computed(() => selectedTargetIds.value.size)
  const companionCount = computed(() => assignments.value.filter(item => item.role === 'companion').length)
  const requiredBoardCount = computed(() => processSnapshot.value?.metadata.assemblyRule.minimumTargetBoards ?? 1)
  const scannedCount = computed(() => confirmedSerials.value.length)
  const remainingCount = computed(() => Math.max(0, requiredBoardCount.value - scannedCount.value))

  const validation = computed(() => {
    const process = processSnapshot.value
    if (!process) return { valid: false, message: '工艺装配规则尚未加载' }
    return validateScannedSessionAssembly({
      processId: currentOrder.value?.process?.id || 0,
      rule: process.metadata.assemblyRule,
      assignments: assignments.value,
      eligibleBoards: eligibleBoards.value,
      confirmedSerials: confirmedSerials.value,
    })
  })

  const isComplete = computed(() => validation.value.valid)
  const progress = computed(() => {
    const slotCount = assignments.value.length
    if (!slotCount) return 0
    return Math.round(assignments.value.filter(item => item.role !== 'empty').length / slotCount * 100)
  })

  const scannedBoards = computed<ScannedBoard[]>(() => assignments.value.flatMap((assignment) => {
    if (assignment.role === 'target') {
      const target = eligibleBoards.value.find(item => item.id === assignment.targetBoardId)
      if (!target || !confirmedSerials.value.includes(normalizeSerial(target.serial))) return []
      return [{
        serial: target.serial,
        targetBoardId: target.id,
        orderId: target.orderId,
        orderNo: target.orderNo,
        role: 'target' as const,
        slotNo: assignment.slotNo,
        boardModelId: target.boardModelId,
        boardModelName: target.boardModelName,
        boardModelCode: target.boardModelCode,
        scannedAt: new Date(),
      } as ScannedBoard]
    }
    if (
      assignment.role === 'companion'
      && assignment.companionSerial
      && assignment.companionBoardModelId
      && confirmedSerials.value.includes(normalizeSerial(assignment.companionSerial))
    ) {
      const model = processSnapshot.value?.metadata.applicableBoardModels
        .find(item => item.id === assignment.companionBoardModelId)
      return [{
        serial: assignment.companionSerial.trim(),
        role: 'companion' as const,
        slotNo: assignment.slotNo,
        boardModelId: assignment.companionBoardModelId,
        boardModelName: model?.name || '',
        boardModelCode: model?.code,
        scannedAt: new Date(),
      } as ScannedBoard]
    }
    return []
  }))

  async function initializeSelection(order: HaltHassOrder, process: HaltHassProcessJson): Promise<boolean> {
    if (!order.process?.id) {
      lastScanError.value = '请先选择本次执行的工艺版本'
      return false
    }
    currentOrder.value = order
    selectedOrderIds.value = [order.id]
    processSnapshot.value = process
    currentSession.value = null
    clientSessionId.value = uuidv4()
    lastScanError.value = ''
    confirmedSerials.value = []
    isProcessing.value = true
    phase.value = 'loading'
    assignments.value = process.metadata.assemblyRule.slots.map(slot => ({
      slotNo: slot.slotNo,
      slotName: slot.name || `板位 ${slot.slotNo}`,
      required: slot.required,
      allowCompanion: slot.allowCompanion,
      allowedBoardModelIds: [...slot.allowedBoardModelIds],
      role: 'empty',
    }))

    const result = await listEligibleSessionBoards({ processId: order.process.id })
    if (!result.success || !result.data) {
      lastScanError.value = result.error || '获取可测试目标板失败'
      phase.value = 'idle'
      isProcessing.value = false
      return false
    }
    allEligibleBoards.value = result.data

    phase.value = validation.value.valid ? 'complete' : 'selecting'
    isProcessing.value = false
    return true
  }

  function updateAssignment(slotNo: number, patch: Partial<HaltHassSlotAssignment>): void {
    const current = assignments.value.find(item => item.slotNo === slotNo)
    const previousSerial = getAssignmentSerial(current)
    assignments.value = assignments.value.map(item => item.slotNo === slotNo ? { ...item, ...patch } : item)
    const updated = assignments.value.find(item => item.slotNo === slotNo)
    const nextSerial = getAssignmentSerial(updated)
    if (previousSerial && previousSerial !== nextSerial) {
      unconfirmSerial(previousSerial)
    }
    phase.value = validation.value.valid ? 'complete' : 'selecting'
  }

  function getAssignmentSerial(assignment?: HaltHassSlotAssignment): string {
    if (!assignment) return ''
    if (assignment.role === 'target') {
      return normalizeSerial(eligibleBoards.value.find(item => item.id === assignment.targetBoardId)?.serial)
    }
    if (assignment.role === 'companion') return normalizeSerial(assignment.companionSerial)
    return ''
  }

  function confirmSerial(serial: string): void {
    const normalized = normalizeSerial(serial)
    if (normalized && !confirmedSerials.value.includes(normalized)) {
      confirmedSerials.value = [...confirmedSerials.value, normalized]
    }
  }

  function unconfirmSerial(serial: string): void {
    const normalized = normalizeSerial(serial)
    confirmedSerials.value = confirmedSerials.value.filter(item => item !== normalized)
  }

  function setRole(slotNo: number, role: HaltHassSlotAssignment['role']): void {
    updateAssignment(slotNo, {
      role,
      targetBoardId: undefined,
      companionSerial: '',
      companionBoardModelId: undefined,
    })
  }

  function setSelectedOrders(orderIds: number[]): void {
    const nextIds = Array.from(new Set(orderIds.map(Number).filter(Boolean)))
    selectedOrderIds.value = nextIds
    const allowedTargetIds = new Set(
      allEligibleBoards.value.filter(board => nextIds.includes(board.orderId)).map(board => board.id),
    )
    for (const assignment of assignments.value) {
      if (assignment.role === 'target' && assignment.targetBoardId && !allowedTargetIds.has(assignment.targetBoardId)) {
        unconfirmSerial(allEligibleBoards.value.find(board => board.id === assignment.targetBoardId)?.serial || '')
        setRole(assignment.slotNo, 'empty')
      }
    }
    phase.value = validation.value.valid ? 'complete' : 'selecting'
  }

  function toggleSelectedOrder(orderId: number, selected: boolean): void {
    const next = new Set(selectedOrderIds.value)
    if (selected) next.add(orderId)
    else next.delete(orderId)
    setSelectedOrders(Array.from(next))
  }

  function getTargetsForSlot(slot: HaltHassSlotAssignment): HaltHassTargetBoard[] {
    return eligibleBoards.value.filter(target => (
      targetFitsSlot(target, slot)
      && (!selectedTargetIds.value.has(target.id) || target.id === slot.targetBoardId)
    ))
  }

  function buildSessionBoardInputs(): HaltHassSessionBoardInput[] {
    return assignments.value.flatMap((item): HaltHassSessionBoardInput[] => {
      if (item.role === 'target' && item.targetBoardId) {
        return [{ role: 'target', slotNo: item.slotNo, targetBoardId: item.targetBoardId }]
      }
      if (item.role === 'companion' && item.companionSerial && item.companionBoardModelId) {
        return [{ role: 'companion', slotNo: item.slotNo, serial: item.companionSerial.trim(), boardModelId: item.companionBoardModelId }]
      }
      return []
    })
  }

  async function createSession(operatorId?: number): Promise<HaltHassTestSession | null> {
    if (!currentOrder.value?.process?.id || !processSnapshot.value) {
      lastScanError.value = '工单或工艺数据不存在'
      return null
    }
    if (!validation.value.valid) {
      lastScanError.value = validation.value.message
      return null
    }
    if (currentSession.value) return currentSession.value

    isProcessing.value = true
    const result = await createHaltHassSession({
      clientSessionId: clientSessionId.value,
      processId: currentOrder.value.process.id,
      orderIds: selectedOrderIds.value,
      operatorId,
      boards: buildSessionBoardInputs(),
    })
    isProcessing.value = false
    if (!result.success || !result.data) {
      lastScanError.value = result.error || '创建测试场次失败'
      return null
    }
    currentSession.value = result.data
    return result.data
  }

  function restoreSessionSelection(
    order: HaltHassOrder,
    process: HaltHassProcessJson,
    session: HaltHassTestSession,
  ): void {
    currentOrder.value = order
    processSnapshot.value = process
    currentSession.value = session
    clientSessionId.value = session.clientSessionId
    allEligibleBoards.value = session.boards
      .filter(item => item.role === 'target' && item.targetBoardId && item.orderId)
      .map(item => ({
        id: Number(item.targetBoardId),
        orderId: Number(item.orderId),
        orderNo: order.id === item.orderId ? order.orderNo : '',
        processId: session.processId,
        processName: order.process?.name || '',
        serial: item.serial,
        boardModelId: item.boardModelId,
        boardModelName: item.boardModelName,
        boardModelCode: item.boardModelCode,
        status: 1,
        statusText: item.statusText,
        attemptNo: 0,
      }))
    selectedOrderIds.value = Array.from(new Set(
      session.boards.filter(item => item.role === 'target' && item.orderId).map(item => Number(item.orderId)),
    ))
    assignments.value = process.metadata.assemblyRule.slots.map((slot) => {
      const participation = session.boards.find(item => item.slotNo === slot.slotNo)
      const base: HaltHassSlotAssignment = {
        slotNo: slot.slotNo,
        slotName: slot.name || `板位 ${slot.slotNo}`,
        required: slot.required,
        allowCompanion: slot.allowCompanion,
        allowedBoardModelIds: [...slot.allowedBoardModelIds],
        role: participation?.role || 'empty',
      }
      if (participation?.role === 'target') base.targetBoardId = Number(participation.targetBoardId)
      if (participation?.role === 'companion') {
        base.companionSerial = participation.serial
        base.companionBoardModelId = participation.boardModelId
      }
      return base
    })
    confirmedSerials.value = session.boards.map(item => normalizeSerial(item.serial)).filter(Boolean)
    phase.value = 'complete'
    lastScanError.value = ''
  }

  async function handleScan(serial: string): Promise<{ success: boolean; message: string; isComplete?: boolean }> {
    const normalized = normalizeSerial(serial)
    if (!normalized) return { success: false, message: '序列号为空' }
    if (confirmedSerials.value.includes(normalized)) {
      return { success: false, message: '该电路板已扫码确认' }
    }

    const targetMatches = eligibleBoards.value.filter(item => normalizeSerial(item.serial) === normalized)
    const assignedTargetSlot = assignments.value.find(item => (
      item.role === 'target'
      && targetMatches.some(target => target.id === item.targetBoardId)
    ))
    if (assignedTargetSlot) {
      confirmSerial(normalized)
      phase.value = validation.value.valid ? 'complete' : 'selecting'
      return {
        success: true,
        message: `${serial.trim()} 已扫码确认（${assignedTargetSlot.slotName}）`,
        isComplete: validation.value.valid,
      }
    }

    const target = targetMatches.find(item => item.orderId === currentOrder.value?.id)
      || targetMatches.find(item => !selectedTargetIds.value.has(item.id))
    if (target) {
      const slot = assignments.value.find(item => item.role === 'empty' && targetFitsSlot(target, item))
      if (!slot) {
        return {
          success: false,
          message: '没有可放置该型号的空闲板位：该型号所需数量已满足，或工艺未配置对应板位',
        }
      }
      updateAssignment(slot.slotNo, { role: 'target', targetBoardId: target.id })
      confirmSerial(normalized)
      phase.value = validation.value.valid ? 'complete' : 'selecting'
      return {
        success: true,
        message: `${target.serial} 已扫码确认并放入 ${slot.slotName}`,
        isComplete: validation.value.valid,
      }
    }

    const companionSlot = assignments.value.find(item => (
      item.role === 'companion' && normalizeSerial(item.companionSerial) === normalized
    ))
    if (companionSlot) {
      confirmSerial(normalized)
      phase.value = validation.value.valid ? 'complete' : 'selecting'
      return {
        success: true,
        message: `${serial.trim()} 已扫码确认为陪测板（${companionSlot.slotName}）`,
        isComplete: validation.value.valid,
      }
    }

    const pendingCompanionSlot = assignments.value.find(item => (
      item.role === 'companion' && item.companionBoardModelId && !normalizeSerial(item.companionSerial)
    ))
    if (pendingCompanionSlot) {
      updateAssignment(pendingCompanionSlot.slotNo, { companionSerial: serial.trim() })
      confirmSerial(normalized)
      phase.value = validation.value.valid ? 'complete' : 'selecting'
      return {
        success: true,
        message: `${serial.trim()} 已记录为陪测板（${pendingCompanionSlot.slotName}）`,
        isComplete: validation.value.valid,
      }
    }

    return { success: false, message: '该 SN 不属于本次勾选工单；如为陪测板，请先选择陪测板位和型号后再扫描' }
  }

  function removeScannedBoard(serial: string): void {
    const normalized = normalizeSerial(serial)
    const assignment = assignments.value.find((item) => {
      if (item.role === 'target') {
        return normalizeSerial(eligibleBoards.value.find(target => target.id === item.targetBoardId)?.serial) === normalized
      }
      return item.companionSerial?.trim().toUpperCase() === normalized
    })
    if (assignment) setRole(assignment.slotNo, 'empty')
  }

  function reset(): void {
    phase.value = 'idle'
    currentOrder.value = null
    allEligibleBoards.value = []
    selectedOrderIds.value = []
    assignments.value = []
    currentSession.value = null
    clientSessionId.value = ''
    lastScanError.value = ''
    isProcessing.value = false
    processSnapshot.value = null
    confirmedSerials.value = []
  }

  function setOrder(order: HaltHassOrder): void {
    currentOrder.value = order
  }

  function getAllSerials(): string[] {
    return scannedBoards.value.map(board => board.serial)
  }

  return {
    phase, currentOrder, eligibleBoards, allEligibleBoards, availableOrders, selectedOrderIds,
    assignments, currentSession, clientSessionId, confirmedSerials,
    scannedBoards, lastScanError, isProcessing, requiredBoardCount, scannedCount,
    remainingCount, targetCount, companionCount, isComplete, progress, validation,
    initializeSelection, updateAssignment, setRole, setSelectedOrders, toggleSelectedOrder,
    getTargetsForSlot, createSession, restoreSessionSelection,
    handleScan, removeScannedBoard, reset, setOrder, getAllSerials,
  }
}
