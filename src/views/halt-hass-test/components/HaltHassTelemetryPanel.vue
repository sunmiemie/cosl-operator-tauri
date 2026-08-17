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
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { Icon } from '@iconify/vue'
import { ElDialog } from 'element-plus'

import type { WorkerJobResponse } from '@/composables/useFlojoySocket'
import {
  useHaltHassMqtt,
  type HaltHassMqttConfig,
} from '@/composables/useHaltHassMqtt'
import type { HassHardwarePreflightResponse } from '@/services/flojoy-api'
import { parseHassMqttTelemetry } from '@/services/hass-mqtt-telemetry'
import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'


use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
])

const props = defineProps<{
  processJson: HaltHassProcessJson | null
  lastMessage: WorkerJobResponse | null
  isRunning: boolean
  canRun: boolean
  cycleTotalSeconds: number | null
  cycleRemainingSeconds: number | null
  cycleFinishState: 'idle' | 'running' | 'finishing' | 'recovering'
  serverStatus: string
  preflightResult: HassHardwarePreflightResponse | null
}>()
const emit = defineEmits<{
  run: []
  stop: []
}>()

const MAX_MQTT_POINTS = 21_600
const MQTT_POINT_TRIM_CHUNK = 1_800
const MQTT_UI_FLUSH_INTERVAL_MS = 100
const MAX_PULSER_HISTORY_SECONDS = 21_600
const PULSER_RECENT_RAW_SECONDS = 300
const PULSER_COMPACTION_THRESHOLD = 180_000
const MIN_CHART_DISPLAY_POINTS = 600
const MAX_CHART_DISPLAY_POINTS = 2400
const TELEMETRY_STALE_AFTER_MS = 3000
const DEVICE_ONLINE_STALE_AFTER_MS = 8000

type DualCurvePoint = {
  time: number
  actual: number | null
  target: number | null
}

type ChartWindow = 300 | 3600 | 14_400 | 'all'

const pulserPoints = shallowRef<DualCurvePoint[]>([])
const temperaturePoints = shallowRef<DualCurvePoint[]>([])
const vibrationPoints = shallowRef<DualCurvePoint[]>([])
const chartWindow = ref<ChartWindow>('all')
const chartViewportWidth = ref(1000)
const chartRegionElement = ref<HTMLElement | null>(null)
const freshnessClock = ref(Date.now())
let freshnessTimer: ReturnType<typeof setInterval> | null = null
let chartResizeObserver: ResizeObserver | null = null
let mqttUiFlushTimer: ReturnType<typeof setTimeout> | null = null
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
const mqttConfig = reactive<HaltHassMqttConfig>({
  broker: '192.168.1.20',
  port: 1883,
  topicPrefix: 'EDM',
  username: 'Admin',
  password: '123456',
})
const mqttSettingsOpen = ref(false)
const workbenchReadings = reactive({
  systemStatus: '',
  testStatus: '',
})
const {
  connectionState: mqttConnectionState,
  statusMessage: mqttStatusMessage,
  lastMessage: lastMqttMessage,
  isConnected: mqttConnected,
  isConnecting: mqttConnecting,
  connect: connectMqtt,
  disconnect: disconnectMqtt,
} = useHaltHassMqtt()
const mqttDisplayStatus = computed(() => {
  if (!props.isRunning && mqttConnectionState.value === 'disconnected') {
    return '随循环测试自动订阅和退出'
  }
  return mqttStatusMessage.value
})
const powerReadings = reactive({
  voltage3124: null as number | null,
  current3124: null as number | null,
  voltage6723: null as number | null,
  current6723: null as number | null,
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
  voltage3124: { valid: false, fresh: false, lastValueAt: 0, error: '' },
  current3124: { valid: false, fresh: false, lastValueAt: 0, error: '' },
  voltage6723: { valid: false, fresh: false, lastValueAt: 0, error: '' },
  current6723: { valid: false, fresh: false, lastValueAt: 0, error: '' },
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
  const initialElapsed = Math.max(
    0,
    Number(props.cycleTotalSeconds ?? 0)
      - Number(props.cycleRemainingSeconds ?? props.cycleTotalSeconds ?? 0),
  )
  pulserRunStartedAtMs = Date.now() - initialElapsed * 1000
  pulserLastSequence = 0
  pulserLastFrameTime = 0
  pulserLastCompactionAt = 0
  pendingTemperaturePoints.length = 0
  pendingVibrationPoints.length = 0
  if (mqttUiFlushTimer) {
    clearTimeout(mqttUiFlushTimer)
    mqttUiFlushTimer = null
  }
  powerReadings.voltage3124 = null
  powerReadings.current3124 = null
  powerReadings.voltage6723 = null
  powerReadings.current6723 = null
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
  pulserStream.error = ''
  for (const freshness of Object.values(ifboxFreshness)) {
    freshness.lastSuccessAt = 0
    freshness.lastAttemptAt = 0
    freshness.lastAttemptOk = false
  }
}

function loadMqttConfig() {
  try {
    const stored = localStorage.getItem('halt-hass-mqtt-config')
    if (!stored) return
    const config = JSON.parse(stored) as Partial<HaltHassMqttConfig>
    if (typeof config.broker === 'string') mqttConfig.broker = config.broker
    if (Number.isInteger(config.port)) mqttConfig.port = Number(config.port)
    if (typeof config.topicPrefix === 'string') {
      mqttConfig.topicPrefix = config.topicPrefix
    }
    if (typeof config.username === 'string') mqttConfig.username = config.username
  } catch {
    // 配置损坏时继续使用工作台默认参数。
  }
}

function saveMqttConfig() {
  localStorage.setItem('halt-hass-mqtt-config', JSON.stringify({
    broker: mqttConfig.broker,
    port: mqttConfig.port,
    topicPrefix: mqttConfig.topicPrefix,
    username: mqttConfig.username,
  }))
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
  if (freshness.valid && value !== null) powerReadings[key] = value
}

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
  id: 'itech6723' | 'itech3123' | 'ifbox' | 'storage' | 'pulser'
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
  const itech6723Online = powerDeviceIsOnline([
    'voltage6723',
    'current6723',
  ])
  const itech3123Online = powerDeviceIsOnline([
    'voltage3124',
    'current3124',
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
      id: 'itech6723',
      name: 'ITECH 6723',
      icon: 'mdi:power-plug-outline',
      online: itech6723Online,
      voltage: formatReading(powerReadings.voltage6723, 'V'),
      current: formatReading(powerReadings.current6723, 'A'),
      detail: itech6723Online
        ? `${formatReading(powerReadings.voltage6723, 'V')} / ${formatReading(powerReadings.current6723, 'A')}`
        : '无实时通信响应',
    },
    {
      id: 'itech3123',
      name: 'ITECH 3123',
      icon: 'mdi:power-plug-outline',
      online: itech3123Online,
      voltage: formatReading(powerReadings.voltage3124, 'V'),
      current: formatReading(powerReadings.current3124, 'A'),
      detail: itech3123Online
        ? `${formatReading(powerReadings.voltage3124, 'V')} / ${formatReading(powerReadings.current3124, 'A')}`
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
        ? `自动上报 ${pulserStream.sampleCount} 点`
        : '无实时曲线上报',
    },
  ]
})

