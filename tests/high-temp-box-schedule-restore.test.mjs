import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const schedule = readFileSync(resolve(root, 'src/views/high-temp-box/composables/useHighTempBox.ts'), 'utf8')

assert.match(
  schedule,
  /scheduledStartAt\?:\s*string\s*\|\s*null/,
  'high-temp-box work orders should retain backend scheduled_start_at for calendar restore'
)

assert.match(
  schedule,
  /scheduledEndAt\?:\s*string\s*\|\s*null/,
  'high-temp-box work orders should retain backend scheduled_end_at for calendar restore'
)

assert.match(
  schedule,
  /function\s+parseBackendDateTime\(value\?:\s*string\s*\|\s*null\)/,
  'high-temp-box schedule should parse backend datetime strings'
)

assert.match(
  schedule,
  /function\s+eventFromOrderSchedule\(order:\s*WorkOrder\):\s*ScheduledEvent\s*\|\s*null/,
  'backend schedule fields should be converted into a concrete calendar event'
)

assert.match(
  schedule,
  /function\s+restoreScheduledEvents\(orders:\s*WorkOrder\[\]\)/,
  'refresh should restore concrete calendar blocks from backend schedule fields'
)

assert.match(
  schedule,
  /restoreScheduledEvents\(scheduledOrders\)/,
  'refreshWorkOrders should restore the high-temp-box calendar after loading scheduled backend orders'
)

assert.match(
  schedule,
  /async\s+function\s+loadPresetSchedule\(\)\s*{\s*await\s+refreshWorkOrders\(\)\s*}/,
  'the high-temp-box read-week-schedule button should refresh backend schedules instead of injecting demo blocks'
)

assert.doesNotMatch(
  schedule,
  /HT-2024-\d{3}/,
  'the high-temp-box read-week-schedule button should not use hard-coded demo schedule ids'
)

assert.match(
  schedule,
  /if\s*\(event\)\s*next\[event\.eventId\]\s*=\s*event/,
  'restored high-temp-box events should be written into scheduledEvents for block rendering'
)

console.log('high-temp-box schedule restore assertions passed')
