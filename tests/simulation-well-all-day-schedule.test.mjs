import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const schedule = readFileSync(
  resolve(root, 'src/views/simulation-well/composables/useSimulationWellScheduleV2.ts'),
  'utf8'
)
const dashboard = readFileSync(
  resolve(root, 'src/views/simulation-well/components/SimulationWellDashboard.vue'),
  'utf8'
)

assert.match(
  schedule,
  /for \(let h = 0; h <= 24; h\+\+\)/,
  'simulation-well schedule should expose the full 00:00-24:00 timeline'
)

assert.match(
  schedule,
  /const lastKey = timeSlots\.value\[timeSlots\.value\.length - 1\]\?\.key[\s\S]{0,100}if \(timeKey === lastKey\) return/,
  '24:00 should remain an end boundary so scheduled intervals always have positive duration'
)

assert.match(
  schedule,
  /const maxStartIdx = Math\.max\(0, timeSlots\.value\.length - 2\)/,
  'resize should allow 23:00 as the latest start time'
)

assert.match(
  dashboard,
  /v-for="slot in timeSlots"[\s\S]*'is-end-boundary': slot\.key === endBoundaryKey/,
  'the calendar should render a complete 24:00 boundary row'
)

assert.match(
  dashboard,
  /slotIndex < 0 \|\| slotIndex >= props\.timeSlots\.length - 1\) return null/,
  'drops on the 24:00 boundary should be ignored'
)

assert.match(
  dashboard,
  /v-if="slot\.key !== endBoundaryKey" class="empty-slot-hint"/,
  'the 24:00 boundary row should not show a new-schedule hint'
)

assert.match(
  dashboard,
  /const reachesEndBoundary = item\.startIdx \+ item\.span === props\.timeSlots\.length - 1[\s\S]*const visualSpan = item\.span \+ \(reachesEndBoundary \? 1 : 0\)/,
  'an event ending at 24:00 should visually cover the complete boundary row'
)

console.log('simulation-well all-day schedule assertions passed')
