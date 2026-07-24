import assert from 'node:assert/strict'
import test from 'node:test'
import { findIncompleteTargets, validateFeedbackSubmit, validateQuestionSubmit } from '../src/utils/feedbackQuestion.ts'
test('空白文字、空图片地址和未知状态都保持未完成', () => {
  for (const item of [{ pass: 42 }, { pass: '1' }, { pass: 0 },
    { pass: 2, error: { desc: '  ', url: ['a.png'] } },
    { pass: 3, question: { desc: 'question', url: ['  '] } },
    { pass: 1, warn: { desc: 'warning', url: [] } }]) {
    assert.equal(findIncompleteTargets([item]).length, 1)
    assert.equal(validateFeedbackSubmit([item]).canSubmit, false)
  }
})
test('完整证据可提交，历史单字符串图片格式继续兼容', () => {
  assert.equal(validateFeedbackSubmit([{ pass: 2, error: { desc: 'defect', url: 'one.png' } }]).canSubmit, true)
  assert.equal(validateFeedbackSubmit([{ pass: 4, error: { desc: 'defect', url: ['one.png'] }, question: { desc: 'question', url: ['two.png'] } }]).canSubmit, true)
  assert.equal(validateQuestionSubmit([{ pass: 3, question: { desc: 'question', url: ['two.png'] } }]).canSubmit, false)
})
