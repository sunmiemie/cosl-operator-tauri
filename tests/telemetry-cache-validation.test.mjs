import assert from 'node:assert/strict'
import test from 'node:test'
import { memoryStorage } from './storage-fixture.mjs'
import { loadHaltHassPeriodicRecords as load, saveHaltHassPeriodicRecords as save, clearHaltHassPeriodicRecords as clear } from '../src/views/halt-hass-test/utils/telemetryPersistence.ts'
const record = { intervalIndex: 1, recordedAt: '2026-10-21T00:00:00Z', elapsedSeconds: 180,
  communications: { controlBoard: '异常' }, missingReasons: ['missing'], current48v: null }
test('过滤会使报告页面崩溃的损坏记录，保留缺测和异常状态', t => {
  const raw = JSON.stringify([null, {}, { ...record, communications: null }, { ...record, elapsedSeconds: -1 }, record])
  const values = memoryStorage(t, { 'halt-hass.telemetry-records.v1.7': raw })
  assert.deepEqual(load(7), [record])
  assert.equal(values.get('halt-hass.telemetry-records.v1.7'), raw)
})
test('不同场次缓存相互独立，无场次读写不产生键', t => {
  const values = memoryStorage(t)
  save(1, [record]); save(2, [record]); clear(1)
  assert.deepEqual(load(1), [])
  assert.deepEqual(load(2), [record])
  save(null, [record]); clear(undefined)
  assert.equal(values.size, 1)
})
