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
  buildWorkbenchControlledCycleRunSettings,
  hasHassDurationLoop,
} = runtimeModule
const { parseHassMqttTelemetry } = mqttTelemetryModule
const {
  applyHassHardwareBindings,
  externalizeHassRuntimeGraph,
  getRequiredHassHardwareRoles,
  normalizeHassHardwareNodes,
} = hardwareBindingModule

const pulserDataOpenNode = {
  id: 'OPEN_SERIAL-pulser-data',
  data: {
    func: 'OPEN_SERIAL',
    label: '打开脉冲器数据串口',
    path: 'HARDWARE/PROTOCOLS/SERIAL/OPEN_SERIAL/OPEN_SERIAL.py',
    ctrls: {
      device: { type: 'SerialDevice', value: '' },
      baudrate: { type: 'int', value: 115200 },
    },
  },
}
const [boundPulserDataOpenNode] = applyHassHardwareBindings(
  [pulserDataOpenNode],
  [{
    role: 'pulser',
    displayName: '脉冲器',
    port: 'COM3',
    resource: 'COM3',
    hwid: 'USB VID:PID=0403:6001 SER=BG02KQYKA',
  }],
)
assert.equal(boundPulserDataOpenNode.data.ctrls.device.value, 'COM3')
assert.equal(
  boundPulserDataOpenNode.data.ctrls.baudrate.value,
  115200,
  '运行时绑定只替换串口，不得覆盖循环流脉冲器数据波特率',
)
assert.deepEqual(
  getRequiredHassHardwareRoles([
    {
      id: 'storage-open',
      data: { func: 'OPEN_SERIAL', label: '打开存储板串口' },
    },
  ]),
  ['storage'],
)

const [normalizedPulserNode] = normalizeHassHardwareNodes([{
  ...pulserDataOpenNode,
  data: {
    ...pulserDataOpenNode.data,
    ctrls: {
      ...pulserDataOpenNode.data.ctrls,
      device: { type: 'SerialDevice', value: 'COM30' },
    },
  },
}])
assert.equal(normalizedPulserNode.data.hardwareRole, 'pulser')
assert.equal(
  normalizedPulserNode.data.ctrls.device.value,
  '',
  '工艺持久化前必须移除当前工作台串口地址',
)

const externalizedGraph = externalizeHassRuntimeGraph(
  [
    { id: 'before', data: { func: 'OPEN_SERIAL', label: '打开脉冲器串口', ctrls: {} } },
    { id: 'start-edm', data: { func: 'START_EDM', ctrls: { broker: { value: '192.168.1.54' } } } },
    { id: 'after', data: { func: 'READ_ZERO_POSITION', ctrls: {} } },
  ],
  [
    { id: 'before-start', source: 'before', target: 'start-edm' },
    { id: 'start-after', source: 'start-edm', target: 'after' },
  ],
)
assert.deepEqual(externalizedGraph.nodes.map(node => node.id), ['before', 'after'])
assert.deepEqual(
  externalizedGraph.edges.map(edge => [edge.source, edge.target]),
  [['before', 'after']],
  '客户端接管 MQTT 后必须旁路旧工艺 START_EDM 节点并保留执行顺序',
)

const genericSerialGraph = externalizeHassRuntimeGraph(
  [
    {
      id: 'legacy-open-serial',
      data: {
        func: 'OPEN_SERIAL',
        label: 'OPEN SERIAL',
        ctrls: { device: { type: 'SerialDevice', value: '' } },
      },
    },
    { id: 'tbus-handshake', data: { func: 'SHAKE_HANDS', ctrls: {} } },
  ],
  [{ id: 'serial-handshake', source: 'legacy-open-serial', target: 'tbus-handshake' }],
)
assert.equal(
  genericSerialGraph.nodes[0].data.hardwareRole,
  undefined,
  '流程边只表示执行顺序，通用 OPEN_SERIAL 不得按相邻协议节点猜测设备角色',
)

const [legacyPulserOpenNode] = normalizeHassHardwareNodes([{
  id: 'OPEN_SERIAL-f4a0e8b1-3f7e-4748-8cc6-0aaf02630688',
  data: {
    func: 'OPEN_SERIAL',
    label: 'OPEN SERIAL',
    ctrls: { device: { type: 'SerialDevice', value: '' } },
  },
}])
assert.equal(
  legacyPulserOpenNode.data.hardwareRole,
  'pulser',
  '旧工单缓存中的脉冲器重开节点必须按稳定节点 ID 恢复设备角色',
)

