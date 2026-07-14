import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFeedbackTargets, parseQuestionTargets } from '../src/utils/feedbackQuestion.ts'
test('空目标和历史步骤空项不妨碍解析其余重检步骤', () => {
  const item = { id: 2, type: 'eyes', position: 'total' }
  const process = { eyes: { total: { step: [null, { id: 2, name: 'valid step', pass: 1 }] } } }
  for (const [parse, field] of [[parseFeedbackTargets, 'feedback_json'], [parseQuestionTargets, 'question_json']]) {
    const result = parse({ [field]: [null, [], 1, item] }, process)
    assert.equal(result.length, 1)
    assert.equal(result[0].stepName, 'valid step')
  }
})
test('区域和报告列表的异常形状不会引发 find 异常', () => {
  const item = { id: 2, type: 'eyes', position: 'area', areaPosition: 'general', areaId: 3 }
  const process = { eyes: { area: [null, { id: 3, general: { step: {} } }] } }
  const report = { json: { threeD: { eyes: { area: [null, { id: 3, general: { errorList: {}, warnList: [null] } }] } } } }
  assert.equal(parseFeedbackTargets({ feedback_json: [item] }, process, report)[0].stepName, '步骤 2')
})
