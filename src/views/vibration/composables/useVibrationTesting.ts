import { computed, onUnmounted, ref } from 'vue'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { ElMessage } from 'element-plus'
import { useConfig } from '@/composables/useConfig'
import type { VibrationAnalysisSummary, VibrationCaptureRecord, WorkOrder } from '../types'

interface UseVibrationTestingOptions {
  getCurrentWorkOrder: () => WorkOrder | null
  getTestMode: () => 'formal' | 'pre'
  onFinishToReport: (exportDir: string) => void
  onFinishToDashboard: (finalStatus?: number) => void
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

  const liveLevel = ref('-- G')
  const liveFreq = ref('-- Hz')
  const liveAx = ref('--.-g')
  const liveAy = ref('--.-g')
  const liveAz = ref('--.-g')
  const liveFileName = ref('振动实验数据.csv')
  const showAbortWarning = ref(false)
  const videoFileName = ref('')
  const videoPath = ref('')
  const videoUrl = ref('')
  const videoDurationSeconds = ref(0)
  const backendProcessingRequired = ref(false)
  const sampleIntervalSeconds = ref(0.5)
  const captureStatusText = ref('请先上传 .wmv 试验视频')
  const captureProgressPct = ref(0)
  const latestCaptureUrl = ref('')
  const captureOutputDir = ref('')
  const exportOutputDir = ref('')
  const captureRecords = ref<VibrationCaptureRecord[]>([])
  const analysisSummary = ref<VibrationAnalysisSummary | null>(null)
  let unlistenStream: UnlistenFn | null = null
  let capturePollTimer: number | null = null
  let latestCaptureObjectUrl = ''

  const formattedDuration = computed(() => {
    const h = String(Math.floor(vibTestSeconds.value / 3600)).padStart(2, '0')
    const m = String(Math.floor((vibTestSeconds.value % 3600) / 60)).padStart(2, '0')
    const s = String(vibTestSeconds.value % 60).padStart(2, '0')
    return `${h}:${m}:${s}`
  })

  const videoReady = computed(() => !!videoPath.value)
  const videoDurationText = computed(() => {
    if (!videoDurationSeconds.value) return '--'
    return formatClock(videoDurationSeconds.value)
  })
  const analysisPreviewRecords = computed(() => captureRecords.value.slice(-6).reverse())

