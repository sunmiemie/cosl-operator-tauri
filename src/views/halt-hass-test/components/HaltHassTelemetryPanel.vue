<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  shallowRef,
  triggerRef,
  watch,
} from 'vue'
import VChart from 'vue-echarts'
import { Icon } from '@iconify/vue'
import { ElDialog, ElMessage } from 'element-plus'

import type { WorkerJobResponse } from '@/composables/useFlojoySocket'
import {
  useHaltHassMqtt,
  type HaltHassMqttCommand,
  type HaltHassMqttConfig,
} from '@/composables/useHaltHassMqtt'
import {
  appendExecutionLog,
  resolveHassRectifierBindings,
  runHassRectifierCommand,
  type HassHardwarePreflightResponse,
} from '@/services/flojoy-api'
import type { ResolvedHassHardwareBinding } from '@/services/hass-hardware-binding'
import {
  createRectifierStageTracker,
  executeRectifierTemperatureStage,
  type RectifierStageTrigger,
} from '@/services/hass-rectifier-runtime'
import { parseHassMqttTelemetry } from '@/services/hass-mqtt-telemetry'
import {
  loadHassWorkbenchConfig,
  saveHassWorkbenchConfig,
} from '@/services/hass-workbench-config'
import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'
import type {
  HaltHassDualCurvePoint,
  HaltHassPeriodicRecord,
  HaltHassRectifierTemperatureStageRecord,
  HaltHassScalarCurvePoint,
  HaltHassTelemetrySnapshot,
} from '../types'
import {
  loadHaltHassPeriodicRecords,
  saveHaltHassPeriodicRecords,
} from '../utils/telemetryPersistence'
import '@/utils/echarts'

const props = defineProps<{
  processJson: HaltHassProcessJson | null
  lastMessage: WorkerJobResponse | null
  isRunning: boolean
  canRun: boolean
  cycleRemainingSeconds: number | null
  cycleFinishState: 'idle' | 'running' | 'finishing' | 'recovering'
  serverStatus: string
  preflightResult: HassHardwarePreflightResponse | null
  jobsetId: string
  sessionId: number | null
  defaultWorkbenchTestName?: string
}>()
const emit = defineEmits<{
  run: []
  stop: []
  workbenchFinished: [{ status: string; elapsedSeconds: number; remainingSeconds: number }]
  rectifierFailure: [{ message: string }]
}>()

const MAX_MQTT_POINTS = 21_600
const MQTT_POINT_TRIM_CHUNK = 1_800
const MQTT_UI_FLUSH_INTERVAL_MS = 100
const MQTT_TELEMETRY_TIMEOUT_MS = 10_000
const WORKBENCH_LIST_TIMEOUT_MS = 5_000
const MAX_PULSER_HISTORY_SECONDS = 21_600
const PULSER_RECENT_RAW_SECONDS = 300
const PULSER_COMPACTION_THRESHOLD = 180_000
const MIN_CHART_DISPLAY_POINTS = 600
const MAX_CHART_DISPLAY_POINTS = 2400
const TELEMETRY_STALE_AFTER_MS = 3000
const DEVICE_ONLINE_STALE_AFTER_MS = 8000
const PERIODIC_RECORD_SECONDS = 180
const REPORT_CHART_MAX_POINTS = 2400

type DualCurvePoint = HaltHassDualCurvePoint

type ChartWindow = 300 | 3600 | 14_400 | 'all'
type PulserSampleWindow = 50 | 100 | 250

function lastOf<T>(values: T[]): T | undefined {
  return values[values.length - 1]
}

const pulserPoints = shallowRef<DualCurvePoint[]>([])
const temperaturePoints = shallowRef<DualCurvePoint[]>([])
const vibrationPoints = shallowRef<DualCurvePoint[]>([])
const reportPulserPoints: DualCurvePoint[] = []
const reportTemperaturePoints: DualCurvePoint[] = []
const reportVibrationPoints: DualCurvePoint[] = []
const current48vPoints = shallowRef<HaltHassScalarCurvePoint[]>([])
const current90vPoints = shallowRef<HaltHassScalarCurvePoint[]>([])
const periodicRecords = ref<HaltHassPeriodicRecord[]>(
  loadHaltHassPeriodicRecords(props.sessionId),
)
const rectifierStages = ref<HaltHassRectifierTemperatureStageRecord[]>([])
const isRectifierProcess = computed(() => (
  props.processJson?.metadata.reportType === 'rectifier_regulator'
))
let rectifierBindings: ResolvedHassHardwareBinding[] | null = null
let rectifierStageExecution: Promise<void> = Promise.resolve()
let rectifierExecutionFailed = false
let rectifierStageTracker = createRectifierStageTracker(5, 120)

function rectifierStorageKey(sessionId: number | null): string {
  return `halt-hass-rectifier-stages-v1:${sessionId ?? 'pending'}`
}

function loadRectifierStages(sessionId: number | null): HaltHassRectifierTemperatureStageRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(rectifierStorageKey(sessionId)) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistRectifierStages(): void {
  localStorage.setItem(
    rectifierStorageKey(props.sessionId),
    JSON.stringify(rectifierStages.value),
  )
}

function configureRectifierStageTracker(): void {
  const config = props.processJson?.metadata.rectifierConfig
  const latestStageIndex = rectifierStages.value.reduce(
    (maximum, stage) => Math.max(maximum, Number(stage.stageIndex) || 0),
    0,
  )
  rectifierStageTracker = createRectifierStageTracker(
    config?.temperatureToleranceC ?? 5,
    config?.temperatureStableSeconds ?? 120,
    10,
    latestStageIndex,
  )
}
const chartWindow = ref<ChartWindow>('all')
const pulserSampleWindow = ref<PulserSampleWindow>(100)
const chartViewportWidth = ref(1000)
const chartRegionElement = ref<HTMLElement | null>(null)
const freshnessClock = ref(Date.now())
let freshnessTimer: ReturnType<typeof setInterval> | null = null
let chartResizeObserver: ResizeObserver | null = null
let mqttUiFlushTimer: ReturnType<typeof setTimeout> | null = null
let mqttTelemetryWatchStartedAt = 0
let mqttTemperatureReceivedAt = 0
let mqttVibrationReceivedAt = 0
let mqttTrendStartedAtMs = 0
let mqttWatchdogNextRetryAt = 0
let mqttDetailRetryInFlight = false
let pulserRunStartedAtMs = 0
let pulserLastSequence = 0
let pulserLastFrameTime = 0
let pulserLastCompactionAt = 0
const pendingTemperaturePoints: DualCurvePoint[] = []
const pendingVibrationPoints: DualCurvePoint[] = []
const pulserStream = reactive({
  streaming: false,
  fresh: false,
  sequence: 0,
  sampleCount: 0,
  lastSampleAt: 0,
  movementConfirmed: false,
  movementActualSpan: 0,
  error: '',
})
const chartWindowOptions: ReadonlyArray<{
  value: ChartWindow
  label: string
}> = [
  { value: 300, label: '5 分钟' },
  { value: 3600, label: '1 小时' },
  { value: 14_400, label: '4 小时' },
  { value: 'all', label: '全部' },
]
const pulserSampleWindowOptions: ReadonlyArray<{
  value: PulserSampleWindow
  label: string
}> = [
  { value: 50, label: '50 点' },
  { value: 100, label: '100 点' },
  { value: 250, label: '250 点' },
]
const mqttConfig = reactive<HaltHassMqttConfig>({
  broker: '192.168.1.54',
  port: 1883,
  topicPrefix: 'EDM',
  username: 'Admin',
  password: '123456',
})
const mqttSettingsOpen = ref(false)
const mqttTelemetryWarning = ref('')
const workbenchTests = ref<Array<{ name: string; type: string; createdTime: string }>>([])
const workbenchListLoading = ref(false)
const workbenchListError = ref('')
let workbenchListRequestToken = 0
let workbenchListTimeout: ReturnType<typeof setTimeout> | null = null
const selectedWorkbenchTest = ref(props.defaultWorkbenchTestName?.trim() || '')
const loadedWorkbenchTest = ref('')
const workbenchStarting = ref(false)
let workbenchStartToken = 0
const workbenchElapsedSeconds = ref<number | null>(null)
const workbenchRemainingSeconds = ref<number | null>(null)
let hasSeenWorkbenchRunning = false
let workbenchFinishEmitted = false
let nextWorkbenchStatusRequestAt = 0
const workbenchReadings = reactive({
  systemStatus: '',
  testStatus: '',
})
const {
  connectionState: mqttConnectionState,
  statusMessage: mqttStatusMessage,
  lastMessage: lastMqttMessage,
  lastCommunication: lastMqttCommunication,
  isConnected: mqttConnected,
  isConnecting: mqttConnecting,
  connect: connectMqtt,
  disconnect: disconnectMqtt,
  publishCommand: publishMqttCommandRaw,
} = useHaltHassMqtt()

function persistClientCommunicationLog(input: {
  eventType: string
  message: string
  level?: 'info' | 'warning' | 'error'
  direction?: 'send' | 'receive'
  data?: unknown
}): void {
  void appendExecutionLog({
    ...input,
    jobsetId: props.jobsetId,
    function: 'HALT_HASS_MQTT_CLIENT',
  }).catch((error) => {
    console.error('[HALT-HASS] MQTT 通信日志落盘失败', error)
  })
}

