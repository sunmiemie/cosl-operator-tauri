import { computed, onMounted, onUnmounted, ref } from 'vue'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { readFile } from '@tauri-apps/plugin-fs'
import { ElMessage } from 'element-plus'
import { useConfig } from '@/composables/useConfig'
import type {
  VibrationAnalysisSummary,
  VibrationCaptureFieldValue,
  VibrationCaptureRecord,
  VibrationOcrDevice,
  WorkOrder,
} from '../types'
import type {
  VibrationTablePreExperimentPayload,
  VibrationTableReportPayload,
} from '@/services/vibration-table-report-api'

interface UseVibrationTestingOptions {
  getCurrentWorkOrder: () => WorkOrder | null
  getTestMode: () => 'formal' | 'pre'
  onFinishToReport: (exportDir: string) => void
  onFinishToDashboard: (finalStatus?: number, options?: { resetRunningInstruments?: boolean }) => void
}

type FieldId = 'target' | 'level' | 'response' | 'drive' | 'elapsed' | 'remaining' | 'right_level'

const ACCEPTANCE_THRESHOLD = 0.9995
function emptyField(status = 'no_data'): VibrationCaptureFieldValue {
  return {
    raw: '',
    value: null,
    confidence: null,
    status,
    reason: null,
    acceptedAt: null,
    stale: false,
  }
}

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function useVibrationTesting(options: UseVibrationTestingOptions) {
  const { initConfig, getConfigItem } = useConfig()
  const vibTestSeconds = ref(0)
  const vibDataCount = ref(0)
  const isRunning = ref(false)
  const isPaused = ref(false)
  const isFinalizing = ref(false)
  const sessionStarted = ref(false)
  const analysisCompleted = ref(false)

  const liveLevel = ref('--')
  const liveFreq = ref('--')
  const liveInputLevel = ref('--')
  const liveDrive = ref('--')
  const liveAx = ref('--')
  const liveAy = ref('--')
  const liveAz = ref('--')
  const liveFileName = ref('振动台OCR实验数据.csv')
  const showAbortWarning = ref(false)
  const sampleIntervalSeconds = ref(0.5)
  const captureStatusText = ref('正在搜索振动台采集卡...')
  const captureProgressPct = ref(0)
  const latestCaptureUrl = ref('')
  const captureOutputDir = ref('')
  const exportOutputDir = ref('')
  const captureRecords = ref<VibrationCaptureRecord[]>([])
  const analysisSummary = ref<VibrationAnalysisSummary | null>(null)
  const preExperimentClientSubmitId = ref('')
  const captureDevices = ref<VibrationOcrDevice[]>([])
  const selectedCaptureDevice = ref('')
  const selectedCaptureDeviceName = ref('')
  const deviceRefreshing = ref(false)
  const ocrReady = ref(false)

  const lastAccepted = new Map<FieldId, VibrationCaptureFieldValue>()
  let unlistenStream: UnlistenFn | null = null
  let capturePollTimer: number | null = null
  let latestCaptureObjectUrl = ''

  const formattedDuration = computed(() => formatClock(vibTestSeconds.value))
  const captureDeviceReady = computed(() => Boolean(selectedCaptureDevice.value))
  const analysisPreviewRecords = computed(() => captureRecords.value.slice(-6).reverse())

  function formatClock(totalSeconds: number) {
    const total = Math.max(0, Math.floor(totalSeconds || 0))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function formatInvokeError(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'string' && error.trim()) return error
    return fallback
  }

  function revokeLatestCaptureObjectUrl() {
    if (!latestCaptureObjectUrl) return
    URL.revokeObjectURL(latestCaptureObjectUrl)
    latestCaptureObjectUrl = ''
  }

  function resetCaptureData() {
    vibTestSeconds.value = 0
    vibDataCount.value = 0
    captureProgressPct.value = 0
    latestCaptureUrl.value = ''
    revokeLatestCaptureObjectUrl()
    captureOutputDir.value = ''
    exportOutputDir.value = ''
    captureRecords.value = []
    analysisSummary.value = null
    preExperimentClientSubmitId.value = ''
    analysisCompleted.value = false
    sessionStarted.value = false
    isRunning.value = false
    isPaused.value = false
    ocrReady.value = false
    liveLevel.value = '--'
    liveFreq.value = '--'
    liveAx.value = '--'
    liveAy.value = '--'
    liveAz.value = '--'
    liveInputLevel.value = '--'
    liveDrive.value = '--'
    lastAccepted.clear()
  }

  function resetCaptureSession() {
    stopCapturePolling()
    resetCaptureData()
    liveFileName.value = `${options.getCurrentWorkOrder()?.id || '临时测试'}_振动台OCR实验数据.csv`
    captureStatusText.value = captureDeviceReady.value
      ? `采集卡 ${selectedCaptureDeviceName.value} 已找到，等待开始识别`
      : '未找到振动台采集卡，请刷新设备列表'
  }

  function measurementMap(measurements: unknown): Map<string, any> {
    const map = new Map<string, any>()
    if (!Array.isArray(measurements)) return map
    measurements.forEach((item) => {
      if (item && typeof item === 'object' && String(item.id || '')) {
        map.set(String(item.id), item)
      }
    })
    return map
  }

  function mapField(item: any, screenDetected: boolean): VibrationCaptureFieldValue {
    if (!item) return emptyField()
    const confidence = numericValue(item.confidence)
    const status = String(item.status || 'no_data')
    const accepted = screenDetected
      && status === 'accepted'
      && confidence !== null
      && confidence >= ACCEPTANCE_THRESHOLD
    return {
      raw: item.raw === null || item.raw === undefined ? '' : String(item.raw),
      value: accepted ? numericValue(item.value) : null,
      confidence,
      status,
      reason: item.reason === null || item.reason === undefined ? null : String(item.reason),
      acceptedAt: accepted && item.accepted_at ? String(item.accepted_at) : null,
      stale: false,
    }
  }

  function mapPythonRecord(item: any, previewPath = ''): VibrationCaptureRecord {
    const screenDetected = Boolean(item?.screen_detected)
    const map = measurementMap(item?.measurements)
    const preview = String(item?.preview_path || previewPath || '')
    return {
      timeSec: Number(item?.time_sec || 0),
      capturedAt: item?.captured_at ? String(item.captured_at) : null,
      screenDetected,
      previewUrl: preview ? convertFileSrc(preview) : '',
      values: {
        target: mapField(map.get('target'), screenDetected),
        level: mapField(map.get('level'), screenDetected),
        response: mapField(map.get('response'), screenDetected),
        drive: mapField(map.get('drive'), screenDetected),
        elapsedTime: mapField(map.get('elapsed'), screenDetected),
        remainingTime: mapField(map.get('remaining'), screenDetected),
        rightLevel: mapField(map.get('right_level'), screenDetected),
      },
    }
  }

  function accepted(field: VibrationCaptureFieldValue) {
    return field.status === 'accepted'
      && field.confidence !== null
      && field.confidence >= ACCEPTANCE_THRESHOLD
      && field.value !== null
  }

  function displayField(id: FieldId, current: VibrationCaptureFieldValue) {
    if (accepted(current)) {
      const trusted = { ...current, stale: false }
      lastAccepted.set(id, trusted)
      return trusted.raw || String(trusted.value)
    }
    const previous = lastAccepted.get(id)
    return previous ? `${previous.raw || previous.value}（历史）` : '--'
  }

  function updateLiveMetrics(record: VibrationCaptureRecord) {
    liveLevel.value = displayField('response', record.values.response)
    liveFreq.value = displayField('target', record.values.target)
    liveInputLevel.value = displayField('level', record.values.level)
    liveDrive.value = displayField('drive', record.values.drive)
    liveAx.value = displayField('elapsed', record.values.elapsedTime)
    liveAy.value = displayField('remaining', record.values.remainingTime)
    liveAz.value = displayField('right_level', record.values.rightLevel)
    if (accepted(record.values.elapsedTime)) {
      vibTestSeconds.value = Math.floor(record.values.elapsedTime.value || 0)
    }
  }

  function calculateSummary(records: VibrationCaptureRecord[]): VibrationAnalysisSummary {
    const validResponses = records
      .map((record) => record.values.response)
      .filter(accepted)
      .map((field) => Number(field.value))
    const validDrives = records
      .map((record) => record.values.drive)
      .filter(accepted)
      .map((field) => Number(field.value))
    const last = records[records.length - 1]
    const lastElapsed = [...records].reverse().find((record) => accepted(record.values.elapsedTime))
    const lastRemaining = [...records].reverse().find((record) => accepted(record.values.remainingTime))
    return {
      sourceCapture: selectedCaptureDeviceName.value || selectedCaptureDevice.value || '振动台采集卡',
      sampleIntervalSeconds: sampleIntervalSeconds.value,
      durationSeconds: last?.timeSec || vibTestSeconds.value,
      recordCount: records.length,
      screenDetectedCount: records.filter((record) => record.screenDetected).length,
      acceptedRecordCount: records.filter((record) => Object.values(record.values).some(accepted)).length,
      avgResponse: validResponses.length
        ? Number((validResponses.reduce((sum, value) => sum + value, 0) / validResponses.length).toFixed(4))
        : 0,
      maxDrive: validDrives.length ? Number(Math.max(...validDrives).toFixed(4)) : 0,
      lastElapsedTime: lastElapsed?.values.elapsedTime.raw || '--',
      lastRemainingTime: lastRemaining?.values.remainingTime.raw || '--',
    }
  }

  function mapPythonSummary(summary: any, records: VibrationCaptureRecord[]): VibrationAnalysisSummary {
    const calculated = calculateSummary(records)
    return {
      ...calculated,
      sampleIntervalSeconds: Number(summary?.sample_interval_seconds ?? calculated.sampleIntervalSeconds),
      durationSeconds: Number(summary?.duration_seconds ?? calculated.durationSeconds),
      recordCount: Number(summary?.record_count ?? calculated.recordCount),
      screenDetectedCount: Number(summary?.screen_detected_count ?? calculated.screenDetectedCount),
      acceptedRecordCount: Number(summary?.accepted_record_count ?? calculated.acceptedRecordCount),
      lastElapsedTime: String(summary?.last_elapsed_time ?? calculated.lastElapsedTime),
      lastRemainingTime: String(summary?.last_remaining_time ?? calculated.lastRemainingTime),
    }
  }

  function cleanupStreamListener() {
    unlistenStream?.()
    unlistenStream = null
  }

  function stopCapturePolling() {
    if (capturePollTimer !== null) {
      window.clearInterval(capturePollTimer)
      capturePollTimer = null
    }
  }

  async function updateLatestCapturePreview(filePath: string) {
    if (!filePath) return
    try {
      const bytes = await readFile(filePath)
      revokeLatestCaptureObjectUrl()
      latestCaptureObjectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
      latestCaptureUrl.value = latestCaptureObjectUrl
    } catch {
      latestCaptureUrl.value = `${convertFileSrc(filePath)}?t=${Date.now()}`
    }
  }

  function mergeRecord(record: VibrationCaptureRecord) {
    const next = captureRecords.value.slice()
    const index = next.findIndex((item) => item.timeSec === record.timeSec)
    if (index >= 0) next[index] = record
    else next.push(record)
    captureRecords.value = next
    updateLiveMetrics(record)
  }

  async function syncCaptureResultFromOutputDir() {
    if (!captureOutputDir.value) return
    const result = await invoke<any>('get_vibration_capture_result', {
      outputDir: captureOutputDir.value,
    })
    captureOutputDir.value = String(result?.output_dir || captureOutputDir.value)
    const records = Array.isArray(result?.records)
      ? result.records.map((record: any) => mapPythonRecord(record))
      : []
    captureRecords.value = records
    if (records.length) updateLiveMetrics(records[records.length - 1])
    vibDataCount.value = records.filter((record: VibrationCaptureRecord) =>
      Object.values(record.values).some(accepted)
    ).length
    analysisSummary.value = mapPythonSummary(result?.summary || {}, records)
    if (result?.latest_frame) await updateLatestCapturePreview(String(result.latest_frame))
  }

  async function pollCaptureStatus() {
    if (!captureOutputDir.value) return
    const status = await invoke<any>('get_vibration_capture_status', {
      outputDir: captureOutputDir.value,
    })
    if (!status?.exists) return
    captureProgressPct.value = Number(status?.ready_pct || 0)
    vibDataCount.value = Number(status?.accepted_current || 0)
    isPaused.value = Boolean(status?.paused)
    const sourceError = String(status?.service?.source?.last_error || '').trim()
    if (!ocrReady.value && sourceError) {
      captureStatusText.value = `采集卡尚未就绪：${sourceError}`
    }
    if (status?.latest_frame) await updateLatestCapturePreview(String(status.latest_frame))
    if (status?.latest_record) updateLiveMetrics(mapPythonRecord(status.latest_record))
    if (status?.complete) {
      stopCapturePolling()
      isRunning.value = false
      isPaused.value = false
      analysisCompleted.value = true
    }
  }

  function startCapturePolling() {
    stopCapturePolling()
    capturePollTimer = window.setInterval(() => {
      void pollCaptureStatus().catch(() => undefined)
    }, 1000)
  }

  function handleStreamEvent(payload: any) {
    const eventType = String(payload?.event || '')
    if (eventType === 'start') {
      captureStatusText.value = `已连接 ${selectedCaptureDeviceName.value || payload?.device || '振动台采集卡'}，正在加载 OCR`
      captureProgressPct.value = 10
      return
    }
    if (eventType === 'ready') {
      ocrReady.value = true
      captureProgressPct.value = 100
      captureStatusText.value = String(payload?.message || '振动台 OCR 已就绪')
      return
    }
    if (eventType === 'sample') {
      const record = mapPythonRecord(payload?.record || payload, String(payload?.preview_path || ''))
      mergeRecord(record)
      vibDataCount.value = Number(payload?.accepted_current ?? vibDataCount.value)
      if (payload?.preview_path) {
        void updateLatestCapturePreview(String(payload.preview_path)).catch(() => undefined)
      }
      captureStatusText.value = record.screenDetected
        ? `OCR 实时识别中，可信采样 ${vibDataCount.value} 条`
        : '未检测到已标定的振动台界面，业务数据未更新'
      return
    }
    if (eventType === 'complete') {
      isRunning.value = false
      isPaused.value = false
      analysisCompleted.value = true
      stopCapturePolling()
      captureStatusText.value = `振动台 OCR 采集已完成，共 ${Number(payload?.accepted_record_count || vibDataCount.value)} 条可信采样`
      return
    }
    if (eventType === 'error') {
      isRunning.value = false
      isPaused.value = false
      stopCapturePolling()
      captureStatusText.value = String(payload?.message || '振动台 OCR 识别失败')
      ElMessage.error(captureStatusText.value)
    }
  }

  async function ensureStreamListener() {
    cleanupStreamListener()
    unlistenStream = await listen<any>('vibration-ocr-stream', (event) => {
      handleStreamEvent(event.payload)
    })
  }

  async function refreshCaptureDevices() {
    if (deviceRefreshing.value || isRunning.value) return
    deviceRefreshing.value = true
    try {
      await initConfig()
      const devices = await invoke<VibrationOcrDevice[]>('get_vibration_ocr_devices')
      captureDevices.value = devices.filter((device) => device.available)
      const configuredIndex = Number(getConfigItem('highTempPressureCaptureDevice'))
      const configured = Number.isInteger(configuredIndex) && configuredIndex >= 0
        ? captureDevices.value.find((device) => device.index === configuredIndex)
        : undefined
      const preferred = configured || captureDevices.value.find((device) =>
        /AFN_cap video/i.test(`${device.name} ${device.device}`)
      ) || captureDevices.value[0]
      selectedCaptureDevice.value = preferred?.device || ''
      selectedCaptureDeviceName.value = preferred?.name || ''
      captureStatusText.value = preferred
        ? `采集卡 ${preferred.name} 已找到，等待开始识别`
        : '未找到振动台采集卡，请检查连接后刷新'
    } catch (error) {
      captureDevices.value = []
      selectedCaptureDevice.value = ''
      selectedCaptureDeviceName.value = ''
      captureStatusText.value = formatInvokeError(error, '搜索振动台采集卡失败')
    } finally {
      deviceRefreshing.value = false
    }
  }

  async function getConfiguredDownloadDir() {
    await initConfig()
    return String(getConfigItem('vibrationDownloadDir') || '').trim()
  }

  function buildExportFolderName() {
    const orderId = options.getCurrentWorkOrder()?.id || '临时测试'
    const now = new Date()
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '-',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('')
    return `${orderId}_振动台采集结果_${stamp}`
  }

  function buildVibrationCurveImageDataUrl() {
    const records = captureRecords.value
    const canvas = document.createElement('canvas')
    const width = 1600
    const height = 900
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前环境无法生成振动测试曲线')

    const chart = { left: 110, top: 120, right: 1450, bottom: 790 }
    const chartWidth = chart.right - chart.left
    const chartHeight = chart.bottom - chart.top
    const series = [
      { label: '目标', color: '#2563eb', axis: 'left', field: (record: VibrationCaptureRecord) => record.values.target },
      { label: '量级', color: '#f59e0b', axis: 'left', field: (record: VibrationCaptureRecord) => record.values.level },
      { label: '响应', color: '#dc2626', axis: 'left', field: (record: VibrationCaptureRecord) => record.values.response },
      { label: '右侧量级', color: '#059669', axis: 'left', field: (record: VibrationCaptureRecord) => record.values.rightLevel },
      { label: '驱动', color: '#7c3aed', axis: 'right', field: (record: VibrationCaptureRecord) => record.values.drive },
    ] as const

    const numericValues = (axis: 'left' | 'right') => series
      .filter((item) => item.axis === axis)
      .flatMap((item) => records
        .map((record) => item.field(record))
        .filter(accepted)
        .map((field) => Number(field.value)))

    const axisRange = (values: number[]) => {
      if (!values.length) return { min: 0, max: 1 }
      let minValue = Number.POSITIVE_INFINITY
      let maxValue = Number.NEGATIVE_INFINITY
      values.forEach((value) => {
        minValue = Math.min(minValue, value)
        maxValue = Math.max(maxValue, value)
      })
      const span = Math.max(maxValue - minValue, Math.max(Math.abs(maxValue), 1) * 0.02)
      return { min: minValue - span * 0.08, max: maxValue + span * 0.08 }
    }

    const leftRange = axisRange(numericValues('left'))
    const rightRange = axisRange(numericValues('right'))
    let minTime = records.length ? Number.POSITIVE_INFINITY : 0
    let maxTimeValue = records.length ? Number.NEGATIVE_INFINITY : 1
    records.forEach((record) => {
      minTime = Math.min(minTime, record.timeSec)
      maxTimeValue = Math.max(maxTimeValue, record.timeSec)
    })
    const maxTime = maxTimeValue > minTime ? maxTimeValue : minTime + 1
    const xOf = (time: number) => chart.left + ((time - minTime) / (maxTime - minTime)) * chartWidth
    const yOf = (value: number, axis: 'left' | 'right') => {
      const range = axis === 'left' ? leftRange : rightRange
      return chart.bottom - ((value - range.min) / (range.max - range.min)) * chartHeight
    }

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#111827'
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('振动测试曲线', width / 2, 48)
    ctx.font = '16px "Microsoft YaHei", sans-serif'
    ctx.fillStyle = '#64748b'
    const orderNumber = options.getCurrentWorkOrder()?.id || '临时测试'
    ctx.fillText(`工单：${orderNumber}　采样：${records.length} 条　时长：${formatClock(maxTimeValue)}`, width / 2, 78)

    ctx.lineWidth = 1
    ctx.font = '14px "Microsoft YaHei", sans-serif'
    for (let index = 0; index <= 10; index += 1) {
      const ratio = index / 10
      const x = chart.left + ratio * chartWidth
      ctx.strokeStyle = '#e2e8f0'
      ctx.beginPath()
      ctx.moveTo(x, chart.top)
      ctx.lineTo(x, chart.bottom)
      ctx.stroke()
      ctx.fillStyle = '#64748b'
      ctx.textAlign = 'center'
      ctx.fillText(formatClock(minTime + ratio * (maxTime - minTime)), x, chart.bottom + 28)
    }
    for (let index = 0; index <= 8; index += 1) {
      const ratio = index / 8
      const y = chart.bottom - ratio * chartHeight
      ctx.strokeStyle = '#e2e8f0'
      ctx.beginPath()
      ctx.moveTo(chart.left, y)
      ctx.lineTo(chart.right, y)
      ctx.stroke()
      ctx.fillStyle = '#64748b'
      ctx.textAlign = 'right'
      ctx.fillText((leftRange.min + ratio * (leftRange.max - leftRange.min)).toFixed(2), chart.left - 12, y + 5)
      ctx.textAlign = 'left'
      ctx.fillText((rightRange.min + ratio * (rightRange.max - rightRange.min)).toFixed(1), chart.right + 12, y + 5)
    }

    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.5
    ctx.strokeRect(chart.left, chart.top, chartWidth, chartHeight)

    series.forEach((item) => {
      ctx.strokeStyle = item.color
      ctx.lineWidth = 2
      ctx.beginPath()
      let hasPoint = false
      records.forEach((record) => {
        const field = item.field(record)
        if (!accepted(field)) {
          hasPoint = false
          return
        }
        const x = xOf(record.timeSec)
        const y = yOf(Number(field.value), item.axis)
        if (hasPoint) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
        hasPoint = true
      })
      ctx.stroke()
    })

    let legendX = chart.left
    const legendY = 102
    ctx.font = '15px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'left'
    series.forEach((item) => {
      ctx.fillStyle = item.color
      ctx.fillRect(legendX, legendY - 10, 24, 4)
      ctx.fillStyle = '#334155'
      ctx.fillText(item.label, legendX + 32, legendY)
      legendX += ctx.measureText(item.label).width + 78
    })
    ctx.fillStyle = '#64748b'
    ctx.textAlign = 'center'
    ctx.fillText('时间', width / 2, 850)
    ctx.save()
    ctx.translate(28, (chart.top + chart.bottom) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('目标 / 量级 / 响应', 0, 0)
    ctx.restore()
    ctx.save()
    ctx.translate(width - 28, (chart.top + chart.bottom) / 2)
    ctx.rotate(Math.PI / 2)
    ctx.fillText('驱动', 0, 0)
    ctx.restore()
    return canvas.toDataURL('image/png')
  }

  function startVibTestMonitor() {
    if (!captureDeviceReady.value) {
      captureStatusText.value = '未找到振动台采集卡，请刷新后再开始测试'
      ElMessage.warning(captureStatusText.value)
      return
    }
    void (async () => {
      await ensureStreamListener()
      resetCaptureData()
      sessionStarted.value = true
      isRunning.value = true
      captureStatusText.value = '正在启动振动台采集卡实时 OCR...'
      liveFileName.value = `${options.getCurrentWorkOrder()?.id || '临时测试'}_振动台OCR实验数据.csv`
      try {
        const result = await invoke<any>('start_vibration_ocr_stream', {
          pythonPath: null,
          device: selectedCaptureDevice.value,
          interval: sampleIntervalSeconds.value,
          testMode: options.getTestMode(),
          orderNumber: options.getCurrentWorkOrder()?.id || null,
        })
        captureOutputDir.value = String(result?.output_dir || '')
        startCapturePolling()
      } catch (error) {
        sessionStarted.value = false
        isRunning.value = false
        captureStatusText.value = formatInvokeError(error, '启动振动台 OCR 失败')
        ElMessage.error(captureStatusText.value)
      }
    })()
  }

  function pauseVibTest() {
    if (!isRunning.value || !captureOutputDir.value) return
    void invoke('pause_vibration_ocr_stream', { outputDir: captureOutputDir.value })
      .then(() => {
        isRunning.value = false
        isPaused.value = true
        captureStatusText.value = `OCR 采集已暂停，当前可信采样 ${vibDataCount.value} 条`
      })
      .catch((error) => {
        captureStatusText.value = formatInvokeError(error, '暂停振动台 OCR 失败')
        ElMessage.error(captureStatusText.value)
      })
  }

  function resumeVibTest() {
    if (!sessionStarted.value || analysisCompleted.value) {
      startVibTestMonitor()
      return
    }
    if (!isPaused.value || !captureOutputDir.value) return
    void invoke('resume_vibration_ocr_stream', { outputDir: captureOutputDir.value })
      .then(() => {
        isRunning.value = true
        isPaused.value = false
        captureStatusText.value = '振动台 OCR 采集已恢复'
      })
      .catch((error) => {
        captureStatusText.value = formatInvokeError(error, '恢复振动台 OCR 失败')
        ElMessage.error(captureStatusText.value)
      })
  }

  function endVibTest() {
    if (isFinalizing.value || !captureOutputDir.value) return
    void (async () => {
      isFinalizing.value = true
      captureStatusText.value = '正在停止 OCR 并整理本次采集数据...'
      try {
        await invoke('stop_vibration_ocr_stream', { outputDir: captureOutputDir.value })
        isRunning.value = false
        isPaused.value = false
        stopCapturePolling()
        await syncCaptureResultFromOutputDir()
        analysisCompleted.value = true
        const curveImageDataUrl = buildVibrationCurveImageDataUrl()

        const configuredDownloadDir = await getConfiguredDownloadDir()
        if (!configuredDownloadDir) throw new Error('请先在设置中配置振动台下载文件保存目录')
        const exportResult = await invoke<any>('export_vibration_capture_output', {
          sourceOutputDir: captureOutputDir.value,
          targetDir: configuredDownloadDir,
          folderName: buildExportFolderName(),
          curveImageDataUrl,
        })
        exportOutputDir.value = String(exportResult?.export_dir || configuredDownloadDir)
        captureStatusText.value = `测试结果已保存到 ${exportOutputDir.value}`
        ElMessage.success(captureStatusText.value)
        options.onFinishToReport(exportOutputDir.value)
      } catch (error) {
        captureStatusText.value = formatInvokeError(error, '整理振动台 OCR 结果失败')
        ElMessage.error(captureStatusText.value)
      } finally {
        isFinalizing.value = false
      }
    })()
  }

  async function prepareFreshFormalSession() {
    stopCapturePolling()
    cleanupStreamListener()
    if (captureOutputDir.value) {
      await invoke('stop_vibration_ocr_stream', {
        outputDir: captureOutputDir.value,
      }).catch(() => undefined)
    }
    resetCaptureData()
    liveFileName.value = `${options.getCurrentWorkOrder()?.id || '正式测试'}_振动台OCR实验数据.csv`
    captureStatusText.value = captureDeviceReady.value
      ? `正式测试将重新采集，采集卡 ${selectedCaptureDeviceName.value || selectedCaptureDevice.value} 已就绪`
      : '正式测试将重新采集，请先刷新采集卡列表'
  }

  function confirmAbort() {
    showAbortWarning.value = false
    isRunning.value = false
    isPaused.value = false
    stopCapturePolling()
    void invoke('stop_vibration_ocr_stream', {
      outputDir: captureOutputDir.value || null,
    }).catch(() => undefined)
    const exportDir = exportOutputDir.value.trim()
    if (options.getTestMode() === 'pre' || !exportDir) {
      options.onFinishToDashboard(1, { resetRunningInstruments: true })
      return
    }
    options.onFinishToReport(exportDir)
  }

  function getOscCanvas() {
    return null
  }

  function getCsvContent() {
    const header = 'time_sec,captured_at,screen_detected,target,level,response,drive,elapsed,remaining,right_level\n'
    const rows = captureRecords.value.map((record) => [
      record.timeSec,
      record.capturedAt || '',
      record.screenDetected ? 1 : 0,
      record.values.target.value ?? '',
      record.values.level.value ?? '',
      record.values.response.value ?? '',
      record.values.drive.value ?? '',
      record.values.elapsedTime.value ?? '',
      record.values.remainingTime.value ?? '',
      record.values.rightLevel.value ?? '',
    ].join(',')).join('\n')
    return header + rows
  }

  async function getLatestCaptureBlob() {
    if (!latestCaptureUrl.value) return null
    const response = await fetch(latestCaptureUrl.value)
    return await response.blob()
  }

  function getReportText() {
    const order = options.getCurrentWorkOrder()
    const summary = analysisSummary.value || calculateSummary(captureRecords.value)
    return [
      '振动台试验结果汇总',
      `工单号: ${order?.id || '临时测试'}`,
      `设备名称: ${order?.device || '-'}`,
      `采集卡: ${summary.sourceCapture}`,
      `采样间隔: ${summary.sampleIntervalSeconds} 秒`,
      `采集记录数: ${summary.recordCount}`,
      `可信采样数: ${summary.acceptedRecordCount}`,
      `最终历经时间: ${summary.lastElapsedTime}`,
      `最终剩余时间: ${summary.lastRemainingTime}`,
      `输出目录: ${captureOutputDir.value || '-'}`,
      `生成时间: ${new Date().toLocaleString()}`,
    ].join('\n')
  }

  function getAnalysisSummary() {
    return analysisSummary.value
  }

  function createPreExperimentClientSubmitId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `vib-pre-${crypto.randomUUID()}`
    }
    return `vib-pre-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function ensurePreExperimentClientSubmitId() {
    if (!preExperimentClientSubmitId.value) {
      preExperimentClientSubmitId.value = createPreExperimentClientSubmitId()
    }
    return preExperimentClientSubmitId.value
  }

  function getPreExperimentPayload(_exportDir: string, tester: string): VibrationTablePreExperimentPayload | null {
    const order = options.getCurrentWorkOrder()
    if (!order?.dbId) return null
    const summary = analysisSummary.value || calculateSummary(captureRecords.value)
    return {
      order_id: order.dbId,
      order_number: String(order.id || ''),
      tester,
      summary: {
        source_capture: summary.sourceCapture,
        sample_interval_seconds: summary.sampleIntervalSeconds,
        duration_seconds: summary.durationSeconds,
        record_count: summary.recordCount,
        screen_detected_count: summary.screenDetectedCount,
        accepted_record_count: summary.acceptedRecordCount,
        avg_response: summary.avgResponse,
        max_drive: summary.maxDrive,
        last_elapsed_time: summary.lastElapsedTime,
        last_remaining_time: summary.lastRemainingTime,
        selected_instruments: (order.selectedInstruments || order.instruments || []).map((instrument) => ({
          id: instrument.dbId ?? instrument.id,
          name: instrument.name,
          sn: instrument.sn,
          model: instrument.model || '',
        })),
      },
      records: [],
      attachments: [],
      export_dir: '',
      client_submit_id: ensurePreExperimentClientSubmitId(),
    }
  }

  function getFormalReportPayload(
    tester: string,
    clientSubmitId: string,
    softwareReportName: string
  ): VibrationTableReportPayload | null {
    const order = options.getCurrentWorkOrder()
    const instruments = order?.selectedInstruments || []
    if (!order?.dbId || !instruments.length) return null
    const summary = analysisSummary.value || calculateSummary(captureRecords.value)
    const metrics = {
      source_capture: summary.sourceCapture,
      sample_interval_seconds: summary.sampleIntervalSeconds,
      duration_seconds: summary.durationSeconds,
      record_count: summary.recordCount,
      screen_detected_count: summary.screenDetectedCount,
      accepted_record_count: summary.acceptedRecordCount,
      avg_response: summary.avgResponse,
      max_drive: summary.maxDrive,
      last_elapsed_time: summary.lastElapsedTime,
      last_remaining_time: summary.lastRemainingTime,
    }
    return {
      task_number: String(order.taskNumber || order.id),
      test_date: String(order.testDate || new Date().toISOString().slice(0, 10)),
      tester,
      status: 0,
      overall_result: 'pending',
      order_ids: [order.dbId],
      order_numbers: [String(order.id)],
      instrument_results: instruments.map((instrument) => ({
        order_id: order.dbId,
        order_no: String(order.id),
        instrument_id: instrument.dbId,
        instrument_name: instrument.name,
        instrument_sn: instrument.sn,
        result: 'pending',
        result_text: '待审核确认',
        metrics: { ...metrics },
      })),
      report_json: {
        schema_version: 1,
        report_form_status: 'pending-design',
        source: 'vibration_live_ocr',
        ocr_summary: metrics,
        software_report: {
          source: 'mounted-shared-folder',
          file_name: softwareReportName,
        },
      },
      attachments: [],
      remark: '',
      client_submit_id: clientSubmitId,
    }
  }

  onMounted(() => {
    void refreshCaptureDevices()
  })

  onUnmounted(() => {
    revokeLatestCaptureObjectUrl()
    stopCapturePolling()
    cleanupStreamListener()
  })

  return {
    vibTestSeconds,
    vibDataCount,
    isRunning,
    isPaused,
    isFinalizing,
    liveLevel,
    liveFreq,
    liveInputLevel,
    liveDrive,
    liveAx,
    liveAy,
    liveAz,
    liveFileName,
    showAbortWarning,
    formattedDuration,
    sampleIntervalSeconds,
    captureStatusText,
    captureProgressPct,
    latestCaptureUrl,
    captureRecords,
    exportOutputDir,
    analysisSummary,
    analysisCompleted,
    sessionStarted,
    analysisPreviewRecords,
    captureDevices,
    selectedCaptureDevice,
    selectedCaptureDeviceName,
    captureDeviceReady,
    deviceRefreshing,
    ocrReady,
    refreshCaptureDevices,
    resetCaptureSession,
    startVibTestMonitor,
    pauseVibTest,
    resumeVibTest,
    endVibTest,
    prepareFreshFormalSession,
    confirmAbort,
    getOscCanvas,
    getCsvContent,
    getLatestCaptureBlob,
    getReportText,
    getAnalysisSummary,
    getPreExperimentPayload,
    getFormalReportPayload,
  }
}
