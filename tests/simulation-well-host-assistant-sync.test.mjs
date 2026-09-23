import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const api = read('src/services/simulated-well-api.ts')
const schedule = read('src/views/simulation-well/composables/useSimulationWellScheduleV2.ts')
const scheduleHostDeviceApi = read('src/services/schedule-host-device-api.ts')

assert.match(
  scheduleHostDeviceApi,
  /'simulated-well':\s*\['模拟井',\s*'MSY-800'\]/,
  'simulation well host inventory should recognize the formal MSY-800 model'
)

assert.match(
  schedule,
  /fetchScheduleHostDeviceNames\('simulated-well',\s*headers\)/,
  'simulation well should load host inventory by simulated-well model'
)
assert.match(
  schedule,
  /hostDevicePsiIdsByName\.value\s*=\s*result\.psiIdsByName/,
  'simulation well should retain the host-name to psi_id mapping'
)
assert.match(
  schedule,
  /hostDeviceName:\s*segment\.useDevice[\s\S]*equipmentId:\s*segment\.equipmentId/,
  'saved schedule segments should restore their host assignment'
)
assert.match(
  schedule,
  /return\s+event\?\.hostDeviceName\?\.trim\(\)\s*\|\|\s*'-'/,
  'calendar host filtering should use the assigned host instead of the tested product name'
)
assert.match(
  schedule,
  /use_device:\s*segment\.hostDeviceName[\s\S]*equipment_id:\s*segment\.equipmentId/,
  'every schedule segment should send the selected host name and psi_id'
)
assert.match(
  schedule,
  /if\s*\(!scheduleHostDeviceName\)[\s\S]*请先选择主机后再保存排期/,
  'creating a schedule without a selected host should be blocked'
)
assert.match(
  schedule,
  /if\s*\(!scheduleHostEquipmentId\)[\s\S]*缺少 psi_id/,
  'creating a schedule without a resolvable host psi_id should be blocked'
)

assert.match(
  api,
  /SimulatedWellDeviceScheduleBody[\s\S]*use_device:\s*string[\s\S]*equipment_id:\s*string/,
  'simulated-well schedule request types should include host identity'
)
assert.match(
  api,
  /SimulatedWellAssistantSync[\s\S]*queued\?:\s*boolean[\s\S]*list\?:\s*Array<\{\s*error\?:\s*string;\s*reason\?:\s*string\s*\}>/,
  'simulated-well schedule response should expose assistant sync feedback'
)

const feedbackStart = schedule.indexOf('const assistantSync = resp.data.data?.assistantSync')
const feedbackEnd = schedule.indexOf('      } else {', feedbackStart)
assert.ok(feedbackStart >= 0 && feedbackEnd > feedbackStart, 'assistant sync feedback block should exist')
const feedbackBlock = schedule.slice(feedbackStart, feedbackEnd)
assert.match(feedbackBlock, /assistantSync\?\.queued\s*===\s*true[\s\S]*排程已保存，小助手同步处理中/)
assert.match(feedbackBlock, /assistantSync\?\.success\s*===\s*false[\s\S]*排期已保存，但第三方排期同步失败/)

console.log('simulation-well host assistant sync assertions passed')
