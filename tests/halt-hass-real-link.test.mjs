import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const servicePath = join(root, 'src/services/halt-hass-order.ts')
const schedulePath = join(root, 'src/views/halt-hass-test/composables/useHaltHassSchedule.ts')

const service = readFileSync(servicePath, 'utf8')
const schedule = readFileSync(schedulePath, 'utf8')

assert.equal(
  schedule.includes('import.meta.env.DEV'),
  false,
  'schedule refresh must not short-circuit to mock orders in dev mode',
)
assert.equal(
  schedule.includes('requestFailed || !nextOrders.length'),
  false,
  'schedule refresh must not synthesize demo orders when the real backend returns an empty list',
)

assert.match(
  service,
  /getOrderBySerial[\s\S]*unwrapBackendEnvelope[\s\S]*unwrapped\.data[\s\S]*\.map\(mapHaltHassOrder\)/,
  'getOrderBySerial must unwrap backend envelope and map DTOs',
)
assert.match(service, /boardSerials,\s*[\s\S]*scannedBoards,/, 'mapHaltHassOrder must preserve management preset board serials')
assert.match(service, /scheduleSegments,/, 'mapHaltHassOrder must preserve backend schedule segments')

assert.match(service, /operatorId:\s*data\.operatorId/, 'startOrder must send camelCase operatorId')
assert.match(service, /boardSerials:\s*data\.boardSerials/, 'startOrder must send camelCase boardSerials')
assert.doesNotMatch(service, /operator_id:\s*data\.operatorId/, 'startOrder must not send operator_id')
assert.doesNotMatch(service, /board_serials:\s*data\.boardSerials/, 'startOrder must not send board_serials')

assert.match(service, /data:\s*tempData/, 'uploadTempData must send data')
assert.doesNotMatch(service, /data_json:\s*tempData/, 'uploadTempData must not send data_json')

assert.match(service, /orderId:\s*data\.orderId/, 'uploadReport must send orderId')
assert.match(service, /reportJson:\s*data\.reportJson/, 'uploadReport must send reportJson')
assert.match(service, /operatorId:\s*data\.operatorId/, 'uploadReport must send operatorId')
assert.doesNotMatch(service, /order_id:\s*data\.orderId/, 'uploadReport must not send order_id')
assert.doesNotMatch(service, /report_json:\s*data\.reportJson/, 'uploadReport must not send report_json')

assert.equal(
  service.includes('/test/halt-hass/process/'),
  false,
  'downloadProcessData must not use the missing process endpoint',
)
assert.match(
  service,
  /downloadProcessData[\s\S]*\/test\/halt-hass\/detail\/\$\{processId\}\//,
  'downloadProcessData must fetch process detail from the existing detail endpoint',
)
assert.match(
  service,
  /downloadFeedbackData[\s\S]*unwrapBackendEnvelope/,
  'downloadFeedbackData must unwrap backend feedback envelope',
)
assert.match(
  service,
  /const preset = order\.boardSerials \|\| \[\][\s\S]*if \(!matched\) return \{ valid: false \}/,
  'local scan validation must reject serials outside management preset board serials',
)

assert.doesNotMatch(
  schedule,
  /mapHaltHassOrder\(resp\.data\.data\)/,
  'schedule save responses only contain schedule fields and must not be mapped as full orders',
)
assert.match(
  schedule,
  /const updated:\s*HaltHassOrder\s*=\s*\{[\s\S]*\.\.\.order[\s\S]*scheduledStartAt[\s\S]*scheduledEndAt/,
  'schedule save must merge returned schedule fields into the existing order',
)
assert.match(
  schedule,
  /eventsFromOrderSchedule[\s\S]*order\.scheduleSegments/,
  'schedule restore must render backend schedule segments',
)

console.log('halt-hass real-link text checks passed')
