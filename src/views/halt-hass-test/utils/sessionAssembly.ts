import type { HaltHassAssemblyRule } from '@/views/process-halt-hass/types'
import type { HaltHassSlotAssignment, HaltHassTargetBoard } from '../types'

export interface SessionAssemblyValidationResult {
  valid: boolean
  message: string
}

export function validateSessionAssembly(params: {
  processId: number
  rule: HaltHassAssemblyRule
  assignments: HaltHassSlotAssignment[]
  eligibleBoards: HaltHassTargetBoard[]
}): SessionAssemblyValidationResult {
  const { processId, rule, assignments, eligibleBoards } = params
  if (!Number.isSafeInteger(rule.slotCount) || rule.slotCount <= 0 ||
      !Number.isSafeInteger(rule.minimumTargetBoards) || rule.minimumTargetBoards < 0 ||
      rule.minimumTargetBoards > rule.slotCount) {
    return { valid: false, message: '工艺板位数量配置无效' }
  }
  const slotNumbers = assignments.map(item => item.slotNo)
  if (slotNumbers.some(slotNo => !Number.isSafeInteger(slotNo) || slotNo < 1 || slotNo > rule.slotCount) ||
      new Set(slotNumbers).size !== slotNumbers.length ||
      assignments.some(item => !['target', 'companion', 'empty'].includes(item.role))) {
    return { valid: false, message: '板位编号重复、越界或角色无效' }
  }
  const occupied = assignments.filter(item => item.role !== 'empty')
  const targets = assignments.filter(item => item.role === 'target')
  if (targets.length < rule.minimumTargetBoards) {
    return { valid: false, message: `至少选择 ${rule.minimumTargetBoards} 块目标板` }
  }
  const targetIds = targets.map(item => item.targetBoardId).filter(Boolean)
  if (new Set(targetIds).size !== targetIds.length) {
    return { valid: false, message: '同一目标板不能重复装配' }
  }
  const serials = new Set<string>()
  for (const assignment of assignments) {
    if (assignment.required && assignment.role === 'empty') {
      return { valid: false, message: `${assignment.slotName} 为必装板位` }
    }
    if (assignment.role === 'target') {
      const target = eligibleBoards.find(item => item.id === assignment.targetBoardId)
      if (!target) return { valid: false, message: `${assignment.slotName} 尚未选择目标板` }
      if (target.processId !== processId) {
        return { valid: false, message: '跨工单目标板必须使用同一工艺版本' }
      }
      if (!assignment.allowedBoardModelIds.includes(target.boardModelId)) {
        return { valid: false, message: `${assignment.slotName} 不支持目标板型号 ${target.boardModelName}` }
      }
      if (typeof target.serial !== 'string' || !target.serial.trim()) {
        return { valid: false, message: `${assignment.slotName} 的目标板 SN 不能为空` }
      }
      const serial = target.serial.trim().toUpperCase()
      if (serials.has(serial)) return { valid: false, message: '同一场次不能重复使用相同 SN' }
      serials.add(serial)
    }
    if (assignment.role === 'companion') {
      if (!rule.allowCompanionBoards || !assignment.allowCompanion) {
        return { valid: false, message: `${assignment.slotName} 不允许陪测板` }
      }
      if (!assignment.companionSerial?.trim() || !assignment.companionBoardModelId) {
        return { valid: false, message: `${assignment.slotName} 的陪测板 SN 和型号不能为空` }
      }
      if (!assignment.allowedBoardModelIds.includes(assignment.companionBoardModelId)) {
        return { valid: false, message: `${assignment.slotName} 不支持所选陪测板型号` }
      }
      const serial = assignment.companionSerial.trim().toUpperCase()
      if (serials.has(serial)) return { valid: false, message: '同一场次不能重复使用相同 SN' }
      serials.add(serial)
    }
  }
  if (!rule.allowEmptySlots && occupied.length !== rule.slotCount) {
    return { valid: false, message: '当前工艺要求所有板位均装板' }
  }
  return {
    valid: true,
    message: `已选择 ${targets.length} 块目标板、${assignments.filter(item => item.role === 'companion').length} 块陪测板`,
  }
}

export function validateScannedSessionAssembly(params: {
  processId: number
  rule: HaltHassAssemblyRule
  assignments: HaltHassSlotAssignment[]
  eligibleBoards: HaltHassTargetBoard[]
  confirmedSerials: string[]
}): SessionAssemblyValidationResult {
  const base = validateSessionAssembly(params)
  if (!base.valid) return base

  const confirmed = new Set(
    params.confirmedSerials.map(serial => serial.trim().toUpperCase()).filter(Boolean),
  )
  for (const assignment of params.assignments) {
    let serial = ''
    if (assignment.role === 'target') {
      serial = params.eligibleBoards.find(item => item.id === assignment.targetBoardId)?.serial || ''
    } else if (assignment.role === 'companion') {
      serial = assignment.companionSerial || ''
    } else {
      continue
    }
    if (!confirmed.has(serial.trim().toUpperCase())) {
      return { valid: false, message: `${assignment.slotName} 尚未扫码确认` }
    }
  }

  const targetCount = params.assignments.filter(item => item.role === 'target').length
  const companionCount = params.assignments.filter(item => item.role === 'companion').length
  return {
    valid: true,
    message: `已扫码确认 ${targetCount} 块目标板、${companionCount} 块陪测板`,
  }
}
