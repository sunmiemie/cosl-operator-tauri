import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSessionAssembly as validate } from '../src/views/halt-hass-test/utils/sessionAssembly.ts'
const target = { id: 1, processId: 8, boardModelId: 101, serial: 'SN1' }
const rule = { slotCount: 2, minimumTargetBoards: 1, allowCompanionBoards: true, allowEmptySlots: true }
const slot = { slotNo: 1, slotName: 'one', role: 'target', targetBoardId: 1, allowedBoardModelIds: [101] }
const check = changes => validate({ processId: 8, rule, assignments: [slot], eligibleBoards: [target], ...changes })
test('重复、越界板位和未知角色不能通过装配校验', () => {
  assert.equal(check({}).valid, true)
  for (const item of [{ slotNo: 1, role: 'empty' }, { slotNo: 3, role: 'empty' },
    { slotNo: 2.5, role: 'empty' }, { slotNo: 2, role: 'unknown' }]) {
    assert.equal(check({ assignments: [slot, item] }).valid, false)
  }
})
test('无效工艺数量和空目标板 SN 被明确拒绝', () => {
  for (const count of [NaN, -1, 1.5]) assert.equal(check({ rule: { ...rule, slotCount: count } }).valid, false)
  assert.equal(check({ eligibleBoards: [{ ...target, serial: '   ' }] }).valid, false)
  assert.equal(check({ eligibleBoards: [{ ...target, serial: null }] }).valid, false)
})
