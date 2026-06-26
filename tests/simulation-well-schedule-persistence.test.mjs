import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const api = read('src/services/simulated-well-api.ts')
const types = read('src/views/simulation-well/types.ts')
const schedule = read('src/views/simulation-well/composables/useSimulationWellScheduleV2.ts')
const dashboard = read('src/views/simulation-well/components/SimulationWellDashboard.vue')

assert.match(
  api,
  /SimulatedWellOrderDeviceDTO[\s\S]*schedule_segments\?:\s*Array<\{/,
  'simulated-well device DTO should expose backend schedule_segments'
)

assert.match(
  api,
  /SimulatedWellDeviceScheduleBody[\s\S]*schedule_segments\?:\s*Array<\{/,
  'simulated-well device schedule body should save backend schedule_segments'
)

assert.match(
  types,
  /DeviceItem[\s\S]*scheduleSegments\?:\s*Array<\{/,
  'simulation-well DeviceItem should keep normalized scheduleSegments'
)

const persistStart = schedule.indexOf('async function persistScheduledEvent')
const unscheduledStart = schedule.indexOf('const unscheduledOrders', persistStart)
assert.ok(persistStart >= 0 && unscheduledStart > persistStart, 'persistScheduledEvent should exist before unscheduledOrders')
const persistBlock = schedule.slice(persistStart, unscheduledStart)
assert.doesNotMatch(
  persistBlock,
  /void\s+deviceId[\s\S]*return\s+true/,
  'persistScheduledEvent should not be a memory-only stub'
)
assert.match(
  persistBlock,
  /return\s+persistOwnerSchedule\(event\.scheduleOwnerDeviceId,\s*fallback\)/,
  'persistScheduledEvent should delegate persistence to the owner device schedule'
)

const ownerPersistStart = schedule.indexOf('async function persistOwnerSchedule')
const ownerPersistEnd = schedule.indexOf('async function persistScheduledEvent', ownerPersistStart)
assert.ok(ownerPersistStart >= 0 && ownerPersistEnd > ownerPersistStart, 'persistOwnerSchedule should exist before persistScheduledEvent')
const ownerPersistBlock = schedule.slice(ownerPersistStart, ownerPersistEnd)
assert.match(
  ownerPersistBlock,
  /saveSimulatedWellDeviceSchedule/,
  'simulation-well schedule composable should call saveSimulatedWellDeviceSchedule in persistence path'
)

assert.match(
  schedule,
  /scheduleOwnerDeviceId:\s*string/,
  'ScheduledEvent should carry scheduleOwnerDeviceId for device-schedule persistence'
)

assert.match(
  schedule,
  /function\s+eventsFromDevice\(order:\s*WorkOrder,\s*device:\s*WorkOrder\['deviceList'\]\[number\]\)/,
  'refresh should restore events from each device'
)

assert.match(
  schedule,
  /device\.scheduleSegments\?\.length[\s\S]*device\.scheduledStartAt\s*&&\s*device\.scheduledEndAt/,
  'eventsFromDevice should prefer scheduleSegments and fall back to single scheduledStartAt/scheduledEndAt'
)

assert.match(
  schedule,
  /scheduleSegments:\s*normalizeScheduleSegments\(d\.schedule_segments\)/,
  'refreshWorkOrders should map backend schedule_segments into DeviceItem.scheduleSegments'
)

assert.match(
  schedule,
  /refreshWorkOrders[\s\S]*restoreScheduledEvents\(workOrders\.value\)/,
  'refreshWorkOrders should restore scheduled calendar blocks after loading work orders'
)

assert.match(
  ownerPersistBlock,
  /schedule_segments:\s*schedule\.scheduleSegments/,
  'save payload should include all schedule_segments'
)

assert.match(
  schedule,
  /const\s+hasDeviceSchedule\s*=/,
  'refreshWorkOrders should have a helper for detecting backend schedule data before downhole filtering'
)

assert.match(
  schedule,
  /hasDeviceSchedule\(d\)\s*\|\|\s*![\s\S]{0,120}savedDownholeDeviceIds\.has/,
  'remainingDevices should retain devices with schedule_segments or scheduled_start/end even when downhole filtering applies'
)

assert.match(
  schedule,
  /const\s+scheduledOrderIds\s*=\s*computed\([\s\S]*scheduledEvents\.value[\s\S]*scheduledEventsTentative\.value[\s\S]*event\.orderId/,
  'unscheduledOrders should derive scheduled order ids from saved and tentative scheduled events'
)

assert.match(
  schedule,
  /const\s+unscheduledOrders\s*=\s*computed\([\s\S]*scheduledOrderIds\.value\.has\(order\.id\)[\s\S]*return\s+false/,
  'unscheduledOrders should exclude order ids already present in scheduled/tentative events'
)

assert.match(
  schedule,
  /const\s+getScheduledEvent\s*=\s*\(eventId:\s*string\)/,
  'selection helpers should resolve scheduled events by eventId'
)

assert.match(
  schedule,
  /selectedStartEventIds[\s\S]*selectedScheduledEventIds\.value[\s\S]*getScheduledEvent\(eventId\)/,
  'selectedStartEventIds should treat selected ids as event ids'
)

assert.match(
  schedule,
  /selectedStartOrders[\s\S]*event!\.orderId[\s\S]*deviceList:\s*order\.deviceList/,
  'selectedStartOrders should keep work-order semantics and include the full order deviceList'
)

assert.doesNotMatch(
  schedule,
  /selectedScheduledDeviceIds|selectedStartDeviceIds|resizingDeviceId|handleSelectScheduledDevice/,
  'event selection and resizing names should use event semantics, not deviceId naming'
)

assert.match(
  schedule,
  /selectedScheduledEventIds/,
  'composable should expose selectedScheduledEventIds'
)

assert.match(
  schedule,
  /resizingEventId/,
  'composable should expose resizingEventId'
)

assert.doesNotMatch(
  `${schedule}\n${dashboard}`,
  /\u93ba\u6386\u6e61\u6dc7\u6fde\u5c28\u6fca\u6fa4\u8fab\u89e6|\u934f\u683c\u6d88\u93ba\u6386\u6e61\u6fa4\u8fab\u89e6/,
  'user-visible schedule error fallback strings should not be mojibake'
)

assert.match(
  schedule,
  /\u6392\u671f\u4fdd\u5b58\u5931\u8d25/,
  'save failure fallback should be normal Chinese'
)

assert.match(
  schedule,
  /\u53d6\u6d88\u6392\u671f\u5931\u8d25/,
  'cancel failure fallback should be normal Chinese'
)

assert.match(
  dashboard,
  /:key="it\.eventId"/,
  'Dashboard scheduled block key should be eventId'
)

assert.doesNotMatch(
  dashboard,
  /:key="it\.deviceId"/,
  'Dashboard scheduled block key should not be the owner device id'
)

assert.match(
  dashboard,
  /emit\('unschedule',\s*it\.cellKey,\s*it\.eventId\)/,
  'Dashboard should delete a single block by eventId'
)

assert.match(
  dashboard,
  /emit\('start-resize',\s*it\.eventId,\s*\$event\)/,
  'Dashboard should resize a single block by eventId'
)

assert.match(
  dashboard,
  /selectedScheduledEventIds\.includes\(item\.eventId\)/,
  'Dashboard selected order rows should derive selection from eventId'
)

assert.doesNotMatch(
  dashboard,
  /selectedScheduledDeviceIds|resizingDeviceId|select-scheduled-device/,
  'Dashboard event selection and resizing props/emits should use event naming'
)

console.log('simulation-well schedule persistence assertions passed')
