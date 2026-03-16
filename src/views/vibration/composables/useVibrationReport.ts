import { computed, ref } from 'vue'
import type { ReportFile, ReportFileId, WorkOrder } from '../types'

interface UseVibrationReportOptions {
  getCurrentWorkOrder: () => WorkOrder | null
  getOscCanvas: () => HTMLCanvasElement | null
}

export function useVibrationReport(options: UseVibrationReportOptions) {
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

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  async function saveCsv() {
    const header = 'timestamp,level,freq,ax,ay,az\n'
    const wo = options.getCurrentWorkOrder()
    const base = wo ? parseFloat(wo.level) : 8
    let rows = ''
    for (let i = 0; i < 30; i++) {
      const t = new Date(Date.now() - (30 - i) * 1000).toISOString()
      const phase = i / 5
      const lvl = (base * (0.9 + 0.12 * Math.sin(phase))).toFixed(2)
      const freq = (19.5 + 1.8 * Math.cos(phase)).toFixed(2)
      const ax = (base * 0.35 * (0.85 + 0.15 * Math.sin(phase * 1.1))).toFixed(3)
      const ay = (base * 0.28 * (0.85 + 0.15 * Math.cos(phase * 0.9))).toFixed(3)
      const az = (base * (0.88 + 0.18 * Math.sin(phase * 0.7))).toFixed(3)
      rows += `${t},${lvl},${freq},${ax},${ay},${az}\n`
    }
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' })
    downloadBlob('振动测试数据.csv', blob)
  }

  async function savePng() {
    const canvas = options.getOscCanvas()
    if (canvas) {
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res))
      if (blob) {
        downloadBlob('实时波形.png', blob)
        return
      }
    }
    const empty = new Blob([], { type: 'image/png' })
    downloadBlob('实时波形.png', empty)
  }

  async function saveDoc() {
    const wo = options.getCurrentWorkOrder()
    const content = `测试报告\n工单: ${wo?.id || '-'}\n设备: ${wo?.device || '-'}\n量级: ${wo?.level || '-'}\n时长: ${wo?.duration || '-'} 分钟\n生成时间: ${new Date().toLocaleString()}`
    const blob = new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    downloadBlob('测试报告.docx', blob)
  }

  function startFileGen() {
    if (fileGenRunning.value) return
    fileGenRunning.value = true
    setTimeout(() => { updateFileStatus('csv', '生成中...') }, 200)
    setTimeout(async () => { await saveCsv(); markFileDone('csv') }, 900)
    setTimeout(() => { updateFileStatus('png', '生成中...') }, 300)
    setTimeout(async () => { await savePng(); markFileDone('png') }, 1400)
    setTimeout(() => { updateFileStatus('doc', '生成中...') }, 500)
    setTimeout(async () => { await saveDoc(); markFileDone('doc'); fileGenRunning.value = false }, 2200)
  }

  return {
    reportFiles,
    fileGenRunning,
    allFilesDone,
    reportProgress,
    resetReportFiles,
    startFileGen,
  }
}