watch(
  () => props.isRunning,
  (running, previous) => {
    if (running && !previous) {
      resetTelemetry()
      // MQTT 与 Flojoy 是同一次循环测试的不同数据源。这里只负责订阅
      // 工作台实时数据；Connect/Run/Stop 由工艺节点和安全收尾流程负责。
      void startMqttTelemetrySession()
    } else if (!running && previous) {
      void stopMqttTelemetrySession()
    }
  },
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

    if (func === 'MEASURE_VOLTAGE_ITECH3124') {
      updatePowerReading('voltage3124', data)
    } else if (func === 'MEASURE_CURRENT_ITECH3124') {
      updatePowerReading('current3124', data)
    } else if (func === 'MEASURE_VOLTAGE_ITECH6723G') {
      updatePowerReading('voltage6723', data)
    } else if (func === 'MEASURE_CURRENT_ITECH6723G') {
      updatePowerReading('current6723', data)
    }
  },
)

watch(
  () => lastMqttMessage.value,
  (message) => {
    if (!message) return
    const update = parseHassMqttTelemetry(message)

    if (update.kind === 'system-status') {
      workbenchReadings.systemStatus = update.status
      return
    }
    if (update.kind === 'test-status') {
      workbenchReadings.testStatus = update.status
      return
    }

    if (update.kind === 'temperature') {
      queueMqttPoint(
        pendingTemperaturePoints,
        update.time,
        update.actual,
        update.target,
      )
    } else if (update.kind === 'vibration') {
      queueMqttPoint(
        pendingVibrationPoints,
        update.time,
        update.actual,
        update.target,
      )
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

const visiblePulserPoints = computed(() => (
  visibleCurvePoints(pulserPoints.value)
))

const pulserChartOption = computed(() => {
  const points = visiblePulserPoints.value
  const [yMinimum, yMaximum] = pulserYDomain(points)

  return {
    animation: false,
    aria: {
      enabled: true,
      label: {
        description: '脉冲器目标曲线与实际曲线长时间运行趋势图',
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
      formatter: (params: unknown) => mqttTooltipFormatter(
        params,
        '脉冲器实际曲线',
        '脉冲器目标曲线',
        'mA',
      ),
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
      name: '运行时间',
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
        data: points
          .filter(point => point.actual !== null)
          .map(point => [point.time, point.actual]),
        showSymbol: false,
        smooth: true,
        sampling: 'lttb',
        progressive: 4000,
        progressiveThreshold: 3000,
        lineStyle: {
          width: 2,
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
        data: points
          .filter(point => point.target !== null)
          .map(point => [point.time, point.target]),
        showSymbol: false,
        smooth: true,
        sampling: 'lttb',
        progressive: 4000,
        progressiveThreshold: 3000,
        lineStyle: {
          width: 1.7,
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
function visibleCurvePoints(points: DualCurvePoint[]): DualCurvePoint[] {
  if (points.length < 2) return points.slice()

  const latestTime = points[points.length - 1].time
  const cutoff = chartWindow.value === 'all'
    ? points[0].time
    : latestTime - chartWindow.value
  const startIndex = chartWindow.value === 'all'
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
      name: '运行时间',
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
        data: points
          .filter(point => point.actual !== null)
          .map(point => [point.time, point.actual]),
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
        data: points
          .filter(point => point.target !== null)
          .map(point => [point.time, point.target]),
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
  if (props.isRunning) {
    void startMqttTelemetrySession()
  } else {
    // 清除热更新或异常退出遗留的客户端订阅；不会向工作台发送 Stop。
    void stopMqttTelemetrySession()
  }
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
  }, 1000)
})

onUnmounted(() => {
  if (freshnessTimer) clearInterval(freshnessTimer)
  freshnessTimer = null
  if (mqttUiFlushTimer) clearTimeout(mqttUiFlushTimer)
  mqttUiFlushTimer = null
  chartResizeObserver?.disconnect()
  chartResizeObserver = null
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

const cycleTotalTimeText = computed(() => formatDuration(props.cycleTotalSeconds))
const cycleRemainingTimeText = computed(() => formatDuration(
  props.cycleRemainingSeconds ?? props.cycleTotalSeconds,
))
const cycleStateText = computed(() => {
  if (props.cycleFinishState === 'recovering') return '正在下电'
  if (props.cycleFinishState === 'finishing') return '正在停止流程'
  return props.isRunning ? '循环测试运行中' : '等待运行'
})
</script>

<template>
  <section class="telemetry-panel">
    <div ref="chartRegionElement" class="chart-region">
      <div class="curve-toolbar" aria-label="曲线显示范围">
        <div class="curve-toolbar-label">
          <Icon icon="mdi:timeline-clock-outline" />
          <span>显示范围</span>
          <small>完整数据保留约 6 小时，绘图自动保峰降采样</small>
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
          class="chart-shell"
          role="img"
          aria-label="脉冲器目标曲线与实际曲线"
        >
          <div class="chart-shell-heading">
            <strong>脉冲器曲线</strong>
            <span class="stream-status" :data-state="pulserStreamState">
              <span class="status-dot" />
              <span>{{ pulserStreamText }}</span>
            </span>
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
        <div class="mqtt-status-card" :data-state="mqttConnectionState">
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
          :disabled="!canRun"
          @click="emit('run')"
        >
          <Icon icon="mdi:play" />
          运行循环流
        </button>
        <button
          v-else
          type="button"
          class="action-button danger"
          :disabled="cycleFinishState === 'recovering'"
          @click="emit('stop')"
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

/* 循环监控主布局：曲线保持主视觉，状态和操作固定在右侧。 */
.telemetry-panel {
  grid-template-columns: minmax(0, 1fr) clamp(300px, 24vw, 350px);
  grid-template-rows: minmax(0, 1fr);
  gap: 0.75rem;
  padding: 0.65rem;
  background: #f4f7fb;
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
  grid-template-rows: repeat(3, minmax(175px, 1fr));
  gap: 0.6rem;
  height: 100%;
  min-height: 0;
  padding-right: 0.2rem;
  overflow-x: hidden;
  overflow-y: auto;
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
  display: flex;
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
  .telemetry-panel {
    grid-template-columns: minmax(0, 1fr) 290px;
  }

  .status-sidebar {
    padding: 0.65rem;
  }

  .power-readings {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .telemetry-panel {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(520px, 1fr) auto;
    overflow-y: auto;
  }

  .chart-region {
    min-height: 520px;
  }

  .status-sidebar {
    overflow: visible;
  }
}
</style>
