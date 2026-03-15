import assert from 'node:assert/strict'
import test from 'node:test'

import { loadPendingHighTempPressureReports } from '../src/views/high-temp-pressure/utils/pendingReport.ts'

const oldKey = 'high-temp-pressure-pending-report-v2'
const newKey = 'high-temp-pressure-pending-reports-v3'
const report = {
  version: 1, phase: 'report', selections: [{ orderId: 1 }],
  exportedCaptureDir: 'C:/reports/test', csvCount: 1, runtimeSeconds: 60,
  clientSubmitId: 'htp-test', savedAt: '2026-10-21T10:00:00Z',
}

function setupStorage(t, { failWrite = false, failRemove = false } = {}) {
  const values = new Map([[oldKey, JSON.stringify(report)]])
  const originalWindow = globalThis.window
  globalThis.window = { localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrite && key === newKey) throw new Error('QuotaExceededError')
      values.set(key, value)
    },
    removeItem: key => {
      if (failRemove && key === oldKey) throw new Error('storage removal unavailable')
      values.delete(key)
    },
  } }
  t.mock.method(console, 'warn', () => {})
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  })
  return values
}

test('新队列成功写入后才删除旧报告', t => {
  const values = setupStorage(t)
  assert.deepEqual(loadPendingHighTempPressureReports(), [report])
  assert.equal(values.has(oldKey), false)
  assert.deepEqual(JSON.parse(values.get(newKey)), [report])
})

test('存储配额不足时保留旧报告并继续让用户恢复', t => {
  const values = setupStorage(t, { failWrite: true })
  assert.deepEqual(loadPendingHighTempPressureReports(), [report])
  assert.deepEqual(JSON.parse(values.get(oldKey)), report)
  assert.equal(values.has(newKey), false)
  assert.deepEqual(loadPendingHighTempPressureReports(), [report])
})

test('删除旧键失败时新旧报告都保留且仍可读取', t => {
  const values = setupStorage(t, { failRemove: true })
  assert.deepEqual(loadPendingHighTempPressureReports(), [report])
  assert.equal(values.has(oldKey), true)
  assert.deepEqual(JSON.parse(values.get(newKey)), [report])
})