async function publishMqttCommand(
  topicPrefix: string,
  command: HaltHassMqttCommand,
  argument?: string,
): Promise<void> {
  const topicSuffix = command === 'RequestDetailStatus'
    ? 'THV/Test/Command'
    : 'App/Test/Command'
  const topic = `${topicPrefix.replace(/^\/+|\/+$/g, '')}/${topicSuffix}`
  const payload = command === 'LoadTest' ? `LoadTest;${argument || ''}` : command
  persistClientCommunicationLog({
    eventType: 'device-command',
    message: `MQTT ${topic} 发送 ${payload}`,
    direction: 'send',
    data: { transport: 'MQTT', topic, payload },
  })
  try {
    await publishMqttCommandRaw(topicPrefix, command, argument)
    persistClientCommunicationLog({
      eventType: 'device-response',
      message: `MQTT ${command} 指令已提交`,
      direction: 'receive',
      data: { transport: 'MQTT', topic, payload, submitted: true },
    })
  } catch (error) {
    persistClientCommunicationLog({
      eventType: 'device-response',
      message: `MQTT ${command} 指令发送失败`,
      level: 'error',
      direction: 'receive',
      data: {
        transport: 'MQTT',
        topic,
        payload,
        error: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }
}
const mqttDisplayStatus = computed(() => {
  if (mqttTelemetryWarning.value) return mqttTelemetryWarning.value
  if (!props.isRunning && mqttConnectionState.value === 'disconnected') {
    return '随循环测试自动订阅和退出'
  }
  return mqttStatusMessage.value
})
const powerReadings = reactive({
  voltage90v: null as number | null,
  current90v: null as number | null,
  voltage48v: null as number | null,
  current48v: null as number | null,
})
type PowerReadingKey = keyof typeof powerReadings
const powerFreshness = reactive<Record<
  PowerReadingKey,
  {
    valid: boolean
    fresh: boolean
    lastValueAt: number
    error: string
  }
>>({
  voltage90v: { valid: false, fresh: false, lastValueAt: 0, error: '' },
  current90v: { valid: false, fresh: false, lastValueAt: 0, error: '' },
  voltage48v: { valid: false, fresh: false, lastValueAt: 0, error: '' },
  current48v: { valid: false, fresh: false, lastValueAt: 0, error: '' },
})
const ifboxReadings = reactive({
  communication: '',
  controlBoard: '',
  status: '',
})
const storageReading = reactive({
  value: '',
  lastSuccessAt: 0,
  lastAttemptAt: 0,
  lastAttemptOk: false,
})
const ifboxConnection = reactive({
  opened: false,
  openedAt: 0,
  lastError: '',
})
const storageConnection = reactive({
  opened: false,
  openedAt: 0,
  lastError: '',
})
type IfboxReadingKey = keyof typeof ifboxReadings
const ifboxFreshness = reactive<Record<
  IfboxReadingKey,
  {
    lastSuccessAt: number
    lastAttemptAt: number
    lastAttemptOk: boolean
  }
>>({
  communication: {
    lastSuccessAt: 0,
    lastAttemptAt: 0,
    lastAttemptOk: false,
  },
  controlBoard: {
    lastSuccessAt: 0,
    lastAttemptAt: 0,
    lastAttemptOk: false,
  },
  status: {
    lastSuccessAt: 0,
    lastAttemptAt: 0,
    lastAttemptOk: false,
  },
})

const nodeFunctionById = computed(() => new Map(
  (props.processJson?.cycleFlow.nodes || []).map((node) => [
    node.id,
    String(node.data?.func || '').toUpperCase(),
  ])
))
const nodeLabelById = computed(() => new Map(
  (props.processJson?.cycleFlow.nodes || []).map((node) => [
    node.id,
    String(node.data?.label || '').toUpperCase(),
  ])
))

function isStorageNode(nodeId: string): boolean {
  return nodeFunctionById.value.get(nodeId) === 'READ_MEMORY_ADDRESS'
    || nodeLabelById.value.get(nodeId)?.includes('存储板') === true
}

function resetTelemetry() {
  pulserPoints.value = []
  temperaturePoints.value = []
  vibrationPoints.value = []
  reportPulserPoints.length = 0
  reportTemperaturePoints.length = 0
  reportVibrationPoints.length = 0
  current48vPoints.value = []
  current90vPoints.value = []
  periodicRecords.value = loadHaltHassPeriodicRecords(props.sessionId)
  rectifierStages.value = isRectifierProcess.value
    ? loadRectifierStages(props.sessionId)
    : []
  rectifierBindings = null
  rectifierStageExecution = Promise.resolve()
  rectifierExecutionFailed = false
  configureRectifierStageTracker()
  pulserRunStartedAtMs = Date.now()
  pulserLastSequence = 0
  pulserLastFrameTime = 0
  pulserLastCompactionAt = 0
  pendingTemperaturePoints.length = 0
  pendingVibrationPoints.length = 0
  mqttTelemetryWatchStartedAt = 0
  mqttTemperatureReceivedAt = 0
  mqttVibrationReceivedAt = 0
  mqttTrendStartedAtMs = 0
  mqttWatchdogNextRetryAt = 0
  mqttDetailRetryInFlight = false
  mqttTelemetryWarning.value = ''
  workbenchReadings.testStatus = ''
  workbenchElapsedSeconds.value = null
  workbenchRemainingSeconds.value = null
  hasSeenWorkbenchRunning = false
  workbenchFinishEmitted = false
  if (mqttUiFlushTimer) {
    clearTimeout(mqttUiFlushTimer)
    mqttUiFlushTimer = null
  }
  powerReadings.voltage90v = null
  powerReadings.current90v = null
  powerReadings.voltage48v = null
  powerReadings.current48v = null
  for (const freshness of Object.values(powerFreshness)) {
    freshness.valid = false
    freshness.fresh = false
    freshness.lastValueAt = 0
    freshness.error = ''
  }
  ifboxReadings.communication = ''
  ifboxReadings.controlBoard = ''
  ifboxReadings.status = ''
  storageReading.value = ''
  storageReading.lastSuccessAt = 0
  storageReading.lastAttemptAt = 0
  storageReading.lastAttemptOk = false
  ifboxConnection.opened = false
  ifboxConnection.openedAt = 0
  ifboxConnection.lastError = ''
  storageConnection.opened = false
  storageConnection.openedAt = 0
  storageConnection.lastError = ''
  pulserStream.streaming = false
  pulserStream.fresh = false
  pulserStream.sequence = 0
  pulserStream.sampleCount = 0
  pulserStream.lastSampleAt = 0
  pulserStream.movementConfirmed = false
  pulserStream.movementActualSpan = 0
  pulserStream.error = ''
  for (const freshness of Object.values(ifboxFreshness)) {
    freshness.lastSuccessAt = 0
    freshness.lastAttemptAt = 0
    freshness.lastAttemptOk = false
  }
}

function loadMqttConfig() {
  Object.assign(mqttConfig, loadHassWorkbenchConfig().mqtt)
}

function rectifierDelay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function executeRectifierStage(trigger: RectifierStageTrigger): Promise<void> {
  const config = props.processJson?.metadata.rectifierConfig
  if (!config || rectifierExecutionFailed) return

  try {
    if (!rectifierBindings) rectifierBindings = await resolveHassRectifierBindings()
    const runCommand = async (
      action: 'set_input' | 'set_loads' | 'measure',
      input: {
        inputVoltage?: number
        sourceCurrentLimitA?: number
        load48Ohm?: number
        load90Ohm?: number
      } = {},
    ) => {
      const response = await runHassRectifierCommand(
        action,
        rectifierBindings!,
        input,
        props.jobsetId,
      )
      if (!response.success) throw new Error(response.message || `整流稳压 ${action} 执行失败`)
      return response
    }

    const stage = await executeRectifierTemperatureStage(
      trigger,
      config,
      {
        setInputVoltage: async (voltage, currentLimitA) => {
          await runCommand('set_input', {
            inputVoltage: voltage,
            sourceCurrentLimitA: currentLimitA,
          })
        },
        setLoads: async (load48Ohm, load90Ohm) => {
          await runCommand('set_loads', { load48Ohm, load90Ohm })
        },
        measure: async () => {
          const response = await runCommand('measure')
          if (!response.measurement) throw new Error('整流稳压测量未返回数据')
          return response.measurement
        },
      },
      rectifierDelay,
    )
    rectifierStages.value.push(stage)
    persistRectifierStages()
    await persistClientCommunicationLog({
      eventType: 'rectifier-stage-complete',
      message: `整流稳压温度阶段 ${stage.stageIndex} 已完成`,
      direction: 'receive',
      data: {
        stageIdentity: stage.stageIdentity,
        targetTemperature: stage.targetTemperature,
        actualTemperature: stage.actualTemperature,
        voltageStepCount: stage.voltageSteps.length,
      },
    })
  } catch (error) {
    rectifierExecutionFailed = true
    const message = error instanceof Error ? error.message : String(error)
    await persistClientCommunicationLog({
      eventType: 'rectifier-stage-failed',
      message: `整流稳压温度阶段执行失败：${message}`,
      level: 'error',
      direction: 'receive',
      data: { stageIdentity: trigger.stageIdentity, error: message },
    })
    emit('rectifierFailure', { message })
  }
}

function queueRectifierStage(trigger: RectifierStageTrigger): void {
  if (rectifierStages.value.some(stage => stage.stageIdentity === trigger.stageIdentity)) return
  rectifierStageExecution = rectifierStageExecution.then(
    () => executeRectifierStage(trigger),
    () => executeRectifierStage(trigger),
  )
}

function saveMqttConfig() {
  const config = loadHassWorkbenchConfig()
  config.mqtt = { ...mqttConfig }
  saveHassWorkbenchConfig(config)
}

function saveMqttSettings() {
  saveMqttConfig()
  mqttSettingsOpen.value = false
}

async function startMqttTelemetrySession() {
  if (mqttConnected.value || mqttConnecting.value) return
  saveMqttConfig()
  const connected = await connectMqtt({ ...mqttConfig })
  if (!connected) {
    console.error('[HALT-HASS] 循环测试 MQTT 数据源启动失败')
  }
}

async function stopMqttTelemetrySession() {
  await disconnectMqtt()
}

async function connectWorkbench(): Promise<void> {
  await startMqttTelemetrySession()
  if (!mqttConnected.value && !mqttConnecting.value) return
  await publishMqttCommand(mqttConfig.topicPrefix, 'Connect')
}

async function readWorkbenchTests(): Promise<void> {
  if (!mqttConnected.value) {
    ElMessage.warning('请先连接工作台 MQTT')
    return
  }
  const requestToken = ++workbenchListRequestToken
  if (workbenchListTimeout) clearTimeout(workbenchListTimeout)
  workbenchListLoading.value = true
  workbenchListError.value = ''
  workbenchTests.value = []
  try {
    await publishMqttCommand(mqttConfig.topicPrefix, 'ListTest')
    workbenchListTimeout = setTimeout(() => {
      if (requestToken !== workbenchListRequestToken || !workbenchListLoading.value) return
      workbenchListLoading.value = false
      workbenchListError.value = '5 秒内未收到 EDM/App/Test/List 回包'
      ElMessage.warning('曲线列表读取超时，请确认工作台服务已启动并订阅命令主题')
      persistClientCommunicationLog({
        eventType: 'device-response',
        message: 'MQTT ListTest 等待回包超时',
        level: 'warning',
        direction: 'receive',
        data: {
          transport: 'MQTT',
          expectedTopic: `${mqttConfig.topicPrefix.replace(/^\/+|\/+$/g, '')}/App/Test/List`,
          timeoutMs: WORKBENCH_LIST_TIMEOUT_MS,
        },
      })
    }, WORKBENCH_LIST_TIMEOUT_MS)
  } catch (error) {
    workbenchListLoading.value = false
    workbenchListError.value = error instanceof Error ? error.message : String(error)
  }
}

async function loadWorkbenchTest(): Promise<void> {
  const name = selectedWorkbenchTest.value.trim()
  if (!name) {
    ElMessage.warning('请选择温度、振动曲线')
    return
  }
  await publishMqttCommand(mqttConfig.topicPrefix, 'LoadTest', name)
}

async function runWorkbenchTest(): Promise<void> {
  if (!props.canRun) {
    ElMessage.warning('当前工艺尚未满足运行条件')
    return
  }
  if (!mqttConnected.value) {
    ElMessage.warning('请先连接工作台 MQTT')
    return
  }
  if (!selectedWorkbenchTest.value || loadedWorkbenchTest.value !== selectedWorkbenchTest.value) {
    ElMessage.warning('请先加载当前选择的温度、振动曲线')
    return
  }
  hasSeenWorkbenchRunning = false
  workbenchFinishEmitted = false
  const startToken = ++workbenchStartToken
  workbenchStarting.value = true
  try {
    await publishMqttCommand(mqttConfig.topicPrefix, 'Run')
    const deadline = Date.now() + 20_000
    while (
      startToken === workbenchStartToken
      && !isWorkbenchRunning()
      && Date.now() < deadline
    ) {
      await publishMqttCommand(mqttConfig.topicPrefix, 'RequestTestStatus')
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    if (startToken !== workbenchStartToken) return
    if (!isWorkbenchRunning()) {
      throw new Error('工作台在 20 秒内未确认 Running')
    }
    await publishMqttCommand(mqttConfig.topicPrefix, 'RequestDetailStatus')
    emit('run')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    if (startToken === workbenchStartToken) workbenchStarting.value = false
  }
}

async function stopWorkbenchTest(): Promise<void> {
  if (!mqttConnected.value) return
  workbenchStartToken += 1
  workbenchStarting.value = false
  await publishMqttCommand(mqttConfig.topicPrefix, 'Stop')
  await publishMqttCommand(mqttConfig.topicPrefix, 'RequestTestStatus')
}

function isWorkbenchRunning(): boolean {
  return workbenchReadings.testStatus.trim().toLowerCase() === 'running'
}

function missingMqttTelemetryChannels(now: number): string[] {
  if (!mqttTelemetryWatchStartedAt) return []
  const missing: string[] = []
  const temperatureReference = mqttTemperatureReceivedAt || mqttTelemetryWatchStartedAt
  const vibrationReference = mqttVibrationReceivedAt || mqttTelemetryWatchStartedAt
  if (now - temperatureReference >= MQTT_TELEMETRY_TIMEOUT_MS) missing.push('温度')
  if (now - vibrationReference >= MQTT_TELEMETRY_TIMEOUT_MS) missing.push('振动')
  return missing
}

async function retryMissingMqttTelemetry(missing: string[]): Promise<void> {
  if (mqttDetailRetryInFlight) return
  mqttDetailRetryInFlight = true
  const channelText = missing.join('、')
  mqttTelemetryWarning.value = `10 秒未收到${channelText}数据，已重新请求`
  ElMessage.warning(mqttTelemetryWarning.value)
  try {
    await publishMqttCommand(mqttConfig.topicPrefix, 'RequestDetailStatus')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    mqttTelemetryWarning.value = `重新请求${channelText}数据失败：${message}`
    ElMessage.error(mqttTelemetryWarning.value)
  } finally {
    mqttDetailRetryInFlight = false
  }
}

function checkMqttTelemetryWatchdog(): void {
  if (!props.isRunning || !mqttConnected.value || !isWorkbenchRunning()) return
  const now = Date.now()
  const missing = missingMqttTelemetryChannels(now)
  if (!missing.length) {
    mqttTelemetryWarning.value = ''
    return
  }
  if (now < mqttWatchdogNextRetryAt) return
  mqttWatchdogNextRetryAt = now + MQTT_TELEMETRY_TIMEOUT_MS
  void retryMissingMqttTelemetry(missing)
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map(Number)
    .filter((item) => Number.isFinite(item))
}

function buildPulserFrame(
  sampleIndexesValue: unknown,
  samplesValue: unknown,
): Array<[number, number]> {
  const samples = toNumberArray(samplesValue)
  if (!samples.length) return []

  const sampleIndexes = toNumberArray(sampleIndexesValue)
  return samples.map((sample, index): [number, number] => [
    sampleIndexes[index] ?? index,
    sample,
  ])
}

function scalarValue(value: unknown): number | null {
  const candidate = Array.isArray(value) ? value[0] : value
  const numberValue = Number(candidate)
  return Number.isFinite(numberValue) ? numberValue : null
}

function queueMqttPoint(
  queue: DualCurvePoint[],
  time: number,
  actual: number | null,
  target: number | null,
) {
  if (actual === null && target === null) return
  queue.push({ time, actual, target })
  scheduleMqttUiFlush()
}

function resetMqttTrendData(startedAtMs = 0) {
  temperaturePoints.value = []
  vibrationPoints.value = []
  reportTemperaturePoints.length = 0
  reportVibrationPoints.length = 0
  pendingTemperaturePoints.length = 0
  pendingVibrationPoints.length = 0
  mqttTrendStartedAtMs = startedAtMs
}

function mqttTrendElapsedSeconds(receivedAtMs: number): number {
  const receivedAt = Number.isFinite(receivedAtMs) ? receivedAtMs : Date.now()
  if (!mqttTrendStartedAtMs) mqttTrendStartedAtMs = receivedAt
  return Math.max(0, (receivedAt - mqttTrendStartedAtMs) / 1000)
}

function appendMqttBatch(
  pointsRef: typeof temperaturePoints,
  pending: DualCurvePoint[],
) {
  if (!pending.length) return

  pointsRef.value.push(...pending)
  pending.length = 0
  if (pointsRef.value.length > MAX_MQTT_POINTS + MQTT_POINT_TRIM_CHUNK) {
    pointsRef.value.splice(0, MQTT_POINT_TRIM_CHUNK)
  }
  triggerRef(pointsRef)
}

function flushMqttUi() {
  mqttUiFlushTimer = null
  appendMqttBatch(temperaturePoints, pendingTemperaturePoints)
  appendMqttBatch(vibrationPoints, pendingVibrationPoints)
}

function scheduleMqttUiFlush() {
  if (mqttUiFlushTimer) return
  mqttUiFlushTimer = setTimeout(flushMqttUi, MQTT_UI_FLUSH_INTERVAL_MS)
}

function resultText(result: WorkerJobResponse['NODE_RESULTS']): string {
  if (!result) return ''
  const blockResult = result.result
  if (typeof blockResult.text_blob === 'string') return blockResult.text_blob
  const data = blockResult.data
  if (data && typeof data.s === 'string') return data.s
  return ''
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function metadataNumber(
  metadata: Record<string, unknown>,
  key: string,
): number | null {
  const value = Number(metadata[key])
  return Number.isFinite(value) ? value : null
}

function updatePowerReading(
  key: PowerReadingKey,
  data: Record<string, unknown>,
) {
  const metadata = metadataRecord(data.extra)
  const freshness = powerFreshness[key]
  freshness.valid = metadata.valid !== false
  freshness.fresh = metadata.fresh !== false
  freshness.lastValueAt = (
    metadataNumber(metadata, 'last_value_at_ms')
    ?? (freshness.valid ? Date.now() : 0)
  )
  freshness.error = typeof metadata.error === 'string' ? metadata.error : ''

  const value = scalarValue(data.c)
  if (freshness.valid && value !== null) {
    powerReadings[key] = value
    if (key === 'current48v' || key === 'current90v') {
      const point = { time: currentElapsedSeconds(), value }
      const points = key === 'current48v'
        ? current48vPoints.value
        : current90vPoints.value
      points.push(point)
    }
  }
}

function currentElapsedSeconds(): number {
  if (workbenchElapsedSeconds.value !== null) return workbenchElapsedSeconds.value
  return Math.max(
    0,
    pulserLastFrameTime,
    lastOf(temperaturePoints.value)?.time ?? 0,
    lastOf(pendingTemperaturePoints)?.time ?? 0,
    lastOf(vibrationPoints.value)?.time ?? 0,
    lastOf(pendingVibrationPoints)?.time ?? 0,
  )
}

function latestDualValueAtOrBefore(
  points: HaltHassDualCurvePoint[],
  elapsedSeconds: number,
): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]
    if (point.time <= elapsedSeconds && point.actual !== null) return point.actual
  }
  return null
}

function latestScalarValueAtOrBefore(
  points: HaltHassScalarCurvePoint[],
  elapsedSeconds: number,
): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]
    if (point.time <= elapsedSeconds && point.value !== null) return point.value
  }
  return null
}

