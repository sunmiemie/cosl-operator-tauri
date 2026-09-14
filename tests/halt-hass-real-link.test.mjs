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
const workbenchConfigPath = join(root, 'src/services/hass-workbench-config.ts')
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
const workbenchConfig = readFileSync(workbenchConfigPath, 'utf8')
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
  /visibleOrderStatuses\s*=\s*\[1,\s*4\]/,
  'only unexecuted and redo orders may begin a newly selected process version',
)
assert.match(
  workOrderPage,
  /getOrderDetail\(order\.id\)[\s\S]*resetHardwarePreflight\(\)[\s\S]*resetScan\(\)[\s\S]*setScanOrder\(targetOrder\)[\s\S]*setPhase\('detect'\)/,
  'scheduled orders must reload details and return to device detection with fresh scan state',
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
  flojoyApi,
  /discoverHassHardwareBindings\(\['itech3123_48v'\]\)/,
  'pre-power binding must resolve only the client-bound 48V 3123 power supply',
)
assert.match(
  hardwareBinding,
  /'pulser',\s*[\r\n]+\s*'ifbox',\s*[\r\n]+\s*'itech3123',[\s\S]*\.\.\.getRequiredHassHardwareRoles\(nodes\)/,
  'preflight must check core devices and only add optional roles used by the process',
)
assert.match(
  hardwareBinding,
  /func === 'OPEN_SERIAL' && label\.includes\('脉冲器'\)/,
  'all explicitly labelled pulser serial nodes must receive the runtime COM binding',
)
assert.match(
  flojoyApi,
  /devices\/halt-hass\/resolve-bindings[\s\S]*json:\s*\{ roles, baudrates, profiles \}/,
  'runtime hardware binding must send the current client profiles to Flojoy',
)
assert.match(
  flojoyApi,
  /powerStabilizationSeconds:\s*20/,
  'preflight must wait 20 seconds after enabling the 48V 3123 output',
)
assert.match(flojoyApi, /timeout:\s*60000/, 'the client timeout must cover the 20-second startup wait')
assert.match(
  workbenchConfig,
  /role:\s*'pulser'[\s\S]*vid:\s*0x0403,[\s\S]*pid:\s*0x6001/,
  'the initial client profile must identify the pulser model without pinning another bench unit',
)
assert.match(
  workbenchConfig,
  /role:\s*'itech3123_48v'[\s\S]*vid:\s*0x2ec7,[\s\S]*pid:\s*0x0666/,
  'the initial client profile must recognize the 48V supply model before local assignment',
)
assert.match(
  workbenchConfig,
  /role:\s*'itech3123'[\s\S]*vid:\s*0x2ec7,[\s\S]*pid:\s*0x0666/,
  'the initial client profile must recognize the 90V supply model before local assignment',
)
assert.match(
  workbenchConfig,
  /role:\s*'ifbox'[\s\S]*interfaceMarker:\s*'TBUS PORT'/,
  'the client profile must identify the IFBOX TBus interface',
)
assert.match(
  workbenchConfig,
  /role:\s*'storage'[\s\S]*interfaceMarker:\s*'EXT PORT'/,
  'the client profile must distinguish the storage EXT interface from IFBOX TBus',
)
assert.doesNotMatch(
  preflightService,
  /ROLE_FIXED_PORTS|ROLE_USB_IDENTITIES|ROLE_INSTRUMENT_SERIALS|"itech3123":\s*"COM\d+"/,
  'backend discovery must not hardcode a workstation port or device identity',
)
assert.doesNotMatch(
  workbenchConfig,
  /803510011817110007|803510011817110003|BG02KQYKA|04A2744B8000/,
  'default client configuration must not contain unit-specific identities from another bench',
)
assert.match(
  preflightService,
  /profile:\s*HaltHassHardwareProfile[\s\S]*_get_persistent_serial_port/,
  'backend discovery must resolve stable Linux paths from client-owned profiles',
)
assert.match(
  hardwareBinding,
  /normalizeHassHardwareNodes[\s\S]*HARDWARE_CONTROL_TYPES[\s\S]*value:\s*''/,
  'saved processes must clear workstation-specific serial and VISA resources',
)
const powerCallIndex = preflightService.indexOf(') = _prepare_halt_hass_power(')
const waitIndex = preflightService.indexOf('time.sleep(stabilization_seconds)', powerCallIndex)
const enumerationIndex = preflightService.indexOf(
  'ports = list(serial.tools.list_ports.comports())',
  waitIndex,
)
const deviceCheckIndex = preflightService.indexOf('results.append(checker(binding))', enumerationIndex)
assert.ok(powerCallIndex >= 0, 'preflight must verify and enable the 48V 3123 output')
assert.ok(waitIndex > powerCallIndex, 'preflight must wait only after the 48V 3123 output is enabled')
assert.ok(enumerationIndex > waitIndex, 'powered devices must be enumerated after the startup wait')
assert.ok(deviceCheckIndex > enumerationIndex, 'other device communication checks must run after enumeration')
assert.match(
  preflightService,
  /def _restore_local[\s\S]*instrument\.write\("SYST:LOC"\)/,
  '3123 preflight must provide an explicit return-to-local-control command',
)
assert.match(
  preflightService,
  /finally:[\s\S]*_restore_local\(power_instrument\)[\s\S]*power_instrument\.close\(\)/,
  'preflight must restore local control before releasing the 3123 serial handle',
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
  preflightService.indexOf('def _check_ifbox'),
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
  'power-off must restore local control before closing the 3123 connection',
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
assert.doesNotMatch(service, /totalCycleDurationHours:\s*Number\(/, 'order mapping must not retain planned process duration')
assert.doesNotMatch(service, /remainingRuntimeSeconds:\s*Number\(/, 'order mapping must not retain planned remaining runtime')

assert.match(service, /listExecutionProcessOptions[\s\S]*orderId:\s*String\(order\.id\)/, 'client process selection must request options from the frozen order data')
assert.match(service, /item\.productModelId === order\.productModel\?\.id/, 'client process selection must recheck the product type')
assert.match(service, /item\.clientTestType === order\.clientTestType/, 'client process selection must recheck the client page type')
assert.match(service, /item\.experimentType === order\.experimentType/, 'client process selection must reject an unknown or mismatched experiment mode')
assert.match(service, /createHaltHassSession[\s\S]*processId:\s*number[\s\S]*orderIds:\s*number\[\][\s\S]*boards:/, 'session creation must carry the client-selected process and boards')
assert.match(
  workOrderPage,
  /await runFlowchart\([\s\S]*循环流开始运行，测试时间由工作台曲线控制/,
  'cycle flow must be accepted by Flojoy before it is reported as running',
)
assert.doesNotMatch(service, /startOrderCycleRuntime|pauseOrderCycleRuntime/, 'order runtime endpoints must be removed')
assert.doesNotMatch(service, /resetRunningOrderExecution/, 'legacy running-order reset must not remain in the client')
assert.doesNotMatch(service, /startOrder\(|uploadTempData|downloadTempData|downloadFeedbackData/, 'legacy order execution and resume APIs must not remain in the client')

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

assert.doesNotMatch(testFlow, /activateOrderRuntime|pauseCycleRuntime/, 'client must not account planned order runtime')
assert.doesNotMatch(testFlow, /restartRunningTest/, 'the removed partial restart mode must not remain')
assert.match(
  flojoyApi,
  /cancelCurrentFlowchartRun[\s\S]*jobsetId:\s*null/,
  'restart must support cancelling the active Flojoy topology after the local job id is lost',
)
assert.match(reportUploader, /循环次数/, 'report upload must display cycle count')
assert.doesNotMatch(reportUploader, /循环总时长/, 'report upload must not display planned cycle duration')
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
