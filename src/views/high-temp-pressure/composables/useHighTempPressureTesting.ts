import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import * as echarts from 'echarts'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { ElMessage } from 'element-plus'
import { useConfig } from '@/composables/useConfig'
import type { HighTempPressureModal, HighTempPressurePanel } from '../types'
import { formatRuntimeTimer, getElapsedRuntimeSeconds } from '../utils/runtime'

export type HighTempPressureVideoChannel = {
  id: string
  name: string
  unit: string
  color: string
}

export type HighTempPressureVideoMeasurement = HighTempPressureVideoChannel & {
  raw: string
  value: number | null
  confidence: number | null
}

export type HighTempPressureCurveData = {
  timeSec: number[]
  upperTemp: number[]
  lowerTemp: number[]
  pressure: number[]
}

type VideoMeasurementPayload = {
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

const LEGACY_MEASUREMENT_MARKERS = new Set([
  'vessel_250_unlabeled_yellow_value',
  'vessel_480_stacked_value_25',
])

const LEGACY_MEASUREMENT_ALIASES: Record<string, string> = {
  vessel_250_unlabeled_yellow_value: 'vessel_250_pressure',
  vessel_480_upper_water_temp: 'vessel_250_lower_water_temp',
  vessel_480_stacked_value_25: 'vessel_480_upper_water_temp',
}

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

export function useHighTempPressureTesting() {
  const { initConfig, getConfigItem } = useConfig()
  const currentPanel = ref<HighTempPressurePanel>('dashboard')
  const activeModal = ref<HighTempPressureModal>(null)
  const testRunning = ref(false)
  const testStartTime = ref<number | null>(null)
  const csvCount = ref(0)
  const onlineSeconds = ref(0)
  const onlineTimerStr = ref(formatRuntimeTimer(0))
  const videoPath = ref('')
  const videoFileName = ref('')
  const videoUrl = ref('')
  const captureOutputDir = ref('')
  const captureProgressPct = ref(0)
  const captureRecordCount = ref(0)
  const captureStatusText = ref('等待选择试验视频')
  const captureCompleted = ref(false)
  const latestFrameUrl = ref('')
  const exportedCaptureDir = ref('')
  const curveChartImagePath = ref('')
  const videoMeasurements = ref<HighTempPressureVideoMeasurement[]>([])
  const videoReadings = reactive<Record<string, number>>({})
  const videoConfidence = reactive<Record<string, number>>({})
  const curveData = reactive<HighTempPressureCurveData>({
    timeSec: [],
    upperTemp: [],
    lowerTemp: [],
    pressure: [],
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
  let chartInst: echarts.ECharts | null = null

  function initChart() {
    const el = document.getElementById('htp-chart')
    if (!el) return
    disposeChart()
    echarts.getInstanceByDom(el)?.dispose()
    chartInst = echarts.init(el)
    chartInst.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['上部水温', '下部水温', '容器压力×10'], orient: 'horizontal', top: 6, right: 8 },
      grid: { left: 40, right: 20, top: 40, bottom: 10 },
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'value' },
      series: [
        { name: '上部水温', type: 'line', showSymbol: false, smooth: true, data: [] },
        { name: '下部水温', type: 'line', showSymbol: false, smooth: true, data: [] },
        { name: '容器压力×10', type: 'line', showSymbol: false, smooth: true, data: [] },
      ],
    })
  }

  function disposeChart() {
    if (!chartInst) return
    chartInst.dispose()
    chartInst = null
  }

  function updateChart() {
    if (!chartInst) return
    const len = Math.max(state.chartData.t1.length, state.chartData.p.length)
    const x = Array.from({ length: len }, (_, i) => i + 1)
    chartInst.setOption({
      legend: { orient: 'horizontal', top: 6, right: 8 },
      xAxis: { data: x },
      series: [
        { name: '上部水温', data: state.chartData.t1.map(v => +v.toFixed(1)) },
        { name: '下部水温', data: state.chartData.t2.map(v => +v.toFixed(1)) },
        { name: '容器压力×10', data: state.chartData.p.map(v => +(v * 10).toFixed(2)) },
      ],
    })
  }

  function appendCurvePoint(t1?: number, t2?: number, p?: number, timeSec?: number) {
    const lastTime = curveData.timeSec[curveData.timeSec.length - 1]
    const lastT1 = curveData.upperTemp[curveData.upperTemp.length - 1] ?? 0
    const lastT2 = curveData.lowerTemp[curveData.lowerTemp.length - 1] ?? 0
    const lastP = curveData.pressure[curveData.pressure.length - 1] ?? 0
    curveData.timeSec.push(Number.isFinite(timeSec) ? Number(timeSec) : (lastTime ?? -SAMPLE_INTERVAL_SECONDS) + SAMPLE_INTERVAL_SECONDS)
    curveData.upperTemp.push(t1 ?? lastT1)
    curveData.lowerTemp.push(t2 ?? lastT2)
    curveData.pressure.push(p ?? lastP)
  }

  function pushPrimaryPoint(t1?: number, t2?: number, p?: number, timeSec?: number) {
    appendCurvePoint(t1, t2, p, timeSec)
    const lastT1 = state.chartData.t1[state.chartData.t1.length - 1] ?? 0
    const lastT2 = state.chartData.t2[state.chartData.t2.length - 1] ?? 0
    const lastP = state.chartData.p[state.chartData.p.length - 1] ?? 0
    state.chartData.t1.push(t1 ?? lastT1)
    state.chartData.t2.push(t2 ?? lastT2)
    state.chartData.p.push(p ?? lastP)
    if (state.chartData.t1.length > MAX_POINTS) state.chartData.t1.shift()
    if (state.chartData.t2.length > MAX_POINTS) state.chartData.t2.shift()
    if (state.chartData.p.length > MAX_POINTS) state.chartData.p.shift()
    updateChart()
  }

  function resetCurveData() {
    curveData.timeSec = []
    curveData.upperTemp = []
    curveData.lowerTemp = []
    curveData.pressure = []
    curveChartImagePath.value = ''
  }

  function clearVideoReadings() {
    videoMeasurements.value = []
    for (const key of Object.keys(videoReadings)) delete videoReadings[key]
    for (const key of Object.keys(videoConfidence)) delete videoConfidence[key]
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

  function hasLegacyMeasurementSchema(measurements: VideoMeasurementPayload[]) {
    return measurements.some(item => LEGACY_MEASUREMENT_MARKERS.has(String(item?.id || '')))
  }

  function normalizeMeasurementId(id: string, legacySchema: boolean) {
    if (!legacySchema) return id
    return LEGACY_MEASUREMENT_ALIASES[id] || id
  }

  function resetCaptureState() {
    state.chartData.t1 = []
    state.chartData.t2 = []
    state.chartData.p = []
    resetCurveData()
    csvCount.value = 0
    captureRecordCount.value = 0
    captureProgressPct.value = 0
    captureCompleted.value = false
    captureOutputDir.value = ''
    lastSyncedRecordCount = 0
    latestFrameUrl.value = ''
    revokeLatestFrameObjectUrl()
    exportedCaptureDir.value = ''
    captureStatusText.value = '等待选择试验视频'
    clearVideoReadings()
    updateChart()
  }

  function clearVideoSelection() {
    videoPath.value = ''
    videoFileName.value = ''
    videoUrl.value = ''
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
      void invoke('stop_high_temp_pressure_video_stream', {
        outputDir: captureOutputDir.value,
      }).catch(() => undefined)
    }
    resetCaptureState()
    clearVideoSelection()
    testRunning.value = false
    testStartTime.value = null
    syncRuntime()
    captureStatusText.value = '等待选择试验视频'
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
    const measurements: VideoMeasurementPayload[] = Array.isArray(record?.measurements)
      ? record.measurements
      : []
    const legacySchema = hasLegacyMeasurementSchema(measurements)
    const values: Partial<Record<string, number>> = {}

    measurements.forEach((item) => {
      const rawId = String(item?.id || '')
      const id = normalizeMeasurementId(rawId, legacySchema)
      const value = item?.value
      if (!id || typeof value !== 'number' || !Number.isFinite(value)) return
      values[id] = value
    })

    return {
      timeSec: Number(record?.time_sec),
      upperWaterTemp: values.vessel_250_upper_water_temp ?? values.vessel_480_upper_water_temp,
      lowerWaterTemp: values.vessel_250_lower_water_temp ?? values.vessel_480_lower_water_temp,
      pressure: values.vessel_250_pressure ?? values.cylinder_pressure ?? values.high_pressure_pump_outlet_pressure,
    }
  }

  function rebuildCurveData(records: any[]) {
    resetCurveData()
    state.chartData.t1 = []
    state.chartData.t2 = []
    state.chartData.p = []
    records.forEach((record, index) => {
      const point = extractPrimaryValues(record)
      if (
        point.upperWaterTemp === undefined &&
        point.lowerWaterTemp === undefined &&
        point.pressure === undefined
      ) return
      appendCurvePoint(
        point.upperWaterTemp,
        point.lowerWaterTemp,
        point.pressure,
        Number.isFinite(point.timeSec) ? point.timeSec : index * SAMPLE_INTERVAL_SECONDS
      )
    })
    state.chartData.t1 = curveData.upperTemp.slice(-MAX_POINTS)
    state.chartData.t2 = curveData.lowerTemp.slice(-MAX_POINTS)
    state.chartData.p = curveData.pressure.slice(-MAX_POINTS)
    updateChart()
  }

  function applyVideoRecord(record: any, appendPoint = true) {
    if (!record) return
    const measurements: VideoMeasurementPayload[] = Array.isArray(record.measurements)
      ? record.measurements
      : []
    const legacySchema = hasLegacyMeasurementSchema(measurements)
    const values: Partial<Record<string, number>> = {}
    const nextMeasurements: HighTempPressureVideoMeasurement[] = []

    measurements.forEach((item) => {
      const rawId = String(item?.id || '')
      const id = normalizeMeasurementId(rawId, legacySchema)
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
      videoReadings[id] = numericValue
      if (typeof item?.confidence === 'number') {
        videoConfidence[id] = item.confidence
      }
    })
    videoMeasurements.value = nextMeasurements

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
      pushPrimaryPoint(upperWaterTemp, lowerWaterTemp, pressure, point.timeSec)
    }
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
          { type: 'value', name: '温度 (°C)' },
          { type: 'value', name: '压力 (MPa)' },
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
    await syncCaptureResultFromOutputDir().catch(() => undefined)
    const outputDir = exportedCaptureDir.value || captureOutputDir.value
    if (!outputDir) {
      throw new Error('未找到视频识别结果目录，无法生成温度/压力测试曲线图')
    }
    return exportCurveChartImage(outputDir)
  }

  async function syncCaptureResultFromOutputDir() {
    if (!captureOutputDir.value) return
    const result = await invoke<any>('get_high_temp_pressure_capture_result', {
      outputDir: captureOutputDir.value,
    })
    const records = Array.isArray(result?.records) ? result.records : []
    captureRecordCount.value = records.length
    csvCount.value = records.length
    lastSyncedRecordCount = records.length
    if (result?.latest_frame) await updateLatestFrame(String(result.latest_frame))
    if (records.length) {
      rebuildCurveData(records)
      applyVideoRecord(records[records.length - 1], false)
    }
  }

  async function pollCaptureStatus() {
    if (!captureOutputDir.value) return
    const status = await invoke<any>('get_high_temp_pressure_capture_status', {
      outputDir: captureOutputDir.value,
    })
    if (!status?.exists) return

    captureRecordCount.value = Number(status?.current || status?.record_count || 0)
    csvCount.value = captureRecordCount.value
    captureProgressPct.value = Number(status?.progress_pct || 0)
    if (status?.latest_frame) await updateLatestFrame(String(status.latest_frame))
    if (captureRecordCount.value > 0 && captureRecordCount.value !== lastSyncedRecordCount) {
      await syncCaptureResultFromOutputDir().catch(() => undefined)
    }

    if (status?.complete) {
      stopCapturePolling()
      captureCompleted.value = true
      testRunning.value = false
      captureStatusText.value = `视频识别完成，已采集 ${captureRecordCount.value} 条`
      await syncCaptureResultFromOutputDir().catch(() => undefined)
    } else if (status?.paused) {
      captureStatusText.value = `视频识别已暂停 (${captureRecordCount.value}/${Number(status?.total_targets || captureRecordCount.value)})`
      testRunning.value = false
    } else {
      captureStatusText.value = `视频识别中 (${captureRecordCount.value}/${Number(status?.total_targets || captureRecordCount.value)})`
    }
  }

  function startCapturePolling() {
    stopCapturePolling()
    capturePollTimer = window.setInterval(() => {
      void pollCaptureStatus().catch(() => undefined)
    }, 700)
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
      captureStatusText.value = String(payload?.message || '视频识别脚本运行中...')
      return
    }

    if (eventType === 'start') {
      captureStatusText.value = `视频识别已启动，共 ${Number(payload?.total_targets || 0)} 个采样点`
      captureProgressPct.value = 1
      captureCompleted.value = false
      testRunning.value = true
      return
    }

    if (eventType === 'sample') {
      captureRecordCount.value = Number(payload?.current || captureRecordCount.value + 1)
      csvCount.value = captureRecordCount.value
      captureProgressPct.value = Number(payload?.progress_pct || captureProgressPct.value)
      if (payload?.preview_path) void updateLatestFrame(String(payload.preview_path))
      applyVideoRecord(payload?.record)
      captureStatusText.value = `视频识别中 (${captureRecordCount.value}/${Number(payload?.total || captureRecordCount.value)})`
      return
    }

    if (eventType === 'complete') {
      captureRecordCount.value = Number(payload?.record_count || captureRecordCount.value)
      csvCount.value = captureRecordCount.value
      captureProgressPct.value = 100
      captureCompleted.value = true
      testRunning.value = false
      stopCapturePolling()
      if (payload?.latest_frame) void updateLatestFrame(String(payload.latest_frame))
      captureStatusText.value = `视频识别完成，已采集 ${captureRecordCount.value} 条`
      void syncCaptureResultFromOutputDir().catch(() => undefined)
      return
    }

    if (eventType === 'paused' || eventType === 'stopped') {
      testRunning.value = false
      stopCapturePolling()
      captureStatusText.value = String(payload?.message || (eventType === 'paused' ? '视频识别已暂停' : '视频识别已停止'))
      return
    }

    if (eventType === 'error') {
      testRunning.value = false
      stopCapturePolling()
      captureStatusText.value = String(payload?.message || '视频识别失败')
      if (captureRecordCount.value > 0) {
        captureStatusText.value = `视频识别已停止，已保留 ${captureRecordCount.value} 条采集数据`
        void syncCaptureResultFromOutputDir().catch(() => undefined)
        ElMessage.warning(captureStatusText.value)
        return
      }
      ElMessage.error(captureStatusText.value)
    }
  }

  async function ensureStreamListener() {
    cleanupStreamListener()
    unlistenStream = await listen<any>('high-temp-pressure-video-stream', (event) => {
      handleStreamEvent(event.payload)
    })
  }

  async function startVideoCollection(resume = false) {
    if (!videoPath.value) return false
    await ensureStreamListener()
    await initConfig()
    if (!resume) resetCaptureState()

    const configuredPythonPath = String(getConfigItem('flojoyPythonPath') || '').trim()
    captureStatusText.value = resume ? '正在恢复视频识别...' : '正在启动视频识别脚本...'
    try {
      const result = await invoke<any>('start_high_temp_pressure_video_stream', {
        pythonPath: configuredPythonPath || null,
        videoPath: videoPath.value,
        interval: SAMPLE_INTERVAL_SECONDS,
        outputDir: resume ? captureOutputDir.value : null,
        resume,
      })
      captureOutputDir.value = String(result?.output_dir || captureOutputDir.value)
      testRunning.value = true
      startCapturePolling()
      void pollCaptureStatus().catch(() => undefined)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '启动视频识别失败')
      captureStatusText.value = message
      testRunning.value = false
      stopCapturePolling()
      cleanupStreamListener()
      ElMessage.error(message)
      return false
    }
  }

  async function selectVideoFile() {
    const selected = await open({
      title: '选择高温高压井试验视频',
      multiple: false,
      directory: false,
      filters: [{ name: '视频文件', extensions: ['wmv', 'mp4', 'avi', 'mov'] }],
    })
    if (!selected || typeof selected !== 'string') return

    videoPath.value = selected
    videoFileName.value = selected.split(/[\\/]/).pop() || selected
    videoUrl.value = convertFileSrc(selected)
    const started = await startVideoCollection(false)
    if (!started) return
    ElMessage.success('试验视频已选择，开始视频识别采集')
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
    captureStatusText.value = '等待选择试验视频并启动识别采集'
  }

  async function pauseTest() {
    if (captureOutputDir.value) {
      captureStatusText.value = '正在暂停视频识别...'
      await invoke('pause_high_temp_pressure_video_stream', { outputDir: captureOutputDir.value })
      stopCapturePolling()
    }
    testRunning.value = false
  }

  async function resumeTest() {
    if (!chartInst) nextTick(() => initChart())
    if (videoPath.value) {
      await startVideoCollection(!!captureOutputDir.value)
      return
    }
    ElMessage.warning('请先选择试验视频，再启动视频识别采集')
  }

  function stopTest() {
    resetTestSession()
    closeModal()
    switchPanel('dashboard')
  }

  function buildExportFolderName() {
    const source = (videoFileName.value || 'video_capture').replace(/\.[^.]+$/, '')
    return `${source}_高温高压井视频采集结果`
  }

  async function getConfiguredDownloadDir() {
    await initConfig()
    const configuredDownloadDir = String(getConfigItem('downloadDir') || '').trim()
    if (!configuredDownloadDir) {
      captureStatusText.value = '请先在设置中配置下载文件保存目录'
      ElMessage.error(captureStatusText.value)
      return ''
    }
    return configuredDownloadDir
  }

  async function finalizeVideoCapture() {
    stopCapturePolling()
    if (!captureOutputDir.value) return true

    await invoke('stop_high_temp_pressure_video_stream', {
      outputDir: captureOutputDir.value || null,
    }).catch(() => undefined)
    await syncCaptureResultFromOutputDir().catch(() => undefined)

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
      await exportCurveChartImage(exportedCaptureDir.value)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '视频识别结果导出失败')
      console.warn('[high-temp-pressure] export capture output failed:', error)
      captureStatusText.value = message
      ElMessage.warning(`视频识别结果导出失败，已继续结束测试：${message}`)
    }
    return true
  }

  function endTest(endAtMs = Date.now()) {
    stopCapturePolling()
    syncRuntime(endAtMs)
    testRunning.value = false
    testStartTime.value = null
    closeModal()
    switchPanel('report')
  }

  onMounted(() => {
    timerInterval = window.setInterval(() => {
      if (testStartTime.value !== null) syncRuntime()
    }, 1000)
  })

  onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval)
    revokeLatestFrameObjectUrl()
    stopCapturePolling()
    cleanupStreamListener()
    if (captureOutputDir.value) {
      void invoke('stop_high_temp_pressure_video_stream', {
        outputDir: captureOutputDir.value,
      }).catch(() => undefined)
    }
    disposeChart()
  })

  return {
    currentPanel,
    activeModal,
    testRunning,
    testStartTime,
    csvCount,
    videoPath,
    videoFileName,
    videoUrl,
    captureOutputDir,
    captureProgressPct,
    captureRecordCount,
    captureStatusText,
    captureCompleted,
    latestFrameUrl,
    exportedCaptureDir,
    curveChartImagePath,
    curveData,
    videoMeasurements,
    videoReadings,
    videoConfidence,
    onlineSeconds,
    onlineTimerStr,
    state,
    switchPanel,
    showModal,
    closeModal,
    confirmStart,
    resetTestSession,
    selectVideoFile,
    pauseTest,
    resumeTest,
    stopTest,
    finalizeVideoCapture,
    ensureCurveChartImage,
    endTest,
  }
}
