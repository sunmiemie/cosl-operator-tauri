import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const servicePath = join(root, 'src/services/halt-hass-order.ts')
const schedulePath = join(root, 'src/views/halt-hass-test/composables/useHaltHassSchedule.ts')
const testFlowPath = join(root, 'src/views/halt-hass-test/composables/useHaltHassTest.ts')
const reportUploaderPath = join(root, 'src/views/halt-hass-test/components/ReportUploader.vue')
const processTypesPath = join(root, 'src/views/process-halt-hass/types.ts')
const processEditorPath = join(root, 'src/views/process-halt-hass/index.vue')
const workOrderPagePath = join(root, 'src/views/halt-hass-test/index.vue')
const scheduleDashboardPath = join(
  root,
  'src/views/halt-hass-test/components/HaltHassScheduleDashboard.vue',
)
const hardwareBindingPath = join(root, 'src/services/hass-hardware-binding.ts')
const flojoyApiPath = join(root, 'src/services/flojoy-api.ts')
const preflightServicePath = join(
  root,
  'src-tauri/resources/flojoy/captain/services/halt_hass_preflight.py',
)

const service = readFileSync(servicePath, 'utf8')
const schedule = readFileSync(schedulePath, 'utf8')
const testFlow = readFileSync(testFlowPath, 'utf8')
const reportUploader = readFileSync(reportUploaderPath, 'utf8')
const processTypes = readFileSync(processTypesPath, 'utf8')
const processEditor = readFileSync(processEditorPath, 'utf8')
const workOrderPage = readFileSync(workOrderPagePath, 'utf8')
const scheduleDashboard = readFileSync(scheduleDashboardPath, 'utf8')
const hardwareBinding = readFileSync(hardwareBindingPath, 'utf8')
const flojoyApi = readFileSync(flojoyApiPath, 'utf8')
const preflightService = readFileSync(preflightServicePath, 'utf8')
const flojoySocket = readFileSync(
  join(root, 'src/composables/useFlojoySocket.ts'),
  'utf8',
)

