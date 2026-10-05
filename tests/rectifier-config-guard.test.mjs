import assert from 'node:assert/strict'
import test from 'node:test'
import { executeRectifierTemperatureStage } from '../src/services/hass-rectifier-runtime.ts'

const config = { inputVoltageSteps: [150], sourceCurrentLimitA: 5,
  voltageSettleSeconds: 0, halfLoadSettleSeconds: 0, fullLoadSettleSeconds: 0,
  halfLoad: { load48Ohm: 15, load90Ohm: 56 }, fullLoad: { load48Ohm: 7, load90Ohm: 28 },
  output48VoltageRange: { min: 45, max: 51 }, output90VoltageRange: { min: 85, max: 95 } }

test('损坏的执行配置在设备首次调用之前拒绝', async () => {
  let calls = 0
  const called = async () => { calls += 1 }
  const hardware = { setInputVoltage: called, setLoads: called, measure: called }
  for (const change of [
    { inputVoltageSteps: [] }, { inputVoltageSteps: [150, NaN] }, { sourceCurrentLimitA: 0 },
    { halfLoad: { load48Ohm: -1, load90Ohm: 56 } }, { fullLoad: null },
    { voltageSettleSeconds: Infinity }, { halfLoadSettleSeconds: -1 },
    { fullLoadSettleSeconds: 2147484 }, { output48VoltageRange: { min: NaN, max: 50 } },
    { output90VoltageRange: { min: 95, max: 85 } },
  ]) await assert.rejects(executeRectifierTemperatureStage({}, { ...config, ...change }, hardware, called))
  assert.equal(calls, 0)
})

test('有效零等待方案仍生成正常判定记录', async () => {
  const hardware = { setInputVoltage: async () => {}, setLoads: async () => {},
    measure: async () => ({ output48Voltage: 48, output48CurrentA: 1, output90Voltage: 90, output90CurrentA: 1 }) }
  const result = await executeRectifierTemperatureStage({ stageIndex: 1 }, config, hardware, async () => {})
  assert.equal(result.voltageSteps[0].halfLoad.output48Result.result, '合格')
  assert.equal(result.voltageSteps[0].fullLoad.output90Result.result, '合格')
})

test('工艺参考范围允许有限零下限，不引入额外正数限制', async () => {
  const hardware = { setInputVoltage: async () => {}, setLoads: async () => {},
    measure: async () => ({ output48Voltage: 0, output48CurrentA: 0, output90Voltage: 90, output90CurrentA: 1 }) }
  const result = await executeRectifierTemperatureStage({ stageIndex: 1 },
    { ...config, output48VoltageRange: { min: 0, max: 51 } }, hardware, async () => {})
  assert.equal(result.voltageSteps[0].halfLoad.output48Result.result, '合格')
})
