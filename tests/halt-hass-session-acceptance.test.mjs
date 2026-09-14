import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateScannedSessionAssembly,
  validateSessionAssembly,
} from '../src/views/halt-hass-test/utils/sessionAssembly.ts'
import {
  loadPendingHaltHassReports,
  mergePendingHaltHassReports,
  removePendingHaltHassReport,
} from '../src/views/halt-hass-test/utils/pendingReports.ts'

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
  clear() { this.values.clear() }
}
globalThis.localStorage = new MemoryStorage()

const rule = {
  slotCount: 3,
  minimumTargetBoards: 1,
  allowCompanionBoards: true,
  allowEmptySlots: true,
  slots: [],
}
const target = (id, orderId, serial, processId = 8, boardModelId = 101) => ({
  id, orderId, orderNo: `HH-${orderId}`, processId, serial,
  boardModelId, boardModelName: `MODEL-${boardModelId}`, status: 0,
  statusText: '待测试', attemptNo: 0,
})
const slot = (slotNo, role, values = {}) => ({
  slotNo, slotName: `板位 ${slotNo}`, required: slotNo === 1,
  allowCompanion: true, allowedBoardModelIds: [101], role, ...values,
})

test('同一工单可以只选择部分目标板分批测试', () => {
  const boards = [target(1, 10, 'A-001'), target(2, 10, 'A-002')]
  const result = validateSessionAssembly({
    processId: 8,
    rule,
    eligibleBoards: boards,
    assignments: [slot(1, 'target', { targetBoardId: 1 }), slot(2, 'empty'), slot(3, 'empty')],
  })
  assert.equal(result.valid, true)
})

test('同工艺目标板可以跨工单组成一个场次', () => {
  const boards = [target(1, 10, 'A-001'), target(2, 11, 'B-001')]
  const result = validateSessionAssembly({
    processId: 8,
    rule,
    eligibleBoards: boards,
    assignments: [
      slot(1, 'target', { targetBoardId: 1 }),
      slot(2, 'target', { targetBoardId: 2 }),
      slot(3, 'empty'),
    ],
  })
  assert.equal(result.valid, true)
})

test('不同工艺版本的跨工单目标板会被阻止', () => {
  const boards = [target(1, 10, 'A-001'), target(2, 11, 'B-001', 9)]
  const result = validateSessionAssembly({
    processId: 8,
    rule,
    eligibleBoards: boards,
    assignments: [
      slot(1, 'target', { targetBoardId: 1 }),
      slot(2, 'target', { targetBoardId: 2 }),
      slot(3, 'empty'),
    ],
  })
  assert.equal(result.valid, false)
  assert.match(result.message, /同一工艺版本/)
})

test('陪测板可参与场次但必须有型号和唯一 SN', () => {
  const boards = [target(1, 10, 'A-001')]
  const valid = validateSessionAssembly({
    processId: 8,
    rule,
    eligibleBoards: boards,
    assignments: [
      slot(1, 'target', { targetBoardId: 1 }),
      slot(2, 'companion', { companionSerial: 'C-001', companionBoardModelId: 101 }),
      slot(3, 'empty'),
    ],
  })
  assert.equal(valid.valid, true)
  const duplicated = validateSessionAssembly({
    processId: 8,
    rule,
    eligibleBoards: boards,
    assignments: [
      slot(1, 'target', { targetBoardId: 1 }),
      slot(2, 'companion', { companionSerial: 'A-001', companionBoardModelId: 101 }),
      slot(3, 'empty'),
    ],
  })
  assert.equal(duplicated.valid, false)
})

test('板位装配正确但未逐板扫码时不能开始测试', () => {
  const boards = [target(1, 10, 'A-001'), target(2, 11, 'B-001')]
  const assignments = [
    slot(1, 'target', { targetBoardId: 1 }),
    slot(2, 'target', { targetBoardId: 2 }),
    slot(3, 'empty'),
  ]
  const pending = validateScannedSessionAssembly({
    processId: 8,
    rule,
    eligibleBoards: boards,
    assignments,
    confirmedSerials: ['A-001'],
  })
  assert.equal(pending.valid, false)
  assert.match(pending.message, /板位 2 尚未扫码确认/)

  const completed = validateScannedSessionAssembly({
    processId: 8,
    rule,
    eligibleBoards: boards,
    assignments,
    confirmedSerials: ['A-001', 'B-001'],
  })
  assert.equal(completed.valid, true)
})