assert.match(processTypes, /schemaVersion:\s*2/, 'HALT-HASS process schema must be version 2')
assert.match(processTypes, /testFlow:\s*HaltHassFlowchart/, 'process must persist an independent test flow')
assert.match(processTypes, /cycleFlow:\s*HaltHassFlowchart/, 'process must persist an independent cycle flow')
assert.doesNotMatch(processTypes, /^\s*flowchart:\s*HaltHassFlowchart/m, 'new schema must not retain the single-flow field')
assert.match(processEditor, /测试流编辑/, 'process editor must expose the test-flow page')
assert.match(processEditor, /循环流编辑/, 'process editor must expose the cycle-flow page')
assert.match(workOrderPage, /advanceToCycleFlow/, 'work-order execution must advance from test flow to cycle flow')
assert.match(workOrderPage, /测试流尚未通过，不能运行循环流/, 'cycle flow must be gated by test-flow success')
assert.match(
  flojoySocket,
  /res\.RUNNING_NODE !== undefined[\s\S]*runningBlock\.value = res\.RUNNING_NODE/,
  'an empty RUNNING_NODE must clear the final-node spinner',
)
assert.match(
  workOrderPage,
  /NODE_RESULTS 是节点成功完成的权威消息[\s\S]*watch\(\s*blockResults/,
  'node completion must be driven by NODE_RESULTS instead of node start',
)
assert.match(
  workOrderPage,
  /\(\) => completedNodes\.value\.length/,
  'test-flow completion must watch the reactive completed-node count',
)
assert.match(
  workOrderPage,
  /status === ServerStatus\.STANDBY[\s\S]*completeActiveFlowchartRun/,
  'Flojoy standby must finalize both test and cycle flows',
)
assert.match(
  schedule,
  /visibleOrderStatuses\s*=\s*\[1,\s*2,\s*4,\s*7\]/,
  'orders must remain visible while testing and before report submission',
)
assert.match(
  workOrderPage,
  /getOrderDetail\(order\.id\)[\s\S]*if \(targetOrder\.status === 2\)[\s\S]*ensureFlojoyConnected\(\)[\s\S]*cancelCurrentFlowchartRun\(\)[\s\S]*resetRunningOrderExecution\(targetOrder\.id\)[\s\S]*setScanOrder\(freshOrder,\s*\[\]\)[\s\S]*setPhase\('detect'\)/,
  'testing orders must clear stale execution and return to device detection with no retained scans',
)
assert.match(
  scheduleDashboard,
  /开始测试/,
  'scheduled orders must use the normal start-test action',
)
assert.match(
  scheduleDashboard,
  /if \(order\.status === 2\) return '测试中'[\s\S]*scheduledOrderIdSet\.value\.has/,
  'testing status must take precedence over the generic scheduled status',
)
assert.match(
  scheduleDashboard,
  /排程：\{\{ getOrderScheduleText\(selectedInfo\) \}\}/,
  'the selected work order must display its persisted schedule range',
)
assert.match(
  hardwareBinding,
  /resolveHassHardwareBindings\(\['itech6723'\], serialDevices\)/,
  'pre-power binding must resolve only the 6723G power supply',
)
assert.match(
  hardwareBinding,
  /'pulser',\s*[\r\n]+\s*'ifbox',\s*[\r\n]+\s*'itech3123',\s*[\r\n]+\s*'storage'/,
  'preflight must check the complete powered test bench after startup',
)
assert.match(
  hardwareBinding,
  /displayName:\s*'存储板'[\s\S]*matches:\s*matchesExtPort/,
  'storage board must bind to the composite device EXT Port',
)
assert.match(
  flojoyApi,
  /powerStabilizationSeconds:\s*20/,
  'preflight must wait 20 seconds after enabling 6723G output',
)
assert.match(flojoyApi, /timeout:\s*60000/, 'the client timeout must cover the 20-second startup wait')
assert.match(
  preflightService,
  /"pulser": \(0x0403, 0x6001, "B003PLDPA"\)/,
  'the powered pulser must be rediscovered by its stable USB identity',
)
assert.match(
  preflightService,
  /"storage":\s*"EXT PORT"/,
  'storage board discovery must distinguish EXT Port from the IFBOX TBus Port',
)
const powerCallIndex = preflightService.indexOf(') = _prepare_halt_hass_power(')
const waitIndex = preflightService.indexOf('time.sleep(stabilization_seconds)', powerCallIndex)
const enumerationIndex = preflightService.indexOf(
  'ports = list(serial.tools.list_ports.comports())',
  waitIndex,
)
const deviceCheckIndex = preflightService.indexOf('results.append(checker(binding))', enumerationIndex)
assert.ok(powerCallIndex >= 0, 'preflight must verify and enable 6723G output')
assert.ok(waitIndex > powerCallIndex, 'preflight must wait only after 6723G output is enabled')
assert.ok(enumerationIndex > waitIndex, 'powered devices must be enumerated after the startup wait')
assert.ok(deviceCheckIndex > enumerationIndex, 'other device communication checks must run after enumeration')
assert.match(
  preflightService,
  /def _restore_local[\s\S]*instrument\.write\("SYST:LOC"\)/,
  '6723G preflight must provide an explicit return-to-local-control command',
)
assert.match(
  preflightService,
  /finally:[\s\S]*_restore_local\(power_instrument\)[\s\S]*power_instrument\.close\(\)/,
  'preflight must restore local control before releasing the 6723G serial handle',
)
assert.doesNotMatch(
  preflightService,
  /_turn_off\(power_instrument\)/,
  'communication preflight must not turn off the maintained 48 V output',
)
assert.match(
  preflightService,
  /powerMaintained=power_instrument is not None/,
  'preflight must report maintained power independently from other communication results',
)
assert.doesNotMatch(
  workOrderPage,
  /releasePreflightPower|releaseHassPreflightPower/,
  'leaving or retrying preflight must not automatically turn off 48 V',
)
assert.doesNotMatch(
  preflightService,
  /IFBOX_OPEN_COMMAND|set zero position|set startend angles/i,
  'preflight must not execute process actions',
)
const onlineCheckSource = preflightService.slice(
  preflightService.indexOf('def _check_serial_online'),
  preflightService.indexOf('def run_halt_hass_preflight'),
)
assert.match(
  onlineCheckSource,
  /with serial\.Serial\(/,
  'serial preflight must verify that the enumerated port can be opened',
)
assert.doesNotMatch(
  onlineCheckSource,
  /connection\.write|connection\.read|instrument\.query/,
  'device-online preflight must not send or expect business protocol data',
)
assert.match(
  preflightService,
  /def turn_off_halt_hass_power[\s\S]*instrument\.write\("OUTP OFF"\)[\s\S]*_restore_local\(instrument\)[\s\S]*instrument\.close\(\)/,
  'power-off must restore local control before closing the 6723G connection',
)

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
assert.match(service, /cycleCount:\s*Number\(dto\.cycle_count \?\? dto\.cycleCount/, 'order mapping must preserve cycle count')
assert.match(service, /totalCycleDurationHours:\s*Number\(/, 'order mapping must preserve cycle total duration')
assert.match(service, /remainingRuntimeSeconds:\s*Number\(/, 'order mapping must preserve remaining runtime')

assert.match(service, /operatorId:\s*data\.operatorId/, 'startOrder must send camelCase operatorId')
assert.match(service, /boardSerials:\s*data\.boardSerials/, 'startOrder must send camelCase boardSerials')
assert.doesNotMatch(service, /restart:\s*data\.restart/, 'normal start must not carry the removed restart mode')
assert.match(
  service,
  /startOrderCycleRuntime[\s\S]*\/test\/halt-hass\/order\/cycle\/start\/\$\{orderId\}\//,
  'cycle runtime must start through its dedicated endpoint',
)
assert.match(
  workOrderPage,
  /await runFlowchart\([\s\S]*activateCycleRuntime\(\)/,
  'cycle runtime accounting must start only after Flojoy accepts the cycle flow',
)
assert.match(
  service,
  /pauseOrderCycleRuntime[\s\S]*\/test\/halt-hass\/order\/cycle\/pause\/\$\{orderId\}\//,
  'cycle runtime must provide an idempotent pause endpoint',
)
assert.match(
  workOrderPage,
  /completeActiveFlowchartRun[\s\S]*pauseCycleRuntime\(\)[\s\S]*onFlowchartComplete/,
  'cycle completion must freeze accumulated runtime before report upload',
)
assert.match(
  service,
  /resetRunningOrderExecution[\s\S]*\/test\/halt-hass\/order\/reset-running\/\$\{orderId\}\//,
  'running-order reset must use a dedicated endpoint without scanned serials',
)
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
  testFlow,
  /restoreTemp[\s\S]*activateOrderRuntime\(order\)/,
  'restoring saved work must resume backend runtime accounting',
)
assert.match(
  testFlow,
  /loadFeedback[\s\S]*activateOrderRuntime\(order\)/,
  'redo work must restart backend runtime accounting',
)
assert.doesNotMatch(testFlow, /restartRunningTest/, 'the removed partial restart mode must not remain')
assert.match(
  flojoyApi,
  /cancelCurrentFlowchartRun[\s\S]*jobsetId:\s*null/,
  'restart must support cancelling the active Flojoy topology after the local job id is lost',
)
assert.match(reportUploader, /循环次数/, 'report upload must display cycle count')
assert.match(reportUploader, /循环总时长/, 'report upload must display total cycle duration')
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
