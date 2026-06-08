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
