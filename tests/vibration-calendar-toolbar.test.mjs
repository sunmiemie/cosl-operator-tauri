import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const dashboard = readFileSync(resolve(root, 'src/views/vibration/components/VibrationDashboard.vue'), 'utf8')
const index = readFileSync(resolve(root, 'src/views/vibration/index.vue'), 'utf8')
const schedule = readFileSync(resolve(root, 'src/views/vibration/composables/useVibrationSchedule.ts'), 'utf8')
const css = readFileSync(resolve(root, 'src/views/vibration/components/vibration.shared.css'), 'utf8')

assert.match(
  dashboard,
  /<div class="layout-container">/,
  'vibration dashboard should keep its existing outer layout so the left work-order table width is unchanged'
)
assert.match(
  dashboard,
  /\.sidebar\s*\{[\s\S]*?width:\s*460px[\s\S]*?min-width:\s*460px/,
  'vibration dashboard should keep the local 460px sidebar override'
)
assert.doesNotMatch(
  dashboard,
  /<div class="panel active">\s*<div class="schedule-wrap">/,
  'calendar-only change should not replace the vibration dashboard shell'
)

assert.match(
  dashboard,
  /'load-preset-schedule': \[\]/,
  'vibration calendar should expose the same load-preset-schedule event as high-temp-pressure'
)
assert.match(
  dashboard,
  /读取本周排程[\s\S]*?emit\('load-preset-schedule'\)|emit\('load-preset-schedule'\)[\s\S]*?读取本周排程/,
  'vibration calendar toolbar should include a working read current week schedule button'
)
assert.match(
  index,
  /@load-preset-schedule="loadPresetSchedule"/,
  'vibration page should wire the calendar toolbar event to the schedule composable'
)
assert.match(
  schedule,
  /function loadPresetSchedule\(\)/,
  'vibration schedule composable should implement loadPresetSchedule'
)
assert.match(
  schedule,
  /\bloadPresetSchedule,\s*\n/,
  'vibration schedule composable should return loadPresetSchedule'
)

const toolbarMatch = css.match(/\.week-cal-toolbar\s*\{([\s\S]*?)\}/)
assert.ok(toolbarMatch, 'vibration shared css should define the calendar toolbar')
assert.match(toolbarMatch[1], /min-width:\s*0/, 'calendar toolbar should match high-temp-pressure constrained layout')

const labelMatch = css.match(/\.week-cal-label\s*\{([\s\S]*?)\}/)
assert.ok(labelMatch, 'vibration shared css should define the calendar week label')
assert.match(labelMatch[1], /overflow:\s*hidden/, 'week label should match high-temp-pressure overflow handling')
assert.match(labelMatch[1], /text-overflow:\s*ellipsis/, 'week label should match high-temp-pressure ellipsis handling')

console.log('vibration calendar toolbar assertions passed')
