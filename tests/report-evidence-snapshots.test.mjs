import assert from 'node:assert/strict'
import test from 'node:test'
import { collectStepLists, picsToPicList } from '../src/utils/reportTemplate.ts'
test('报告缺陷和疑问证据不会被工艺表单后续修改', () => {
  const step = { id: 1, pass: 4, error: { url: ['old.png'], desc: 'old error' }, question: { url: ['question.png'], desc: 'question' } }
  const { errorList, questionList } = collectStepLists([step])
  step.error.url.push('new.png'); step.error.desc = 'changed'; step.pass = 1
  assert.deepEqual(errorList[0].error, { url: ['old.png'], desc: 'old error' })
  assert.equal(questionList[0].pass, 4)
  questionList[0].question.desc = 'report edit'
  assert.equal(step.question.desc, 'question')
})
test('报告图片列表与采集表单保存地址独立', () => {
  const input = [{ id: 1, name: 'photo', save: ['old.png'] }]
  const output = picsToPicList(input)
  input[0].save.push('new.png')
  assert.deepEqual(output[0].save, ['old.png'])
  output[0].save[0] = 'report.png'
  assert.equal(input[0].save[0], 'old.png')
})
