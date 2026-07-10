import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const modules = [
  {
    name: 'vibration',
    equipment: 'vibration-table',
    schedule: 'src/views/vibration/composables/useVibrationSchedule.ts',
    dashboard: 'src/views/vibration/components/VibrationDashboard.vue',
    page: 'src/views/vibration/index.vue',
    selectedPrune: /pruneSelectedScheduledOrderIdsForActiveHost/,
    visibleGuard: /isScheduledOrderVisibleInActiveHost/,
  },
  {
    name: 'water-cycle',
    equipment: 'water-cycle',
    schedule: 'src/views/water-cycle/composables/useSchedule.ts',
    dashboard: 'src/views/water-cycle/components/DashboardView.vue',
    selectedPrune: /pruneSelectedScheduledOrderIdsForActiveHost/,
    visibleGuard: /isScheduledOrderVisibleInActiveHost/,
  },
  {
    name: 'high-temp-box',
    equipment: 'high-temp-box',
    schedule: 'src/views/high-temp-box/composables/useHighTempBox.ts',
    dashboard: 'src/views/high-temp-box/components/HighTempBoxDashboard.vue',
    selectedPrune: /pruneSelectedScheduledOrderForActiveHost/,
    visibleGuard: /isScheduledEventVisibleInActiveHost/,
  },
  {
    name: 'halt-hass',
    equipment: 'halt-hass',
    schedule: 'src/views/halt-hass-test/composables/useHaltHassSchedule.ts',
    dashboard: 'src/views/halt-hass-test/components/HaltHassScheduleDashboard.vue',
    selectedPrune: /pruneSelectedScheduledOrderForActiveHost/,
    visibleGuard: /isScheduledEventVisibleInActiveHost/,
  },
  {
    name: 'simulation-well',
    equipment: 'simulated-well',
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
  assert.match(schedule, /hostDeviceNames\s*=\s*ref<string\[\]>\(\[\]\)/, `${mod.name} should store database host inventory`)
  assert.match(schedule, new RegExp(`fetchScheduleHostDeviceNames\\('${mod.equipment}'`), `${mod.name} should request hosts for its database model`)
  assert.match(schedule, /hostDeviceTabs\s*=\s*computed/, `${mod.name} should derive concrete host tabs`)
  assert.match(schedule, /hostDeviceTabs\s*=\s*computed\(\(\)\s*=>\s*\{\s*return\s*\[\.\.\.hostDeviceNames\.value\]\s*\}\)/, `${mod.name} should display exactly the database host names`)
  assert.doesNotMatch(schedule, /hostDeviceTabs\s*=\s*computed\(\(\)\s*=>\s*\{\s*return\s+(?:Array\.from|workOrders\.value|deviceIndex\.value)/, `${mod.name} should not derive host tabs from work orders`)
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

const globalStatusDashboards = [
  ['high-temp-pressure', 'src/views/high-temp-pressure/components/DashboardPanel.vue'],
  ['vibration', 'src/views/vibration/components/VibrationDashboard.vue'],
  ['water-cycle', 'src/views/water-cycle/components/DashboardView.vue'],
  ['high-temp-box', 'src/views/high-temp-box/components/HighTempBoxDashboard.vue'],
  ['halt-hass', 'src/views/halt-hass-test/components/HaltHassScheduleDashboard.vue'],
  ['simulation-well', 'src/views/simulation-well/components/SimulationWellDashboard.vue'],
]

for (const [name, path] of globalStatusDashboards) {
  const dashboard = read(path)
  assert.match(
    dashboard,
    /Object\.values\((?:props\.)?scheduledOrders(?:\.value)?(?:\s*\|\|\s*\{\})?\)/,
    `${name} left-side status should use schedules from every host`
  )
  assert.doesNotMatch(
    dashboard,
    /new\s+Set\((?:props\.)?scheduledLayoutItems(?:\.value)?\.map\([^)]*item\.orderId/,
    `${name} left-side status should not depend on the active-host calendar layout`
  )
}

const highTempBoxSchedule = read('src/views/high-temp-box/composables/useHighTempBox.ts')
assert.match(highTempBoxSchedule, /async\s+function\s+refreshHostDeviceNames\(\)\s*\{[\s\S]*const\s+authOk\s*=\s*await\s+initAuth\(\)[\s\S]*if\s*\(!authOk\)\s*return[\s\S]*fetchScheduleHostDeviceNames/, 'high-temp-box should initialize auth before requesting device instances')
assert.match(highTempBoxSchedule, /async\s+function\s+getRequiredAuthHeaders\(\)/, 'high-temp-box should centralize auth headers for protected mutations')
assert.match(highTempBoxSchedule, /const\s+headers\s*=\s*await\s+getRequiredAuthHeaders\(\)[\s\S]*changeHighTempBoxOrderStatus\([\s\S]*headers/, 'high-temp-box start experiment should pass auth headers to status mutations')
assert.doesNotMatch(highTempBoxSchedule, /changeHighTempBoxOrderStatus\([\s\S]{0,120}undefined,[\s\S]{0,120}\{(?:\s*runningInstrumentIds|\s*completedInstrumentIds)/, 'high-temp-box status mutations should not pass undefined auth headers')
assert.doesNotMatch(highTempBoxSchedule, /isHighTempBoxHostName|\^高温箱/, 'high-temp-box should not restrict database host names with a naming regex')

const waterCycleSchedule = read('src/views/water-cycle/composables/useSchedule.ts')
assert.doesNotMatch(waterCycleSchedule, /WATER_CYCLE_HOST_NAMES|new\s+Set\(\['水循环'/, 'water-cycle host names should not be hard-coded')
assert.match(waterCycleSchedule, /await\s+refreshHostDeviceNames\(\)[\s\S]*syncActiveHostDeviceName\(\)/, 'water-cycle should refresh host inventory before selecting the active host')

const scheduleHostDeviceApi = read('src/services/schedule-host-device-api.ts')
assert.match(scheduleHostDeviceApi, /listDeviceInstances\(\{\s*currentPage:\s*1,\s*size:\s*2000\s*\}/, 'shared host inventory should read the complete database device-instance list')
assert.match(scheduleHostDeviceApi, /row\.psimodel_name[\s\S]*row\.modelName[\s\S]*row\.model_name/, 'host classification should prefer database model metadata')
assert.match(scheduleHostDeviceApi, /filter\(\(row\)\s*=>\s*isScheduleHostDevice\(row,\s*equipment\)\)[\s\S]*map\(getScheduleHostDeviceName\)[\s\S]*filter\(Boolean\)/, 'shared inventory should retain every named instance of the selected model')
assert.match(scheduleHostDeviceApi, /Array\.from\(new\s+Set\(names\)\)/, 'shared inventory should only de-duplicate exact database instance names')
assert.doesNotMatch(scheduleHostDeviceApi, /高温高压井-\d|高温箱-\d|振动台-\d|水循环-\d|模拟井-\d/, 'shared inventory should not contain concrete numbered host names')

for (const equipment of ['high-temp-pressure', 'halt-hass', 'vibration-table', 'water-cycle', 'simulated-well', 'high-temp-box']) {
  assert.match(scheduleHostDeviceApi, new RegExp(`'${equipment}'`), `shared host inventory should support ${equipment}`)
}

console.log('remaining schedule host scope assertions passed')
