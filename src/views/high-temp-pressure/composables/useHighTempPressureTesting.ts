import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import * as echarts from 'echarts'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { readFile } from '@tauri-apps/plugin-fs'
import { ElMessage } from 'element-plus'
import { useConfig } from '@/composables/useConfig'
import type { HighTempPressureModal, HighTempPressurePanel } from '../types'
import { formatRuntimeTimer, getElapsedRuntimeSeconds } from '../utils/runtime'

export type HighTempPressureOcrChannel = {
  id: string
  name: string
  unit: string
  color: string
}

export type HighTempPressureOcrMeasurement = HighTempPressureOcrChannel & {
  raw: string
  value: number | null
  confidence: number | null
}

export type HighTempPressureCurveData = {
  timestampMs: number[]
  timeSec: number[]
  upperTemp: number[]
  lowerTemp: number[]
  pressure: number[]
}

export type HighTempPressureChartSummary = {
  latestUpperTemp: number | null
  latestLowerTemp: number | null
  latestPressure: number | null
  maxTemp: number | null
  minTemp: number | null
  avgTemp: number | null
  maxPressure: number | null
  minPressure: number | null
  count: number
  updatedAtMs: number | null
}

export type HighTempPressureChartSeriesKey = 'upperTemp' | 'lowerTemp' | 'pressure'

export type HighTempPressureChartSeriesVisibility = Record<HighTempPressureChartSeriesKey, boolean>

type OcrMeasurementPayload = {
  id?: unknown
  part?: unknown
  data?: unknown
  raw?: unknown
  value?: unknown
  confidence?: unknown
}

const MEASUREMENT_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#14b8a6',
  '#0ea5e9',
  '#22c55e',
  '#a855f7',
  '#eab308',
  '#fb7185',
  '#38bdf8',
  '#4ade80',
  '#facc15',
  '#c084fc',
  '#60a5fa',
]

const MEASUREMENT_METADATA: Record<string, { part: string; data: string }> = {
  vessel_250_upper_water_temp: { part: '250试验容器', data: '上部水温' },
  vessel_250_lower_water_temp: { part: '250试验容器', data: '下部水温' },
  vessel_250_pressure: { part: '250试验容器', data: '压力' },
  vessel_480_upper_water_temp: { part: '480试验容器', data: '上部水温' },
  vessel_480_lower_water_temp: { part: '480试验容器', data: '下部水温' },
  cylinder_pressure: { part: '筒内', data: '压力' },
}

const SAMPLE_INTERVAL_SECONDS = 0.5
const MAX_POINTS = 120
const MAX_RENDERED_CHART_POINTS = 6000

