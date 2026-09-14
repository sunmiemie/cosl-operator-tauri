import type { RectifierProcessConfig } from '@/views/process-halt-hass/types'
import type {
  HaltHassPassResult,
  HaltHassRectifierLoadRecord,
  HaltHassRectifierTemperatureStageRecord,
} from '@/views/halt-hass-test/types'
import type { HassRectifierMeasurement } from './flojoy-api'

export interface RectifierStageTelemetry {
  totalTime: number
  receivedAt: number
  targetTemperature: number | null
  actualTemperature: number | null
  targetVibration: number | null
  actualVibration: number | null
}

export interface RectifierStageTrigger extends RectifierStageTelemetry {
  stageIndex: number
  stageIdentity: string
}

export interface RectifierHardwareAdapter {
  setInputVoltage: (voltage: number, currentLimitA: number) => Promise<void>
  setLoads: (load48Ohm: number, load90Ohm: number) => Promise<void>
  measure: () => Promise<HassRectifierMeasurement>
}

export interface RectifierStageTracker {
  observe: (sample: RectifierStageTelemetry) => RectifierStageTrigger | null
  reset: () => void
}

const TARGET_CHANGE_EPSILON_C = 0.5

export function createRectifierStageTracker(
  toleranceC: number,
  stableDurationSeconds: number,
  maximumSampleGapSeconds = 10,
  startingStageIndex = 0,
): RectifierStageTracker {
  let candidateTarget: number | null = null
  let stableSince = 0
  let lockedTarget: number | null = null
  let stageIndex = Math.max(0, Math.floor(startingStageIndex))
  let lastReceivedAt = 0

  function resetCandidate(target: number | null): void {
    candidateTarget = target
    stableSince = 0
  }

  return {
    observe(sample) {
      const target = sample.targetTemperature
      const actual = sample.actualTemperature
      if (target === null || actual === null) {
        resetCandidate(target)
        lastReceivedAt = sample.receivedAt
        return null
      }

      if (
        lastReceivedAt
        && sample.receivedAt - lastReceivedAt > maximumSampleGapSeconds * 1000
      ) {
        stableSince = 0
      }
      lastReceivedAt = sample.receivedAt

      if (lockedTarget !== null) {
        if (Math.abs(target - lockedTarget) <= TARGET_CHANGE_EPSILON_C) return null
        lockedTarget = null
        resetCandidate(target)
      }

      if (
        candidateTarget === null
        || Math.abs(target - candidateTarget) > TARGET_CHANGE_EPSILON_C
      ) {
        resetCandidate(target)
      }

      if (Math.abs(target - actual) > toleranceC) {
        stableSince = 0
        return null
      }

      if (!stableSince) stableSince = sample.receivedAt
      if (sample.receivedAt - stableSince < stableDurationSeconds * 1000) return null

      stageIndex += 1
      lockedTarget = target
      stableSince = 0
      return {
        ...sample,
        stageIndex,
        stageIdentity: `${stageIndex}:target=${target}:total=${Math.floor(sample.totalTime)}`,
      }
    },
    reset() {
      candidateTarget = null
      stableSince = 0
      lockedTarget = null
      stageIndex = Math.max(0, Math.floor(startingStageIndex))
      lastReceivedAt = 0
    },
  }
}

function resultForOutput(
  voltage: number | null,
  currentA: number | null,
  range: { min: number; max: number },
  label: string,
): { result: HaltHassPassResult; missingReasons: string[] } {
  const missingReasons: string[] = []
  if (!Number.isFinite(voltage) || !Number.isFinite(currentA)) {
    missingReasons.push(`${label} 负载返回了无效电压或电流`)
  }
  if (!Number.isFinite(voltage) || Number(voltage) < range.min || Number(voltage) > range.max) {
    missingReasons.push(`${label} 输出不在 ${range.min}-${range.max} V 范围内`)
  }
  return {
    result: missingReasons.length ? '不合格' : '合格',
    missingReasons,
  }
}

function buildLoadRecord(
  measurement: HassRectifierMeasurement,
  load48Ohm: number,
  load90Ohm: number,
  config: RectifierProcessConfig,
  now: () => Date,
): HaltHassRectifierLoadRecord {
  const output48 = resultForOutput(
    measurement.output48Voltage,
    measurement.output48CurrentA,
    config.output48VoltageRange,
    '48 V',
  )
  const output90 = resultForOutput(
    measurement.output90Voltage,
    measurement.output90CurrentA,
    config.output90VoltageRange,
    '90 V',
  )
  return {
    load48Ohm,
    load90Ohm,
    output48Voltage: measurement.output48Voltage,
    output48CurrentA: measurement.output48CurrentA,
    output90Voltage: measurement.output90Voltage,
    output90CurrentA: measurement.output90CurrentA,
    output48Result: {
      originalResult: output48.result,
      result: output48.result,
    },
    output90Result: {
      originalResult: output90.result,
      result: output90.result,
    },
    recordedAt: now().toISOString(),
    missingReasons: [...output48.missingReasons, ...output90.missingReasons],
  }
}

export async function executeRectifierTemperatureStage(
  trigger: RectifierStageTrigger,
  config: RectifierProcessConfig,
  hardware: RectifierHardwareAdapter,
  delay: (milliseconds: number) => Promise<void>,
  now: () => Date = () => new Date(),
): Promise<HaltHassRectifierTemperatureStageRecord> {
  const startedAt = now().toISOString()
  const voltageSteps: HaltHassRectifierTemperatureStageRecord['voltageSteps'] = []

  for (const inputVoltage of config.inputVoltageSteps) {
    const voltageChangedAt = now().toISOString()
    await hardware.setInputVoltage(inputVoltage, config.sourceCurrentLimitA)
    await delay(config.voltageSettleSeconds * 1000)

    await hardware.setLoads(config.halfLoad.load48Ohm, config.halfLoad.load90Ohm)
    await delay(config.halfLoadSettleSeconds * 1000)
    const halfLoadMeasurement = await hardware.measure()

    await hardware.setLoads(config.fullLoad.load48Ohm, config.fullLoad.load90Ohm)
    await delay(config.fullLoadSettleSeconds * 1000)
    const fullLoadMeasurement = await hardware.measure()

    voltageSteps.push({
      inputVoltage,
      voltageChangedAt,
      halfLoad: buildLoadRecord(
        halfLoadMeasurement,
        config.halfLoad.load48Ohm,
        config.halfLoad.load90Ohm,
        config,
        now,
      ),
      fullLoad: buildLoadRecord(
        fullLoadMeasurement,
        config.fullLoad.load48Ohm,
        config.fullLoad.load90Ohm,
        config,
        now,
      ),
    })
  }

  if (config.inputVoltageSteps.length) {
    await hardware.setInputVoltage(config.inputVoltageSteps[0], config.sourceCurrentLimitA)
  }

  return {
    stageIndex: trigger.stageIndex,
    stageIdentity: trigger.stageIdentity,
    targetTemperature: trigger.targetTemperature,
    actualTemperature: trigger.actualTemperature,
    targetVibration: trigger.targetVibration,
    actualVibration: trigger.actualVibration,
    startedAt,
    completedAt: now().toISOString(),
    voltageSteps,
  }
}
