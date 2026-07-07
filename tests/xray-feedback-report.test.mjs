import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFeedbackTargets, parseQuestionTargets } from '../src/utils/feedbackQuestion.ts'
test('Xray 重检从报告顶层 xray 读取原始缺陷和疑问', () => {
  const error = { url: ['error.png'], desc: 'defect' }
  const question = { url: ['question.png'], desc: 'inspect' }
  const report = { json: { xray: { total: { errorList: [{ id: 1, error }], questionList: [{ id: 1, question }] } } } }
  const item = { id: 1, type: 'xray', position: 'total' }
  assert.deepEqual(parseFeedbackTargets({ feedback_json: [item] }, null, report)[0].error, error)
  assert.deepEqual(parseQuestionTargets({ question_json: [item] }, null, report)[0].question, question)
})
test('3D 正反面报告仍按原结构读取', () => {
  const error = { url: ['back.png'], desc: 'back defect' }
  const report = { json: { threeD: { eyesBak: { total: { errorList: [{ id: 2, error }] } } } } }
  assert.deepEqual(parseFeedbackTargets({ feedback_json: [{ id: 2, type: 'eyesBak', position: 'total' }] }, null, report)[0].error, error)
})