  function formatClock(totalSeconds: number) {
    const total = Math.max(0, Math.floor(totalSeconds))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function resetAnalysisState(keepVideo = true) {
    vibTestSeconds.value = 0
    vibDataCount.value = 0
    captureProgressPct.value = 0
    latestCaptureUrl.value = ''
    revokeLatestCaptureObjectUrl()
    captureOutputDir.value = ''
    exportOutputDir.value = ''
    captureRecords.value = []
    analysisSummary.value = null
    analysisCompleted.value = false
    sessionStarted.value = false
    isPaused.value = false
    liveLevel.value = '-- G'
    liveFreq.value = '-- Hz'
    liveAx.value = '--.-g'
    liveAy.value = '--.-g'
    liveAz.value = '--.-g'
    captureStatusText.value = keepVideo ? '视频已就绪，等待开始图像采集' : '请先上传 .wmv 试验视频'
    if (!keepVideo) {
      videoFileName.value = ''
      videoPath.value = ''
      videoDurationSeconds.value = 0
      videoUrl.value = ''
      backendProcessingRequired.value = false
    }
  }

  function revokeLatestCaptureObjectUrl() {
    if (!latestCaptureObjectUrl) return
    URL.revokeObjectURL(latestCaptureObjectUrl)
    latestCaptureObjectUrl = ''
  }

  function formatField(raw: string, value: number | null, unit: string) {
    return { raw, value, unit }
  }

  function updateLiveMetrics(record: VibrationCaptureRecord) {
    liveLevel.value = `${captureRecords.value.length} 张`
    liveFreq.value = `${sampleIntervalSeconds.value.toFixed(1)} 秒`
    liveAx.value = record.values.elapsedTime.raw || '--'
    liveAy.value = record.values.remainingTime.raw || '--'
    liveAz.value = '--'
  }


  function mapPythonRecord(item: any): VibrationCaptureRecord {
    return {
      timeSec: Number(item?.time_sec || 0),
      screenDetected: Boolean(item?.screen_detected),
      chartScreenshotUrl: item?.chart_screenshot ? convertFileSrc(String(item.chart_screenshot)) : '',
      values: {
        target: formatField(String(item?.values?.target?.raw ?? ''), Number(item?.values?.target?.value ?? 0) || null, String(item?.values?.target?.unit ?? '')),
        level: formatField(String(item?.values?.level?.raw ?? ''), Number(item?.values?.level?.value ?? 0) || null, String(item?.values?.level?.unit ?? '')),
        response: formatField(String(item?.values?.response?.raw ?? ''), Number(item?.values?.response?.value ?? 0) || null, String(item?.values?.response?.unit ?? '')),
        drive: formatField(String(item?.values?.drive?.raw ?? ''), Number(item?.values?.drive?.value ?? 0) || null, String(item?.values?.drive?.unit ?? '')),
        elapsedTime: formatField(String(item?.values?.elapsed_time?.raw ?? ''), Number(item?.values?.elapsed_time?.value ?? 0) || null, String(item?.values?.elapsed_time?.unit ?? '')),
        remainingTime: formatField(String(item?.values?.remaining_time?.raw ?? ''), Number(item?.values?.remaining_time?.value ?? 0) || null, String(item?.values?.remaining_time?.unit ?? '')),
      },
    }
  }

  function mapPythonSummary(summary: any): VibrationAnalysisSummary {
    return {
      sourceVideoName: String(summary?.source_video || videoFileName.value || '未命名视频'),
      sampleIntervalSeconds: Number(summary?.sample_interval_seconds ?? sampleIntervalSeconds.value),
      durationSeconds: Number(summary?.duration_seconds ?? 0),
      recordCount: Number(summary?.record_count ?? 0),
      screenDetectedCount: Number(summary?.screen_detected_count ?? 0),
      avgResponse: Number(summary?.avg_response ?? 0),
      maxDrive: Number(summary?.max_drive ?? 0),
      lastElapsedTime: String(summary?.last_elapsed_time || ''),
    }
  }

  function buildSummary(records: VibrationCaptureRecord[]): VibrationAnalysisSummary {
    const validResponses = records.map(item => Number(item.values.response.value || 0)).filter(value => Number.isFinite(value))
    const validDrives = records.map(item => Number(item.values.drive.value || 0)).filter(value => Number.isFinite(value))
    return {
      sourceVideoName: videoFileName.value || '未命名视频',
      sampleIntervalSeconds: sampleIntervalSeconds.value,
      durationSeconds: videoDurationSeconds.value || records[records.length - 1]?.timeSec || 0,
      recordCount: records.length,
      screenDetectedCount: records.filter(item => item.screenDetected).length,
      avgResponse: validResponses.length
        ? Number((validResponses.reduce((sum, value) => sum + value, 0) / validResponses.length).toFixed(2))
        : 0,
      maxDrive: validDrives.length ? Number(Math.max(...validDrives).toFixed(2)) : 0,
      lastElapsedTime: records.length ? records[records.length - 1].values.elapsedTime.raw : '--',
    }
  }

  function cleanupStreamListener() {
    if (!unlistenStream) return
    unlistenStream()
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

  async function syncCaptureResultFromOutputDir() {
    if (!captureOutputDir.value) return
    const result = await invoke<any>('get_vibration_capture_result', {
      outputDir: captureOutputDir.value,
    })
    captureOutputDir.value = String(result?.output_dir || captureOutputDir.value)
    const records = Array.isArray(result?.records) ? result.records.map(mapPythonRecord) : []
    captureRecords.value = records
    vibDataCount.value = records.length
    if (records.length) {
      const last = records[records.length - 1]
      const lastRawPath = String(result?.records?.[result.records.length - 1]?.chart_screenshot || '')
      if (lastRawPath) {
        await updateLatestCapturePreview(lastRawPath)
      }
      vibTestSeconds.value = Math.floor(last.timeSec || 0)
      updateLiveMetrics(last)
    }
    analysisSummary.value = mapPythonSummary(result?.summary || {})
    if (analysisSummary.value.durationSeconds) {
      videoDurationSeconds.value = analysisSummary.value.durationSeconds
    }
  }

  async function pollCaptureStatus() {
    if (!captureOutputDir.value) return
    const status = await invoke<any>('get_vibration_capture_status', {
      outputDir: captureOutputDir.value,
    })
    if (!status?.exists) return

    const current = Number(status?.current || 0)
    const total = Number(status?.total_targets || 0)
    const paused = Boolean(status?.paused)
    vibDataCount.value = current
    captureProgressPct.value = Number(status?.progress_pct || 0)
    if (status?.latest_screenshot) {
      await updateLatestCapturePreview(String(status.latest_screenshot))
    }
    vibTestSeconds.value = Math.floor(Number(status?.latest_time_sec || 0))
    captureStatusText.value = current
      ? paused ? `图像采集已暂停 (${current}/${total || current})` : `图像采集中 (${current}/${total || current})`
      : '正在初始化图像采集...'
    isPaused.value = paused
    isRunning.value = !paused && !Boolean(status?.complete) && current < (total || Number.MAX_SAFE_INTEGER)
    liveLevel.value = `${current} 张`
    liveFreq.value = `${sampleIntervalSeconds.value.toFixed(1)} 秒`
    liveAx.value = formatClock(Number(status?.latest_time_sec || 0))
    liveAy.value = total ? `${Math.max(0, total - current)} 张待采` : '--'
    liveAz.value = '--'

    if (status?.complete) {
      stopCapturePolling()
      await syncCaptureResultFromOutputDir()
      captureProgressPct.value = 100
      analysisCompleted.value = true
      isRunning.value = false
      isPaused.value = false
      captureStatusText.value = captureOutputDir.value
        ? `图像采集完成，已保存 ${vibDataCount.value} 张截图`
        : '图像采集完成'
      ElMessage.success(captureOutputDir.value ? `图像采集完成，截图已保存到 ${captureOutputDir.value}` : '图像采集完成')
    }
  }

  function startCapturePolling() {
    stopCapturePolling()
    capturePollTimer = window.setInterval(() => {
      void pollCaptureStatus().catch(() => undefined)
    }, 500)
  }

  function handleStreamEvent(payload: any) {
    const eventType = String(payload?.event || '')
    if (!eventType) return

    if (eventType === 'status') {
      captureStatusText.value = String(payload?.message || 'Python 脚本处理中...')
      return
    }

    if (eventType === 'start') {
      const duration = Number(payload?.duration_seconds || 0)
      if (duration > 0) {
        videoDurationSeconds.value = duration
      }
      captureProgressPct.value = 1
      isPaused.value = false
      captureStatusText.value = `Python 脚本已启动，共 ${Number(payload?.total_targets || 0)} 个采样点`
      return
    }

    if (eventType === 'sample') {
      return
    }

    if (eventType === 'complete') {
      analysisSummary.value = mapPythonSummary(payload?.summary || {})
      captureOutputDir.value = String(payload?.output_dir || payload?.screenshot_dir || '')
      if (analysisSummary.value.durationSeconds) {
        videoDurationSeconds.value = analysisSummary.value.durationSeconds
      }
      captureProgressPct.value = 100
      analysisCompleted.value = true
      isRunning.value = false
      isPaused.value = false
      stopCapturePolling()
      captureStatusText.value = captureOutputDir.value
        ? `图像采集完成，已保存 ${captureRecords.value.length} 张截图`
        : '图像采集完成，可结束试验并输出实验数据'
      ElMessage.success(captureOutputDir.value ? `图像采集完成，截图已保存到 ${captureOutputDir.value}` : '图像采集完成')
      return
    }

    if (eventType === 'paused') {
      isRunning.value = false
      isPaused.value = true
      stopCapturePolling()
      captureStatusText.value = String(payload?.message || '图像采集已暂停')
      return
    }

    if (eventType === 'stopped') {
      isRunning.value = false
      isPaused.value = false
      stopCapturePolling()
      captureStatusText.value = String(payload?.message || '图像采集已中止')
      return
    }

    if (eventType === 'error') {
      isRunning.value = false
      isPaused.value = false
      stopCapturePolling()
      captureStatusText.value = String(payload?.message || 'Python 脚本处理失败')
      ElMessage.error(captureStatusText.value)
    }
  }

  async function ensureStreamListener() {
    cleanupStreamListener()
    unlistenStream = await listen<any>('vibration-video-stream', (event) => {
      handleStreamEvent(event.payload)
    })
  }

  async function importVideoFile(selected: string) {
    resetAnalysisState(false)
    if (!selected.toLowerCase().endsWith('.wmv')) {
      captureStatusText.value = '仅支持上传 .wmv 格式试验视频'
      ElMessage.error(captureStatusText.value)
      return
    }
    videoPath.value = selected
    videoFileName.value = selected.split(/[\\/]/).pop() || selected
    videoUrl.value = ''
    liveFileName.value = `${options.getCurrentWorkOrder()?.id || '振动'}_${videoFileName.value.replace(/\.[^.]+$/, '')}_实验数据.csv`
    videoDurationSeconds.value = 0
    backendProcessingRequired.value = true
    captureStatusText.value = '.wmv 视频已选择，点击开始图像采集后将调用项目内 Python 脚本实时处理'
    ElMessage.success('.wmv 视频已选择，准备使用 Python 脚本实时处理')
  }

  async function selectVideoFile() {
    const selected = await open({
      title: '选择试验视频',
      multiple: false,
      directory: false,
      filters: [
        { name: 'WMV 视频文件', extensions: ['wmv'] },
      ],
    })
    if (!selected || typeof selected !== 'string') return
    await importVideoFile(selected)
  }

  function clearVideoFile() {
    isRunning.value = false
    isPaused.value = false
    stopCapturePolling()
    void invoke('stop_vibration_video_stream', { outputDir: captureOutputDir.value || null }).catch(() => undefined)
    resetAnalysisState(false)
  }

  function buildExportFolderName() {
    const orderId = options.getCurrentWorkOrder()?.id || '振动'
    const videoName = (videoFileName.value || 'capture').replace(/\.[^.]+$/, '')
    return `${orderId}_${videoName}_采集结果`
  }

  function startVibTestMonitor() {
    if (!videoPath.value) {
      captureStatusText.value = '请先上传 .wmv 试验视频后再开始采集'
      return
    }
    void (async () => {
      await ensureStreamListener()
      await initConfig()
      const configuredPythonPath = String(getConfigItem('flojoyPythonPath') || '').trim()
      resetAnalysisState(true)
      sessionStarted.value = true
      isRunning.value = true
      isPaused.value = false
      captureStatusText.value = '正在启动 Python 实时处理...'
      captureProgressPct.value = 1

      try {
        const startResult = await invoke<any>('start_vibration_video_stream', {
          pythonPath: configuredPythonPath || null,
          videoPath: videoPath.value,
          interval: sampleIntervalSeconds.value,
          outputDir: null,
          resume: false,
        })
        captureOutputDir.value = String(startResult?.output_dir || '')
        startCapturePolling()
        void pollCaptureStatus().catch(() => undefined)
      } catch (error) {
        captureStatusText.value = formatInvokeError(error, '视频采集失败')
        sessionStarted.value = false
        isRunning.value = false
        stopCapturePolling()
        ElMessage.error(captureStatusText.value)
      }
    })()
  }

  function formatInvokeError(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'string' && error.trim()) return error
    return fallback
  }

  function pauseVibTest() {
    if (!isRunning.value || !captureOutputDir.value) return
    isRunning.value = false
    isPaused.value = true
    stopCapturePolling()
    captureStatusText.value = '正在暂停图像采集...'
    void invoke('pause_vibration_video_stream', {
      outputDir: captureOutputDir.value,
    }).then(() => {
      captureStatusText.value = `图像采集已暂停，当前已采集 ${vibDataCount.value} 张`
    }).catch((error) => {
      isPaused.value = false
      captureStatusText.value = formatInvokeError(error, '暂停图像采集失败')
      ElMessage.error(captureStatusText.value)
    })
  }

  function resumeVibTest() {
    if (!sessionStarted.value || analysisCompleted.value) {
      startVibTestMonitor()
      return
    }
    if (!isPaused.value || !captureOutputDir.value) {
      captureStatusText.value = '当前采集正在运行，请等待本轮图像采集完成'
      return
    }
    void (async () => {
      await ensureStreamListener()
      await initConfig()
      const configuredPythonPath = String(getConfigItem('flojoyPythonPath') || '').trim()
      isRunning.value = true
      isPaused.value = false
      captureStatusText.value = '正在恢复图像采集...'
      try {
        await invoke('start_vibration_video_stream', {
          pythonPath: configuredPythonPath || null,
          videoPath: videoPath.value,
          interval: sampleIntervalSeconds.value,
          outputDir: captureOutputDir.value,
          resume: true,
        })
        startCapturePolling()
        void pollCaptureStatus().catch(() => undefined)
      } catch (error) {
        isRunning.value = false
        isPaused.value = true
        captureStatusText.value = formatInvokeError(error, '恢复图像采集失败')
        ElMessage.error(captureStatusText.value)
      }
    })()
  }

  function endVibTest() {
    if (isFinalizing.value) return
    void (async () => {
      const wasRunning = isRunning.value
      const wasPaused = isPaused.value
      const wasCompleted = analysisCompleted.value
      isFinalizing.value = true
      isRunning.value = false
      stopCapturePolling()
      try {
        if (wasRunning && captureOutputDir.value) {
          await invoke('pause_vibration_video_stream', { outputDir: captureOutputDir.value }).catch(() => undefined)
        } else if (wasRunning) {
          await invoke('stop_vibration_video_stream', { outputDir: null }).catch(() => undefined)
        }
        if (captureOutputDir.value) {
          await syncCaptureResultFromOutputDir()
        }
        analysisSummary.value = buildSummary(captureRecords.value)
      } catch (error) {
        isPaused.value = Boolean(captureOutputDir.value) && !wasCompleted
        captureStatusText.value = formatInvokeError(error, '读取采集结果失败，可继续采集或重新选择视频')
        ElMessage.error(captureStatusText.value)
        isFinalizing.value = false
        return
      }

      let selectedDir: string | string[] | null = null
      try {
        selectedDir = await open({
          title: '选择测试结束后的保存目录',
          directory: true,
          multiple: false,
          defaultPath: exportOutputDir.value || undefined,
        })
      } catch (error) {
        isPaused.value = Boolean(captureOutputDir.value) && !wasCompleted
        captureStatusText.value = formatInvokeError(error, '打开保存目录选择器失败，可继续采集或稍后重试')
        ElMessage.error(captureStatusText.value)
        isFinalizing.value = false
        return
      }
      if (!selectedDir || typeof selectedDir !== 'string') {
        isPaused.value = Boolean(captureOutputDir.value) && !wasCompleted
        captureStatusText.value = wasRunning || wasPaused || !wasCompleted
          ? '已取消选择保存目录，可继续采集、重新上传视频，或再次点击结束重新选择保存目录'
          : '已取消选择保存目录，可再次点击结束重新选择保存目录，或重新采集'
        isFinalizing.value = false
        return
      }

      try {
        const exportResult = await invoke<any>('export_vibration_capture_output', {
          sourceOutputDir: captureOutputDir.value,
          targetDir: selectedDir,
          folderName: buildExportFolderName(),
        })
        exportOutputDir.value = String(exportResult?.export_dir || selectedDir)
        captureStatusText.value = `测试结果已保存到 ${exportOutputDir.value}`
        ElMessage.success(`测试结果已保存到 ${exportOutputDir.value}`)
        options.onFinishToReport(exportOutputDir.value)
      } catch (error) {
        isPaused.value = Boolean(captureOutputDir.value) && !wasCompleted
        captureStatusText.value = formatInvokeError(error, '导出测试结果失败')
        ElMessage.error(captureStatusText.value)
      } finally {
        isFinalizing.value = false
      }
    })()
  }

  function confirmAbort() {
    showAbortWarning.value = false
    isRunning.value = false
    isPaused.value = false
    stopCapturePolling()
    void invoke('stop_vibration_video_stream', { outputDir: captureOutputDir.value || null }).catch(() => undefined)
    const exportDir = String(exportOutputDir.value || '').trim()
    if (options.getTestMode() === 'pre' || !exportDir) {
      options.onFinishToDashboard(1)
      return
    }
    options.onFinishToReport(exportDir)
  }

  function getOscCanvas() {
    return null
  }

  function getCsvContent() {
    const header = 'time_sec,elapsed_time,remaining_time,screen_detected,chart_screenshot\n'
    const rows = captureRecords.value
      .map(
        item =>
          [
            item.timeSec,
            item.values.elapsedTime.raw,
            item.values.remainingTime.raw,
            item.screenDetected ? 1 : 0,
            item.chartScreenshotUrl,
          ].join(',')
      )
      .join('\n')
    return header + rows
  }

  async function getLatestCaptureBlob() {
    if (!latestCaptureUrl.value) return null
    const response = await fetch(latestCaptureUrl.value)
    return await response.blob()
  }

  function getReportText() {
    const wo = options.getCurrentWorkOrder()
    const summary = analysisSummary.value
    return [
      '振动台试验结果汇总',
      `工单号: ${wo?.id || '-'}`,
      `设备名称: ${wo?.device || '-'}`,
      `视频文件: ${summary?.sourceVideoName || videoFileName.value || '-'}`,
      `视频时长: ${summary ? formatClock(summary.durationSeconds) : videoDurationText.value}`,
      `采样间隔: ${sampleIntervalSeconds.value} 秒`,
      `采集记录数: ${summary?.recordCount || captureRecords.value.length}`,
      `有效图像数: ${summary?.screenDetectedCount || captureRecords.value.filter(item => item.screenDetected).length}`,
      `最终历经时间: ${summary?.lastElapsedTime || '-'}`,
      `截图目录: ${captureOutputDir.value || '-'}`,
      `生成时间: ${new Date().toLocaleString()}`,
    ].join('\n')
  }

  function getAnalysisSummary() {
    return analysisSummary.value
  }

  onUnmounted(() => {
    revokeLatestCaptureObjectUrl()
    stopCapturePolling()
    cleanupStreamListener()
    void invoke('stop_vibration_video_stream', { outputDir: captureOutputDir.value || null }).catch(() => undefined)
    clearVideoFile()
  })

  return {
    vibTestSeconds,
    vibDataCount,
    isRunning,
    isPaused,
    isFinalizing,
    liveLevel,
    liveFreq,
    liveAx,
    liveAy,
    liveAz,
    liveFileName,
    showAbortWarning,
    formattedDuration,
    videoFileName,
    videoPath,
    videoUrl,
    videoReady,
    backendProcessingRequired,
    videoDurationText,
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
    selectVideoFile,
    importVideoFile,
    clearVideoFile,
    startVibTestMonitor,
    pauseVibTest,
    resumeVibTest,
    endVibTest,
    confirmAbort,
    getOscCanvas,
    getCsvContent,
    getLatestCaptureBlob,
    getReportText,
    getAnalysisSummary,
  }
}