function hasStorageTest(): boolean {
  return [
    ...(props.processJson?.testFlow.nodes || []),
    ...(props.processJson?.cycleFlow.nodes || []),
  ].some(node => (
    String(node.data?.func || '').toUpperCase() === 'READ_MEMORY_ADDRESS'
    || String(node.data?.label || '').includes('存储板')
  ))
}

function communicationResult(
  freshness: { lastAttemptAt: number; lastAttemptOk: boolean },
): '正常' | '异常' {
  return freshness.lastAttemptAt > 0 && freshness.lastAttemptOk ? '正常' : '异常'
}

function buildPeriodicRecord(
  elapsedSeconds: number,
  isPartialInterval: boolean,
): HaltHassPeriodicRecord {
  const temperature = latestDualValueAtOrBefore(
    reportTemperaturePoints.length ? reportTemperaturePoints : temperaturePoints.value,
    elapsedSeconds,
  )
  const vibration = latestDualValueAtOrBefore(
    reportVibrationPoints.length ? reportVibrationPoints : vibrationPoints.value,
    elapsedSeconds,
  )
  const current48v = latestScalarValueAtOrBefore(current48vPoints.value, elapsedSeconds)
  const current90v = latestScalarValueAtOrBefore(current90vPoints.value, elapsedSeconds)
  const interfaceBoard = communicationResult(ifboxFreshness.communication)
  const controlBoard = communicationResult(ifboxFreshness.controlBoard)
  const storageBoard = hasStorageTest()
    ? communicationResult(storageReading)
    : '不适用'
  const pulserSummary = (
    pulserStream.movementConfirmed
    && pulserStream.lastSampleAt > 0
    && !pulserStream.error
  ) ? '正常' : '异常'
  const missingReasons: string[] = []
  if (temperature === null) missingReasons.push('未取得温度末值')
  if (vibration === null) missingReasons.push('未取得振动末值')
  if (current48v === null) missingReasons.push('未取得 48V 电流末值')
  if (current90v === null) missingReasons.push('未取得 90V 电流末值')
  if (interfaceBoard === '异常') missingReasons.push('接口板通信异常')
  if (controlBoard === '异常') missingReasons.push('控制板通信异常')
  if (storageBoard === '异常') missingReasons.push('存储板通信异常')
  if (pulserSummary === '异常') missingReasons.push('脉冲器波形或运动异常')

  const runStartMs = pulserRunStartedAtMs || Date.now() - elapsedSeconds * 1000
  return {
    intervalIndex: periodicRecords.value.length + 1,
    recordedAt: new Date(runStartMs + elapsedSeconds * 1000).toISOString(),
    elapsedSeconds: Math.max(0, Math.round(elapsedSeconds)),
    isPartialInterval,
    temperature,
    vibration,
    communications: { interfaceBoard, controlBoard, storageBoard },
    pulserSummary,
    current48v,
    current90v,
    missingReasons,
  }
}

function persistPeriodicRecords(): void {
  saveHaltHassPeriodicRecords(props.sessionId, periodicRecords.value)
}

function generateDuePeriodicRecords(elapsed = currentElapsedSeconds()): void {
  const lastElapsed = lastOf(periodicRecords.value)?.elapsedSeconds ?? 0
  let nextBoundary = Math.floor(lastElapsed / PERIODIC_RECORD_SECONDS + 1)
    * PERIODIC_RECORD_SECONDS
  let changed = false
  while (nextBoundary <= Math.floor(elapsed)) {
    periodicRecords.value.push(buildPeriodicRecord(nextBoundary, false))
    nextBoundary += PERIODIC_RECORD_SECONDS
    changed = true
  }
  if (changed) persistPeriodicRecords()
}

function downsampleDual(
  points: HaltHassDualCurvePoint[],
  limit = REPORT_CHART_MAX_POINTS,
): HaltHassDualCurvePoint[] {
  if (points.length <= limit) return points.map(point => ({ ...point }))
  const step = Math.ceil(points.length / Math.max(1, Math.floor(limit / 2)))
  const output: HaltHassDualCurvePoint[] = []
  for (let index = 0; index < points.length; index += step) {
    const bucket = points.slice(index, index + step)
    const candidates = bucket.filter(point => point.actual !== null)
    if (!candidates.length) {
      output.push(lastOf(bucket)!)
      continue
    }
    let minimum = candidates[0]
    let maximum = candidates[0]
    for (const point of candidates) {
      if ((point.actual ?? Infinity) < (minimum.actual ?? Infinity)) minimum = point
      if ((point.actual ?? -Infinity) > (maximum.actual ?? -Infinity)) maximum = point
    }
    output.push(...[minimum, maximum].sort((a, b) => a.time - b.time))
  }
  return output.slice(0, limit)
}

function downsampleScalar(
  points: HaltHassScalarCurvePoint[],
  limit = REPORT_CHART_MAX_POINTS,
): HaltHassScalarCurvePoint[] {
  if (points.length <= limit) return points.map(point => ({ ...point }))
  const step = Math.ceil(points.length / Math.max(1, Math.floor(limit / 2)))
  const output: HaltHassScalarCurvePoint[] = []
  for (let index = 0; index < points.length; index += step) {
    const bucket = points.slice(index, index + step)
    const candidates = bucket.filter(point => point.value !== null)
    if (!candidates.length) {
      output.push(lastOf(bucket)!)
      continue
    }
    let minimum = candidates[0]
    let maximum = candidates[0]
    for (const point of candidates) {
      if ((point.value ?? Infinity) < (minimum.value ?? Infinity)) minimum = point
      if ((point.value ?? -Infinity) > (maximum.value ?? -Infinity)) maximum = point
    }
    output.push(...[minimum, maximum].sort((a, b) => a.time - b.time))
  }
  return output.slice(0, limit)
}

function getTelemetrySnapshot(): HaltHassTelemetrySnapshot {
  flushMqttUi()
  return {
    periodicRecords: periodicRecords.value.map(record => ({
      ...record,
      communications: { ...record.communications },
      missingReasons: [...record.missingReasons],
    })),
    chartSummary: {
      pulser: downsampleDual(reportPulserPoints),
      temperature: downsampleDual(reportTemperaturePoints),
      vibration: downsampleDual(reportVibrationPoints),
      current48v: downsampleScalar(current48vPoints.value),
      current90v: downsampleScalar(current90vPoints.value),
    },
    rectifierReport: isRectifierProcess.value
      ? {
          currentUnit: 'A',
          stages: rectifierStages.value.map(stage => ({
            ...stage,
            voltageSteps: stage.voltageSteps.map(step => ({
              ...step,
              halfLoad: { ...step.halfLoad, missingReasons: [...step.halfLoad.missingReasons] },
              fullLoad: { ...step.fullLoad, missingReasons: [...step.fullLoad.missingReasons] },
            })),
          })),
          boardConclusions: [],
        }
      : undefined,
    generatedAt: new Date().toISOString(),
  }
}

function finalizeTelemetry(): HaltHassTelemetrySnapshot {
  const elapsed = currentElapsedSeconds()
  generateDuePeriodicRecords(elapsed)
  const lastElapsed = lastOf(periodicRecords.value)?.elapsedSeconds ?? 0
  if (elapsed > lastElapsed && elapsed % PERIODIC_RECORD_SECONDS !== 0) {
    periodicRecords.value.push(buildPeriodicRecord(elapsed, true))
    persistPeriodicRecords()
  }
  return getTelemetrySnapshot()
}

async function waitForRectifierStages(): Promise<void> {
  await rectifierStageExecution
}

defineExpose({ finalizeTelemetry, getTelemetrySnapshot, waitForRectifierStages })

function updateIfboxReading(key: IfboxReadingKey, value: string) {
  const now = Date.now()
  const freshness = ifboxFreshness[key]
  freshness.lastAttemptAt = now
  freshness.lastAttemptOk = Boolean(value)
  if (!value) return

  ifboxReadings[key] = value
  freshness.lastSuccessAt = now
  ifboxConnection.lastError = ''
}

function updateStorageReading(value: string) {
  const now = Date.now()
  storageReading.lastAttemptAt = now
  storageReading.lastAttemptOk = Boolean(value)
  if (!value) return

  storageReading.value = value
  storageReading.lastSuccessAt = now
  storageConnection.lastError = ''
}

function compactPulserHistory(
  points: DualCurvePoint[],
  latestTime: number,
): DualCurvePoint[] {
  const historyCutoff = Math.max(
    0,
    latestTime - MAX_PULSER_HISTORY_SECONDS,
  )
  const recentCutoff = Math.max(
    historyCutoff,
    latestTime - PULSER_RECENT_RAW_SECONDS,
  )
  const historyStart = findFirstVisibleIndex(points, historyCutoff)
  const recentStart = findFirstVisibleIndex(points, recentCutoff)
  const compacted: DualCurvePoint[] = []
  let bucketSecond = -1
  let bucket: DualCurvePoint[] = []

  const flushBucket = () => {
    if (!bucket.length) return
    let minActual = -1
    let maxActual = -1
    let minTarget = -1
    let maxTarget = -1
    bucket.forEach((point, index) => {
      if (point.actual !== null) {
        if (
          minActual < 0
          || point.actual < (bucket[minActual].actual ?? Infinity)
        ) minActual = index
        if (
          maxActual < 0
          || point.actual > (bucket[maxActual].actual ?? -Infinity)
        ) maxActual = index
      }
      if (point.target !== null) {
        if (
          minTarget < 0
          || point.target < (bucket[minTarget].target ?? Infinity)
        ) minTarget = index
        if (
          maxTarget < 0
          || point.target > (bucket[maxTarget].target ?? -Infinity)
        ) maxTarget = index
      }
    })
    const retained = [minActual, maxActual, minTarget, maxTarget]
      .filter(index => index >= 0)
      .filter((index, position, values) => values.indexOf(index) === position)
      .sort((left, right) => left - right)
    if (!retained.length) compacted.push(bucket[0])
    else retained.forEach(index => compacted.push(bucket[index]))
    bucket = []
  }

  for (let index = historyStart; index < recentStart; index += 1) {
    const point = points[index]
    const pointSecond = Math.floor(point.time)
    if (bucketSecond >= 0 && pointSecond !== bucketSecond) flushBucket()
    bucketSecond = pointSecond
    bucket.push(point)
  }
  flushBucket()
  compacted.push(...points.slice(recentStart))
  return compacted
}

