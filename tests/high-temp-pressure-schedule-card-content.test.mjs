import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const dashboardPath = resolve(root, 'src/views/high-temp-pressure/components/DashboardPanel.vue')
const source = readFileSync(dashboardPath, 'utf8')

const scheduledItemMatch = source.match(/class="scheduled-item"[\s\S]*?<div class="resize-handle-top"/)
assert.ok(scheduledItemMatch, 'high-temp-pressure dashboard should render scheduled calendar items')

const scheduledItemTemplate = scheduledItemMatch[0]

assert.match(
  scheduledItemTemplate,
  /<span class="device-name">\{\{ getOrderByInstrumentId\(it\.instrumentId\)\?\.no \}\}<\/span>/,
  'scheduled block should display the work order number',
)

assert.match(
  scheduledItemTemplate,
  /<span class="host-name">\{\{ it\.hostDeviceName \|\| '-' \}\}<\/span>/,
  'scheduled block should display the assigned device name',
)

assert.doesNotMatch(
  scheduledItemTemplate,
  /scheduled-tag|\.applicant|\.applyDate/,
  'scheduled block should not display applicant or date metadata',
)

console.log('high-temp-pressure schedule card content assertions passed')