const [boundExplicitPulserOpenNode] = applyHassHardwareBindings(
  [{
    ...genericSerialGraph.nodes[0],
    data: {
      ...genericSerialGraph.nodes[0].data,
      hardwareRole: 'pulser',
    },
  }],
  [{
    role: 'pulser',
    displayName: '脉冲器',
    port: 'COM3',
    resource: 'COM3',
    hwid: 'USB VID:PID=0403:6001 SER=PULSER',
  }],
)
assert.equal(
  boundExplicitPulserOpenNode.data.ctrls.device.value,
  'COM3',
  '工艺明确标记为脉冲器的通用串口节点必须注入脉冲器端口',
)

const durationNode = {
  id: 'HALT_HASS_DURATION_LOOP-test',
  data: {
    func: 'HALT_HASS_DURATION_LOOP',
  },
}

assert.equal(hasHassDurationLoop([durationNode]), true)
assert.equal(hasHassDurationLoop([]), false)

assert.deepEqual(
  buildWorkbenchControlledCycleRunSettings({
    nodeDelay: 0,
    maximumRuntime: 100,
    maximumConcurrentWorkers: 4,
  }),
  {
    nodeDelay: 0,
    maximumRuntime: 0,
    maximumConcurrentWorkers: 1,
  },
  '工作台控制模式不得继续使用客户端最大运行时',
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
    remainingTime: null,
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
    remainingTime: null,
    actual: 8.4,
    target: 9,
  },
)