function appendPulserFrame(
  actualFrame: Array<[number, number]>,
  targetFrame: Array<[number, number]>,
  metadata: Record<string, unknown>,
) {
  const frameLength = Math.max(actualFrame.length, targetFrame.length)
  if (!frameLength) return

  const sequence = metadataNumber(metadata, 'sequence')
  if (
    sequence !== null
    && pulserLastSequence > 0
    && sequence <= pulserLastSequence
  ) {
    return
  }
  const newSampleCount = sequence !== null && pulserLastSequence > 0
    ? Math.min(frameLength, Math.max(0, sequence - pulserLastSequence))
    : frameLength
  if (!newSampleCount) return

  const capturedAtMs = (
    metadataNumber(metadata, 'last_sample_at_ms')
    ?? Date.now()
  )
  let frameEnd = Math.max(
    0,
    (capturedAtMs - pulserRunStartedAtMs) / 1000,
  )
  if (frameEnd <= pulserLastFrameTime) {
    frameEnd = pulserLastFrameTime + Math.max(newSampleCount / 1000, 0.001)
  }
  const frameStart = pulserLastFrameTime > 0
    ? pulserLastFrameTime
    : Math.max(0, frameEnd - Math.min(1, newSampleCount / 250))
  const sourceStart = frameLength - newSampleCount
  const frameSpan = Math.max(frameEnd - frameStart, 0.001)
  const appended = Array.from(
    { length: newSampleCount },
    (_, offset): DualCurvePoint => {
      const sourceIndex = sourceStart + offset
      const progress = newSampleCount > 1
        ? offset / (newSampleCount - 1)
        : 1
      return {
        time: frameStart + frameSpan * progress,
        actual: actualFrame[sourceIndex]?.[1] ?? null,
        target: targetFrame[sourceIndex]?.[1] ?? null,
      }
    },
  )

  const currentPoints = pulserPoints.value
  currentPoints.push(...appended)
  const reportCandidates: DualCurvePoint[] = []
  const actualValues = appended.filter(point => point.actual !== null)
  const targetValues = appended.filter(point => point.target !== null)
  if (actualValues.length) {
    reportCandidates.push(
      actualValues.reduce((left, right) => (left.actual ?? Infinity) <= (right.actual ?? Infinity) ? left : right),
      actualValues.reduce((left, right) => (left.actual ?? -Infinity) >= (right.actual ?? -Infinity) ? left : right),
    )
  }
  if (targetValues.length) {
    reportCandidates.push(
      targetValues.reduce((left, right) => (left.target ?? Infinity) <= (right.target ?? Infinity) ? left : right),
      targetValues.reduce((left, right) => (left.target ?? -Infinity) >= (right.target ?? -Infinity) ? left : right),
    )
  }
  reportCandidates
    .filter((point, index, values) => values.indexOf(point) === index)
    .sort((left, right) => left.time - right.time)
    .forEach(point => reportPulserPoints.push({ ...point }))
  let nextPoints = currentPoints
  const oldestTime = nextPoints[0]?.time ?? frameEnd
  const compactionDue = (
    nextPoints.length > PULSER_COMPACTION_THRESHOLD
    || frameEnd - oldestTime > MAX_PULSER_HISTORY_SECONDS
  )
  if (compactionDue && frameEnd - pulserLastCompactionAt >= 60) {
    nextPoints = compactPulserHistory(nextPoints, frameEnd)
    pulserLastCompactionAt = frameEnd
    pulserPoints.value = nextPoints
  } else {
    triggerRef(pulserPoints)
  }

  pulserLastSequence = sequence ?? pulserLastSequence + newSampleCount
  pulserLastFrameTime = frameEnd
}

const pulserStreamState = computed<'live' | 'waiting' | 'stale' | 'error'>(() => {
  if (pulserStream.error && !pulserStream.lastSampleAt) return 'error'
  if (!pulserStream.lastSampleAt) return 'waiting'
  if (
    !pulserStream.streaming
    || freshnessClock.value - pulserStream.lastSampleAt
      > TELEMETRY_STALE_AFTER_MS
  ) {
    return 'stale'
  }
  return 'live'
})

const pulserStreamText = computed(() => {
  if (pulserStreamState.value === 'live') {
    return `自动上报正常 · ${pulserStream.sampleCount} 点`
  }
  if (pulserStreamState.value === 'stale') {
    const ageSeconds = Math.max(
      Math.floor((freshnessClock.value - pulserStream.lastSampleAt) / 1000),
      0,
    )
    return `自动上报已中断 · ${ageSeconds} 秒无新数据`
  }
  if (pulserStreamState.value === 'error') {
    return `接收异常：${pulserStream.error}`
  }
  return props.isRunning ? '等待脉冲器自动上报' : '尚未开始采集'
})

type DeviceConnectionStatus = {
  id: 'itech3123_48v' | 'itech3123' | 'ifbox' | 'storage' | 'pulser'
  name: string
  icon: string
  online: boolean
  detail: string
  voltage?: string
  current?: string
  readings?: Array<{
    label: string
    value: string
    online: boolean
  }>
}

function powerDeviceIsOnline(keys: PowerReadingKey[]): boolean {
  return keys.some((key) => {
    const freshness = powerFreshness[key]
    return (
      freshness.valid
      && freshness.fresh
      && freshness.lastValueAt > 0
      && freshnessClock.value - freshness.lastValueAt
        <= DEVICE_ONLINE_STALE_AFTER_MS
    )
  })
}

const ifboxPreflightResult = computed(() => (
  props.preflightResult?.results.find(result => result.role === 'ifbox') ?? null
))
const storagePreflightResult = computed(() => (
  props.preflightResult?.results.find(result => result.role === 'storage') ?? null
))

function ifboxIsOnline(): boolean {
  const hasRecentResponse = Object.values(ifboxFreshness).some((freshness) => (
    freshness.lastAttemptOk
    && freshness.lastSuccessAt > 0
    && freshnessClock.value - freshness.lastSuccessAt
      <= DEVICE_ONLINE_STALE_AFTER_MS
  ))
  return (
    ifboxConnection.opened
    || hasRecentResponse
    || ifboxPreflightResult.value?.success === true
  )
}

function storageIsOnline(): boolean {
  const hasRecentResponse = (
    storageReading.lastAttemptOk
    && storageReading.lastSuccessAt > 0
    && freshnessClock.value - storageReading.lastSuccessAt
      <= DEVICE_ONLINE_STALE_AFTER_MS
  )
  return (
    storageConnection.opened
    || hasRecentResponse
    || storagePreflightResult.value?.success === true
  )
}

const deviceConnectionStatuses = computed<DeviceConnectionStatus[]>(() => {
  const itech3123_48vOnline = powerDeviceIsOnline([
    'voltage48v',
    'current48v',
  ])
  const itech3123Online = powerDeviceIsOnline([
    'voltage90v',
    'current90v',
  ])
  const ifboxOnline = ifboxIsOnline()
  const storageOnline = storageIsOnline()
  const pulserOnline = (
    pulserStream.streaming
    && pulserStream.lastSampleAt > 0
    && !pulserStream.error
    && freshnessClock.value - pulserStream.lastSampleAt
      <= DEVICE_ONLINE_STALE_AFTER_MS
  )

  return [
    {
      id: 'itech3123_48v',
      name: 'ITECH 3123（48 V）',
      icon: 'mdi:power-plug-outline',
      online: itech3123_48vOnline,
      voltage: formatReading(powerReadings.voltage48v, 'V'),
      current: formatReading(powerReadings.current48v, 'A'),
      detail: itech3123_48vOnline
        ? `${formatReading(powerReadings.voltage48v, 'V')} / ${formatReading(powerReadings.current48v, 'A')}`
        : '无实时通信响应',
    },
    {
      id: 'itech3123',
      name: 'ITECH 3123（90 V）',
      icon: 'mdi:power-plug-outline',
      online: itech3123Online,
      voltage: formatReading(powerReadings.voltage90v, 'V'),
      current: formatReading(powerReadings.current90v, 'A'),
      detail: itech3123Online
        ? `${formatReading(powerReadings.voltage90v, 'V')} / ${formatReading(powerReadings.current90v, 'A')}`
        : '无实时通信响应',
    },
    {
      id: 'ifbox',
      name: 'IFBOX',
      icon: 'mdi:server-network-outline',
      online: ifboxOnline,
      detail: ifboxOnline
        ? (
            ifboxReadings.status
            || ifboxReadings.communication
            || (
              ifboxConnection.opened
                ? (
                    ifboxConnection.lastError
                      ? '串口已打开，循环状态查询异常'
                      : '串口已打开，等待循环状态回包'
                  )
                : '预检通信通过，等待循环流打开串口'
            )
          )
        : '无实时通信响应',
      readings: [
        {
          label: '接口板',
          value: ifboxReadings.communication || '等待工艺回包',
          online: Boolean(ifboxReadings.communication),
        },
        {
          label: '控制板',
          value: ifboxReadings.controlBoard || '等待工艺回包',
          online: Boolean(ifboxReadings.controlBoard),
        },
      ],
    },
    {
      id: 'storage',
      name: '存储板',
      icon: 'mdi:memory',
      online: storageOnline,
      detail: storageReading.value
        ? `响应 ${storageReading.value}`
        : (
            storageConnection.opened
              ? (
                  storageConnection.lastError
                    ? '串口已打开，读取异常'
                    : '串口已打开，等待读取'
                )
              : (
                  storagePreflightResult.value?.success
                    ? '预检通信通过，等待循环流读取'
                    : '无实时通信响应'
                )
          ),
    },
    {
      id: 'pulser',
      name: '脉冲器',
      icon: 'mdi:pulse',
      online: pulserOnline,
      detail: pulserOnline
        ? (
            pulserStream.movementConfirmed
              ? `运动已确认 · 峰峰值 ${pulserStream.movementActualSpan.toFixed(3)} mA`
              : `自动上报 ${pulserStream.sampleCount} 点 · 等待运动确认`
          )
        : '无实时曲线上报',
    },
  ]
})

watch(
  () => props.sessionId,
  sessionId => {
    resetTelemetry()
    periodicRecords.value = loadHaltHassPeriodicRecords(sessionId)
  },
)

watch(
  () => props.isRunning,
  (running, previous) => {
    if (running && !previous) {
      resetTelemetry()
      return
    }
    if (!running && previous && mqttConnected.value && !workbenchFinishEmitted) {
      // Flojoy 启动失败、异常退出或安全退出时，不能让已经启动的工作台继续运行。
      void publishMqttCommand(mqttConfig.topicPrefix, 'Stop')
        .then(() => publishMqttCommand(mqttConfig.topicPrefix, 'RequestTestStatus'))
        .catch(error => console.error('[HALT-HASS] 工作台兜底停止失败:', error))
    }
  },
)

watch(
  () => props.defaultWorkbenchTestName,
  value => {
    if (!selectedWorkbenchTest.value && value?.trim()) selectedWorkbenchTest.value = value.trim()
  },
)

watch(
  () => mqttConnected.value,
  connected => {
    if (connected && !workbenchTests.value.length && !workbenchListLoading.value) {
      void readWorkbenchTests()
    }
    if (!connected) {
      workbenchListRequestToken += 1
      workbenchListLoading.value = false
      if (workbenchListTimeout) clearTimeout(workbenchListTimeout)
      workbenchListTimeout = null
    }
  },
  { immediate: true },
)

