import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'


const repoRoot = path.resolve(import.meta.dirname, '..')
const runtimeModule = await import(pathToFileURL(
  path.join(repoRoot, 'src/services/hass-cycle-runtime.ts')
).href)
const mqttTelemetryModule = await import(pathToFileURL(
  path.join(repoRoot, 'src/services/hass-mqtt-telemetry.ts')
).href)
const hardwareBindingModule = await import(pathToFileURL(
  path.join(repoRoot, 'src/services/hass-hardware-binding.ts')
).href)

const {
  applyHassCycleDuration,
  buildHassCycleRunSettings,
  hasHassDurationLoop,
  resolveRemainingRuntimeSeconds,
} = runtimeModule
const { parseHassMqttTelemetry } = mqttTelemetryModule
const {
  getRequiredHassHardwareRoles,
  resolveHassHardwareBindings,
} = hardwareBindingModule

const compositeBindings = resolveHassHardwareBindings(
  ['ifbox', 'storage'],
  [
    {
      port: 'COM20',
      description: 'TBus Port (Interface 0)',
      manufacturer: 'Halt-Hass',
      hwid: 'USB VID:PID=2E3C:7543 SER=TEST',
    },
    {
      port: 'COM21',
      description: 'EXT Port (Interface 4)',
      manufacturer: 'Halt-Hass',
      hwid: 'USB VID:PID=2E3C:7543 SER=TEST',
    },
  ],
)
assert.equal(compositeBindings[0].port, 'COM20')
assert.equal(compositeBindings[1].port, 'COM21')
assert.deepEqual(
  getRequiredHassHardwareRoles([
    {
      id: 'storage-open',
      data: { func: 'OPEN_SERIAL', label: '打开存储板串口' },
    },
  ]),
  ['storage'],
)

const durationNode = {
  id: 'HALT_HASS_DURATION_LOOP-test',
  data: {
    func: 'HALT_HASS_DURATION_LOOP',
    ctrls: {
      duration_seconds: {
        type: 'float',
        value: 3600,
      },
    },
  },
}

assert.equal(hasHassDurationLoop([durationNode]), true)
assert.equal(hasHassDurationLoop([]), false)

const nowMs = Date.parse('2026-07-27T10:01:40+08:00')
assert.equal(
  resolveRemainingRuntimeSeconds(
    {
      requiredRuntimeSeconds: 3600,
      elapsedRuntimeSeconds: 0,
      remainingRuntimeSeconds: 3600,
      currentRunStartedAt: '2026-07-27T10:00:00+08:00',
    },
    nowMs,
  ),
  3500,
)

const injectedNodes = applyHassCycleDuration([durationNode], 123)
assert.equal(
  injectedNodes[0].data.ctrls.duration_seconds.value,
  123,
)
assert.equal(
  durationNode.data.ctrls.duration_seconds.value,
  3600,
  '运行时注入不得修改工艺缓存',
)

assert.deepEqual(
  buildHassCycleRunSettings(
    {
      nodeDelay: 0,
      maximumRuntime: 100,
      maximumConcurrentWorkers: 4,
    },
    300,
  ),
  {
    nodeDelay: 0,
    maximumRuntime: 360,
    maximumConcurrentWorkers: 1,
  },
)

assert.deepEqual(
  parseHassMqttTelemetry({
    topic: 'EDM/THV/Test/THStatus',
    payload: {
      TotalTime: 12.5,
      ControlTemperature: '-31.2',
      TargetTemperature: -35,
    },
    receivedAt: 1000,
  }),
  {
    kind: 'temperature',
    time: 12.5,
    actual: -31.2,
    target: -35,
  },
)

assert.deepEqual(
  parseHassMqttTelemetry({
    topic: 'EDM/THV/Test/VibStatus',
    payload: {
      ControlVibration: 8.4,
      TargetVibration: 9,
    },
    receivedAt: 42000,
  }),
  {
    kind: 'vibration',
    time: 42,
    actual: 8.4,
    target: 9,
  },
)

const waveformSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/blocks/HARDWARE/PULSER/READ_PULSER_WAVEFORM/READ_PULSER_WAVEFORM.py',
  ),
  'utf8',
)
assert.doesNotMatch(
  waveformSource,
  /pyqtgraph|PyQt|QApplication|sys\.exit|matplotlib/i,
  '无界面脉冲器节点不得引入窗口绘图库',
)
assert.match(waveformSource, /OrderedPair/)
assert.match(waveformSource, /inject_connection=True/)
assert.match(waveformSource, /get_or_start_pulser_reader/)
assert.match(
  waveformSource,
  /stream_status\["target_y"\]\s*=\s*target_values\.tolist\(\)/,
  '无界面脉冲器节点必须同时向客户端返回目标曲线',
)
assert.doesNotMatch(
  waveformSource,
  /raise TimeoutError/,
  '脉冲器单轮无上报数据不得终止循环流',
)

const pulserStreamSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/blocks/HARDWARE/PULSER/READ_PULSER_WAVEFORM/pulser_stream.py',
  ),
  'utf8',
)
assert.match(pulserStreamSource, /threading\.Thread/)
assert.match(pulserStreamSource, /daemon=True/)

for (const blockName of ['READ_COMM', 'READ_MAST', 'READ_STATUS']) {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      `src-tauri/resources/flojoy/blocks/HARDWARE/TBUS/${blockName}/${blockName}.py`,
    ),
    'utf8',
  )
  assert.match(source, /bounded_tbus_query/)
  assert.doesNotMatch(
    source,
    /\bsleep\s*\(/,
    `${blockName} 不得用固定 sleep 阻塞循环流`,
  )
}

for (const blockName of ['READ_COMM', 'READ_MAST']) {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      `src-tauri/resources/flojoy/blocks/HARDWARE/TBUS/${blockName}/${blockName}.py`,
    ),
    'utf8',
  )
  assert.match(
    source,
    /decode_tbus_payload/,
    `${blockName} 必须把 TBUS 传输帧解析为板卡信息`,
  )
  assert.match(
    source,
    /serial_hex/,
    `${blockName} 必须保留原始串口帧供问题排查`,
  )
}

const storageReadSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/blocks/HARDWARE/MEMORY/READ_MEMORY_ADDRESS/READ_MEMORY_ADDRESS.py',
  ),
  'utf8',
)
assert.match(storageReadSource, /bounded_serial_query/)
assert.match(storageReadSource, /AA560007A1000400000000AB/)
assert.doesNotMatch(
  storageReadSource,
  /\bsleep\s*\(/,
  '存储板读取不得用固定 sleep 阻塞循环流',
)

for (
  const measurementPath of [
    'ITECH3124/MEASURE_VOLTAGE_ITECH3124/MEASURE_VOLTAGE_ITECH3124.py',
    'ITECH3124/MEASURE_CURRENT_ITECH3124/MEASURE_CURRENT_ITECH3124.py',
    'ITECH6723G/MEASURE_VOLTAGE_ITECH6723G/MEASURE_VOLTAGE_ITECH6723G.py',
    'ITECH6723G/MEASURE_CURRENT_ITECH6723G/MEASURE_CURRENT_ITECH6723G.py',
  ]
) {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      'src-tauri/resources/flojoy/blocks/HARDWARE/ITECH',
      measurementPath,
    ),
    'utf8',
  )
  assert.match(
    source,
    /bounded_itech_measurement/,
    `${measurementPath} 必须使用有界、可缓存的遥测查询`,
  )
}

const startEdmSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/blocks/HARDWARE/EDM_MQTT/START_EDM/START_EDM.py',
  ),
  'utf8',
)
assert.doesNotMatch(
  startEdmSource,
  /pyqtgraph|PyQt|QApplication|matplotlib|mqtt_signal_chart|subprocess/i,
  'START_EDM 只能发送 MQTT 控制指令，不得在 Flojoy Worker 内启动图形进程',
)
assert.match(startEdmSource, /"EDM\/App\/Test\/Command", "Connect"/)
assert.match(startEdmSource, /"EDM\/App\/Test\/Command", "Run"/)
assert.match(startEdmSource, /"EDM\/THV\/Test\/Command", "RequestDetailStatus"/)

const stopEdmSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/blocks/HARDWARE/EDM_MQTT/STOP_EDM/STOP_EDM.py',
  ),
  'utf8',
)
assert.match(stopEdmSource, /"EDM\/App\/Test\/Command", "Stop"/)

const flowchartRunnerSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src/views/halt-hass-test/components/FlowchartRunner.vue',
  ),
  'utf8',
)
assert.match(
  flowchartRunnerSource,
  /cycleRemainingSeconds:\s*number\s*\|\s*null/,
  '循环流运行页必须接收工单剩余秒数',
)
assert.match(
  flowchartRunnerSource,
  /:cycle-total-seconds="cycleTotalSeconds"[\s\S]*:cycle-remaining-seconds="cycleRemainingSeconds"[\s\S]*:cycle-finish-state="cycleFinishState"/,
  '循环流运行页必须把总时间、剩余倒计时和收尾状态交给右侧状态栏',
)
assert.match(
  flowchartRunnerSource,
  /v-if="activeFlowType === 'test'"[\s\S]*class="preflight-section"/,
  '循环流页面必须隐藏测试前设备门禁，把主体空间留给实时状态和曲线',
)
assert.match(
  flowchartRunnerSource,
  /<HaltHassTelemetryPanel[\s\S]*v-if="activeFlowType === 'cycle'"/,
  '循环流必须使用专用实时状态和曲线面板',
)
assert.match(
  flowchartRunnerSource,
  /<HaltHassTelemetryPanel[\s\S]*:preflight-result="preflightResult"/,
  '循环监控面板必须复用同一次测试的设备预检结果',
)
assert.doesNotMatch(
  flowchartRunnerSource,
  /emit\('save'\)|>\s*暂存\s*</,
  '循环测试页面不得继续提供暂存入口',
)

const telemetryPanelSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src/views/halt-hass-test/components/HaltHassTelemetryPanel.vue',
  ),
  'utf8',
)
assert.match(
  telemetryPanelSource,
  /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*clamp\(300px,\s*24vw,\s*350px\)/,
  '循环流实时面板必须采用左侧曲线、右侧状态布局',
)
assert.match(
  telemetryPanelSource,
  /\.chart-stack\s*\{[\s\S]*?grid-template-rows:\s*repeat\(3,\s*minmax\(175px,\s*1fr\)\)/,
  '脉冲、温度和振动三张图必须在左侧等高纵向排列',
)
assert.equal(
  (telemetryPanelSource.match(/smooth:\s*true/g) || []).length,
  4,
  '脉冲、温度和振动的目标/实际曲线系列都必须启用平滑显示',
)
assert.match(
  telemetryPanelSource,
  /const MAX_MQTT_POINTS = 21_600/,
  '约四小时任务必须保留不少于六小时的一秒级温振原始数据',
)
assert.match(
  telemetryPanelSource,
  /function visibleCurvePoints[\s\S]*minActualIndex[\s\S]*minTargetIndex/,
  '长时曲线必须对目标值和实际值进行保峰降采样',
)
assert.match(
  telemetryPanelSource,
  /脉冲器实际曲线[\s\S]*脉冲器目标曲线/,
  '脉冲器图表必须同时显示实际曲线和目标曲线',
)
assert.match(
  telemetryPanelSource,
  /appendPulserFrame[\s\S]*time:\s*frameStart \+ frameSpan \* progress/,
  '脉冲器新帧必须映射到本次循环测试的运行时间轴',
)
assert.match(
  telemetryPanelSource,
  /const visiblePulserPoints[\s\S]*visibleCurvePoints\(pulserPoints\.value\)/,
  '脉冲器长时间曲线必须复用时间窗口和保峰降采样',
)
assert.doesNotMatch(
  telemetryPanelSource,
  /帧内采样点/,
  '脉冲器横轴不得继续显示帧内采样序号',
)
assert.match(
  telemetryPanelSource,
  /grid:[\s\S]*bottom:\s*62[\s\S]*legend:[\s\S]*bottom:\s*2/,
  '图表必须给运行时间坐标和底部图例预留独立空间',
)
for (
  const deviceName of [
    'ITECH 6723',
    'ITECH 3123',
    'IFBOX',
    '存储板',
    '脉冲器',
  ]
) {
  assert.match(
    telemetryPanelSource,
    new RegExp(`name:\\s*'${deviceName}'`),
    `循环流设备状态区必须显示 ${deviceName}`,
  )
}
assert.match(
  telemetryPanelSource,
  /label:\s*'接口板'[\s\S]*label:\s*'控制板'/,
  'IFBOX 状态卡必须显示解析后的接口板和控制板信息',
)
assert.match(
  telemetryPanelSource,
  /String 节点的 WebSocket 结果只有 text_blob[\s\S]*func === 'READ_COMM'/,
  '板卡字符串结果必须在 result.data 判断前处理',
)
assert.match(
  telemetryPanelSource,
  /device\.online\s*\?\s*'在线'\s*:\s*'离线'/,
  '设备卡片必须直接显示在线或离线文字，不能只依赖颜色',
)
assert.match(
  telemetryPanelSource,
  /failedFunc === 'OPEN_IFB'[\s\S]*func === 'OPEN_IFB'[\s\S]*ifboxConnection\.opened = true/,
  'IFBOX 在线状态必须区分串口打开结果与状态报文内容',
)
assert.match(
  telemetryPanelSource,
  /ifboxPreflightResult\.value\?\.success === true/,
  'IFBOX 循环页必须继承本次测试已通过的设备预检结果',
)
assert.match(
  telemetryPanelSource,
  /\.power-readings strong\s*\{[\s\S]*font-size:\s*0\.82rem/,
  '电源电压电流读数必须使用足够清晰的字号',
)
assert.doesNotMatch(
  telemetryPanelSource,
  /<span>接口板<\/span>|<span>控制板<\/span>/,
  '设备状态区不应继续显示接口板/控制板等待数据卡片',
)
assert.match(
  telemetryPanelSource,
  /总运行时间[\s\S]*剩余时间[\s\S]*运行循环流[\s\S]*MQTT 设置/,
  '右侧状态栏必须显示时间并承载循环流和 MQTT 操作',
)
assert.match(
  telemetryPanelSource,
  /if \(running && !previous\)[\s\S]*startMqttTelemetrySession\(\)[\s\S]*else if \(!running && previous\)[\s\S]*stopMqttTelemetrySession\(\)/,
  'MQTT 数据源必须随同一次循环测试自动订阅和退出',
)
assert.doesNotMatch(
  telemetryPanelSource,
  /toggleMqttConnection|保存并连接|断开连接/,
  'MQTT 设置不得再提供独立于循环测试的手动连接会话',
)
assert.match(
  telemetryPanelSource,
  /Connect\/Run\/Stop[\s\S]*工艺节点和安全收尾流程负责/,
  '工作台控制命令和只读 MQTT 数据源必须保持同一测试下的职责分离',
)
assert.doesNotMatch(
  telemetryPanelSource,
  /曲线优先|device-digital-display/,
  '循环监控页不得继续显示曲线优先文案或旧数字仪表',
)

const workOrderPageSource = fs.readFileSync(
  path.join(repoRoot, 'src/views/halt-hass-test/index.vue'),
  'utf8',
)
assert.doesNotMatch(
  workOrderPageSource,
  /CYCLE_FINISH_GRACE_SECONDS|scheduleCycleFinishFallback/,
  '软件倒计时归零后不得继续等待工艺宽限时间',
)
assert.match(
  workOrderPageSource,
  /remaining > 0[\s\S]*recoverTimedOutCycleFlow\(\)/,
  '软件倒计时归零后必须立即触发关闭流程',
)
assert.match(
  workOrderPageSource,
  /recoverTimedOutCycleFlow[\s\S]*cancelCurrentFlowchartRun\(\)[\s\S]*runHassHardwareShutdown[\s\S]*completionSuccess:\s*true/,
  '倒计时到期后必须取消残留拓扑、执行独立下电并继续完成流程',
)
assert.match(
  workOrderPageSource,
  /cycleRemainingSeconds\.value\s*=\s*remaining/,
  '页面倒计时必须使用运行时剩余秒数',
)
const handleExitStart = workOrderPageSource.indexOf('async function handleExit()')
const handleNewTestStart = workOrderPageSource.indexOf(
  'async function handleNewTest()',
  handleExitStart,
)
assert.ok(
  handleExitStart >= 0 && handleNewTestStart > handleExitStart,
  '必须保留 HALT-HASS 返回排程处理函数',
)
const handleExitSource = workOrderPageSource.slice(
  handleExitStart,
  handleNewTestStart,
)
assert.match(
  handleExitSource,
  /phase\.value\s*===\s*'complete'/,
  '测试完成后返回不应再按未保存测试处理',
)
assert.match(
  handleExitSource,
  /await\s+schedule\.refreshWorkOrders\(\)/,
  '返回排程页前必须等待后端工单状态刷新',
)
assert.ok(
  handleExitSource.indexOf('await schedule.refreshWorkOrders()') <
    handleExitSource.indexOf('resetTest()'),
  '必须先完成工单刷新，再显示排程页，避免闪现旧缓存',
)

const deviceRoutesSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/captain/routes/devices.py',
  ),
  'utf8',
)
assert.match(
  deviceRoutesSource,
  /@router\.post\("\/devices\/halt-hass\/shutdown"\)/,
  'Flojoy 必须提供独立的 HALT-HASS 安全收尾接口',
)

const shutdownServiceSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/captain/services/halt_hass_preflight.py',
  ),
  'utf8',
)
assert.match(
  shutdownServiceSource,
  /def run_halt_hass_shutdown/,
)
assert.match(
  shutdownServiceSource,
  /"EDM\/App\/Test\/Command"[\s\S]*"Stop"/,
)
assert.match(
  shutdownServiceSource,
  /turn_off_halt_hass_power\(binding\.resource\)/,
)

const durationLoopSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/blocks/CONTROL_FLOW/LOOPS/HALT_HASS_DURATION_LOOP/HALT_HASS_DURATION_LOOP.py',
  ),
  'utf8',
)
assert.match(
  durationLoopSource,
  /from blocks\.CONTROL_FLOW\.LOOPS\.HALT_HASS_DURATION_LOOP\.halt_hass_duration_state import/,
  '时长循环辅助模块必须使用 Flojoy blocks 包的完整导入路径',
)

const topologySource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/captain/models/topology.py',
  ),
  'utf8',
)
assert.match(
  topologySource,
  /\{"LOOP", "HALT_HASS_DURATION_LOOP"\}/,
  'Flojoy 调度器必须识别时长循环节点',
)

const manifestSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src-tauri/resources/flojoy/captain/utils/manifest/build_manifest.py',
  ),
  'utf8',
)
assert.match(
  manifestSource,
  /SPECIAL_NODES\s*=\s*\[[^\]]*"HALT_HASS_DURATION_LOOP"/,
  'manifest 必须把时长循环的 body/end 当作控制流输出',
)

const cycleJsonPath = process.env.HALT_HASS_CYCLE_FIXTURE
if (cycleJsonPath && fs.existsSync(cycleJsonPath)) {
  const cycleJson = JSON.parse(fs.readFileSync(cycleJsonPath, 'utf8'))
  const nodes = cycleJson.rfInstance.nodes
  const edges = cycleJson.rfInstance.edges
  const ids = new Set(nodes.map((node) => node.id))
  assert.equal(nodes.length, 27)
  assert.equal(edges.length, 26)
  assert.equal(
    edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)),
    true,
  )
  assert.equal(
    edges.some(
      (edge) =>
        edge.source ===
          'TIMER-00000000-0000-4000-8000-000000000018' &&
        edge.target ===
          'HALT_HASS_DURATION_LOOP-00000000-0000-4000-8000-000000000009',
    ),
    false,
    'Flojoy 调度器负责回卷 LOOP，显式回边会让循环节点因依赖未满足而无法启动',
  )
  assert.equal(
    nodes.some((node) => /WAVEFORM_SHOW|TEXT_VIEW/.test(node.data.func)),
    false,
  )
  assert.equal(
    nodes.some(node => node.data.func === 'READ_MEMORY_ADDRESS'),
    true,
    '循环工艺必须每轮读取存储板信息',
  )
  assert.equal(
    nodes.some(
      node => node.data.func === 'OPEN_SERIAL'
        && node.data.label === '打开存储板串口',
    ),
    true,
    '循环工艺必须在初始化阶段打开存储板串口',
  )
}

const mqttTestDevicePath = process.env.MQTT_TEST_DEVICE_PATH
if (mqttTestDevicePath && fs.existsSync(mqttTestDevicePath)) {
  const mqttTestDeviceSource = fs.readFileSync(mqttTestDevicePath, 'utf8')
  assert.match(
    mqttTestDeviceSource,
    /const DEFAULT_RUN_SECONDS = 6 \* 60 \* 60/,
    'MQTT_TEST 必须覆盖长时间工单，不能保留三分钟发布上限',
  )
  assert.doesNotMatch(
    mqttTestDeviceSource,
    /state\.remainTime = 200;/,
    'MQTT_TEST 收到 Run 后不得在约三分钟主动停止发布',
  )
}

console.log('HALT-HASS cycle flow checks passed')
