import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const dashboard = readFileSync(resolve(root, 'src/views/high-temp-pressure/components/DashboardPanel.vue'), 'utf8')

const instrumentStatusStart = dashboard.indexOf('const getInstrumentStatusMeta')
const orderStatusStart = dashboard.indexOf('const getOrderStatusMeta')
assert.ok(instrumentStatusStart >= 0 && orderStatusStart > instrumentStatusStart, 'DashboardPanel should define status helpers')
const instrumentStatusBlock = dashboard.slice(instrumentStatusStart, orderStatusStart)

assert.match(
  dashboard,
  /const\s+scheduledInstrumentIdSet\s*=\s*computed/,
  'DashboardPanel should derive scheduled instrument ids from current calendar schedules'
)

assert.match(
  instrumentStatusBlock,
  /scheduledInstrumentIdSet\.value\.has\(instrumentId\)[\s\S]*?label:\s*'已排程'/,
  'dragged instruments should show 已排程 while they are present on the calendar'
)

assert.ok(
  instrumentStatusBlock.indexOf('props.isInstrumentRunning(instrumentId)') < instrumentStatusBlock.indexOf('scheduledInstrumentIdSet.value.has(instrumentId)'),
  'running status should take precedence over scheduled status'
)

assert.match(
  instrumentStatusBlock,
  /return\s*\{\s*label:\s*'待排程'/,
  'non-running unfinished instruments should show 待排程'
)

const orderSummaryStart = dashboard.indexOf('const getOrderTestTypeSummary')
assert.ok(orderSummaryStart > orderStatusStart, 'DashboardPanel should define getOrderTestTypeSummary after getOrderStatusMeta')
const orderStatusBlock = dashboard.slice(orderStatusStart, orderSummaryStart)

assert.match(
  dashboard,
  /const\s+getScheduledInstrumentCount\s*=\s*\(order:\s*WorkOrder\)/,
  'DashboardPanel should count scheduled instruments for order-level status'
)

assert.match(
  orderStatusBlock,
  /getScheduledInstrumentCount\(order\)[\s\S]*?label:\s*'已排程'/,
  'orders should show 已排程 when any active instrument is present on the calendar'
)

assert.ok(
  orderStatusBlock.indexOf('getRunningInstrumentCount(order)') < orderStatusBlock.indexOf('getScheduledInstrumentCount(order)'),
  'order running status should take precedence over scheduled status'
)

assert.match(
  orderStatusBlock,
  /return\s*\{\s*label:\s*'待排程'/,
  'non-running unfinished orders should show 待排程'
)

console.log('high-temp-pressure dashboard status assertions passed')
