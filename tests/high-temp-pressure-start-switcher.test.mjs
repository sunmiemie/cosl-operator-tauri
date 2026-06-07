import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const startPanel = readFileSync(resolve(root, 'src/views/high-temp-pressure/components/StartPanel.vue'), 'utf8')
const indexPage = readFileSync(resolve(root, 'src/views/high-temp-pressure/index.vue'), 'utf8')

assert.match(
  startPanel,
  /selectedScheduledOrders:\s*ScheduledSelection\[\]/,
  'StartPanel should receive all selected work orders so it can render 1/2 switch buttons'
)

assert.match(
  startPanel,
  /const\s+activeSelectionIndex\s*=\s*ref\(0\)/,
  'StartPanel should track which selected work order is being previewed'
)

assert.match(
  startPanel,
  /const\s+previewSelection\s*=\s*computed/,
  'StartPanel should render the currently previewed selection instead of only currentSelected'
)

assert.match(
  startPanel,
  /v-if="selectedScheduledOrders\.length\s*>\s*1"[\s\S]*?class="start-order-switcher"/,
  'StartPanel should show the switcher only when there is more than one selected work order'
)

assert.match(
  startPanel,
  /v-for="\([^)]*index[^)]*\)\s+in\s+selectedScheduledOrders"[\s\S]*?\{\{\s*index\s*\+\s*1\s*\}\}/,
  'StartPanel should render visible 1/2 buttons in the work-order card header'
)

assert.match(
  indexPage,
  /<StartPanel[\s\S]*:selected-scheduled-orders="activeTestSelections\.length\s*\?\s*activeTestSelections\s*:\s*schedule\.selectedScheduledOrders\.value"/,
  'high-temp-pressure page should pass the active selected work orders into StartPanel'
)

console.log('high-temp-pressure start switcher assertions passed')
