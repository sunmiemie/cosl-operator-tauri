import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import * as echarts from 'echarts'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { ElMessage } from 'element-plus'
import { useConfig } from '@/composables/useConfig'
import type { HighTempPressureModal, HighTempPressurePanel } from '../types'

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

const SAMPLE_INTERVAL_SECONDS = 0.5
const MAX_POINTS = 120

export function useHighTempPressureTesting() {
  const { initConfig, getConfigItem } = useConfig()
  const currentPanel = ref<HighTempPressurePanel>('dashboard')
  const activeModal = ref<HighTempPressureModal>(null)
  const testRunning = ref(false)
  const testStartTime = ref<number | null>(null)
  const csvCount = ref(0)
  const onlineSeconds = ref(54)
  const onlineTimerStr = ref('0时0分54秒')
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
  const videoMeasurements = ref<HighTempPressureVideoMeasurement[]>([])
  const videoReadings = reactive<Record<string, number>>({})
  const videoConfidence = reactive<Record<string, number>>({})

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

  function pushPrimaryPoint(t1?: number, t2?: number, p?: number) {
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

  function resetCaptureState() {
    state.chartData.t1 = []
    state.chartData.t2 = []
    state.chartData.p = []
    csvCount.value = 0
    captureRecordCount.value = 0
    captureProgressPct.value = 0
    captureCompleted.value = false
    captureOutputDir.value = ''
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

  function applyVideoRecord(record: any) {
    if (!record) return
    const measurements: VideoMeasurementPayload[] = Array.isArray(record.measurements)
      ? record.measurements
      : []
    const values: Record<string, number> = {}
    const nextMeasurements: HighTempPressureVideoMeasurement[] = []

    measurements.forEach((item, index) => {
      const id = String(item?.id || '')
      if (!id) return
      const part = String(item?.part || '').trim()
      const data = String(item?.data || '').trim()
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
        color: MEASUREMENT_COLORS[index % MEASUREMENT_COLORS.length],
      })
      if (numericValue === null) return
      values[id] = numericValue
      videoReadings[id] = numericValue
      if (typeof item?.confidence === 'number') {
        videoConfidence[id] = item.confidence
      }
    })
    videoMeasurements.value = nextMeasurements

    const upperWaterTemp = values.vessel_250_upper_water_temp ?? values.vessel_480_upper_water_temp
    const lowerWaterTemp = values.vessel_480_lower_water_temp ?? values.vessel_480_upper_water_temp
    const pressure = values.cylinder_pressure ?? values.high_pressure_pump_outlet_pressure
    if (
      upperWaterTemp !== undefined ||
      lowerWaterTemp !== undefined ||
      pressure !== undefined
    ) {
      pushPrimaryPoint(upperWaterTemp, lowerWaterTemp, pressure)
    }
  }

  async function syncCaptureResultFromOutputDir() {
    if (!captureOutputDir.value) return
    const result = await invoke<any>('get_high_temp_pressure_capture_result', {
      outputDir: captureOutputDir.value,
    })
    const records = Array.isArray(result?.records) ? result.records : []
    captureRecordCount.value = records.length
    csvCount.value = records.length
    if (result?.latest_frame) await updateLatestFrame(String(result.latest_frame))
    if (records.length) applyVideoRecord(records[records.length - 1])
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
    testRunning.value = true
    testStartTime.value = Date.now()
    switchPanel('testing')
    nextTick(() => initChart())
    captureStatusText.value = videoPath.value ? captureStatusText.value : '等待选择试验视频'
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
    testRunning.value = true
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

  async function finalizeVideoCapture() {
    stopCapturePolling()
    if (!captureOutputDir.value) return true

    await invoke('stop_high_temp_pressure_video_stream', {
      outputDir: captureOutputDir.value || null,
    }).catch(() => undefined)
    await syncCaptureResultFromOutputDir().catch(() => undefined)

    const selectedDir = await open({
      title: '选择高温高压井视频识别结果保存目录',
      directory: true,
      multiple: false,
    })
    if (!selectedDir || typeof selectedDir !== 'string') {
      captureStatusText.value = '已取消保存目录选择，仍停留在测试页面'
      return false
    }

    const result = await invoke<any>('export_high_temp_pressure_capture_output', {
      sourceOutputDir: captureOutputDir.value,
      targetDir: selectedDir,
      folderName: buildExportFolderName(),
    })
    exportedCaptureDir.value = String(result?.export_dir || selectedDir)
    ElMessage.success(`视频识别结果已保存到 ${exportedCaptureDir.value}`)
    return true
  }

  function endTest() {
    stopCapturePolling()
    testRunning.value = false
    closeModal()
    switchPanel('report')
  }

  onMounted(() => {
    timerInterval = window.setInterval(() => {
      onlineSeconds.value++
      const h = Math.floor(onlineSeconds.value / 3600)
      const m = Math.floor((onlineSeconds.value % 3600) / 60)
      const s = onlineSeconds.value % 60
      onlineTimerStr.value = `${h}时${m}分${s}秒`
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
    endTest,
  }
}
