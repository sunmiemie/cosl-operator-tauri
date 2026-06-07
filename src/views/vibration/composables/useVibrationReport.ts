import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
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

export function useVibrationReport(options: UseVibrationReportOptions) {
  const exportDir = ref('')
  const reportFiles = ref<ReportFile[]>([
    { id: 'csv', name: '振动测试数据.csv', status: '待生成', done: false },
    { id: 'png', name: '实时波形.png', status: '待生成', done: false },
    { id: 'doc', name: '测试报告.docx', status: '待生成', done: false },
  ])
  const fileGenRunning = ref(false)
  const allFilesDone = computed(() => reportFiles.value.every(f => f.done))
  const reportProgress = computed(() => {
    const total = reportFiles.value.length
    const done = reportFiles.value.filter(f => f.done).length
    return Math.round((done / total) * 100)
  })

  function resetReportFiles() {
    reportFiles.value = [
      { id: 'csv', name: '振动测试数据.csv', status: '待生成', done: false },
      { id: 'png', name: '实时波形.png', status: '待生成', done: false },
      { id: 'doc', name: '测试报告.docx', status: '待生成', done: false },
    ]
    fileGenRunning.value = false
  }

  function updateFileStatus(id: ReportFileId, status: string) {
    const f = reportFiles.value.find(x => x.id === id)
    if (f) f.status = status
  }

  function markFileDone(id: ReportFileId) {
    const f = reportFiles.value.find(x => x.id === id)
    if (f) {
      f.status = '已生成 ✓'
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

  async function buildImageBytes() {
    const captureBlob = await options.getLatestCaptureBlob()
    if (captureBlob) {
      return Array.from(new Uint8Array(await captureBlob.arrayBuffer()))
    }
    const canvas = options.getOscCanvas()
    if (canvas) {
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res))
      if (blob) {
        return Array.from(new Uint8Array(await blob.arrayBuffer()))
      }
    }
    return []
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
        updateFileStatus('csv', '生成中...')
        updateFileStatus('png', '生成中...')
        updateFileStatus('doc', '生成中...')
        const imageBytes = await buildImageBytes()
        await invoke('write_vibration_report_files', {
          exportDir: exportDir.value,
          csvContent: options.getCsvContent(),
          reportText: options.getReportText(),
          imageBytes,
        })
        markFileDone('csv')
        markFileDone('png')
        markFileDone('doc')
        await uploadPreExperimentIfNeeded()
        if (exportDir.value) ElMessage.success(`报告文件已写入 ${exportDir.value}`)
        options.onComplete?.()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        updateFileStatus('csv', message)
        updateFileStatus('png', message)
        updateFileStatus('doc', message)
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
