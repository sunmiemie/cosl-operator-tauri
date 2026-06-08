import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { ReportFile, ReportFileId } from '../types'
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

export function useVibrationReport(options: UseVibrationReportOptions) {
  const exportDir = ref('')
  const reportFiles = ref<ReportFile[]>(createReportFiles())
  const fileGenRunning = ref(false)
  const allFilesDone = computed(() => reportFiles.value.every(f => f.done))
  const reportProgress = computed(() => {
    const total = reportFiles.value.length || 1
    const done = reportFiles.value.filter(f => f.done).length
    return Math.round((done / total) * 100)
  })

  function resetReportFiles() {
    reportFiles.value = createReportFiles()
    fileGenRunning.value = false
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
      {
        fieldName: 'report_file',
        fileName: 'report.txt',
        blob: new Blob([options.getReportText()], { type: 'text/plain;charset=utf-8' }),
      },
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

  function startFileGen() {
    if (fileGenRunning.value) return
    fileGenRunning.value = true
    void (async () => {
      try {
        ensureExportDir()
        updateFileStatus('screenshots', '已输出')
        updateFileStatus('json', '已输出')
        markFileDone('screenshots')
        markFileDone('json')
        await uploadPreExperimentIfNeeded()
        if (exportDir.value) ElMessage.success(`报告输出已保留 ${exportDir.value}`)
        options.onComplete?.()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        reportFiles.value.forEach(file => updateFileStatus(file.id, message))
      } finally {
        fileGenRunning.value = false
      }
    })()
  }

  return {
    reportFiles,
    fileGenRunning,
    allFilesDone,
    reportProgress,
    exportDir,
    setExportDir,
    resetReportFiles,
    startFileGen,
  }
}
