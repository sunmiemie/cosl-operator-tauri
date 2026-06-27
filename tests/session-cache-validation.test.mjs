import assert from 'node:assert/strict'
import test from 'node:test'
import { memoryStorage } from './storage-fixture.mjs'
import { loadHaltHassLocalSession as load } from '../src/views/halt-hass-test/utils/sessionState.ts'
const key = 'halt-hass.active-session.v1'
const state = { order: {}, session: { clientSessionId: 'session-1' }, processJson: {}, phase: 'upload',
  installStep: 0, activeFlowType: 'test', testFlowPassed: false, testFlowResults: [], nodeResults: [], completedNodes: [], currentNodeId: '' }
test('完整本地场次保持待上传阶段和执行记录', t => {
  memoryStorage(t, { [key]: JSON.stringify(state) })
  assert.deepEqual(load(), state)
})
test('缺失工艺或损坏执行状态不会进入恢复流程且原缓存不删除', t => {
  const values = memoryStorage(t)
  for (const changes of [{ processJson: null }, { session: {} }, { phase: 'bogus' }, { completedNodes: {} },
    { activeFlowType: 'unknown' }, { installStep: -1 }, { testFlowPassed: 'true' }]) {
    const raw = JSON.stringify({ ...state, ...changes })
    values.set(key, raw)
    assert.equal(load(), null)
    assert.equal(values.get(key), raw)
  }
})
