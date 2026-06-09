import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const schedule = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureSchedule.ts'), 'utf8')

assert.match(
  schedule,
  /function\s+shouldRestoreInstrumentSchedule\(order:\s*WorkOrder,\s*instrument:\s*InstrumentItem\)/,
  'schedule restore should have an explicit rule for whether backend schedule fields are still active'
)

const restoreRuleStart = schedule.indexOf('function shouldRestoreInstrumentSchedule')
const restoreEventsStart = schedule.indexOf('function restoreScheduledEvents', restoreRuleStart)
assert.ok(restoreRuleStart >= 0 && restoreEventsStart > restoreRuleStart, 'schedule restore helpers should be ordered')
const restoreRuleBlock = schedule.slice(restoreRuleStart, restoreEventsStart)

assert.match(
  restoreRuleBlock,
  /eventsFromInstrument\(instrument,\s*order\.id\)\.length\s*>\s*0/,
  'refresh should restore calendar blocks when backend still returns valid schedule fields'
)

assert.doesNotMatch(
  restoreRuleBlock,
  /order\.statusCode\s*===\s*2|instrument\.status\s*===\s*1|runningInstrumentIds\.value/,
  'refresh should not require testing/running status to restore backend schedule fields'
)

assert.match(
  schedule,
  /if\s*\(!shouldRestoreInstrumentSchedule\(order,\s*instrument\)\)\s*return/,
  'restoreScheduledEvents should skip backend schedule blocks for instruments that are back to pending schedule'
)

assert.match(
  schedule,
  /selectedScheduledOrderIds\.value\s*=\s*selectedScheduledOrderIds\.value\.filter\(\(id\)\s*=>\s*\(scheduledEvents\.value\[id\]\s*\|\|\s*\[\]\)\.length\)/,
  'refreshWorkOrders should drop selected ids whose calendar blocks were auto-cleared'
)

console.log('high-temp-pressure schedule auto-clear assertions passed')