watch(
  () => props.lastMessage,
  (message) => {
    for (const [nodeId, error] of Object.entries(message?.FAILED_NODES ?? {})) {
      const failedFunc = nodeFunctionById.value.get(nodeId)
      if (
        failedFunc === 'OPEN_IFB'
        || failedFunc === 'READ_COMM'
        || failedFunc === 'READ_MAST'
        || failedFunc === 'READ_STATUS'
      ) {
        ifboxConnection.lastError = error
        if (failedFunc === 'OPEN_IFB') ifboxConnection.opened = false
      }
      if (failedFunc === 'READ_MEMORY_ADDRESS' || isStorageNode(nodeId)) {
        storageConnection.lastError = error
        if (failedFunc === 'OPEN_SERIAL') storageConnection.opened = false
      }
      if (failedFunc === 'READ_PULSER_WAVEFORM') {
        pulserStream.error = error
        pulserStream.movementConfirmed = false
      }
    }

    const nodeResult = message?.NODE_RESULTS
    if (!nodeResult) return

    const func = nodeFunctionById.value.get(nodeResult.id)
    const data = nodeResult.result.data
    if (!func) return

    if (func === 'OPEN_IFB') {
      ifboxConnection.opened = true
      ifboxConnection.openedAt = Date.now()
      ifboxConnection.lastError = ''
      return
    }
    if (func === 'CLOSE_IFB') {
      ifboxConnection.opened = false
      return
    }
    if (func === 'OPEN_SERIAL' && isStorageNode(nodeResult.id)) {
      storageConnection.opened = true
      storageConnection.openedAt = Date.now()
      storageConnection.lastError = ''
      return
    }
    if (func === 'CLOSE_SERIAL' && isStorageNode(nodeResult.id)) {
      storageConnection.opened = false
      return
    }

    // String 节点的 WebSocket 结果只有 text_blob，没有 result.data。
    // 接口板、控制板和存储板状态必须在结构化数据判断之前处理。
    if (func === 'READ_COMM') {
      updateIfboxReading('communication', resultText(nodeResult))
      return
    }
    if (func === 'READ_MAST') {
      updateIfboxReading('controlBoard', resultText(nodeResult))
      return
    }
    if (func === 'READ_STATUS') {
      updateIfboxReading('status', resultText(nodeResult))
      return
    }
    if (func === 'READ_MEMORY_ADDRESS') {
      updateStorageReading(resultText(nodeResult))
      return
    }

    if (!data) return

    if (func === 'READ_PULSER_WAVEFORM') {
      const metadata = metadataRecord(data.extra)
      const actualFrame = buildPulserFrame(data.x, data.y)
      const targetFrame = buildPulserFrame(data.x, metadata.target_y)
      pulserStream.streaming = metadata.streaming === true
      pulserStream.fresh = metadata.fresh === true
      pulserStream.sequence = metadataNumber(metadata, 'sequence') ?? 0
      pulserStream.sampleCount = metadataNumber(metadata, 'sample_count') ?? 0
      pulserStream.lastSampleAt = (
        metadataNumber(metadata, 'last_sample_at_ms') ?? 0
      )
      pulserStream.movementConfirmed = metadata.movement_confirmed === true
      pulserStream.movementActualSpan = (
        metadataNumber(metadata, 'movement_actual_span') ?? 0
      )
      pulserStream.error = typeof metadata.error === 'string'
        ? metadata.error
        : ''

      // 只追加后台接收器确认的新样本，并使用接收时间映射到本次循环测试
      // 的运行时间轴。较早数据按秒保留极值，最近 5 分钟保留完整波形。
      if (pulserStream.fresh && actualFrame.length) {
        appendPulserFrame(actualFrame, targetFrame, metadata)
      }
      return
    }

    if (func === 'MEASURE_VOLTAGE_ITECH3123_48V') {
      updatePowerReading('voltage48v', data)
    } else if (func === 'MEASURE_CURRENT_ITECH3123_48V') {
      updatePowerReading('current48v', data)
    } else if (func === 'MEASURE_VOLTAGE_ITECH3123') {
      updatePowerReading('voltage90v', data)
    } else if (func === 'MEASURE_CURRENT_ITECH3123') {
      updatePowerReading('current90v', data)
    }
  },
)

watch(
  () => lastMqttCommunication.value,
  (communication) => {
    if (!communication) return
    persistClientCommunicationLog({
      eventType: communication.direction === 'send'
        ? 'device-command'
        : 'device-response',
      message: communication.message,
      level: communication.level,
      direction: communication.direction,
      data: {
        transport: 'MQTT',
        topic: communication.topic,
        payload: communication.payload,
        occurredAt: communication.occurredAt,
      },
    })
  },
)

watch(
  () => lastMqttMessage.value,
  (message) => {
    if (!message) return
    persistClientCommunicationLog({
      eventType: 'device-response',
      message: `MQTT ${message.topic} 收到工作台回执`,
      direction: 'receive',
      data: {
        transport: 'MQTT',
        topic: message.topic,
        rawPayload: message.rawPayload,
        payload: message.payload,
        receivedAt: message.receivedAt,
      },
    })
    const update = parseHassMqttTelemetry(message)

    if (update.kind === 'system-status') {
      workbenchReadings.systemStatus = update.status
      return
    }
    if (update.kind === 'test-status') {
      const wasRunning = isWorkbenchRunning()
      workbenchReadings.testStatus = update.status
      if (update.name) loadedWorkbenchTest.value = update.name
      const running = isWorkbenchRunning()
      if (running && !wasRunning) {
        hasSeenWorkbenchRunning = true
        workbenchFinishEmitted = false
        const now = Date.now()
        // 温度和振动使用工作台 MQTT 接收时间轴，与脉冲器采样点轴分离。
        // 工作台重新进入 Running 时同时丢弃订阅后收到的上一轮状态快照。
        resetMqttTrendData(message.receivedAt || now)
        mqttTelemetryWatchStartedAt = now
        mqttTemperatureReceivedAt = 0
        mqttVibrationReceivedAt = 0
        mqttWatchdogNextRetryAt = now + MQTT_TELEMETRY_TIMEOUT_MS
        mqttTelemetryWarning.value = ''
      } else if (!running) {
        mqttTelemetryWatchStartedAt = 0
        mqttWatchdogNextRetryAt = 0
        mqttTelemetryWarning.value = ''
        if (wasRunning && hasSeenWorkbenchRunning && props.isRunning && !workbenchFinishEmitted) {
          workbenchFinishEmitted = true
          emit('workbenchFinished', {
            status: update.status,
            elapsedSeconds: workbenchElapsedSeconds.value ?? currentElapsedSeconds(),
            remainingSeconds: workbenchRemainingSeconds.value ?? 0,
          })
        }
      }
      return
    }

    if (update.kind === 'test-list') {
      workbenchListRequestToken += 1
      if (workbenchListTimeout) clearTimeout(workbenchListTimeout)
      workbenchListTimeout = null
      workbenchListLoading.value = false
      workbenchTests.value = update.tests
      workbenchListError.value = update.tests.length
        ? ''
        : '工作台返回的曲线列表为空'
      const defaultName = props.defaultWorkbenchTestName?.trim()
      if (!selectedWorkbenchTest.value && defaultName) selectedWorkbenchTest.value = defaultName
      if (!selectedWorkbenchTest.value && update.tests.length) selectedWorkbenchTest.value = update.tests[0].name
      return
    }

    if (update.kind === 'temperature') {
      workbenchElapsedSeconds.value = update.time
      workbenchRemainingSeconds.value = update.remainingTime
      mqttTemperatureReceivedAt = Date.now()
      const time = mqttTrendElapsedSeconds(message.receivedAt)
      queueMqttPoint(
        pendingTemperaturePoints,
        time,
        update.actual,
        update.target,
      )
      if (update.actual !== null || update.target !== null) {
        reportTemperaturePoints.push({ time, actual: update.actual, target: update.target })
      }
      if (
        isRectifierProcess.value
        && props.isRunning
        && isWorkbenchRunning()
        && !rectifierExecutionFailed
      ) {
        const latestVibration = lastOf(reportVibrationPoints)
        const trigger = rectifierStageTracker.observe({
          totalTime: update.time,
          receivedAt: message.receivedAt,
          targetTemperature: update.target,
          actualTemperature: update.actual,
          targetVibration: latestVibration?.target ?? null,
          actualVibration: latestVibration?.actual ?? null,
        })
        if (trigger) queueRectifierStage(trigger)
      }
    } else if (update.kind === 'vibration') {
      workbenchElapsedSeconds.value = update.time
      workbenchRemainingSeconds.value = update.remainingTime
      mqttVibrationReceivedAt = Date.now()
      const time = mqttTrendElapsedSeconds(message.receivedAt)
      queueMqttPoint(
        pendingVibrationPoints,
        time,
        update.actual,
        update.target,
      )
      if (update.actual !== null || update.target !== null) {
        reportVibrationPoints.push({ time, actual: update.actual, target: update.target })
      }
    }
  },
)

function pulserYDomain(points: DualCurvePoint[]): [number, number] {
  if (!points.length) return [4, 20]

  let minimum = Infinity
  let maximum = -Infinity
  for (const point of points) {
    if (point.actual !== null) {
      minimum = Math.min(minimum, point.actual)
      maximum = Math.max(maximum, point.actual)
    }
    if (point.target !== null) {
      minimum = Math.min(minimum, point.target)
      maximum = Math.max(maximum, point.target)
    }
  }

  // 保持 4~20 mA 的物理边界，同时至少显示 4 mA 的纵向窗口，
  // 避免自动缩放把微小串口噪声放大成剧烈波动。
  const visibleSpan = Math.max(maximum - minimum, 4)
  const padding = Math.max(visibleSpan * 0.12, 0.25)
  let lower = Math.max(4, minimum - padding)
  let upper = Math.min(20, maximum + padding)

  if (upper - lower < 4) {
    const missingSpan = 4 - (upper - lower)
    lower = Math.max(4, lower - missingSpan / 2)
    upper = Math.min(20, upper + missingSpan / 2)
    if (upper - lower < 4) {
      if (lower <= 4) upper = Math.min(20, 8)
      else if (upper >= 20) lower = Math.max(4, 16)
    }
  }

  return [
    Number(lower.toFixed(3)),
    Number(upper.toFixed(3)),
  ]
}

function visiblePulserSamples(
  points: DualCurvePoint[],
  sampleWindow: PulserSampleWindow,
): DualCurvePoint[] {
  const latestSamples = points.slice(-sampleWindow)
  return latestSamples.map((point, index) => ({
    ...point,
    // 实时波形只表达最新采样帧内部的形状，不再复用循环运行时间。
    time: index + 1,
  }))
}

const visiblePulserPoints = computed(() => (
  visiblePulserSamples(pulserPoints.value, pulserSampleWindow.value)
))

function pulserTooltipFormatter(params: unknown): string {
  const items = (Array.isArray(params) ? params : [params]).filter(
    (item): item is Record<string, unknown> => (
      item !== null && typeof item === 'object'
    ),
  )
  const seriesValue = (seriesName: string): number | null => {
    const item = items.find(candidate => candidate.seriesName === seriesName)
    const data = item?.data
    if (!Array.isArray(data)) return null
    const value = Number(data[1])
    return Number.isFinite(value) ? value : null
  }
  const referenceData = items.map(item => item.data).find(Array.isArray)
  const sampleIndex = Math.max(1, Math.round(Number(referenceData?.[0] ?? 1)))
  const actualValue = seriesValue('脉冲器实际曲线')
  const targetValue = seriesValue('脉冲器目标曲线')
  const rows = [`<strong>当前窗口第 ${sampleIndex} 个采样点</strong>`]
  if (actualValue !== null) rows.push(`实际值：${actualValue.toFixed(3)} mA`)
  if (targetValue !== null) rows.push(`目标值：${targetValue.toFixed(3)} mA`)
  if (actualValue !== null && targetValue !== null) {
    rows.push(`偏差：${(actualValue - targetValue).toFixed(3)} mA`)
  }
  return rows.join('<br>')
}

const pulserChartOption = computed(() => {
  const points = visiblePulserPoints.value
  const [yMinimum, yMaximum] = pulserYDomain(points)

  return {
    animation: false,
    aria: {
      enabled: true,
      label: {
        description: `脉冲器目标曲线与实际曲线最近 ${pulserSampleWindow.value} 个采样点实时波形图`,
      },
    },
    grid: {
      left: 58,
      right: 34,
      top: 38,
      bottom: 62,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: '#94a3b8',
          type: 'dashed',
        },
      },
      formatter: pulserTooltipFormatter,
    },
    legend: {
      data: ['脉冲器实际曲线', '脉冲器目标曲线'],
      bottom: 2,
      textStyle: {
        color: '#64748b',
      },
    },
    xAxis: {
      type: 'value',
      name: '采样点',
      nameGap: 24,
      boundaryGap: false,
      min: 1,
      max: Math.max(points.length, 2),
      minInterval: 1,
      axisLabel: {
        color: '#64748b',
        hideOverlap: true,
        formatter: (value: number) => Math.round(value).toString(),
      },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(148, 163, 184, 0.08)' },
      },
    },
    yAxis: {
      type: 'value',
      name: 'mA',
      min: yMinimum,
      max: yMaximum,
      scale: true,
      splitNumber: 5,
      axisLabel: {
        color: '#64748b',
        formatter: (value: number) => value.toFixed(1),
      },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.15)' } },
    },
    series: [
      {
        name: '脉冲器实际曲线',
        type: 'line',
        data: points.map(point => [point.time, point.actual]),
        showSymbol: false,
        smooth: false,
        connectNulls: false,
        lineStyle: {
          width: 1.25,
          color: '#22d3ee',
        },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 2.5 },
        },
      },
      {
        name: '脉冲器目标曲线',
        type: 'line',
        data: points.map(point => [point.time, point.target]),
        showSymbol: false,
        smooth: false,
        connectNulls: false,
        lineStyle: {
          width: 1.1,
          type: 'dashed',
          color: '#f59e0b',
        },
      },
    ],
  }
})

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function findFirstVisibleIndex(
  points: DualCurvePoint[],
  cutoff: number,
): number {
  let low = 0
  let high = points.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (points[middle].time < cutoff) low = middle + 1
    else high = middle
  }
  return Math.max(0, low - 1)
}

/**
 * 参考 MQTT_TEST：原始数据保留约 6 小时，绘图数据按画布宽度做保峰降采样。
 * 每个桶同时保留目标/实际曲线的极值点，避免长时间运行时削掉瞬态峰值
 * 或目标值阶跃。
 */
