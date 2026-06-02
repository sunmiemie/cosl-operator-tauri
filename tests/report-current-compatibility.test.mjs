import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeHaltHassReportCurrentsToMa as normalize } from '../src/views/halt-hass-test/utils/reportCurrentUnits.ts'
test('历史缺省曲线可转换且不修改原始报告', () => {
  const source = { chartSummary: { temperature: [] }, periodicRecords: [null, { current48v: .012, current90v: null }] }
  const result = normalize(source)
  assert.deepEqual(result.chartSummary.current48v, [])
  assert.deepEqual(result.chartSummary.current90v, [])
  assert.equal(result.periodicRecords[0].current48v, 12)
  assert.equal(source.periodicRecords[1].current48v, .012)
  assert.equal(normalize(result), result)
})
test('曲线非数值和溢出电流保持缺测而非无穷大', () => {
  const result = normalize({ chartSummary: { current48v: [null, { time: 1, value: 1e308 }, { time: 2, value: .001 }], current90v: {} } })
  assert.deepEqual(result.chartSummary.current48v, [{ time: 1, value: null }, { time: 2, value: 1 }])
  assert.deepEqual(result.chartSummary.current90v, [])
  assert.equal(normalize({ reportType: 'rectifier_regulator', currentUnit: 'A' }).currentUnit, 'A')
})