export function useHighTempPressureTesting() {
  const { initConfig, getConfigItem } = useConfig()
  const currentPanel = ref<HighTempPressurePanel>('dashboard')
  const activeModal = ref<HighTempPressureModal>(null)
  const testRunning = ref(false)
  const testStartTime = ref<number | null>(null)
  const csvCount = ref(0)
  const onlineSeconds = ref(0)
  const onlineTimerStr = ref(formatRuntimeTimer(0))
  const ocrDeviceIndex = ref<number | null>(null)
  const ocrDeviceName = ref('')
  const captureOutputDir = ref('')
  const ocrReadyPct = ref(0)
  const captureRecordCount = ref(0)
  const captureStatusText = ref('等待连接采集卡')
  const captureCompleted = ref(false)
  const latestFrameUrl = ref('')
  const exportedCaptureDir = ref('')
  const curveChartImagePath = ref('')
  const ocrMeasurements = ref<HighTempPressureOcrMeasurement[]>([])
  const ocrReadings = reactive<Record<string, number>>({})
  const ocrConfidence = reactive<Record<string, number>>({})
  const chartWindowMinutes = ref<number | null>(null)
  const chartRangeLocked = ref(false)
  const chartSeriesVisibility = reactive<HighTempPressureChartSeriesVisibility>({
    upperTemp: true,
    lowerTemp: true,
    pressure: true,
  })
  const curveData = reactive<HighTempPressureCurveData>({
    timestampMs: [],
    timeSec: [],
    upperTemp: [],
    lowerTemp: [],
    pressure: [],
  })
  const chartSummary = reactive<HighTempPressureChartSummary>({
    latestUpperTemp: null,
    latestLowerTemp: null,
    latestPressure: null,
    maxTemp: null,
    minTemp: null,
    avgTemp: null,
    maxPressure: null,
    minPressure: null,
    count: 0,
    updatedAtMs: null,
  })

  const state = reactive({
    chartData: {
      t1: [] as number[],
      t2: [] as number[],
      p: [] as number[],
    },
  })

  let timerInterval: number | null = null
  let capturePollTimer: number | null = null
  let unlistenStream: UnlistenFn | null = null
  let latestFrameObjectUrl = ''
  let lastSyncedRecordCount = 0
  let captureGeneration = 0
  let recordSyncPromise: Promise<void> | null = null
  const pendingOcrRecords = new Map<number, any>()
  let chartRenderTimer: number | null = null
  let chartInst: echarts.ECharts | null = null
  let applyingChartOption = false
  let manualChartRange: { start: number; end: number } | null = null

  function adaptiveChartDuration(spanMs: number) {
    const steps = [
      30 * 1000,
      60 * 1000,
      2 * 60 * 1000,
      5 * 60 * 1000,
      10 * 60 * 1000,
      30 * 60 * 1000,
      60 * 60 * 1000,
      3 * 60 * 60 * 1000,
      6 * 60 * 60 * 1000,
      12 * 60 * 60 * 1000,
      24 * 60 * 60 * 1000,
    ]
    return steps.find((step) => spanMs <= step) ?? steps[steps.length - 1]
  }

  function getChartRange() {
    const now = Date.now()
    const first = curveData.timestampMs[0]
    const last = curveData.timestampMs[curveData.timestampMs.length - 1]
    if (!Number.isFinite(first) || !Number.isFinite(last)) {
      return {
        fullStart: now,
        fullEnd: now + 30 * 1000,
        displayStart: now,
        displayEnd: now + 30 * 1000,
      }
    }

    const selectedWindow = chartWindowMinutes.value && chartWindowMinutes.value > 0
      ? chartWindowMinutes.value * 60 * 1000
      : null
    const windowSize = selectedWindow ?? adaptiveChartDuration(Math.max(0, last - first))
    const padding = Math.max(5000, Math.min(windowSize / 20, 5 * 60 * 1000))
    const fullEnd = Math.max(first + windowSize, last + padding)
    if (chartRangeLocked.value && manualChartRange) {
      const displayStart = Math.max(first, Math.min(manualChartRange.start, fullEnd))
      const displayEnd = Math.max(displayStart, Math.min(manualChartRange.end, fullEnd))
      return { fullStart: first, fullEnd, displayStart, displayEnd }
    }
    if (chartWindowMinutes.value === 0) {
      return { fullStart: first, fullEnd, displayStart: first, displayEnd: fullEnd }
    }
    const displayEnd = fullEnd
    return {
      fullStart: first,
      fullEnd,
      displayStart: Math.max(first, displayEnd - windowSize),
      displayEnd,
    }
  }

  function updateChartSummary() {
    const temperatureValues = [...curveData.upperTemp, ...curveData.lowerTemp]
      .filter((value) => Number.isFinite(value))
    const lastIndex = curveData.timestampMs.length - 1
    chartSummary.latestUpperTemp = lastIndex >= 0 ? curveData.upperTemp[lastIndex] ?? null : null
    chartSummary.latestLowerTemp = lastIndex >= 0 ? curveData.lowerTemp[lastIndex] ?? null : null
    chartSummary.latestPressure = lastIndex >= 0 ? curveData.pressure[lastIndex] ?? null : null
    chartSummary.maxTemp = temperatureValues.length ? Math.max(...temperatureValues) : null
    chartSummary.minTemp = temperatureValues.length ? Math.min(...temperatureValues) : null
    chartSummary.avgTemp = temperatureValues.length
      ? temperatureValues.reduce((sum, value) => sum + value, 0) / temperatureValues.length
      : null
    const pressureValues = curveData.pressure.filter((value) => Number.isFinite(value))
    chartSummary.maxPressure = pressureValues.length ? Math.max(...pressureValues) : null
    chartSummary.minPressure = pressureValues.length ? Math.min(...pressureValues) : null
    chartSummary.count = curveData.timestampMs.length
    chartSummary.updatedAtMs = lastIndex >= 0 ? curveData.timestampMs[lastIndex] ?? null : null
  }

  function formatChartAxisTime(value: number, spanMs: number) {
    const date = new Date(value)
    const includeSeconds = spanMs <= 10 * 60 * 1000
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' as const } : {}),
    })
  }

  function initChart() {
    const el = document.getElementById('htp-chart')
    if (!el) return
    disposeChart()
    echarts.getInstanceByDom(el)?.dispose()
    chartInst = echarts.init(el)
    chartInst.on('datazoom', () => {
      if (applyingChartOption || !chartInst) return
      const option = chartInst.getOption() as any
      const zoom = Array.isArray(option?.dataZoom) ? option.dataZoom[0] : null
      const start = Number(zoom?.startValue)
      const end = Number(zoom?.endValue)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
      manualChartRange = { start, end }
      chartRangeLocked.value = true
    })
    updateChart()
  }

  function disposeChart() {
    if (!chartInst) return
    chartInst.dispose()
    chartInst = null
  }

  function resizeChart() {
    chartInst?.resize()
  }

  function getRenderedChartIndices(length: number) {
    if (length <= MAX_RENDERED_CHART_POINTS) {
      return Array.from({ length }, (_, index) => index)
    }
    const step = (length - 1) / (MAX_RENDERED_CHART_POINTS - 1)
    return Array.from(
      { length: MAX_RENDERED_CHART_POINTS },
      (_, index) => Math.round(index * step)
    )
  }

  function scheduleChartUpdate() {
    if (chartRenderTimer !== null) return
    chartRenderTimer = window.setTimeout(() => {
      chartRenderTimer = null
      updateChart()
    }, 1000)
  }

  function updateChart() {
    updateChartSummary()
    if (!chartInst) return
    const range = getChartRange()
    const span = range.displayEnd - range.displayStart
    const renderedIndices = getRenderedChartIndices(curveData.timestampMs.length)
    const pointCount = renderedIndices.length
    const createSeriesData = (values: number[]) => renderedIndices.map((index) => [
      curveData.timestampMs[index],
      values[index] ?? null,
    ])
    const upperData = createSeriesData(curveData.upperTemp)
    const lowerData = createSeriesData(curveData.lowerTemp)
    const pressureData = createSeriesData(curveData.pressure)

    applyingChartOption = true
    chartInst.setOption({
      animation: false,
      backgroundColor: '#ffffff',
      color: ['#e14b55', '#f59e0b', '#3f69c9'],
      grid: { left: 58, right: 58, top: 28, bottom: 72, containLabel: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#98a2b3', width: 1 } },
        formatter: (params: any) => {
          const items = Array.isArray(params) ? params : [params]
          const firstItem = items.find((item) => Array.isArray(item?.data))
          if (!firstItem) return ''
          const timestamp = Number(firstItem.data[0])
          const time = new Date(timestamp).toLocaleString('zh-CN', {
            hour12: false,
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
          const rows = items.map((item) => {
            const value = Number(Array.isArray(item?.data) ? item.data[1] : NaN)
            const isPressure = item?.seriesName === '容器压力'
            const unit = isPressure ? 'MPa' : '°C'
            const digits = isPressure ? 3 : 1
            return `${item?.marker ?? ''}${item?.seriesName ?? ''}：${Number.isFinite(value) ? value.toFixed(digits) : '--'} ${unit}`
          })
          return `${time}<br/>${rows.join('<br/>')}`
        },
      },
      xAxis: {
        type: 'time',
        min: range.fullStart,
        max: range.fullEnd,
        splitNumber: span <= 10 * 60 * 1000 ? 8 : 12,
        axisLine: { lineStyle: { color: '#8c94a3' } },
        axisTick: { alignWithLabel: true },
        axisLabel: {
          color: '#7a8190',
          hideOverlap: true,
          formatter: (value: number) => formatChartAxisTime(value, span),
        },
        splitLine: { show: true, lineStyle: { color: '#edf1f7', width: 1 } },
      },
      yAxis: [
        {
          type: 'value',
          name: '°C',
          min: 0,
          max: 300,
          interval: 50,
          nameTextStyle: { color: '#7a8190', padding: [0, 0, 0, 6] },
          axisLabel: { color: '#7a8190', formatter: (value: number) => Number(value).toFixed(1) },
          splitLine: { show: true, lineStyle: { color: '#e8edf5', width: 1 } },
        },
        {
          type: 'value',
          name: 'MPa',
          min: 0,
          max: 300,
          interval: 50,
          nameTextStyle: { color: '#7a8190', padding: [0, 6, 0, 0] },
          axisLabel: { color: '#7a8190', formatter: (value: number) => Number(value).toFixed(2) },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        {
          type: 'inside',
          throttle: 50,
          startValue: range.displayStart,
          endValue: range.displayEnd,
        },
        {
          type: 'slider',
          height: 28,
          bottom: 22,
          startValue: range.displayStart,
          endValue: range.displayEnd,
          borderColor: '#d6e2f7',
          backgroundColor: '#f4f7fc',
          fillerColor: 'rgba(79, 116, 209, 0.18)',
          handleStyle: { color: '#ffffff', borderColor: '#a6b8dd' },
          moveHandleStyle: { color: '#c5d5f3' },
          dataBackground: {
            lineStyle: { color: '#9db7f2' },
            areaStyle: { color: '#d8e4ff' },
          },
          selectedDataBackground: {
            lineStyle: { color: '#4f74d1' },
            areaStyle: { color: '#bfd0ff' },
          },
        },
      ],
      series: [
        {
          name: '上部水温',
          type: 'line',
          data: chartSeriesVisibility.upperTemp ? upperData : [],
          connectNulls: false,
          showSymbol: pointCount <= 60,
          symbolSize: 5,
          smooth: false,
          lineStyle: { width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(225, 75, 85, 0.12)' },
              { offset: 1, color: 'rgba(225, 75, 85, 0.01)' },
            ]),
          },
          emphasis: { focus: 'series' },
        },
        {
          name: '下部水温',
          type: 'line',
          data: chartSeriesVisibility.lowerTemp ? lowerData : [],
          connectNulls: false,
          showSymbol: pointCount <= 60,
          symbolSize: 5,
          smooth: false,
          lineStyle: { width: 2 },
          emphasis: { focus: 'series' },
        },
        {
          name: '容器压力',
          type: 'line',
          yAxisIndex: 1,
          data: chartSeriesVisibility.pressure ? pressureData : [],
          connectNulls: false,
          showSymbol: pointCount <= 60,
          symbolSize: 5,
          smooth: false,
          lineStyle: { width: 2 },
          emphasis: { focus: 'series' },
        },
      ],
    }, true)
    queueMicrotask(() => {
      applyingChartOption = false
    })
  }

  function setChartWindowMinutes(value: number | null) {
    chartWindowMinutes.value = value !== null && [0, 5, 30, 60, 240].includes(value) ? value : null
    manualChartRange = null
    chartRangeLocked.value = false
    updateChart()
  }

  function toggleChartSeries(key: HighTempPressureChartSeriesKey) {
    if (!(key in chartSeriesVisibility)) return
    if (chartSeriesVisibility[key]) {
      const visibleCount = Object.values(chartSeriesVisibility).filter(Boolean).length
      if (visibleCount <= 1) {
        ElMessage.warning('实时监控曲线至少保留一条')
        return
      }
    }
    chartSeriesVisibility[key] = !chartSeriesVisibility[key]
    updateChart()
  }

  function showAllChartSeries() {
    chartSeriesVisibility.upperTemp = true
    chartSeriesVisibility.lowerTemp = true
    chartSeriesVisibility.pressure = true
    updateChart()
  }

  function parseTimestampMs(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'string' || !value.trim()) return null
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : null
  }

  function appendCurvePoint(t1?: number, t2?: number, p?: number, timeSec?: number, timestampMs?: number | null) {
    const lastTime = curveData.timeSec[curveData.timeSec.length - 1]
    const resolvedTime = Number.isFinite(timeSec)
      ? Number(timeSec)
      : (lastTime ?? -SAMPLE_INTERVAL_SECONDS) + SAMPLE_INTERVAL_SECONDS
    const lastTimestamp = curveData.timestampMs[curveData.timestampMs.length - 1]
    const sessionTimestamp = testStartTime.value !== null
      ? testStartTime.value + resolvedTime * 1000
      : null
    const resolvedTimestamp = Number.isFinite(timestampMs)
      ? Number(timestampMs)
      : sessionTimestamp ?? (lastTimestamp ?? Date.now() - SAMPLE_INTERVAL_SECONDS * 1000) + SAMPLE_INTERVAL_SECONDS * 1000
    const lastT1 = curveData.upperTemp[curveData.upperTemp.length - 1] ?? 0
    const lastT2 = curveData.lowerTemp[curveData.lowerTemp.length - 1] ?? 0
    const lastP = curveData.pressure[curveData.pressure.length - 1] ?? 0
    curveData.timestampMs.push(resolvedTimestamp)
    curveData.timeSec.push(resolvedTime)
    curveData.upperTemp.push(t1 ?? lastT1)
    curveData.lowerTemp.push(t2 ?? lastT2)
    curveData.pressure.push(p ?? lastP)
  }

  function pushPrimaryPoint(
    t1?: number,
    t2?: number,
    p?: number,
    timeSec?: number,
    timestampMs?: number | null,
    renderChart = true
  ) {
    appendCurvePoint(t1, t2, p, timeSec, timestampMs)
    const lastT1 = state.chartData.t1[state.chartData.t1.length - 1] ?? 0
    const lastT2 = state.chartData.t2[state.chartData.t2.length - 1] ?? 0
    const lastP = state.chartData.p[state.chartData.p.length - 1] ?? 0
    state.chartData.t1.push(t1 ?? lastT1)
    state.chartData.t2.push(t2 ?? lastT2)
    state.chartData.p.push(p ?? lastP)
    if (state.chartData.t1.length > MAX_POINTS) state.chartData.t1.shift()
    if (state.chartData.t2.length > MAX_POINTS) state.chartData.t2.shift()
    if (state.chartData.p.length > MAX_POINTS) state.chartData.p.shift()
    if (renderChart) updateChart()
  }

  function resetCurveData() {
    curveData.timestampMs = []
    curveData.timeSec = []
    curveData.upperTemp = []
    curveData.lowerTemp = []
    curveData.pressure = []
    curveChartImagePath.value = ''
  }

  function clearOcrReadings() {
    ocrMeasurements.value = []
    for (const key of Object.keys(ocrReadings)) delete ocrReadings[key]
    for (const key of Object.keys(ocrConfidence)) delete ocrConfidence[key]
  }

  function inferMeasurementUnit(data: string) {
    if (data.includes('温')) return '°C'
    if (data.includes('压力')) return 'MPa'
    return ''
  }

  function buildMeasurementName(part: string, data: string, fallback: string) {
    if (part && data) return `${part}${data}`
    return part || data || fallback
  }

  function resetCaptureState() {
    captureGeneration += 1
    recordSyncPromise = null
    pendingOcrRecords.clear()
    if (chartRenderTimer !== null) {
      clearTimeout(chartRenderTimer)
      chartRenderTimer = null
    }
    state.chartData.t1 = []
    state.chartData.t2 = []
    state.chartData.p = []
    resetCurveData()
    csvCount.value = 0
    captureRecordCount.value = 0
    ocrReadyPct.value = 0
    captureCompleted.value = false
    captureOutputDir.value = ''
    lastSyncedRecordCount = 0
    latestFrameUrl.value = ''
    revokeLatestFrameObjectUrl()
    exportedCaptureDir.value = ''
    captureStatusText.value = '等待连接采集卡'
    clearOcrReadings()
    updateChart()
  }

  function clearOcrDevice() {
    ocrDeviceIndex.value = null
    ocrDeviceName.value = ''
  }

  function syncRuntime(nowMs = Date.now()) {
    const seconds = getElapsedRuntimeSeconds(testStartTime.value, nowMs)
    onlineSeconds.value = seconds
    onlineTimerStr.value = formatRuntimeTimer(seconds)
  }

  function resetTestSession() {
    stopCapturePolling()
    cleanupStreamListener()
    if (captureOutputDir.value) {
      void invoke('stop_high_temp_pressure_ocr_stream', {
        outputDir: captureOutputDir.value,
      }).catch(() => undefined)
    }
    resetCaptureState()
    clearOcrDevice()
    testRunning.value = false
    testStartTime.value = null
    syncRuntime()
    captureStatusText.value = '等待连接采集卡'
    disposeChart()
  }

  function revokeLatestFrameObjectUrl() {
    if (!latestFrameObjectUrl) return
    URL.revokeObjectURL(latestFrameObjectUrl)
    latestFrameObjectUrl = ''
  }

  async function updateLatestFrame(filePath: string) {
    if (!filePath) return
    try {
      const bytes = await readFile(filePath)
      revokeLatestFrameObjectUrl()
      latestFrameObjectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
      latestFrameUrl.value = latestFrameObjectUrl
    } catch {
      latestFrameUrl.value = `${convertFileSrc(filePath)}?t=${Date.now()}`
    }
  }

  function extractPrimaryValues(record: any) {
    const measurements: OcrMeasurementPayload[] = Array.isArray(record?.measurements)
      ? record.measurements
      : []
    const values: Partial<Record<string, number>> = {}

    measurements.forEach((item) => {
      const id = String(item?.id || '')
      const value = item?.value
      if (!id || typeof value !== 'number' || !Number.isFinite(value)) return
      values[id] = value
    })

    return {
      timeSec: Number(record?.time_sec),
      timestampMs: parseTimestampMs(record?.captured_at),
      upperWaterTemp: values.vessel_250_upper_water_temp ?? values.vessel_480_upper_water_temp,
      lowerWaterTemp: values.vessel_250_lower_water_temp ?? values.vessel_480_lower_water_temp,
      pressure: values.vessel_250_pressure ?? values.cylinder_pressure ?? values.high_pressure_pump_outlet_pressure,
    }
  }

  function applyOcrRecord(record: any, appendPoint = true, renderChart = true) {
    if (!record) return
    const measurements: OcrMeasurementPayload[] = Array.isArray(record.measurements)
      ? record.measurements
      : []
    const values: Partial<Record<string, number>> = {}
    const nextMeasurements: HighTempPressureOcrMeasurement[] = []

    measurements.forEach((item) => {
      const id = String(item?.id || '')
      if (!id) return
      const metadata = MEASUREMENT_METADATA[id]
      const part = metadata?.part || String(item?.part || '').trim()
      const data = metadata?.data || String(item?.data || '').trim()
      const rawValue = item?.raw
      const value = item?.value
      const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null
      nextMeasurements.push({
        id,
        name: buildMeasurementName(part, data, id),
        raw: rawValue === null || rawValue === undefined || rawValue === '' ? '--' : String(rawValue),
        value: numericValue,
        unit: inferMeasurementUnit(data),
        confidence: typeof item?.confidence === 'number' ? item.confidence : null,
        color: MEASUREMENT_COLORS[nextMeasurements.length % MEASUREMENT_COLORS.length],
      })
      if (numericValue === null) return
      values[id] = numericValue
      ocrReadings[id] = numericValue
      if (typeof item?.confidence === 'number') {
        ocrConfidence[id] = item.confidence
      }
    })
    ocrMeasurements.value = nextMeasurements

    const point = extractPrimaryValues(record)
    const upperWaterTemp = point.upperWaterTemp
    const lowerWaterTemp = point.lowerWaterTemp
    const pressure = point.pressure
    if (
      appendPoint &&
      (
        upperWaterTemp !== undefined ||
        lowerWaterTemp !== undefined ||
        pressure !== undefined
      )
    ) {
      pushPrimaryPoint(
        upperWaterTemp,
        lowerWaterTemp,
        pressure,
        point.timeSec,
        point.timestampMs,
        renderChart
      )
    }
  }

  function getOcrRecordIndex(record: any, fallbackIndex?: number) {
    const value = Number(record?.record_index)
    if (Number.isInteger(value) && value > 0) return value
    return fallbackIndex && fallbackIndex > 0 ? fallbackIndex : lastSyncedRecordCount + 1
  }

  function drainQueuedOcrRecords() {
    let applied = false
    while (pendingOcrRecords.has(lastSyncedRecordCount + 1)) {
      const nextIndex = lastSyncedRecordCount + 1
      const record = pendingOcrRecords.get(nextIndex)
      pendingOcrRecords.delete(nextIndex)
      applyOcrRecord(record, true, false)
      lastSyncedRecordCount = nextIndex
      applied = true
    }
    if (applied) {
      captureRecordCount.value = Math.max(captureRecordCount.value, lastSyncedRecordCount)
      csvCount.value = captureRecordCount.value
      scheduleChartUpdate()
    }
  }

  function queueOcrRecord(record: any, fallbackIndex?: number) {
    if (!record) return
    const recordIndex = getOcrRecordIndex(record, fallbackIndex)
    if (recordIndex <= lastSyncedRecordCount || pendingOcrRecords.has(recordIndex)) return
    pendingOcrRecords.set(recordIndex, record)
    drainQueuedOcrRecords()
  }

  function syncMissingOcrRecords(targetCount = captureRecordCount.value) {
    if (!captureOutputDir.value || targetCount <= lastSyncedRecordCount) {
      return Promise.resolve()
    }
    if (recordSyncPromise) return recordSyncPromise

    const outputDir = captureOutputDir.value
    const generation = captureGeneration
    const task = (async () => {
      let requiredCount = Math.max(targetCount, captureRecordCount.value)
      while (lastSyncedRecordCount < requiredCount) {
        const afterIndex = lastSyncedRecordCount
        const result = await invoke<any>('get_high_temp_pressure_capture_records', {
          outputDir,
          afterIndex,
          limit: 1000,
        })
        if (generation !== captureGeneration || outputDir !== captureOutputDir.value) return
        const records = Array.isArray(result?.records) ? result.records : []
        records.forEach((record: any, offset: number) => {
          queueOcrRecord(record, afterIndex + offset + 1)
        })
        if (!records.length || lastSyncedRecordCount <= afterIndex) return
        requiredCount = Math.max(requiredCount, captureRecordCount.value)
      }
    })()
    recordSyncPromise = task
    void task.then(
      () => {
        if (recordSyncPromise === task) recordSyncPromise = null
      },
      () => {
        if (recordSyncPromise === task) recordSyncPromise = null
      }
    )
    return task
  }

  function formatCurveTime(sec: number) {
    const safeSec = Math.max(0, Math.round(Number(sec) || 0))
    const h = Math.floor(safeSec / 3600)
    const m = Math.floor((safeSec % 3600) / 60)
    const s = safeSec % 60
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function dataUrlToBytes(dataUrl: string) {
    const base64 = dataUrl.split(',')[1] || ''
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  function joinPath(root: string, fileName: string) {
    return `${root.replace(/[\\/]+$/, '')}/${fileName}`
  }

  async function exportCurveChartImage(exportDir: string) {
    if (!curveData.timeSec.length) {
      throw new Error('未采集到温度/压力曲线数据，无法生成测试曲线图')
    }
    const labels = curveData.timeSec.map(formatCurveTime)
    const phaseIndex1 = Math.max(0, Math.floor(labels.length * 0.25))
    const phaseIndex2 = Math.max(phaseIndex1, Math.floor(labels.length * 0.75))
    const phaseAreas = [
      [{ name: '升温升压', xAxis: labels[0] }, { xAxis: labels[phaseIndex1] || labels[0] }],
      [{ name: '保温保压', xAxis: labels[phaseIndex1] || labels[0] }, { xAxis: labels[phaseIndex2] || labels[labels.length - 1] }],
      [{ name: '降温降压', xAxis: labels[phaseIndex2] || labels[0] }, { xAxis: labels[labels.length - 1] }],
    ]
    const el = document.createElement('div')
    el.style.width = '1200px'
    el.style.height = '720px'
    el.style.position = 'fixed'
    el.style.left = '-99999px'
    el.style.top = '-99999px'
    document.body.appendChild(el)
    const chart = echarts.init(el, undefined, { renderer: 'canvas', width: 1200, height: 720 })
    try {
      chart.setOption({
        backgroundColor: '#ffffff',
        title: {
          text: '高温高压井测试温度/压力曲线',
          subtext: '横轴：时间；左轴：温度(°C)；右轴：压力(MPa)',
          left: 'center',
          top: 16,
        },
        tooltip: { trigger: 'axis' },
        legend: { top: 72, data: ['上部水温', '下部水温', '容器压力'] },
        grid: { left: 78, right: 82, top: 128, bottom: 78 },
        xAxis: { type: 'category', name: '时间', data: labels, axisLabel: { rotate: 35 } },
        yAxis: [
          { type: 'value', name: '温度 (°C)', min: 0, max: 300, interval: 50 },
          { type: 'value', name: '压力 (MPa)', min: 0, max: 300, interval: 50 },
        ],
        series: [
          {
            name: '上部水温',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: curveData.upperTemp.map((value) => +value.toFixed(2)),
            markArea: {
              itemStyle: { opacity: 0.08 },
              label: { color: '#334155', fontWeight: 700 },
              data: phaseAreas,
            },
          },
          {
            name: '下部水温',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: curveData.lowerTemp.map((value) => +value.toFixed(2)),
          },
          {
            name: '容器压力',
            type: 'line',
            yAxisIndex: 1,
            smooth: true,
            showSymbol: false,
            data: curveData.pressure.map((value) => +value.toFixed(3)),
          },
        ],
      })
      const dataUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
      const imagePath = joinPath(exportDir, '高温高压测试结果曲线.png')
      const result = await invoke<any>('write_high_temp_pressure_curve_chart', {
        exportDir,
        imageBytes: Array.from(dataUrlToBytes(dataUrl)),
        fileName: '高温高压测试结果曲线.png',
      })
      const savedPath = String(result?.image_path || imagePath)
      curveChartImagePath.value = savedPath
      return savedPath
    } finally {
      chart.dispose()
      el.remove()
    }
  }

  async function ensureCurveChartImage() {
    if (curveChartImagePath.value) return curveChartImagePath.value
    await syncMissingOcrRecords().catch(() => undefined)
    const outputDir = captureOutputDir.value
    if (!outputDir) {
      throw new Error('未找到 OCR 识别结果目录，无法生成温度/压力测试曲线图')
    }
    return exportCurveChartImage(outputDir)
  }

  async function pollCaptureStatus() {
    if (!captureOutputDir.value) return
    const status = await invoke<any>('get_high_temp_pressure_capture_status', {
      outputDir: captureOutputDir.value,
    })
    if (!status?.exists) return

    captureRecordCount.value = Number(status?.current || status?.record_count || 0)
    csvCount.value = captureRecordCount.value
    ocrReadyPct.value = Number(status?.ready_pct || 0)
    if (status?.latest_frame) await updateLatestFrame(String(status.latest_frame))
    if (captureRecordCount.value > lastSyncedRecordCount) {
      await syncMissingOcrRecords(captureRecordCount.value).catch(() => undefined)
    }

    const statusError = String(status?.error || '').trim()
    if (statusError) {
      stopCapturePolling()
      testRunning.value = false
      captureStatusText.value = captureRecordCount.value
        ? `OCR 采集异常停止：${statusError}；已保留 ${captureRecordCount.value} 条数据`
        : `OCR 采集异常停止：${statusError}`
    } else if (status?.complete) {
      stopCapturePolling()
      captureCompleted.value = true
      testRunning.value = false
      captureStatusText.value = `OCR 识别完成，已采集 ${captureRecordCount.value} 条`
    } else if (status?.paused) {
      captureStatusText.value = `OCR 识别已暂停，已采集 ${captureRecordCount.value} 条`
      testRunning.value = false
    } else {
      captureStatusText.value = `OCR 实时识别中，已采集 ${captureRecordCount.value} 条`
    }
  }

  function startCapturePolling() {
    stopCapturePolling()
    capturePollTimer = window.setInterval(() => {
      void pollCaptureStatus().catch(() => undefined)
    }, 1000)
  }

  function stopCapturePolling() {
    if (capturePollTimer) {
      clearInterval(capturePollTimer)
      capturePollTimer = null
    }
  }

  function cleanupStreamListener() {
    if (!unlistenStream) return
    unlistenStream()
    unlistenStream = null
  }

  function handleStreamEvent(payload: any) {
    const eventType = String(payload?.event || '')
    if (!eventType) return

    if (eventType === 'status' || eventType === 'log') {
      captureStatusText.value = String(payload?.message || 'OCR 识别进程运行中...')
      return
    }

    if (eventType === 'start') {
      captureStatusText.value = 'OCR 识别已启动，正在等待模型和画面就绪'
      ocrReadyPct.value = 1
      captureCompleted.value = false
      testRunning.value = true
      return
    }

    if (eventType === 'ready') {
      ocrReadyPct.value = Number(payload?.ready_pct || 100)
      captureStatusText.value = String(payload?.message || 'OCR 已就绪，正在识别实时数据')
      testRunning.value = true
      return
    }

    if (eventType === 'sample') {
      captureRecordCount.value = Number(payload?.current || captureRecordCount.value + 1)
      csvCount.value = captureRecordCount.value
      ocrReadyPct.value = Number(payload?.ready_pct || ocrReadyPct.value)
      if (payload?.preview_path) void updateLatestFrame(String(payload.preview_path))
      queueOcrRecord(payload?.record, captureRecordCount.value)
      if (captureRecordCount.value > lastSyncedRecordCount + pendingOcrRecords.size) {
        void syncMissingOcrRecords(captureRecordCount.value).catch(() => undefined)
      }
      captureStatusText.value = `OCR 实时识别中，已采集 ${captureRecordCount.value} 条`
      return
    }

    if (eventType === 'complete') {
      captureRecordCount.value = Number(payload?.record_count || captureRecordCount.value)
      csvCount.value = captureRecordCount.value
      ocrReadyPct.value = 100
      captureCompleted.value = true
      testRunning.value = false
      stopCapturePolling()
      if (payload?.latest_frame) void updateLatestFrame(String(payload.latest_frame))
      captureStatusText.value = `OCR 识别完成，已采集 ${captureRecordCount.value} 条`
      void syncMissingOcrRecords(captureRecordCount.value).catch(() => undefined)
      return
    }

    if (eventType === 'paused') {
      testRunning.value = false
      captureStatusText.value = String(payload?.message || 'OCR 数据采集已暂停')
      return
    }

    if (eventType === 'resumed') {
      testRunning.value = true
      captureStatusText.value = String(payload?.message || 'OCR 数据采集已恢复')
      return
    }

    if (eventType === 'error') {
      testRunning.value = false
      stopCapturePolling()
      const message = String(payload?.message || 'OCR 识别失败')
      captureStatusText.value = message
      if (captureRecordCount.value > 0) {
        captureStatusText.value = `OCR 采集异常停止：${message}；已保留 ${captureRecordCount.value} 条数据`
        void syncMissingOcrRecords(captureRecordCount.value).catch(() => undefined)
        ElMessage.warning(captureStatusText.value)
        return
      }
      ElMessage.error(captureStatusText.value)
    }
  }

  async function ensureStreamListener() {
    cleanupStreamListener()
    unlistenStream = await listen<any>('high-temp-pressure-ocr-stream', (event) => {
      handleStreamEvent(event.payload)
    })
  }

  async function startOcrCollection() {
    if (ocrDeviceIndex.value === null) return false
    await ensureStreamListener()
    resetCaptureState()

    captureStatusText.value = '正在启动 OCR 模型并连接采集卡...'
    try {
      const result = await invoke<any>('start_high_temp_pressure_ocr_stream', {
        pythonPath: null,
        deviceIndex: ocrDeviceIndex.value,
        interval: SAMPLE_INTERVAL_SECONDS,
      })
      captureOutputDir.value = String(result?.output_dir || captureOutputDir.value)
      testRunning.value = true
      startCapturePolling()
      void pollCaptureStatus().catch(() => undefined)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '启动 OCR 识别失败')
      captureStatusText.value = message
      testRunning.value = false
      stopCapturePolling()
      cleanupStreamListener()
      ElMessage.error(message)
      return false
    }
  }

  async function connectOcrDevice() {
    if (captureOutputDir.value) {
      await invoke('stop_high_temp_pressure_ocr_stream', {
        outputDir: captureOutputDir.value,
      }).catch(() => undefined)
    }
    await initConfig()
    const configuredDevice = Number(getConfigItem('highTempPressureCaptureDevice'))
    const configuredDeviceName = String(getConfigItem('highTempPressureCaptureDeviceName') || '').trim()
    if (!Number.isInteger(configuredDevice) || configuredDevice < 0) {
      ElMessage.error('请先在设置页刷新搜索并选择高温高压采集卡')
      return
    }

    ocrDeviceIndex.value = configuredDevice
    ocrDeviceName.value = configuredDeviceName || `采集卡 ${configuredDevice}`
    const started = await startOcrCollection()
    if (!started) return
    ElMessage.success(`已连接 ${ocrDeviceName.value}，开始 OCR 识别采集`)
  }

  function switchPanel(panel: HighTempPressurePanel) {
    currentPanel.value = panel
  }

  function showModal(name: Exclude<HighTempPressureModal, null>) {
    activeModal.value = name
  }

  function closeModal() {
    activeModal.value = null
  }

  function confirmStart() {
    resetTestSession()
    closeModal()
    testStartTime.value = Date.now()
    syncRuntime(testStartTime.value)
    switchPanel('testing')
    nextTick(() => initChart())
    captureStatusText.value = '等待连接采集卡并启动 OCR 识别'
  }

  async function pauseTest() {
    if (captureOutputDir.value) {
      captureStatusText.value = '正在暂停 OCR 数据采集...'
      await invoke('pause_high_temp_pressure_ocr_stream', { outputDir: captureOutputDir.value })
    }
    testRunning.value = false
  }

  async function resumeTest() {
    if (!chartInst) nextTick(() => initChart())
    if (captureOutputDir.value) {
      await invoke('resume_high_temp_pressure_ocr_stream', { outputDir: captureOutputDir.value })
      testRunning.value = true
      startCapturePolling()
      return
    }
    if (ocrDeviceIndex.value !== null) {
      await startOcrCollection()
      return
    }
    ElMessage.warning('请先连接采集卡，再启动 OCR 识别采集')
  }

  function stopTest() {
    resetTestSession()
    closeModal()
    switchPanel('dashboard')
  }

  function buildExportFolderName() {
    const source = ocrDeviceName.value || 'ocr_capture'
    return `${source}_高温高压井OCR采集结果`
  }

  async function getConfiguredDownloadDir() {
    await initConfig()
    const configuredDownloadDir = String(getConfigItem('highTempPressureDownloadDir') || '').trim()
    if (!configuredDownloadDir) {
      captureStatusText.value = '请先在设置中配置高温高压井下载文件保存目录'
      ElMessage.error(captureStatusText.value)
      return ''
    }
    return configuredDownloadDir
  }

  async function finalizeOcrCapture() {
    stopCapturePolling()
    if (!captureOutputDir.value) {
      captureStatusText.value = '尚未生成 OCR 采集结果，无法结束并上传报告'
      ElMessage.error(captureStatusText.value)
      return false
    }

    await invoke('stop_high_temp_pressure_ocr_stream', {
      outputDir: captureOutputDir.value || null,
    })
    await pollCaptureStatus().catch(() => undefined)
    await syncMissingOcrRecords(captureRecordCount.value).catch(() => undefined)

    const configuredDownloadDir = await getConfiguredDownloadDir()
    if (!configuredDownloadDir) {
      return false
    }

    try {
      const result = await invoke<any>('export_high_temp_pressure_capture_output', {
        sourceOutputDir: captureOutputDir.value,
        targetDir: configuredDownloadDir,
        folderName: buildExportFolderName(),
      })
      exportedCaptureDir.value = String(result?.export_dir || configuredDownloadDir)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'OCR 识别结果导出失败')
      console.warn('[high-temp-pressure] export capture output failed:', error)
      captureStatusText.value = message
      ElMessage.error(`OCR 识别结果导出失败，无法结束测试：${message}`)
      return false
    }
    return true
  }

  function endTest(endAtMs = Date.now()) {
    stopCapturePolling()
    syncRuntime(endAtMs)
    testRunning.value = false
    testStartTime.value = null
    closeModal()
    switchPanel('dashboard')
  }

  onMounted(() => {
    timerInterval = window.setInterval(() => {
      if (testStartTime.value !== null) syncRuntime()
    }, 1000)
    window.addEventListener('resize', resizeChart)
  })

  onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval)
    if (chartRenderTimer !== null) clearTimeout(chartRenderTimer)
    revokeLatestFrameObjectUrl()
    stopCapturePolling()
    cleanupStreamListener()
    if (captureOutputDir.value) {
      void invoke('stop_high_temp_pressure_ocr_stream', {
        outputDir: captureOutputDir.value,
      }).catch(() => undefined)
    }
    window.removeEventListener('resize', resizeChart)
    disposeChart()
  })

  return {
    currentPanel,
    activeModal,
    testRunning,
    testStartTime,
    csvCount,
    ocrDeviceIndex,
    ocrDeviceName,
    captureOutputDir,
    ocrReadyPct,
    captureRecordCount,
    captureStatusText,
    captureCompleted,
    latestFrameUrl,
    exportedCaptureDir,
    curveChartImagePath,
    curveData,
    chartWindowMinutes,
    chartRangeLocked,
    chartSeriesVisibility,
    chartSummary,
    ocrMeasurements,
    ocrReadings,
    ocrConfidence,
    onlineSeconds,
    onlineTimerStr,
    state,
    switchPanel,
    showModal,
    closeModal,
    confirmStart,
    resetTestSession,
    connectOcrDevice,
    pauseTest,
    resumeTest,
    stopTest,
    finalizeOcrCapture,
    ensureCurveChartImage,
    setChartWindowMinutes,
    toggleChartSeries,
    showAllChartSeries,
    endTest,
  }
}