function visibleCurvePoints(
  points: DualCurvePoint[],
  window: ChartWindow = chartWindow.value,
): DualCurvePoint[] {
  if (points.length < 2) return points.slice()

  const latestTime = points[points.length - 1].time
  const cutoff = window === 'all'
    ? points[0].time
    : latestTime - window
  const startIndex = window === 'all'
    ? 0
    : findFirstVisibleIndex(points, cutoff)
  const visibleCount = points.length - startIndex
  const maxDisplayPoints = clamp(
    Math.floor(chartViewportWidth.value * 2.4),
    MIN_CHART_DISPLAY_POINTS,
    MAX_CHART_DISPLAY_POINTS,
  )

  if (visibleCount <= maxDisplayPoints) return points.slice(startIndex)

  const result: DualCurvePoint[] = [points[startIndex]]
  const lastIndex = points.length - 1
  const interiorCount = Math.max(0, visibleCount - 2)
  const bucketCount = Math.max(1, Math.floor((maxDisplayPoints - 2) / 4))
  const bucketSize = interiorCount / bucketCount

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const from = startIndex + 1 + Math.floor(bucket * bucketSize)
    const to = Math.min(
      lastIndex,
      startIndex + 1 + Math.floor((bucket + 1) * bucketSize),
    )
    if (to <= from) continue

    let minActualIndex = -1
    let maxActualIndex = -1
    let minTargetIndex = -1
    let maxTargetIndex = -1

    for (let index = from; index < to; index += 1) {
      const point = points[index]
      if (point.actual !== null) {
        if (
          minActualIndex < 0
          || point.actual < (points[minActualIndex].actual ?? Infinity)
        ) minActualIndex = index
        if (
          maxActualIndex < 0
          || point.actual > (points[maxActualIndex].actual ?? -Infinity)
        ) maxActualIndex = index
      }
      if (point.target !== null) {
        if (
          minTargetIndex < 0
          || point.target < (points[minTargetIndex].target ?? Infinity)
        ) minTargetIndex = index
        if (
          maxTargetIndex < 0
          || point.target > (points[maxTargetIndex].target ?? -Infinity)
        ) maxTargetIndex = index
      }
    }

    const retainedIndexes = [
      minActualIndex,
      maxActualIndex,
      minTargetIndex,
      maxTargetIndex,
    ]
      .filter(index => index >= 0)
      .filter((index, position, values) => values.indexOf(index) === position)
      .sort((left, right) => left - right)
    retainedIndexes.forEach(index => result.push(points[index]))
  }

  if (result[result.length - 1] !== points[lastIndex]) {
    result.push(points[lastIndex])
  }
  return result
}

