import assert from 'node:assert/strict'
import test from 'node:test'

import { parseTempTargetIds } from '../src/utils/feedbackQuestion.ts'

test('临时重检兼容数字和对象编号，保持顺序并去重', () => {
  assert.deepEqual(parseTempTargetIds([0, 3, { id: ' 002 ' }, { id: 3 }, { id: '0' }, 4], 'feedback'), [0, 3, 2, 4])
})

test('损坏编号不会截断成另一个有效步骤', () => {
  const invalid = [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1,
    { id: '12abc' }, { id: '1.5' }, { id: '1e3' }, { id: '-2' },
    { id: '0x10' }, { id: '' }, { id: '   ' }, { id: null }, { id: true },
    { id: '9007199254740992' }, null, [], {}, '12']
  assert.deepEqual(parseTempTargetIds([...invalid, { id: 12 }], 'feedback'), [12])
})

test('反馈与疑问包装对象只读取对应模式的编号列表', () => {
  const wrapped = { feedback_json: [{ id: '3' }], question_json: [7, { id: 7 }, { id: '8' }] }
  assert.deepEqual(parseTempTargetIds(wrapped, 'feedback'), [3])
  assert.deepEqual(parseTempTargetIds(wrapped, 'question'), [7, 8])
  assert.deepEqual(parseTempTargetIds({ question_json: {} }, 'question'), [])
  assert.deepEqual(parseTempTargetIds(null, 'feedback'), [])
})
