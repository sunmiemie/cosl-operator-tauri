import assert from 'node:assert/strict'
import test from 'node:test'
import { createBaseReportJson, trimReportJson } from '../src/utils/reportTemplate.ts'
test('Xray 报告移除正反面二维检测字段并保留射线证据', () => {
  const report = createBaseReportJson()
  report.twoDBak = 'unrelated-back-image.png'
  report.xray.total.stepList = [{ id: 1, name: 'xray', pass: 1 }]
  trimReportJson(report, 'xray')
  assert.deepEqual(Object.keys(report), ['xray'])
  assert.equal(report.xray.total.stepList.length, 1)
})
test('三维报告按背面配置裁剪，其余类型保持原有字段', () => {
  const back = createBaseReportJson(); trimReportJson(back, 'threeD', true)
  assert.ok(back.threeD.eyesBak)
  const front = createBaseReportJson(); trimReportJson(front, 'threeD', false)
  assert.equal(front.threeD.eyesBak, undefined)
  const two = createBaseReportJson(); trimReportJson(two, 'twoD')
  assert.ok('twoDBak' in two)
})
