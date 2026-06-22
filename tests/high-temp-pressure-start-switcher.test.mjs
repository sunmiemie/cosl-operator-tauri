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

const startHandlerStart = indexPage.indexOf('async function handleConfirmStart()')
assert.notEqual(startHandlerStart, -1, 'handleConfirmStart should be present')
const startHandlerEnd = indexPage.indexOf('async function handleConfirmEnd()', startHandlerStart)
assert.notEqual(startHandlerEnd, -1, 'handleConfirmStart should have a following boundary')
const startHandlerBody = indexPage.slice(startHandlerStart, startHandlerEnd)

assert.match(
  startHandlerBody,
  /const\s+ordersNeedingStart\s*=\s*uniqueOrders\.filter\(\(order\)\s*=>\s*order\.statusCode\s*!==\s*2\)/,
  'high-temp-pressure final start should skip backend start calls for orders that are already testing'
)

assert.match(
  startHandlerBody,
  /const\s+missingDbOrder\s*=\s*ordersNeedingStart\.find/,
  'high-temp-pressure final start should only require backend IDs for orders that still need a start call'
)

assert.match(
  startHandlerBody,
  /if\s*\(!ordersNeedingStart\.length\)\s*\{[\s\S]*?uniqueOrders\.forEach\(\(order\)\s*=>\s*schedule\.markOrderStarted\(order\.id\)\)[\s\S]*?schedule\.markInstrumentsRunning\(runningInstrumentIds\)[\s\S]*?testing\.confirmStart\(\)[\s\S]*?return/,
  'high-temp-pressure final start should enter the test directly when every selected order is already testing'
)

assert.match(
  startHandlerBody,
  /uniqueOrders\.forEach\(\(order\)\s*=>\s*schedule\.markOrderStarted\(order\.id\)\)[\s\S]*?schedule\.markInstrumentsRunning\(runningInstrumentIds\)[\s\S]*?testing\.confirmStart\(\)/,
  'high-temp-pressure final start should mark every selected order as started after any needed backend start calls'
)

console.log('high-temp-pressure start switcher assertions passed')
