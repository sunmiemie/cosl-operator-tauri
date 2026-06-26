import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const schedule = readFileSync(resolve(root, 'src/views/high-temp-box/composables/useHighTempBox.ts'), 'utf8')

assert.match(
  schedule,
  /saveHighTempBoxOrderSchedule/,
  'high-temp-box schedule changes should save scheduled_start_at/scheduled_end_at to the backend'
)

assert.match(
  schedule,
  /clearHighTempBoxOrderSchedule/,
  'high-temp-box schedule deletion should clear backend schedule fields'
)

assert.match(
  schedule,
  /scheduledStartAt:\s*`\$\{ev\.dateStr\}\s+\$\{startHh\}:00:00`/,
  'high-temp-box schedule payload should include backend scheduledStartAt with seconds'
)

assert.match(
  schedule,
  /scheduledEndAt:\s*`\$\{ev\.dateStr\}\s+\$\{endHh\}:00:00`/,
  'high-temp-box schedule payload should include backend scheduledEndAt with seconds'
)

const orderPersistStart = schedule.indexOf('async function persistOrderSchedule')
const persistStart = schedule.indexOf('async function persistScheduledEvent', orderPersistStart)
assert.ok(
  orderPersistStart >= 0 && persistStart > orderPersistStart,
  'persistOrderSchedule should exist before persistScheduledEvent'
)
const orderPersistBlock = schedule.slice(orderPersistStart, persistStart)
assert.match(
  orderPersistBlock,
  /saveHighTempBoxOrderSchedule/,
  'persistOrderSchedule should call saveHighTempBoxOrderSchedule'
)
assert.match(
  orderPersistBlock,
  /clearHighTempBoxOrderSchedule/,
  'persistOrderSchedule should call clearHighTempBoxOrderSchedule when no schedule remains'
)

const filteredOrdersStart = schedule.indexOf('const scheduledOrders', persistStart)
assert.ok(
  persistStart >= 0 && filteredOrdersStart > persistStart,
  'persistScheduledEvent should exist before scheduled order computed state'
)
const persistBlock = schedule.slice(persistStart, filteredOrdersStart)
assert.match(
  persistBlock,
  /return\s+persistOrderSchedule\(event\.orderId,\s*fallback\)/,
  'persistScheduledEvent should delegate persistence to the order schedule'
)

const scheduleOrderStart = schedule.indexOf('async function scheduleOrder')
const handleDropStart = schedule.indexOf('async function handleDrop', scheduleOrderStart)
assert.ok(scheduleOrderStart >= 0 && handleDropStart > scheduleOrderStart, 'scheduleOrder should be async before handleDrop')
const scheduleOrderBlock = schedule.slice(scheduleOrderStart, handleDropStart)
assert.match(
  scheduleOrderBlock,
  /await\s+persistScheduledEvent\(eventId,\s*previousEvents\)/,
  'dropping an order onto the high-temp-box calendar should persist the created block'
)

const unscheduleStart = schedule.indexOf('async function handleUnschedule')
const removeScheduleStart = schedule.indexOf('function removeSchedule', unscheduleStart)
assert.ok(unscheduleStart >= 0 && removeScheduleStart > unscheduleStart, 'handleUnschedule should be async before removeSchedule')
const unscheduleBlock = schedule.slice(unscheduleStart, removeScheduleStart)
assert.match(
  unscheduleBlock,
  /await\s+persistOrderSchedule\(removed\.orderId,\s*previousEvents\)/,
  'removing a high-temp-box calendar block should persist the backend clear'
)

const resizeStart = schedule.indexOf('const startResize =')
const resizeTopStart = schedule.indexOf('const startResizeTop =', resizeStart)
assert.ok(resizeStart >= 0 && resizeTopStart > resizeStart, 'startResize should exist before startResizeTop')
const resizeBlock = schedule.slice(resizeStart, resizeTopStart)
assert.match(
  resizeBlock,
  /persistScheduledEvent\(eventId,\s*previousEvents\)/,
  'bottom resize should persist the adjusted high-temp-box block'
)

const resizeTopBlock = schedule.slice(resizeTopStart)
assert.match(
  resizeTopBlock,
  /persistScheduledEvent\(eventId,\s*previousEvents\)/,
  'top resize should persist the adjusted high-temp-box block'
)

console.log('high-temp-box schedule persistence assertions passed')