assert.deepEqual(
  parseHassMqttTelemetry({
    topic: 'EDM/App/Test/List',
    payload: [
      { Name: '常规Hass', Type: 'THV_HaltHass', CreatedTime: '2024-12-16 13:38:10' },
      { Name: '', Type: 'THV_HaltHass', CreatedTime: '' },
    ],
    receivedAt: 42000,
  }),
  {
    kind: 'test-list',
    tests: [{ name: '常规Hass', type: 'THV_HaltHass', createdTime: '2024-12-16 13:38:10' }],
  },
  'ListTest 返回的工作台曲线列表必须转换为可选择项',
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
    'ITECH3123/MEASURE_VOLTAGE_ITECH3123/MEASURE_VOLTAGE_ITECH3123.py',
    'ITECH3123/MEASURE_CURRENT_ITECH3123/MEASURE_CURRENT_ITECH3123.py',
    'ITECH3123_48V/MEASURE_VOLTAGE_ITECH3123_48V/MEASURE_VOLTAGE_ITECH3123_48V.py',
    'ITECH3123_48V/MEASURE_CURRENT_ITECH3123_48V/MEASURE_CURRENT_ITECH3123_48V.py',
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
assert.match(
  startEdmSource,
  /"EDM\/THV\/Test\/Command",\s*[\r\n\s]*"RequestDetailStatus"/,
)

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
  '循环流运行页必须接收 MQTT 工作台剩余秒数',
)
assert.match(
  flowchartRunnerSource,
  /:cycle-remaining-seconds="cycleRemainingSeconds"[\s\S]*:cycle-finish-state="cycleFinishState"/,
  '循环流运行页必须把 MQTT 剩余时间和收尾状态交给右侧状态栏',
)
assert.match(
  flowchartRunnerSource,
  /v-if="activeFlowType === 'test'"[\s\S]*class="preflight-section"/,
  '循环流页面必须隐藏测试前设备门禁，把主体空间留给实时状态和曲线',
)
assert.match(
  flowchartRunnerSource,
  /v-if="activeFlowType === 'cycle'"[\s\S]*<HaltHassTelemetryPanel/,
  '循环流必须使用专用实时状态和曲线面板',
)
assert.match(
  flowchartRunnerSource,
  /<HaltHassTelemetryPanel[\s\S]*:preflight-result="preflightResult"/,
  '循环监控面板必须复用同一次测试的设备预检结果',
)
assert.match(
  flowchartRunnerSource,
  /preflightDisplayItems[\s\S]*等待逐项通信检测[\s\S]*item\.state === 'checking'/,
  '点击设备检测后必须立即显示逐项检测状态',
)
assert.match(
  flowchartRunnerSource,
  /#below-overview[\s\S]*<FlojoyExecutionLogPanel[\s\S]*layout="inline"/,
  '循环流日志必须通过状态面板插槽接入主工作区',
)
assert.match(
  flowchartRunnerSource,
  /#below-overview[\s\S]*<FlojoyExecutionLogPanel[\s\S]*display-mode="cycle-key"/,
  '循环流只能展示关键日志和错误日志',
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
  /class="cycle-overview"[\s\S]*class="overview-cards"[\s\S]*class="chart-region"/,
  '循环流实时状态必须固定在曲线上方',
)
assert.match(
  telemetryPanelSource,
  /class="telemetry-main-grid"[\s\S]*class="chart-region"[\s\S]*class="overview-log-region"[\s\S]*slot name="below-overview"/,
  '循环流状态总览下方必须按曲线在左、日志在右排列',
)
assert.match(
  telemetryPanelSource,
  /\.telemetry-main-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*7fr\)\s*minmax\(0,\s*3fr\)/,
  '循环流曲线与日志必须使用 7:3 的横向比例',
)
assert.match(
  telemetryPanelSource,
  /\.overview-cards\s*\{[\s\S]*grid-template-columns:\s*repeat\(14,\s*minmax\(0,\s*1fr\)\)[\s\S]*overflow:\s*visible/,
  '实时状态总览必须在一行内完整显示十四项状态',
)
assert.match(
  telemetryPanelSource,
  /\.chart-stack\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1\.35fr\)\s*minmax\(0,\s*0\.85fr\)/,
  '脉冲器主图必须放大显示，并允许三张曲线适配单屏剩余高度',
)
assert.match(
  telemetryPanelSource,
  /\.secondary-chart-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  '温度和振动必须并排显示且保持独立图表',
)
assert.equal(
  (telemetryPanelSource.match(/smooth:\s*true/g) || []).length,
  2,
  '温度和振动的目标/实际趋势系列必须启用平滑显示',
)
assert.match(
  telemetryPanelSource,
  /name:\s*'脉冲器实际曲线'[\s\S]*?smooth:\s*false[\s\S]*?name:\s*'脉冲器目标曲线'[\s\S]*?smooth:\s*false/,
  '脉冲器实时波形必须保留原始采样形状，不得使用曲线平滑伪造波形',
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
  '脉冲器全程报告数据必须保留本次循环测试的运行时间',
)
assert.match(
  telemetryPanelSource,
  /const visiblePulserPoints[\s\S]*visiblePulserSamples\(pulserPoints\.value,\s*pulserSampleWindow\.value\)/,
  '脉冲器实时图必须使用独立的最新采样点窗口',
)
assert.match(
  telemetryPanelSource,
  /name:\s*'采样点'/,
  '脉冲器横轴必须显示采样点，不得复用 MQTT 运行时间',
)
assert.match(
  telemetryPanelSource,
  /mqttTrendElapsedSeconds\(message\.receivedAt\)/,
  '温度和振动必须使用 MQTT 接收时间轴，不得复用报文 TotalTime 或脉冲器采样轴',
)
assert.match(
  telemetryPanelSource,
  /grid:[\s\S]*bottom:\s*62[\s\S]*legend:[\s\S]*bottom:\s*2/,
  '图表必须给运行时间坐标和底部图例预留独立空间',
)
for (
  const deviceName of [
    'ITECH 3123（48 V）',
    'ITECH 3123（90 V）',
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
assert.match(
  telemetryPanelSource,
  /<span>接口板<\/span>|<span>控制板<\/span>/,
  '顶部状态总览必须显示接口板和控制板状态',
)
assert.match(
  telemetryPanelSource,
  /当前时间[\s\S]*测试时间[\s\S]*剩余时间[\s\S]*目标温度[\s\S]*实际温度[\s\S]*目标振动[\s\S]*实际振动/,
  '顶部状态总览必须使用 MQTT 时间并拆分目标值和实际值',
)
assert.match(
  telemetryPanelSource,
  /连接[\s\S]*读取[\s\S]*选择温度、振动曲线[\s\S]*加载[\s\S]*运行[\s\S]*停止/,
  '循环流顶部必须按工作台协议提供连接、列表、加载、运行和停止操作',
)
assert.doesNotMatch(
  telemetryPanelSource,
  /toggleMqttConnection|保存并连接|断开连接/,
  'MQTT 设置不得再提供独立于循环测试的手动连接会话',
)
assert.match(
  telemetryPanelSource,
  /publishMqttCommand\(mqttConfig\.topicPrefix, 'ListTest'\)[\s\S]*publishMqttCommand\(mqttConfig\.topicPrefix, 'LoadTest', name\)[\s\S]*publishMqttCommand\(mqttConfig\.topicPrefix, 'Run'\)/,
  '工作台曲线必须由 ListTest 获取、LoadTest;名称加载后再运行',
)
assert.match(
  telemetryPanelSource,
  /WORKBENCH_LIST_TIMEOUT_MS\s*=\s*5_000[\s\S]*5 秒内未收到 EDM\/App\/Test\/List 回包/,
  '工作台曲线列表无回包时必须给出明确超时反馈',
)
assert.match(
  telemetryPanelSource,
  /\(\) => mqttConnected\.value[\s\S]*readWorkbenchTests\(\)[\s\S]*\{ immediate: true \}/,
  'MQTT 连接成功后必须自动读取工作台曲线列表',
)
assert.match(
  telemetryPanelSource,
  /RequestTestStatus[\s\S]*workbenchFinished/,
  '循环运行期间必须持续查询工作台状态并在 Stopped 后触发安全收尾',
)
assert.match(
  telemetryPanelSource,
  /!running && previous && mqttConnected\.value && !workbenchFinishEmitted[\s\S]*'Stop'[\s\S]*'RequestTestStatus'/,
  'Flojoy 异常退出时必须兜底停止已经启动的工作台',
)
assert.doesNotMatch(
  telemetryPanelSource,
  /曲线优先|device-digital-display/,
  '循环监控页不得继续显示曲线优先文案或旧数字仪表',
)

const executionLogPanelSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src/views/halt-hass-test/components/FlojoyExecutionLogPanel.vue',
  ),
  'utf8',
)
assert.match(
  executionLogPanelSource,
  /background:\s*var\(--color-bg-secondary[\s\S]*color:\s*var\(--color-text-primary/,
  '通信日志面板必须跟随应用亮暗主题变量',
)
assert.doesNotMatch(
  executionLogPanelSource,
  /background:\s*rgba\(15,\s*23,\s*42,\s*0\.9[46]\)/,
  '通信日志面板不得固定为深色背景',
)
assert.match(
  executionLogPanelSource,
  /ROUTINE_CYCLE_FUNCTIONS[\s\S]*isCycleKeyEntry[\s\S]*displayMode === 'cycle-key'/,
  '循环流日志必须过滤轮询节点并保留关键状态和错误',
)

const workOrderPageSource = fs.readFileSync(
  path.join(repoRoot, 'src/views/halt-hass-test/index.vue'),
  'utf8',
)
const flojoyFlowchartUtilsSource = fs.readFileSync(
  path.join(repoRoot, 'src-tauri/resources/flojoy/captain/utils/flowchart_utils.py'),
  'utf8',
)
assert.match(
  flojoyFlowchartUtilsSource,
  /topology\.jobset_id\s*==\s*request\.jobsetId/,
  'Flojoy 最大运行时定时器必须校验 jobsetId，避免上一场定时器误停下一场流程',
)
assert.match(
  workOrderPageSource,
  /buildWorkbenchControlledCycleRunSettings/,
  '循环流必须禁用 Flojoy 最大运行时并由工作台状态控制',
)
assert.doesNotMatch(
  workOrderPageSource,
  /remainingDurationSeconds|haltHassRemainingDurationSeconds/,
  '循环流不得再注入工单或工艺剩余时长',
)
assert.match(
  workOrderPageSource,
  /handleWorkbenchFinished[\s\S]*recoverTimedOutCycleFlow\('workbench-auto-stop'\)/,
  '工作台停止后必须进入统一安全收尾流程',
)
assert.match(
  workOrderPageSource,
  /recoverTimedOutCycleFlow[\s\S]*gracefulStopCurrentFlowchartRun\([\s\S]*runHassHardwareShutdown[\s\S]*completionSuccess:\s*true/,
  '工作台停止后必须先停止采集、等待连接释放，再执行独立下电',
)
assert.match(
  workOrderPageSource,
  /循环流在工作台结束前提前退出，未判定为测试完成/,
  'Flojoy 提前进入 STANDBY 时不得误判为工作台测试完成',
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
  /turn_off_halt_hass_power\([\s\S]*?binding\.resource,[\s\S]*?binding\.instrumentSerial,[\s\S]*?\)/,
  '安全下电必须沿用客户端绑定的电源序列号再次确认设备身份',
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
  /return _build_result\(default, False\)/,
  '循环控制节点必须持续进入采集分支，停止时机由 MQTT 工作台状态决定',
)
assert.doesNotMatch(
  durationLoopSource,
  /duration_seconds|SmallMemory|evaluate_duration_state/,
  '循环控制节点不得再保存或判断工艺时长',
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
