import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const dashboard = readFileSync(resolve(root, 'src/views/vibration/components/VibrationDashboard.vue'), 'utf8')
const flow = readFileSync(resolve(root, 'src/views/vibration/components/VibrationFlow.vue'), 'utf8')

function statusBlock(content, helperName, nextHelperName, label) {
  const start = content.indexOf(`const ${helperName}`)
  assert.notEqual(start, -1, `${label} should define ${helperName}`)
  const end = content.indexOf(`const ${nextHelperName}`, start)
  assert.notEqual(end, -1, `${label} should define ${nextHelperName} after ${helperName}`)
  return content.slice(start, end)
}

const dashboardStatusBlock = statusBlock(dashboard, 'getOrderStatusText', 'getStatusClass', 'VibrationDashboard')

assert.match(
  dashboardStatusBlock,
  /scheduledOrderIdSet\.value\.has\(order\.id\)[\s\S]*?已排程/,
  'vibration dashboard should show 已排程 after the order is dragged onto the calendar'
)

assert.match(
  dashboardStatusBlock,
  /return\s+'待排程'/,
  'vibration dashboard non-running unfinished orders should show 待排程'
)

const flowStatusBlock = statusBlock(flow, 'getOrderStatusText', 'getStatusClass', 'VibrationFlow')

assert.match(
  flowStatusBlock,
  /(?:scheduledStartAt|scheduleSegments)[\s\S]*?已排程/,
  'vibration flow should show 已排程 when the selected order still has schedule fields'
)

assert.match(
  flowStatusBlock,
  /return\s+'待排程'/,
  'vibration flow non-running unfinished orders should show 待排程'
)

console.log('vibration dashboard status assertions passed')
