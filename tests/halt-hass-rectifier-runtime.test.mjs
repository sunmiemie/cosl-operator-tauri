import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRectifierStageTracker,
  executeRectifierTemperatureStage,
} from '../src/services/hass-rectifier-runtime.ts'

const config = {
  inputVoltageSteps: [150, 200, 250, 300, 350, 400],
  sourceCurrentLimitA: 5,
  temperatureToleranceC: 5,
  temperatureStableSeconds: 2,
  voltageSettleSeconds: 3,
  halfLoadSettleSeconds: 3,
  fullLoadSettleSeconds: 3,
  halfLoad: { load48Ohm: 15.36, load90Ohm: 56 },
  fullLoad: { load48Ohm: 7.68, load90Ohm: 28 },
  output48VoltageRange: { min: 45.6, max: 50.4 },
  output90VoltageRange: { min: 85.5, max: 94.5 },
  currentUnit: 'A',
}

function telemetry(receivedAt, targetTemperature, actualTemperature, totalTime) {
  return {
    receivedAt,
    targetTemperature,
    actualTemperature,
    targetVibration: 20,
    actualVibration: 19.8,
    totalTime,
  }
}

test('温度阶段按 MQTT 阶段变化触发，恢复后阶段号连续且同阶段不重复', () => {
  const tracker = createRectifierStageTracker(5, 2, 10, 2)

  assert.equal(tracker.observe(telemetry(1_000, 150, 149, 1)), null)
  assert.equal(tracker.observe(telemetry(2_000, 150, 148, 2)), null)
  const first = tracker.observe(telemetry(3_001, 150, 150, 3))
  assert.equal(first?.stageIndex, 3)
  assert.match(first?.stageIdentity ?? '', /^3:target=150:total=3$/)

  assert.equal(tracker.observe(telemetry(5_500, 150, 150, 5.5)), null)
  assert.equal(tracker.observe(telemetry(6_000, -20, -19, 6)), null)
  assert.equal(tracker.observe(telemetry(7_000, -20, -20, 7)), null)
  const second = tracker.observe(telemetry(8_001, -20, -20, 8))
  assert.equal(second?.stageIndex, 4)

  tracker.reset()
  assert.equal(tracker.observe(telemetry(10_000, 25, 25, 10)), null)
  const afterReset = tracker.observe(telemetry(12_001, 25, 25, 12))
  assert.equal(afterReset?.stageIndex, 3)
})

test('每个输入电压依次执行电压等待、半载等待采集和满载等待采集', async () => {
  const events = []
  let measureIndex = 0
  const measurements = [
    { output48Voltage: 48, output48CurrentA: 3.1, output90Voltage: 90, output90CurrentA: 1.6 },
    { output48Voltage: 48.2, output48CurrentA: 6.2, output90Voltage: 90.2, output90CurrentA: 3.2 },
  ]
  const hardware = {
    async setInputVoltage(voltage, currentLimitA) {
      events.push(['voltage', voltage, currentLimitA])
    },
    async setLoads(load48Ohm, load90Ohm) {
      events.push(['loads', load48Ohm, load90Ohm])
    },
    async measure() {
      events.push(['measure'])
      const value = measurements[measureIndex % measurements.length]
      measureIndex += 1
      return value
    },
  }
  const delays = []
  const now = () => new Date('2026-09-11T08:00:00.000Z')

  const result = await executeRectifierTemperatureStage(
    {
      ...telemetry(Date.now(), 150, 149, 120),
      stageIndex: 1,
      stageIdentity: '1:target=150:total=120',
    },
    config,
    hardware,
    async milliseconds => delays.push(milliseconds),
    now,
  )

  assert.equal(result.voltageSteps.length, 6)
  assert.equal(delays.length, 18)
  assert.deepEqual(new Set(delays), new Set([3_000]))
  assert.deepEqual(events.slice(0, 7), [
    ['voltage', 150, 5],
    ['loads', 15.36, 56],
    ['measure'],
    ['loads', 7.68, 28],
    ['measure'],
    ['voltage', 200, 5],
    ['loads', 15.36, 56],
  ])
  assert.deepEqual(events.at(-1), ['voltage', 150, 5])
  assert.equal(result.voltageSteps[0].halfLoad.output48Result.originalResult, '合格')
  assert.equal(result.voltageSteps[0].fullLoad.output90Result.originalResult, '合格')
  assert.equal(result.voltageSteps[0].halfLoad.output48CurrentA, 3.1)
})
