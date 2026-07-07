import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const modules = [
  {
    name: 'vibration',
    schedule: 'src/views/vibration/composables/useVibrationSchedule.ts',
    dashboard: 'src/views/vibration/components/VibrationDashboard.vue',
    page: 'src/views/vibration/index.vue',
    selectedPrune: /pruneSelectedScheduledOrderIdsForActiveHost/,
    visibleGuard: /isScheduledOrderVisibleInActiveHost/,
  },
  {
    name: 'water-cycle',
    schedule: 'src/views/water-cycle/composables/useSchedule.ts',
    dashboard: 'src/views/water-cycle/components/DashboardView.vue',
    selectedPrune: /pruneSelectedScheduledOrderIdsForActiveHost/,
    visibleGuard: /isScheduledOrderVisibleInActiveHost/,
  },
  {
    name: 'high-temp-box',
    schedule: 'src/views/high-temp-box/composables/useHighTempBox.ts',
    dashboard: 'src/views/high-temp-box/components/HighTempBoxDashboard.vue',
    selectedPrune: /pruneSelectedScheduledOrderForActiveHost/,
    visibleGuard: /isScheduledEventVisibleInActiveHost/,
  },
  {
    name: 'halt-hass',
    schedule: 'src/views/halt-hass-test/composables/useHaltHassSchedule.ts',
    dashboard: 'src/views/halt-hass-test/components/HaltHassScheduleDashboard.vue',
    selectedPrune: /pruneSelectedScheduledOrderForActiveHost/,
    visibleGuard: /isScheduledEventVisibleInActiveHost/,
  },
  {
    name: 'simulation-well',
    schedule: 'src/views/simulation-well/composables/useSimulationWellScheduleV2.ts',
    dashboard: 'src/views/simulation-well/components/SimulationWellDashboard.vue',
    page: 'src/views/simulation-well/index.vue',
    selectedPrune: /pruneSelectedScheduledEventIdsForActiveHost/,
    visibleGuard: /isScheduledEventVisibleInActiveHost/,
  },
]

for (const mod of modules) {
  const schedule = read(mod.schedule)
  const dashboard = read(mod.dashboard)
  const page = mod.page ? read(mod.page) : ''

  assert.match(schedule, /activeHostDeviceName\s*=\s*ref\(''\)/, `${mod.name} should track active host scope`)
  assert.match(schedule, /hostDeviceTabs\s*=\s*computed/, `${mod.name} should derive concrete host tabs`)
  assert.match(schedule, /function\s+syncActiveHostDeviceName/, `${mod.name} should default stale or empty active host`)
  assert.match(schedule, /function\s+assignHostDeviceToCurrentScope/, `${mod.name} should expose host tab switching`)
  assert.match(schedule, /doesScheduledEventMatchActiveHostDevice/, `${mod.name} should compare scheduled events against active host`)
  assert.match(schedule, mod.visibleGuard, `${mod.name} should check whether selected schedules are visible in active host`)
  assert.match(schedule, mod.selectedPrune, `${mod.name} should prune hidden selected schedules on host switch`)
  assert.match(schedule, /if\s*\(!activeScheduleHostName\)\s*return\s+true/, `${mod.name} should keep all calendar blocks visible when no active host exists`)
  assert.match(schedule, /scheduledLayoutItems\s*=\s*computed[\s\S]*activeHostDeviceName\.value\.trim\(\)/, `${mod.name} calendar layout should read active host`)
  assert.match(schedule, /scheduledLayoutItems\s*=\s*computed[\s\S]*doesScheduledEventMatchActiveHostDevice/, `${mod.name} calendar layout should filter by active host`)

  assert.match(dashboard, /host-filter-tabs/, `${mod.name} dashboard should render host tabs`)
  assert.match(dashboard, /v-for="host in hostDeviceTabs"/, `${mod.name} dashboard should render concrete hosts only`)
  assert.match(dashboard, /activeHostDeviceName === host/, `${mod.name} dashboard should mark active host`)
  assert.match(dashboard, /assign-host-device|assignHostDeviceToCurrentScope/, `${mod.name} dashboard should switch host scope`)

  if (page) {
    assert.match(page, /active-host-device-name|activeHostDeviceName/, `${mod.name} page should pass active host scope`)
    assert.match(page, /host-device-tabs|hostDeviceTabs/, `${mod.name} page should pass host tabs`)
    assert.match(page, /assign-host-device|assignHostDeviceToCurrentScope/, `${mod.name} page should wire host switch`)
  }
}

const simulationSchedule = read('src/views/simulation-well/composables/useSimulationWellScheduleV2.ts')
assert.doesNotMatch(simulationSchedule, /if\s*\(scheduledOrderIds\.value\.has\(order\.id\)\)\s*return\s+false/, 'simulation-well left list should no longer hide scheduled orders')

const highTempBoxSchedule = read('src/views/high-temp-box/composables/useHighTempBox.ts')
assert.match(highTempBoxSchedule, /listDeviceInstances/, 'high-temp-box host tabs should be backed by device instance inventory')
assert.match(highTempBoxSchedule, /function\s+isHighTempBoxHostName/, 'high-temp-box host tabs should filter concrete high-temp-box instance names')
assert.match(highTempBoxSchedule, /filter\(isHighTempBoxHostName\)/, 'high-temp-box host tabs should exclude test platforms and generic device names')
assert.doesNotMatch(highTempBoxSchedule, /hostDeviceTabs\s*=\s*computed\(\(\)\s*=>\s*\{[\s\S]*workOrders\.value\.map\(\(order\)\s*=>\s*getOrderHostDeviceName\(order\)\)/, 'high-temp-box host tabs should not be derived from work-order testPlatform/deviceName values')

console.log('remaining schedule host scope assertions passed')