function dualCurveYDomain(
  points: DualCurvePoint[],
  fallback: [number, number],
): [number, number] {
  if (!points.length) return fallback

  let minimum = Infinity
  let maximum = -Infinity
  for (const point of points) {
    if (point.actual !== null) {
      minimum = Math.min(minimum, point.actual)
      maximum = Math.max(maximum, point.actual)
    }
    if (point.target !== null) {
      minimum = Math.min(minimum, point.target)
      maximum = Math.max(maximum, point.target)
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return fallback

  const padding = Math.max((maximum - minimum) * 0.18, 1)
  return [
    Number((minimum - padding).toFixed(3)),
    Number((maximum + padding).toFixed(3)),
  ]
}

function formatElapsedAxis(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function mqttTooltipFormatter(
  params: unknown,
  actualName: string,
  targetName: string,
  unit: string,
): string {
  const items = (Array.isArray(params) ? params : [params]).filter(
    (item): item is Record<string, unknown> => (
      item !== null && typeof item === 'object'
    ),
  )
  const seriesValue = (seriesName: string): number | null => {
    const item = items.find(candidate => candidate.seriesName === seriesName)
    const data = item?.data
    if (!Array.isArray(data)) return null
    const value = Number(data[1])
    return Number.isFinite(value) ? value : null
  }
  const referenceData = items
    .map(item => item.data)
    .find(Array.isArray)
  const elapsedSeconds = Number(referenceData?.[0] ?? 0)
  const actualValue = seriesValue(actualName)
  const targetValue = seriesValue(targetName)
  const rows = [
    `<strong>运行 ${formatElapsedAxis(elapsedSeconds)}</strong>`,
  ]

  if (actualValue !== null) {
    rows.push(`${actualName}：${actualValue.toFixed(3)} ${unit}`)
  }
  if (targetValue !== null) {
    rows.push(`${targetName}：${targetValue.toFixed(3)} ${unit}`)
  }
  if (actualValue !== null && targetValue !== null) {
    rows.push(`偏差：${(actualValue - targetValue).toFixed(3)} ${unit}`)
  }
  return rows.join('<br>')
}

function dualCurveSeriesData(
  points: DualCurvePoint[],
  valueKey: 'actual' | 'target',
  maximumGapSeconds: number,
): Array<[number, number | null]> {
  const output: Array<[number, number | null]> = []
  let previousTime: number | null = null
  for (const point of points) {
    if (
      previousTime !== null
      && point.time - previousTime > maximumGapSeconds
    ) {
      output.push([(previousTime + point.time) / 2, null])
    }
    output.push([point.time, point[valueKey]])
    previousTime = point.time
  }
  return output
}

function mqttChartOption(
  actualName: string,
  targetName: string,
  unit: string,
  points: DualCurvePoint[],
  fallbackDomain: [number, number],
) {
  const [yMinimum, yMaximum] = dualCurveYDomain(points, fallbackDomain)
  return {
    animation: false,
    aria: {
      enabled: true,
      label: {
        description: `${actualName}与${targetName}长时间运行趋势图`,
      },
    },
    grid: {
      left: 58,
      right: 34,
      top: 38,
      bottom: 62,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: {
        type: 'line',
        lineStyle: { color: '#94a3b8', type: 'dashed' },
      },
      formatter: (params: unknown) => mqttTooltipFormatter(
        params,
        actualName,
        targetName,
        unit,
      ),
    },
    legend: {
      data: [actualName, targetName],
      bottom: 2,
      textStyle: { color: '#64748b' },
    },
    xAxis: {
      type: 'value',
      name: 'MQTT 接收时间',
      nameGap: 24,
      boundaryGap: false,
      axisLabel: {
        color: '#64748b',
        hideOverlap: true,
        formatter: (value: number) => formatElapsedAxis(value),
      },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(148, 163, 184, 0.08)' },
      },
    },
    yAxis: {
      type: 'value',
      name: unit,
      min: yMinimum,
      max: yMaximum,
      scale: true,
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.15)' } },
    },
    series: [
      {
        name: actualName,
        type: 'line',
        data: dualCurveSeriesData(
          points,
          'actual',
          MQTT_TELEMETRY_TIMEOUT_MS / 1000,
        ),
        showSymbol: false,
        smooth: true,
        sampling: 'lttb',
        progressive: 4000,
        progressiveThreshold: 3000,
        lineStyle: { width: 2, color: '#22d3ee' },
      },
      {
        name: targetName,
        type: 'line',
        data: dualCurveSeriesData(
          points,
          'target',
          MQTT_TELEMETRY_TIMEOUT_MS / 1000,
        ),
        showSymbol: false,
        smooth: true,
        sampling: 'lttb',
        progressive: 4000,
        progressiveThreshold: 3000,
        lineStyle: { width: 1.5, type: 'dashed', color: '#f59e0b' },
      },
    ],
  }
}

const visibleTemperaturePoints = computed(() => (
  visibleCurvePoints(temperaturePoints.value)
))
const visibleVibrationPoints = computed(() => (
  visibleCurvePoints(vibrationPoints.value)
))

const temperatureChartOption = computed(() => mqttChartOption(
  '实际温度',
  '目标温度',
  '℃',
  visibleTemperaturePoints.value,
  [105, 135],
))

const vibrationChartOption = computed(() => mqttChartOption(
  '实际振动',
  '目标振动',
  'g',
  visibleVibrationPoints.value,
  [0, 35],
))

onMounted(() => {
  loadMqttConfig()
  if (chartRegionElement.value) {
    chartViewportWidth.value = chartRegionElement.value.clientWidth
    chartResizeObserver = new ResizeObserver(([entry]) => {
      chartViewportWidth.value = Math.max(
        Math.floor(entry?.contentRect.width ?? 0),
        MIN_CHART_DISPLAY_POINTS / 2.4,
      )
    })
    chartResizeObserver.observe(chartRegionElement.value)
  }
  freshnessTimer = setInterval(() => {
    freshnessClock.value = Date.now()
    checkMqttTelemetryWatchdog()
    if (props.isRunning && mqttConnected.value && Date.now() >= nextWorkbenchStatusRequestAt) {
      nextWorkbenchStatusRequestAt = Date.now() + 2000
      void publishMqttCommand(mqttConfig.topicPrefix, 'RequestTestStatus')
    }
    if (props.isRunning) generateDuePeriodicRecords()
  }, 1000)
})

onUnmounted(() => {
  if (freshnessTimer) clearInterval(freshnessTimer)
  freshnessTimer = null
  if (mqttUiFlushTimer) clearTimeout(mqttUiFlushTimer)
  mqttUiFlushTimer = null
  chartResizeObserver?.disconnect()
  chartResizeObserver = null
  if (workbenchListTimeout) clearTimeout(workbenchListTimeout)
  workbenchListTimeout = null
  void stopMqttTelemetrySession()
})

function formatReading(value: number | null, unit: string): string {
  return value === null ? '--' : `${value.toFixed(3)} ${unit}`
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--:--'
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60
  return [
    hours,
    minutes,
    remainingSeconds,
  ].map(value => value.toString().padStart(2, '0')).join(':')
}

const cycleTotalTimeText = computed(() => formatDuration(workbenchElapsedSeconds.value))
const cycleRemainingTimeText = computed(() => formatDuration(workbenchRemainingSeconds.value))
const systemTimeText = computed(() => new Date(freshnessClock.value).toLocaleTimeString('zh-CN', { hour12: false }))
const latestTemperature = computed(() => lastOf(temperaturePoints.value) ?? lastOf(pendingTemperaturePoints))
const latestVibration = computed(() => lastOf(vibrationPoints.value) ?? lastOf(pendingVibrationPoints))
const statusById = computed(() => new Map(deviceConnectionStatuses.value.map(item => [item.id, item])))
const interfaceBoardOnline = computed(() => Boolean(ifboxReadings.communication))
const controlBoardOnline = computed(() => Boolean(ifboxReadings.controlBoard))
const storageBoardOnline = computed(() => statusById.value.get('storage')?.online === true)
const pulserOnline = computed(() => statusById.value.get('pulser')?.online === true)
const cycleStateText = computed(() => {
  if (props.cycleFinishState === 'recovering') return '正在下电'
  if (props.cycleFinishState === 'finishing') return '正在停止流程'
  return props.isRunning ? '循环测试运行中' : '等待运行'
})
</script>

<template>
  <section class="telemetry-panel">
    <header class="cycle-overview">
      <div class="overview-heading">
        <div>
          <strong>实时状态总览</strong>
          <span>{{ cycleStateText }}</span>
        </div>
        <div class="workbench-controls">
          <button class="control-button secondary" type="button" @click="mqttSettingsOpen = true">
            <Icon icon="mdi:cog-outline" /> MQTT 设置
          </button>
          <button class="control-button" type="button" :disabled="mqttConnected || mqttConnecting" @click="connectWorkbench">
            连接
          </button>
          <button class="control-button" type="button" :disabled="!mqttConnected || isRunning || workbenchListLoading" @click="readWorkbenchTests">
            <Icon v-if="workbenchListLoading" icon="mdi:loading" class="spin" />
            {{ workbenchListLoading ? '读取中' : '读取' }}
          </button>
          <select v-model="selectedWorkbenchTest" class="workbench-test-select" :disabled="!workbenchTests.length || isRunning">
            <option value="" disabled>
              {{ workbenchListLoading ? '正在读取曲线列表' : '选择温度、振动曲线' }}
            </option>
            <option v-for="test in workbenchTests" :key="test.name" :value="test.name">
              {{ test.name }}
            </option>
          </select>
          <button class="control-button" type="button" :disabled="!selectedWorkbenchTest || isRunning" @click="loadWorkbenchTest">
            加载
          </button>
          <button class="control-button primary" type="button" :disabled="isRunning || workbenchStarting || !canRun || loadedWorkbenchTest !== selectedWorkbenchTest" @click="runWorkbenchTest">
            {{ workbenchStarting ? '启动中' : '运行' }}
          </button>
          <button class="control-button danger" type="button" :disabled="(!isRunning && !workbenchStarting) || cycleFinishState === 'recovering'" @click="stopWorkbenchTest">
            停止
          </button>
        </div>
      </div>
      <p v-if="workbenchListError" class="workbench-list-feedback" role="alert">
        <Icon icon="mdi:alert-circle-outline" />
        {{ workbenchListError }}
      </p>

      <div class="overview-cards">
        <article class="overview-card neutral"><span>当前时间</span><strong>{{ systemTimeText }}</strong></article>
        <article class="overview-card neutral"><span>测试时间</span><strong>{{ cycleTotalTimeText }}</strong></article>
        <article class="overview-card neutral"><span>剩余时间</span><strong>{{ cycleRemainingTimeText }}</strong></article>
        <article class="overview-card neutral"><span>目标温度</span><strong>{{ formatReading(latestTemperature?.target ?? null, '°C') }}</strong></article>
        <article class="overview-card neutral"><span>实际温度</span><strong>{{ formatReading(latestTemperature?.actual ?? null, '°C') }}</strong></article>
        <article class="overview-card neutral"><span>目标振动</span><strong>{{ formatReading(latestVibration?.target ?? null, 'g') }}</strong></article>
        <article class="overview-card neutral"><span>实际振动</span><strong>{{ formatReading(latestVibration?.actual ?? null, 'g') }}</strong></article>
        <article class="overview-card" :class="{ online: interfaceBoardOnline }"><i /><span>接口板</span><strong>{{ interfaceBoardOnline ? '正常' : '异常' }}</strong></article>
        <article class="overview-card" :class="{ online: controlBoardOnline }"><i /><span>控制板</span><strong>{{ controlBoardOnline ? '正常' : '异常' }}</strong></article>
        <article class="overview-card" :class="{ online: storageBoardOnline }"><i /><span>存储板</span><strong>{{ storageBoardOnline ? '正常' : '异常' }}</strong></article>
        <article class="overview-card" :class="{ online: pulserOnline }"><i /><span>波形</span><strong>{{ pulserOnline ? '正常' : '异常' }}</strong></article>
        <article class="overview-card" :class="{ online: powerReadings.current48v !== null }"><i /><span>48V 电流</span><strong>{{ formatReading(powerReadings.current48v, 'A') }}</strong></article>
        <article class="overview-card" :class="{ online: powerReadings.current90v !== null }"><i /><span>90V 电流</span><strong>{{ formatReading(powerReadings.current90v, 'A') }}</strong></article>
        <article class="overview-card" :class="{ online: mqttConnected }"><i /><span>MQTT 通信</span><strong>{{ mqttConnected ? '通信正常' : '未连接' }}</strong></article>
      </div>
    </header>

    <div class="telemetry-main-grid">
      <div ref="chartRegionElement" class="chart-region">
      <div class="curve-toolbar" aria-label="曲线显示范围">
        <div class="curve-toolbar-label">
          <Icon icon="mdi:timeline-clock-outline" />
          <span>温度/振动趋势范围</span>
          <small>脉冲器按最新采样点显示；温度/振动按 MQTT 接收时间显示</small>
        </div>
        <div class="curve-window-options">
          <button
            v-for="option in chartWindowOptions"
            :key="option.value"
            type="button"
            :class="{ active: chartWindow === option.value }"
            :aria-pressed="chartWindow === option.value"
            @click="chartWindow = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="chart-stack">
        <div
          class="chart-shell primary-chart-shell"
          role="img"
          aria-label="脉冲器目标曲线与实际曲线"
        >
          <div class="chart-shell-heading">
            <strong>脉冲器曲线</strong>
            <div class="pulser-heading-actions">
              <div class="pulser-window-options" aria-label="脉冲器波形采样点数">
                <button
                  v-for="option in pulserSampleWindowOptions"
                  :key="option.value"
                  type="button"
                  :class="{ active: pulserSampleWindow === option.value }"
                  :aria-pressed="pulserSampleWindow === option.value"
                  @click="pulserSampleWindow = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
              <span class="stream-status" :data-state="pulserStreamState">
                <span class="status-dot" />
                <span>{{ pulserStreamText }}</span>
              </span>
            </div>
          </div>
          <VChart
            v-if="pulserPoints.length"
            :option="pulserChartOption"
            :update-options="{ notMerge: true, lazyUpdate: true, silent: true }"
            autoresize
            class="pulser-chart"
          />
          <div v-else class="chart-empty">
            <Icon icon="mdi:pulse" />
            <span>等待脉冲器目标曲线与实际曲线</span>
          </div>
        </div>
        <div class="secondary-chart-grid">
          <div
            class="chart-shell"
            role="img"
            aria-label="温度目标值与实际值曲线"
          >
          <div class="chart-shell-heading">
            <strong>温度曲线</strong>
            <span>目标值 / 实际值</span>
          </div>
          <VChart
            v-if="temperaturePoints.length"
            :option="temperatureChartOption"
            :update-options="{ notMerge: true, lazyUpdate: true, silent: true }"
            autoresize
            class="pulser-chart"
          />
          <div v-else class="chart-empty">
            <Icon icon="mdi:thermometer" />
            <span>等待温度目标值与实际值</span>
          </div>
          </div>
          <div
            class="chart-shell"
            role="img"
            aria-label="振动目标值与实际值曲线"
          >
          <div class="chart-shell-heading">
            <strong>振动曲线</strong>
            <span>目标值 / 实际值</span>
          </div>
          <VChart
            v-if="vibrationPoints.length"
            :option="vibrationChartOption"
            :update-options="{ notMerge: true, lazyUpdate: true, silent: true }"
            autoresize
            class="pulser-chart"
          />
          <div v-else class="chart-empty">
            <Icon icon="mdi:waveform" />
            <span>等待振动目标值与实际值</span>
          </div>
          </div>
        </div>
      </div>
      </div>

      <div v-if="$slots['below-overview']" class="overview-log-region">
        <slot name="below-overview" />
      </div>
    </div>

    <aside class="status-sidebar">
      <div class="sidebar-heading">
        <div>
          <h4>循环测试状态</h4>
          <p>{{ cycleStateText }}</p>
        </div>
        <Icon icon="mdi:chart-timeline-variant-shimmer" />
      </div>

      <div class="time-summary">
        <div class="time-card">
          <span>总运行时间</span>
          <strong>{{ cycleTotalTimeText }}</strong>
        </div>
        <div
          class="time-card remaining"
          :class="{ warning: cycleFinishState !== 'idle' && cycleRemainingSeconds === 0 }"
        >
          <span>剩余时间</span>
          <strong>{{ cycleRemainingTimeText }}</strong>
        </div>
      </div>

      <div class="status-section">
        <div class="section-heading">
          <span>设备状态</span>
          <small>{{ serverStatus }}</small>
        </div>
        <div class="device-status-list">
          <div
            v-for="device in deviceConnectionStatuses"
            :key="device.id"
            class="device-status-card"
            :class="{ online: device.online, offline: !device.online }"
            :aria-label="`${device.name}：${device.online ? '在线' : '离线'}`"
          >
            <div class="device-card-main">
              <span class="device-icon">
                <Icon :icon="device.icon" />
              </span>
              <div class="device-card-label">
                <strong>{{ device.name }}</strong>
                <small v-if="!device.voltage" :title="device.detail">
                  {{ device.detail }}
                </small>
              </div>
              <span class="device-state">
                <span class="device-state-dot" />
                {{ device.online ? '在线' : '离线' }}
              </span>
            </div>
            <div v-if="device.voltage && device.current" class="power-readings">
              <span>电压 <strong>{{ device.voltage }}</strong></span>
              <span>电流 <strong>{{ device.current }}</strong></span>
            </div>
            <div v-if="device.readings?.length" class="board-readings">
              <div
                v-for="reading in device.readings"
                :key="reading.label"
                class="board-reading"
              >
                <span class="board-reading-name">{{ reading.label }}</span>
                <span
                  class="board-reading-value"
                  :class="{ available: reading.online }"
                  :title="reading.value"
                >
                  {{ reading.value }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="status-section mqtt-section">
        <div class="section-heading">
          <span>工作台 MQTT</span>
        </div>
        <div
          class="mqtt-status-card"
          :class="{ 'has-warning': mqttTelemetryWarning }"
          :data-state="mqttConnectionState"
        >
          <div class="mqtt-status-main">
            <span class="status-dot" />
            <strong>{{ mqttDisplayStatus }}</strong>
          </div>
          <p v-if="workbenchReadings.systemStatus">
            系统状态：{{ workbenchReadings.systemStatus }}
          </p>
          <p v-if="workbenchReadings.testStatus">
            测试状态：{{ workbenchReadings.testStatus }}
          </p>
          <p v-if="!workbenchReadings.systemStatus && !workbenchReadings.testStatus">
            等待工作台状态上报
          </p>
        </div>
      </div>

      <div class="sidebar-actions">
        <button
          v-if="!isRunning"
          type="button"
          class="action-button primary"
          :disabled="!canRun || workbenchStarting"
          @click="runWorkbenchTest"
        >
          <Icon icon="mdi:play" />
          {{ workbenchStarting ? '等待工作台确认' : '运行循环流' }}
        </button>
        <button
          v-else
          type="button"
          class="action-button danger"
          :disabled="cycleFinishState === 'recovering'"
          @click="stopWorkbenchTest"
        >
          <Icon icon="mdi:stop" />
          {{ cycleFinishState === 'running' ? '停止循环流' : '正在关闭' }}
        </button>
        <button
          type="button"
          class="action-button secondary"
          @click="mqttSettingsOpen = true"
        >
          <Icon icon="mdi:cog-outline" />
          MQTT 设置
        </button>
      </div>
    </aside>

    <ElDialog
      v-model="mqttSettingsOpen"
      title="工作台 MQTT 设置"
      width="560px"
      append-to-body
      destroy-on-close
      class="mqtt-settings-dialog"
    >
      <p v-if="isRunning" class="mqtt-running-tip">
        MQTT 是本次循环测试的实时数据源，运行期间自动订阅，停止后自动退出。
      </p>
      <div class="mqtt-fields">
        <label>
          <span>工作台 Broker</span>
          <input
            v-model.trim="mqttConfig.broker"
            :disabled="mqttConnected || isRunning"
          />
        </label>
        <label class="port-field">
          <span>端口</span>
          <input
            v-model.number="mqttConfig.port"
            type="number"
            min="1"
            max="65535"
            :disabled="mqttConnected || isRunning"
          />
        </label>
        <label>
          <span>Topic 前缀</span>
          <input
            v-model.trim="mqttConfig.topicPrefix"
            :disabled="mqttConnected || isRunning"
          />
        </label>
        <label>
          <span>用户名</span>
          <input
            v-model="mqttConfig.username"
            :disabled="mqttConnected || isRunning"
          />
        </label>
        <label>
          <span>密码</span>
          <input
            v-model="mqttConfig.password"
            type="password"
            autocomplete="off"
            :disabled="mqttConnected || isRunning"
          />
        </label>
      </div>
      <template #footer>
        <div class="mqtt-dialog-actions">
          <button
            type="button"
            class="dialog-button secondary"
            @click="mqttSettingsOpen = false"
          >
            关闭
          </button>
          <button
            type="button"
            class="dialog-button primary"
            :disabled="isRunning"
            @click="saveMqttSettings"
          >
            <Icon icon="mdi:content-save-outline" />
            保存设置
          </button>
        </div>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped>
.telemetry-panel {
  flex: 1;
  display: grid;
  grid-template-rows: minmax(170px, 1fr) minmax(0, 4fr);
  gap: 0.75rem;
  height: 100%;
  min-height: 0;
  padding: 0.75rem 1rem 1rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background: rgba(15, 23, 42, 0.02);
  overflow: hidden;
}

.device-status-region {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0.5rem;
  min-height: 0;
  overflow-y: auto;
}

.mqtt-fields {
  display: grid;
  grid-template-columns: 1.4fr 0.55fr 0.75fr 0.85fr 0.85fr;
  gap: 0.6rem;
}

.mqtt-fields label {
  display: grid;
  gap: 0.25rem;
}

.mqtt-fields label > span {
  color: var(--color-text-secondary, #64748b);
  font-size: 0.7rem;
}

.mqtt-fields input {
  min-width: 0;
  height: 2rem;
  padding: 0 0.55rem;
  color: var(--color-text-primary, #0f172a);
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 0.4rem;
  background: var(--color-bg-primary, #fff);
  outline: none;
}

.mqtt-fields input:focus {
  border-color: #0891b2;
}

.mqtt-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  height: 2rem;
  padding: 0 0.75rem;
  color: #fff;
  border: 0;
  border-radius: 0.45rem;
  background: #0891b2;
  cursor: pointer;
  white-space: nowrap;
}

.mqtt-button.connected {
  background: #64748b;
}

.mqtt-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.mqtt-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  overflow: hidden;
  color: #34473f;
  font-size: 0.75rem;
  white-space: nowrap;
}

.mqtt-status > span + span:not(:last-child)::after {
  margin-left: 0.5rem;
  color: #cbd5e1;
  content: '|';
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #94a3b8;
}

.mqtt-status[data-state='connected'] .status-dot {
  background: #22c55e;
}

.mqtt-status[data-state='connecting'] .status-dot {
  background: #f59e0b;
}

.mqtt-status[data-state='error'] {
  color: #dc2626;
}

.mqtt-status[data-state='error'] .status-dot {
  background: #ef4444;
}

.chart-region {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  padding-right: 0.25rem;
  overflow-x: hidden;
  overflow-y: auto;
}

.chart-shell {
  position: relative;
  flex: 0 0 clamp(320px, 42vh, 480px);
  width: 100%;
  min-height: 320px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 0.75rem;
  background: var(--color-bg-secondary, #fff);
}

.stream-status {
  position: absolute;
  z-index: 2;
  top: 0.55rem;
  right: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: calc(100% - 1.5rem);
  padding: 0.25rem 0.5rem;
  color: #64748b;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  font-size: 0.68rem;
  pointer-events: none;
}

.stream-status[data-state='live'] {
  color: #15803d;
}

.stream-status[data-state='live'] .status-dot {
  background: #22c55e;
}

.stream-status[data-state='stale'],
.stream-status[data-state='waiting'] {
  color: #b45309;
}

.stream-status[data-state='stale'] .status-dot,
.stream-status[data-state='waiting'] .status-dot {
  background: #f59e0b;
}

.stream-status[data-state='error'] {
  color: #dc2626;
}

.stream-status[data-state='error'] .status-dot {
  background: #ef4444;
}

.pulser-chart {
  width: 100%;
  height: 100%;
}

.mqtt-chart-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

.chart-empty {
  display: grid;
  place-content: center;
  justify-items: center;
  height: 100%;
  gap: 0.5rem;
  color: var(--color-text-secondary, #64748b);
}

.chart-empty svg {
  width: 2rem;
  height: 2rem;
}

.mqtt-note {
  padding: 0.65rem 0.75rem;
  border-left: 3px solid #f59e0b;
  background: rgba(245, 158, 11, 0.08);
}

@media (max-width: 960px) {
  .telemetry-panel {
    grid-template-rows: minmax(220px, 1fr) minmax(0, 3fr);
  }

  .device-status-region {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto auto;
  }

  .device-status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mqtt-toolbar {
    grid-template-columns: 1fr;
  }

  .mqtt-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mqtt-settings summary {
    grid-template-columns: 1fr auto;
  }

  .mqtt-status {
    grid-column: 1 / -1;
  }
}

/* 循环监控主布局：顶部状态总览，下面按 7:3 显示曲线与关键日志。 */
.telemetry-panel {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.75rem;
  padding: 0.65rem;
  background: var(--color-bg-tertiary, #f4f7fb);
}

.telemetry-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
  gap: 0.75rem;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.overview-log-region {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.overview-log-region :deep(.execution-log-panel) {
  height: 100%;
  min-height: 0;
  max-height: none;
  border-width: 1px;
  border-radius: 0.7rem;
  resize: none;
}

.chart-region {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.5rem;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.curve-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
  min-height: 2.25rem;
  padding: 0.25rem 0.4rem 0.25rem 0.65rem;
  border: 1px solid #dbe3ee;
  border-radius: 0.65rem;
  background: #fff;
}

.curve-toolbar-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  color: #475569;
  font-size: 0.72rem;
  white-space: nowrap;
}

.curve-toolbar-label svg {
  flex: none;
  width: 1rem;
  height: 1rem;
  color: #0891b2;
}

.curve-toolbar-label small {
  overflow: hidden;
  color: #94a3b8;
  font-size: 0.66rem;
  text-overflow: ellipsis;
}

.curve-window-options {
  display: inline-flex;
  flex: none;
  align-items: center;
  padding: 0.15rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background: #f8fafc;
}

.curve-window-options button {
  min-height: 1.75rem;
  padding: 0 0.6rem;
  color: #64748b;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  font-size: 0.68rem;
  cursor: pointer;
}

.curve-window-options button:hover {
  color: #0e7490;
  background: #ecfeff;
}

.curve-window-options button:focus-visible {
  outline: 2px solid #0891b2;
  outline-offset: 1px;
}

.curve-window-options button.active {
  color: #fff;
  background: #0891b2;
  box-shadow: 0 1px 2px rgba(8, 145, 178, 0.22);
}

.chart-stack {
  display: grid;
  grid-template-rows: minmax(0, 1.35fr) minmax(0, 0.85fr);
  gap: 0.6rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.chart-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  flex: none;
  width: 100%;
  min-height: 175px;
  border: 1px solid #dbe3ee;
  border-radius: 0.7rem;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}

.cycle-overview {
  display: grid;
  gap: 0.55rem;
  min-width: 0;
}

.overview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.overview-heading > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
  color: #1e293b;
}

.overview-heading > div:first-child span {
  color: #64748b;
  font-size: 0.72rem;
}

.workbench-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  min-width: 0;
}

.workbench-list-feedback {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  color: var(--color-warning, #b45309);
  font-size: 0.68rem;
}

.control-button,
.workbench-test-select {
  height: 2rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.45rem;
  background: #fff;
  color: #334155;
  font-size: 0.7rem;
}

.control-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0 0.65rem;
  cursor: pointer;
}

.control-button.primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.control-button.danger {
  border-color: #dc2626;
  background: #dc2626;
  color: #fff;
}

.control-button.secondary {
  color: #475569;
}

.control-button:disabled,
.workbench-test-select:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.spin {
  animation: telemetry-spin 1s linear infinite;
}

@keyframes telemetry-spin {
  to { transform: rotate(360deg); }
}

.workbench-test-select {
  width: clamp(160px, 18vw, 280px);
  padding: 0 0.5rem;
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(14, minmax(0, 1fr));
  gap: 0.3rem;
  min-width: 0;
  padding-bottom: 0.15rem;
  overflow: visible;
}

.overview-card {
  position: relative;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 0.25rem;
  min-width: 0;
  min-height: 4rem;
  padding: 0.4rem 0.25rem;
  border: 1px solid #fecaca;
  border-radius: 0.65rem;
  background: #fffafa;
  text-align: center;
}

.overview-card.neutral {
  border-color: #dbe3ee;
  background: #fff;
}

.overview-card.online {
  border-color: #75d6a6;
  background: #f4fcf8;
}

.overview-card > i {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #ef4444;
}

.overview-card.online > i {
  background: #22a66f;
  box-shadow: 0 0 0 3px rgba(34, 166, 111, 0.12);
}

.overview-card > span {
  color: #64748b;
  font-size: clamp(0.56rem, 0.62vw, 0.68rem);
  white-space: nowrap;
}

.overview-card > strong {
  max-width: 100%;
  overflow: hidden;
  color: #162033;
  font-family: 'JetBrains Mono', 'Roboto Mono', Consolas, monospace;
  font-size: clamp(0.68rem, 0.72vw, 0.86rem);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.primary-chart-shell {
  min-height: 0;
}

.secondary-chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
  min-height: 0;
}

.secondary-chart-grid .chart-shell {
  min-height: 0;
}

.chart-shell-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
  color: #64748b;
  border-bottom: 1px solid #edf1f6;
  font-size: 0.7rem;
}

.chart-shell-heading strong {
  color: #26364a;
  font-size: 0.78rem;
}

.stream-status {
  position: static;
  max-width: 72%;
  padding: 0;
  background: transparent;
}

.pulser-chart {
  min-height: 0;
}

.chart-empty {
  min-height: 0;
}

.status-sidebar {
  display: none;
  flex-direction: column;
  gap: 0.65rem;
  min-width: 0;
  min-height: 0;
  padding: 0.85rem;
  border: 1px solid #dbe3ee;
  border-radius: 0.8rem;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
  overflow-x: hidden;
  overflow-y: auto;
}

.sidebar-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid #edf1f6;
}

.sidebar-heading h4 {
  margin: 0;
  color: #1e293b;
  font-size: 0.95rem;
}

.sidebar-heading p {
  margin: 0.2rem 0 0;
  color: #64748b;
  font-size: 0.72rem;
}

.sidebar-heading > svg {
  flex: 0 0 auto;
  color: #3b82f6;
  font-size: 1.35rem;
}

.time-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.time-card {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.65rem 0.7rem;
  border: 1px solid #dbe6f3;
  border-radius: 0.65rem;
  background: #f8fbff;
}

.time-card > span {
  color: #64748b;
  font-size: 0.68rem;
}

.time-card > strong {
  color: #0f4c81;
  font-family: 'JetBrains Mono', 'Roboto Mono', Consolas, monospace;
  font-size: clamp(0.9rem, 1.1vw, 1.12rem);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.time-card.remaining {
  border-color: #cde7df;
  background: #f3fbf8;
}

.time-card.remaining > strong {
  color: #087f5b;
}

.time-card.warning {
  border-color: #fed7aa;
  background: #fff7ed;
}

.time-card.warning > strong {
  color: #c2410c;
}

.status-section {
  display: grid;
  gap: 0.45rem;
  min-height: 0;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 700;
}

.section-heading small {
  max-width: 64%;
  overflow: hidden;
  color: #94a3b8;
  font-size: 0.62rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-status-list {
  display: grid;
  gap: 0.4rem;
}

.device-status-card {
  display: grid;
  grid-template-rows: none;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.6rem;
  background: #fbfdff;
  box-shadow: none;
}

.device-status-card.online {
  border-color: #d5e9df;
  background: #f8fcfa;
}

.device-card-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
}

.device-icon {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  color: #64748b;
  border-radius: 0.45rem;
  background: #eef2f7;
}

.device-status-card.online .device-icon {
  color: #16805e;
  background: #e9f7f1;
}

.device-card-label {
  display: grid;
  gap: 0.08rem;
  color: #334155;
  font-size: 0.72rem;
}

.device-card-label strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-card-label small {
  overflow: hidden;
  color: #8492a6;
  font-size: 0.6rem;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-state {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: #dc2626;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
}

.device-status-card.online .device-state {
  color: #15803d;
}

.device-state-dot,
.status-dot {
  width: 0.45rem;
  height: 0.45rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: none;
}

.device-status-card.online .device-state-dot {
  background: #22c55e;
  box-shadow: none;
}

.power-readings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  padding-left: 2.25rem;
}

.power-readings > span {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem;
  color: #64748b;
  font-size: 0.72rem;
}

.power-readings strong {
  overflow: hidden;
  color: #0f172a;
  font-family: 'JetBrains Mono', 'Roboto Mono', Consolas, monospace;
  font-size: 0.82rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-readings {
  display: grid;
  gap: 0.25rem;
  padding: 0.35rem 0 0 2.25rem;
  border-top: 1px solid #edf1f6;
}

.board-reading {
  display: grid;
  grid-template-columns: 3.2rem minmax(0, 1fr);
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.board-reading-name {
  color: #64748b;
  font-size: 0.64rem;
  font-weight: 700;
}

.board-reading-value {
  overflow: hidden;
  color: #94a3b8;
  font-family: 'JetBrains Mono', 'Roboto Mono', Consolas, monospace;
  font-size: 0.64rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-reading-value.available {
  color: #166534;
}

.mqtt-section {
  margin-bottom: auto;
}

.mqtt-status-card {
  display: grid;
  gap: 0.25rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.6rem;
  background: #fbfdff;
}

.mqtt-status-main {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #475569;
  font-size: 0.7rem;
}

.mqtt-status-card p {
  margin: 0;
  padding-left: 0.85rem;
  color: #8492a6;
  font-size: 0.62rem;
}

.mqtt-status-card[data-state='connected'] {
  border-color: #d5e9df;
  background: #f8fcfa;
}

.mqtt-status-card[data-state='connected'] .status-dot {
  background: #22c55e;
}

.mqtt-status-card[data-state='connecting'] .status-dot {
  background: #f59e0b;
}

.mqtt-status-card[data-state='error'] {
  border-color: #fecaca;
  background: #fffafa;
}

.pulser-heading-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
}

.pulser-window-options {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.4rem;
  background: #f8fafc;
}

.pulser-window-options button {
  min-height: 1.45rem;
  padding: 0 0.45rem;
  color: #64748b;
  border: 0;
  border-radius: 0.3rem;
  background: transparent;
  font-size: 0.64rem;
  cursor: pointer;
}

.pulser-window-options button:hover,
.pulser-window-options button:focus-visible {
  color: #0e7490;
  background: #ecfeff;
}

.pulser-window-options button:focus-visible {
  outline: 2px solid #0891b2;
  outline-offset: 1px;
}

.pulser-window-options button.active {
  color: #fff;
  background: #0891b2;
}

.mqtt-status-card.has-warning {
  border-color: #fcd34d;
  background: #fffbeb;
}

.mqtt-status-card.has-warning .status-dot {
  background: #f59e0b;
}

.sidebar-actions {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 0.5rem;
  padding-top: 0.65rem;
  border-top: 1px solid #edf1f6;
}

.action-button,
.dialog-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.75rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid transparent;
  border-radius: 0.6rem;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.action-button.primary,
.dialog-button.primary {
  color: #fff;
  background: #2563eb;
}

.action-button.primary:hover:not(:disabled),
.dialog-button.primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.action-button.danger {
  color: #fff;
  background: #dc2626;
}

.action-button.secondary,
.dialog-button.secondary {
  color: #475569;
  border-color: #cbd5e1;
  background: #fff;
}

.action-button:disabled,
.dialog-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.action-button:focus-visible,
.dialog-button:focus-visible,
.mqtt-fields input:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.mqtt-running-tip {
  margin: 0 0 0.8rem;
  padding: 0.6rem 0.75rem;
  color: #9a5b09;
  border-radius: 0.5rem;
  background: #fff7ed;
  font-size: 0.75rem;
}

.mqtt-fields {
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 0.75rem;
}

.mqtt-fields label:nth-child(n + 3) {
  grid-column: 1 / -1;
}

.mqtt-fields input {
  height: 2.35rem;
}

.mqtt-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
}

.dialog-button {
  min-height: 2.4rem;
}

.dialog-button.primary.connected {
  background: #64748b;
}

@media (max-width: 1100px) {
  .overview-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .workbench-controls {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 860px) {
  .telemetry-panel {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    overflow-y: auto;
  }

  .telemetry-main-grid {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(520px, 1fr) 260px;
    overflow: visible;
  }

  .chart-region {
    min-height: 520px;
  }

  .status-sidebar {
    overflow: visible;
  }
}
</style>
