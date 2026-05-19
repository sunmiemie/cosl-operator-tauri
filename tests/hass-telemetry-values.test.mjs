import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHassMqttTelemetry } from '../src/services/hass-mqtt-telemetry.ts'

test('缺失和非数值遥测保持空值，不伪造零测量', () => {
  for (const invalid of [null, undefined, '', '  ', false, true, [], {}, NaN, Infinity]) {
    const result = parseHassMqttTelemetry({ topic: 'EDM/THV/Test/THStatus', receivedAt: 12000,
      payload: { TotalTime: invalid, RemainTime: invalid, ControlTemperature: invalid, TargetTemperature: invalid } })
    assert.equal(result.actual, null)
    assert.equal(result.target, null)
    assert.equal(result.remainingTime, null)
    assert.equal(result.time, 12)
  }
})

test('真实零值和带空白的数值字符串仍可使用', () => {
  const result = parseHassMqttTelemetry({ topic: 'EDM/THV/Test/VibStatus', receivedAt: 12000,
    payload: { TotalTime: 0, RemainTime: ' 10 ', ControlVibration: '0', TargetVibration: 2.5 } })
  assert.deepEqual(result, { kind: 'vibration', time: 0, remainingTime: 10, actual: 0, target: 2.5 })
})