test('陪测板不校验工单归属，但参与本次测试时仍需扫码确认', () => {
  const boards = [target(1, 10, 'A-001')]
  const assignments = [
    slot(1, 'target', { targetBoardId: 1 }),
    slot(2, 'companion', { companionSerial: 'COMP-001', companionBoardModelId: 101 }),
    slot(3, 'empty'),
  ]
  const result = validateScannedSessionAssembly({
    processId: 8,
    rule,
    eligibleBoards: boards,
    assignments,
    confirmedSerials: ['A-001', 'COMP-001'],
  })
  assert.equal(result.valid, true)
})

test('四板工艺可不配置存储板，且每个板位按型号独立校验', () => {
  const boards = [
    target(1, 10, 'IFB-001', 8, 201),
    target(2, 10, 'CTRL-001', 8, 202),
    target(3, 10, 'DRIVE-001', 8, 203),
    target(4, 10, 'CAP-001', 8, 204),
    target(5, 11, 'IFB-002', 8, 201),
  ]
  const fourBoardRule = {
    slotCount: 4,
    minimumTargetBoards: 1,
    allowCompanionBoards: true,
    allowEmptySlots: false,
    slots: [],
  }
  const assignments = [
    slot(1, 'target', { targetBoardId: 1, allowedBoardModelIds: [201] }),
    slot(2, 'target', { targetBoardId: 2, allowedBoardModelIds: [202] }),
    slot(3, 'target', { targetBoardId: 3, allowedBoardModelIds: [203] }),
    slot(4, 'target', { targetBoardId: 4, allowedBoardModelIds: [204] }),
  ]

  assert.equal(validateSessionAssembly({
    processId: 8,
    rule: fourBoardRule,
    eligibleBoards: boards,
    assignments,
  }).valid, true)

  const duplicatedInterfaceBoard = [
    assignments[0],
    slot(2, 'target', { targetBoardId: 5, allowedBoardModelIds: [202] }),
    assignments[2],
    assignments[3],
  ]
  const invalid = validateSessionAssembly({
    processId: 8,
    rule: fourBoardRule,
    eligibleBoards: boards,
    assignments: duplicatedInterfaceBoard,
  })
  assert.equal(invalid.valid, false)
})

test('重复型号通过多个工艺板位表达，不按型号全局去重', () => {
  const boards = [
    target(1, 10, 'DRIVE-001', 8, 203),
    target(2, 11, 'DRIVE-002', 8, 203),
  ]
  const repeatedModelRule = {
    slotCount: 2,
    minimumTargetBoards: 1,
    allowCompanionBoards: true,
    allowEmptySlots: false,
    slots: [],
  }
  const result = validateSessionAssembly({
    processId: 8,
    rule: repeatedModelRule,
    eligibleBoards: boards,
    assignments: [
      slot(1, 'target', { targetBoardId: 1, allowedBoardModelIds: [203] }),
      slot(2, 'target', { targetBoardId: 2, allowedBoardModelIds: [203] }),
    ],
  })
  assert.equal(result.valid, true)
})

test('整流稳压六板和七板装配均可按独立板位完成校验', () => {
  for (const regulator48Count of [2, 3]) {
    const modelIds = [301, 302, 303, 303, ...Array(regulator48Count).fill(304)]
    const boards = modelIds.map((boardModelId, index) => (
      target(index + 1, 20 + index, `RECT-${regulator48Count}-${index + 1}`, 18, boardModelId)
    ))
    const assignments = boards.map((board, index) => slot(index + 1, 'target', {
      targetBoardId: board.id,
      allowedBoardModelIds: [modelIds[index]],
      required: true,
    }))
    const rectifierRule = {
      slotCount: modelIds.length,
      minimumTargetBoards: 1,
      allowCompanionBoards: true,
      allowEmptySlots: false,
      slots: [],
    }

    assert.equal(validateSessionAssembly({
      processId: 18,
      rule: rectifierRule,
      eligibleBoards: boards,
      assignments,
    }).valid, true)
  }
})

test('断网上传队列按幂等号覆盖并只删除服务端已确认项', () => {
  localStorage.clear()
  const base = {
    sessionId: 9, targetBoardId: 1, orderId: 10, result: 1, remark: '',
    reportJson: {}, createdAt: new Date().toISOString(),
  }
  mergePendingHaltHassReports([
    { ...base, clientSubmitId: 'submit-1' },
    { ...base, targetBoardId: 2, clientSubmitId: 'submit-2' },
  ])
  mergePendingHaltHassReports([{ ...base, remark: 'retry', clientSubmitId: 'submit-1' }])
  assert.equal(loadPendingHaltHassReports().length, 2)
  assert.equal(loadPendingHaltHassReports().find(item => item.clientSubmitId === 'submit-1').remark, 'retry')
  removePendingHaltHassReport('submit-1')
  assert.deepEqual(loadPendingHaltHassReports().map(item => item.clientSubmitId), ['submit-2'])
})
