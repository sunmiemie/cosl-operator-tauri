import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPendingHighTempPressureReports } from '../src/views/high-temp-pressure/utils/pendingReport.ts'

const key = 'high-temp-pressure-pending-reports-v3'
const report = { version: 1, phase: 'report', selections: [{ orderId: 1 }],
  exportedCaptureDir: 'C:/reports/test', csvCount: 1, runtimeSeconds: 60,
  clientSubmitId: 'htp-test', savedAt: '2026-10-21T10:00:00Z' }

function storage(t, reports) {
  const raw = JSON.stringify(reports)
  const previous = globalThis.window
  globalThis.window = { localStorage: { getItem: k => k === key ? raw : null,
    setItem: () => { throw new Error('read only') }, removeItem: () => { throw new Error('read only') } } }
  t.mock.method(console, 'warn', () => {})
  t.after(() => { globalThis.window = previous })
}

test('只读存储和损坏条目不隐藏有效待上传报告', t => {
  storage(t, [null, {}, report, []])
  assert.deepEqual(loadPendingHighTempPressureReports(), [report])
  assert.deepEqual(loadPendingHighTempPressureReports(), [report])
})

test('恢复列表排除错误阶段、选择、路径和日期的损坏记录', t => {
  storage(t, [report, ...[{ phase: 'bad' }, { selections: [null] }, { selections: [[]] },
    { exportedCaptureDir: {} }, { clientSubmitId: true }, { savedAt: 'invalid' }]
    .map(change => ({ ...report, ...change }))])
  assert.deepEqual(loadPendingHighTempPressureReports(), [report])
})
