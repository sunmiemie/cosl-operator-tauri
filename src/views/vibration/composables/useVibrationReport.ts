import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile, stat } from '@tauri-apps/plugin-fs'
import { useConfig } from '@/composables/useConfig'
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
  { id: 1, text: '确认第三方报告文件...', status: 'pending' },
  { id: 2, text: '整理测试结果到工单文件夹...', status: 'pending' },
  { id: 3, text: '备份报告到历史文件夹...', status: 'pending' },
  { id: 4, text: '上传工单全部文件到管理服务器...', status: 'pending' },
  { id: 5, text: '上传完成，进入关机检查...', status: 'pending' },
]

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

function getWordMimeType(fileName: string) {
  return fileName.toLowerCase().endsWith('.docx')
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/msword'
}

function formatFileSize(size: number) {
  if (!size) return '--'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function normalizeSharedReportDir(value: string) {
  return value.trim().replace(/^\\\\\s+/, '\\\\')
}

export function useVibrationReport(options: UseVibrationReportOptions) {
  const { initConfig, config } = useConfig()
  const exportDir = ref('')
  const reportFiles = ref<ReportFile[]>(createReportFiles())
  const reportProcessSteps = ref<ReportProcessStep[]>([])
  const fileGenRunning = ref(false)
  const reportProcessing = ref(false)
  const selectedThirdPartyReportPath = ref('')
  const selectedThirdPartyReportName = ref('')
  const selectedThirdPartyReportSize = ref(0)
  const selectedThirdPartyReportModifiedAt = ref('')
  const selectedThirdPartyReportBlob = ref<Blob | null>(null)

  const sharedReportDir = computed(() => normalizeSharedReportDir(String(config.value.vibrationSharedReportDir || '')))
  const thirdPartyReportReady = computed(() =>
    Boolean(selectedThirdPartyReportName.value && selectedThirdPartyReportBlob.value)
  )
  const selectedThirdPartyReportSizeText = computed(() =>
    formatFileSize(selectedThirdPartyReportSize.value)
  )
  const allFilesDone = computed(() => reportFiles.value.every(f => f.done))
  const reportReadyToProcess = computed(() =>
    !fileGenRunning.value
    && !reportProcessing.value
    && thirdPartyReportReady.value
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
    clearThirdPartyReport()
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

  function clearThirdPartyReport() {
    selectedThirdPartyReportPath.value = ''
    selectedThirdPartyReportName.value = ''
    selectedThirdPartyReportSize.value = 0
    selectedThirdPartyReportModifiedAt.value = ''
    selectedThirdPartyReportBlob.value = null
  }

  async function ensureSharedReportDirAccessible(dir: string) {
    if (!dir) return true
    try {
      const info = await stat(dir)
      if (!info.isDirectory) {
        ElMessage.warning(`振动台共享报告路径不是文件夹：${dir}`)
        return false
      }
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ElMessage.warning(`无法访问振动台共享报告文件夹：${dir}。请检查路径、网络连接和 Windows 共享凭据。${message}`)
      return false
    }
  }

  async function selectThirdPartyReport() {
    await initConfig()
    try {
      const defaultSharedReportDir = sharedReportDir.value
      if (!(await ensureSharedReportDirAccessible(defaultSharedReportDir))) return

      const selected = await open({
        title: '选择振动台第三方报告',
        multiple: false,
        directory: false,
        defaultPath: defaultSharedReportDir || undefined,
        filters: [
          { name: 'Word 报告文件', extensions: ['doc', 'docx'] },
        ],
      })
      if (!selected || typeof selected !== 'string') return

      if (!/\.(doc|docx)$/i.test(selected)) {
        ElMessage.error('请选择 .doc 或 .docx 格式的第三方报告')
        return
      }

      const info = await stat(selected)
      if (!info.isFile) {
        ElMessage.error('请选择第三方报告文件，而不是文件夹')
        return
      }

      const bytes = await readFile(selected)
      const fileName = getFileName(selected)
      selectedThirdPartyReportPath.value = selected
      selectedThirdPartyReportName.value = fileName
      selectedThirdPartyReportSize.value = info.size || bytes.byteLength
      selectedThirdPartyReportModifiedAt.value = info.mtime ? info.mtime.toLocaleString() : ''
      selectedThirdPartyReportBlob.value = new Blob([bytes], { type: getWordMimeType(fileName) })
      ElMessage.success(`已选择第三方报告：${fileName}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ElMessage.error(`读取第三方报告失败：${message}`)
    }
  }

  async function getThirdPartyReportUploadFile(): Promise<VibrationTablePreExperimentUploadFile> {
    if (!thirdPartyReportReady.value || !selectedThirdPartyReportBlob.value) {
      throw new Error('请先从共享文件夹选择第三方报告文件')
    }
    return {
      fieldName: 'report_file',
      fileName: selectedThirdPartyReportName.value,
      blob: selectedThirdPartyReportBlob.value,
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
      await getThirdPartyReportUploadFile(),
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
    if (!thirdPartyReportReady.value) {
      ElMessage.warning('请先从共享文件夹选择第三方报告文件')
      return
    }

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
    selectedThirdPartyReportPath,
    selectedThirdPartyReportName,
    selectedThirdPartyReportSize,
    selectedThirdPartyReportSizeText,
    selectedThirdPartyReportModifiedAt,
    thirdPartyReportReady,
    exportDir,
    setExportDir,
    resetReportFiles,
    selectThirdPartyReport,
    clearThirdPartyReport,
    processReport,
  }
}
