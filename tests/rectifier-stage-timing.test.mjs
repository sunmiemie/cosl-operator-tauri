import assert from 'node:assert/strict'
import test from 'node:test'
import { createRectifierStageTracker } from '../src/services/hass-rectifier-runtime.ts'

const sample = receivedAt => ({ receivedAt, totalTime: 10, targetTemperature: 25,
  actualTemperature: 25, targetVibration: null, actualVibration: null })

test('稳定窗口支持时间零点，断档和时钟回退重新计时', () => {
  const tracker = createRectifierStageTracker(1, 1, 2)
  assert.equal(tracker.observe(sample(0)), null)
  assert.equal(tracker.observe(sample(1000))?.stageIndex, 1)
  tracker.reset()
  assert.equal(tracker.observe(sample(5000)), null)
  assert.equal(tracker.observe(sample(4000)), null)
  assert.equal(tracker.observe(sample(4500)), null)
  assert.equal(tracker.observe(sample(8000)), null)
  assert.equal(tracker.observe(sample(9000))?.stageIndex, 1)
})

test('无效温度或时间不能累积稳定阶段，并拒绝无效跟踪配置', () => {
  for (const field of ['targetTemperature', 'actualTemperature', 'receivedAt', 'totalTime']) {
    const tracker = createRectifierStageTracker(1, 1)
    tracker.observe(sample(0))
    assert.equal(tracker.observe({ ...sample(1000), [field]: NaN }), null)
    assert.equal(tracker.observe(sample(2000)), null)
    assert.equal(tracker.observe(sample(3000))?.stageIndex, 1)
  }
  for (const args of [[NaN, 1], [1, -1], [1, 1, Infinity], [1, 1, 10, 1.5]]) {
    assert.throws(() => createRectifierStageTracker(...args))
  }
})
