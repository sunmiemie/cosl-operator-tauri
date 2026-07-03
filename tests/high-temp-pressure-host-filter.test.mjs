import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const schedule = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureSchedule.ts'), 'utf8')
const dashboard = readFileSync(resolve(root, 'src/views/high-temp-pressure/components/DashboardPanel.vue'), 'utf8')
const page = readFileSync(resolve(root, 'src/views/high-temp-pressure/index.vue'), 'utf8')
const types = readFileSync(resolve(root, 'src/views/high-temp-pressure/types.ts'), 'utf8')

assert.match(types, /useDevice\?:\s*string/, 'WorkOrder should expose the backend use_device host name')
assert.match(schedule, /useDevice:\s*useDevice/, 'mapHighTempPressureOrder should preserve dto.use_device on WorkOrder')
assert.match(schedule, /const\s+activeHostDeviceName\s*=\s*ref\(''\)/, 'schedule state should track the active host filter')
assert.match(schedule, /const\s+hostDeviceTabs\s*=\s*computed/, 'schedule state should derive host-name filter tabs')
assert.match(schedule, /new Set\(workOrders\.value\.map\(\(order\)\s*=>\s*order\.useDevice/, 'host tabs should be derived from order.useDevice')
assert.match(schedule, /const\s+hostName\s*=\s*activeHostDeviceName\.value\.trim\(\)/, 'unscheduledOrders should read the active host filter')
assert.match(schedule, /hostName\s*===\s*''\s*\|\|\s*order\.useDevice\s*===\s*hostName/, 'unscheduledOrders should filter orders by exact host name')
assert.match(schedule, /const\s+activeScheduleHostName\s*=\s*activeHostDeviceName\.value\.trim\(\)/, 'scheduledLayoutItems should read the active host filter')
assert.match(schedule, /const\s+order\s*=\s*getOrderByInstrumentId\(ev\.instrumentId\)/, 'scheduledLayoutItems should find each scheduled block owner order')
assert.match(schedule, /activeScheduleHostName\s*&&\s*order\?\.useDevice\s*!==\s*activeScheduleHostName/, 'scheduledLayoutItems should hide blocks from other host names')

assert.match(dashboard, /hostDeviceTabs:\s*string\[\]/, 'DashboardPanel should receive host-name tabs')
assert.match(dashboard, /activeHostDeviceName:\s*string/, 'DashboardPanel should receive the active host-name filter')
assert.match(dashboard, /'update:activeHostDeviceName':\s*\[value:\s*string\]/, 'DashboardPanel should emit host filter updates')
assert.match(dashboard, /host-filter-tabs/, 'DashboardPanel should render host filter tabs')
assert.match(dashboard, /emit\('update:activeHostDeviceName',\s*host\)/, 'host filter buttons should update the active host filter')

assert.match(page, /:host-device-tabs="schedule\.hostDeviceTabs\.value"/, 'index.vue should pass host tabs into DashboardPanel')
assert.match(page, /:active-host-device-name="schedule\.activeHostDeviceName\.value"/, 'index.vue should pass the active host filter into DashboardPanel')
assert.match(page, /@update:active-host-device-name="schedule\.activeHostDeviceName\.value = \$event"/, 'index.vue should wire host filter updates')

console.log('high-temp-pressure host filter assertions passed')
