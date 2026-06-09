import assert from 'node:assert/strict'
import test from 'node:test'
import { memoryStorage } from './storage-fixture.mjs'
import { loadPendingHaltHassReports, mergePendingHaltHassReports } from '../src/views/halt-hass-test/utils/pendingReports.ts'
const key = 'halt-hass.pending-board-reports.v1'
const report = { clientSubmitId: 'a', sessionId: 1, targetBoardId: 2, orderId: 3, reportJson: {} }
test('坏缓存条目不阻止有效报告恢复或后续合并', t => {
  const raw = JSON.stringify([null, {}, [], 1, { ...report, clientSubmitId: ' ' }, { ...report, sessionId: -1 }, report])
  const values = memoryStorage(t, { [key]: raw })
  assert.deepEqual(loadPendingHaltHassReports(), [report])
  assert.equal(values.get(key), raw)
  assert.equal(mergePendingHaltHassReports([{ ...report, clientSubmitId: 'b' }]).length, 2)
})
test('损坏 JSON 返回空队列且保留原始字节', t => {
  const values = memoryStorage(t, { [key]: '{broken' })
  assert.deepEqual(loadPendingHaltHassReports(), [])
  assert.equal(values.get(key), '{broken')
})
