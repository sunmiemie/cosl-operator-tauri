import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { ReportFile, ReportFileId, ReportProcessStep } from '../types'
import {
  createVibrationTablePreExperiment,
  type VibrationTablePreExperimentPayload,
  type VibrationTablePreExperimentUploadFile,
} from '@/services/vibration-table-report-api'

interface UseVibrationReportOptions {
  getOscCanvas: () => HTMLCanvasElement | null
  getCsvContent: () => string
  getLatestCaptureBlob: () => Promise<Blob | null>
  getReportText: () => string
  getTestMode?: () => 'formal' | 'pre'
  ensureAuth?: () => Promise<boolean>
  getAuthHeaders?: () => Record<string, string>
  getPreExperimentPayload?: (exportDir: string) => VibrationTablePreExperimentPayload | null
  onComplete?: () => void
}

const createReportFiles = (): ReportFile[] => [
  { id: 'screenshots', name: 'chart_screenshots', status: '待确认', done: false },
  { id: 'json', name: 'top_readings_0.5s.json', status: '待确认', done: false },
]

const createReportProcessSteps = (): ReportProcessStep[] => [
  { id: 1, text: '从共享文件夹同步报告文件...', status: 'pending' },
  { id: 2, text: '整理测试结果到工单文件夹...', status: 'pending' },
  { id: 3, text: '备份报告到历史文件夹...', status: 'pending' },
  { id: 4, text: '上传工单全部文件到管理服务器...', status: 'pending' },
  { id: 5, text: '上传完成，进入关机检查...', status: 'pending' },
]

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

export function useVibrationReport(options: UseVibrationReportOptions) {
  const exportDir = ref('')
  const reportFiles = ref<ReportFile[]>(createReportFiles())
  const reportProcessSteps = ref<ReportProcessStep[]>([])
  const fileGenRunning = ref(false)
  const reportProcessing = ref(false)

  const allFilesDone = computed(() => reportFiles.value.every(f => f.done))
  const reportReadyToProcess = computed(() =>
    !fileGenRunning.value
    && !reportProcessing.value
  )
  const reportProgress = computed(() => {
    const total = reportFiles.value.length || 1
    const done = reportFiles.value.filter(f => f.done).length
    return Math.round((done / total) * 100)
  })

  function resetReportFiles() {
    reportFiles.value = createReportFiles()
    reportProcessSteps.value = []
    fileGenRunning.value = false
    reportProcessing.value = false
  }

  function updateFileStatus(id: ReportFileId, status: string) {
    const f = reportFiles.value.find(x => x.id === id)
    if (f) f.status = status
  }

  function markFileDone(id: ReportFileId) {
    const f = reportFiles.value.find(x => x.id === id)
    if (f) {
      f.status = '已保留 ✓'
      f.done = true
    }
  }

  function setExportDir(dir: string) {
    exportDir.value = dir
  }

  function ensureExportDir() {
    if (!exportDir.value) {
      throw new Error('未设置测试结果保存目录')
    }
  }

  function setReportStepStatus(index: number, status: ReportProcessStep['status']) {
    reportProcessSteps.value = reportProcessSteps.value.map((step, stepIndex) =>
      stepIndex === index ? { ...step, status } : step
    )
  }

  async function getReportUploadFile(): Promise<VibrationTablePreExperimentUploadFile> {
    return {
      fieldName: 'report_file',
      fileName: 'report.txt',
      blob: new Blob([options.getReportText()], { type: 'text/plain;charset=utf-8' }),
    }
  }

  async function uploadPreExperimentIfNeeded() {
    if (options.getTestMode?.() !== 'pre') return
    if (!options.getPreExperimentPayload) return

    const authOk = options.ensureAuth ? await options.ensureAuth() : true
    if (!authOk) {
      throw new Error('未登录或登录已失效，无法上传预实验数据')
    }

    const payload = options.getPreExperimentPayload(exportDir.value)
    if (!payload) {
      throw new Error('未找到振动台工单ID，无法上传预实验数据')
    }

    const files: VibrationTablePreExperimentUploadFile[] = [
      {
        fieldName: 'csv_file',
        fileName: 'experiment.csv',
        blob: new Blob([options.getCsvContent()], { type: 'text/csv;charset=utf-8' }),
      },
      await getReportUploadFile(),
    ]

    const captureBlob = await options.getLatestCaptureBlob()
    if (captureBlob) {
      files.push({
        fieldName: 'capture_image',
        fileName: 'capture.jpg',
        blob: captureBlob,
      })
    }

    const res = await createVibrationTablePreExperiment(
      payload,
      files,
      options.getAuthHeaders?.()
    )
    if (!res.success || !res.data || res.data.code !== 0) {
      throw new Error(res.data?.msg || res.error || '预实验数据上传失败')
    }
    const label = res.data.data?.experiment_no ? `第 ${res.data.data.experiment_no} 次` : ''
    ElMessage.success(`预实验数据已上传管理端${label ? `（${label}预实验）` : ''}`)
  }

  async function finalizeReportOutput() {
    ensureExportDir()
    updateFileStatus('screenshots', '已输出')
    updateFileStatus('json', '已输出')
    markFileDone('screenshots')
    markFileDone('json')
    await uploadPreExperimentIfNeeded()
    if (exportDir.value) ElMessage.success(`报告输出已保留 ${exportDir.value}`)
  }

  async function runReportProcess() {
    reportProcessSteps.value = createReportProcessSteps()

    for (let index = 0; index < reportProcessSteps.value.length; index += 1) {
      setReportStepStatus(index, 'active')
      if (index === 3) {
        await finalizeReportOutput()
      } else {
        await wait(260)
      }
      setReportStepStatus(index, 'done')
    }
  }

  function processReport() {
    if (reportProcessing.value || fileGenRunning.value) return

    reportProcessing.value = true
    fileGenRunning.value = true
    void (async () => {
      try {
        await runReportProcess()
        ElMessage.success('报告上传成功，进入关机检查')
        options.onComplete?.()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        reportFiles.value.forEach(file => updateFileStatus(file.id, message))
      } finally {
        reportProcessing.value = false
        fileGenRunning.value = false
      }
    })()
  }

  return {
    reportFiles,
    reportProcessSteps,
    fileGenRunning,
    reportProcessing,
    reportReadyToProcess,
    allFilesDone,
    reportProgress,
    exportDir,
    setExportDir,
    resetReportFiles,
    processReport,
  }
}
