/** HALT-HASS 逐目标板报告生成、持久化和幂等上传。 */
import { computed, ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type {
  HaltHassBoardConclusion,
  HaltHassOrder,
  HaltHassPassResult,
  HaltHassRectifierReportData,
  HaltHassReportJson,
  HaltHassTestSession,
  NodeRunResult,
  ScannedBoard,
} from '@/views/halt-hass-test/types'
import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'
import { TEST_RESULT } from '@/views/halt-hass-test/types'
import { buildReportJson, uploadReport } from '@/services/halt-hass-order'
import { useAuth } from '@/composables/useAuth'
import {
  loadPendingHaltHassReports,
  mergePendingHaltHassReports,
  removePendingHaltHassReport,
  savePendingHaltHassReports,
  updatePendingHaltHassReportError,
  type PendingHaltHassBoardReport,
} from '../utils/pendingReports'
import { generateHaltHassReportCharts } from '../utils/reportCharts'
import { normalizeHaltHassReportCurrentsToMa } from '../utils/reportCurrentUnits'

export type HaltHassReportStage = 'editing' | 'review'
export type HaltHassEditableRecordField =
  | 'interfaceBoard'
  | 'controlBoard'
  | 'storageBoard'
  | 'pulserSummary'
export type HaltHassEditableRecordStatus = '正常' | '异常'

export function useHaltHassReport() {
  const { userInfo } = useAuth()
  const reportJson = ref<HaltHassReportJson | null>(null)
  const reportJobs = ref<PendingHaltHassBoardReport[]>([])
  const testResult = ref<number>(TEST_RESULT.NORMAL)
  const remark = ref('')
  const isUploading = ref(false)
  const uploadProgress = ref(0)
  const uploadError = ref('')
  const uploadedReportId = ref<number | null>(null)
  const uploadedCount = ref(0)
  const activeReportIndex = ref(0)
  const reportStage = ref<HaltHassReportStage>('editing')
  const reviewConfirmed = ref(false)

  const hasReport = computed(() => reportJobs.value.length > 0)
  const completedReportCount = computed(() => (
    reportJobs.value.filter(job => job.testerReviewed).length
  ))
  const allReportsCompleted = computed(() => (
    reportJobs.value.length > 0 && completedReportCount.value === reportJobs.value.length
  ))
  const canUploadReports = computed(() => (
    reportJobs.value.length > 0
    && reportJobs.value.every(job => (
      job.testerReviewed === true
      && job.testerReviewConfirmed === true
      && (job.result === TEST_RESULT.NORMAL || job.result === TEST_RESULT.ABNORMAL)
    ))
  ))
  const resultText = computed(() => ({
    [TEST_RESULT.NORMAL]: '正常',
    [TEST_RESULT.ABNORMAL]: '异常',
  }[testResult.value] || '未知'))
  const flowchartSummary = computed(() => {
    if (!reportJson.value) return null
    const value = reportJson.value.flowchartResult
    return {
      total: value.totalNodes,
      success: value.successNodes,
      failed: value.failedNodes,
      successRate: value.totalNodes > 0 ? Math.round(value.successNodes / value.totalNodes * 100) : 0,
    }
  })

  function persistJobs(): void {
    const otherSessions = loadPendingHaltHassReports().filter(item => (
      !reportJobs.value.some(job => job.clientSubmitId === item.clientSubmitId)
    ))
    savePendingHaltHassReports([...otherSessions, ...reportJobs.value])
  }

  function syncActiveReport(): void {
    const job = reportJobs.value[activeReportIndex.value]
    reportJson.value = job?.reportJson || null
    if (!job) return
    testResult.value = job.result
    remark.value = job.remark
  }

  function writeTesterReview(job: PendingHaltHassBoardReport, confirmedAt?: string): void {
    job.reportJson.testerReview = {
      finalResult: job.result === TEST_RESULT.ABNORMAL
        ? TEST_RESULT.ABNORMAL
        : TEST_RESULT.NORMAL,
      completed: job.testerReviewed === true,
      confirmed: job.testerReviewConfirmed === true,
      ...(confirmedAt ? { confirmedAt } : {}),
    }
  }

  function invalidateFinalReview(job: PendingHaltHassBoardReport): void {
    job.testerReviewed = false
    reportJobs.value.forEach((item) => {
      item.testerReviewConfirmed = false
      writeTesterReview(item)
    })
    reviewConfirmed.value = false
    reportStage.value = 'editing'
    writeTesterReview(job)
  }

  function selectReport(index: number): void {
    if (index < 0 || index >= reportJobs.value.length) return
    activeReportIndex.value = index
    syncActiveReport()
  }

  function updateActiveResult(result: number): void {
    if (result !== TEST_RESULT.NORMAL && result !== TEST_RESULT.ABNORMAL) return
    const job = reportJobs.value[activeReportIndex.value]
    if (!job || job.result === result) return
    job.result = result
    invalidateFinalReview(job)
    syncActiveReport()
    persistJobs()
  }

  function updateActiveRecordStatus(
    recordIndex: number,
    field: HaltHassEditableRecordField,
    status: HaltHassEditableRecordStatus,
  ): void {
    const activeRecord = reportJobs.value[activeReportIndex.value]
      ?.reportJson.periodicRecords?.[recordIndex]
    if (!activeRecord || !['正常', '异常'].includes(status)) return
    if (field !== 'pulserSummary' && activeRecord.communications[field] === '不适用') return
    if ((field === 'pulserSummary' ? activeRecord.pulserSummary : activeRecord.communications[field]) === status) return

    // 通信和脉冲器判断属于同一场次的公共采点结果，修正后同步到本场次的每份逐板报告。
    reportJobs.value.forEach((job) => {
      const record = job.reportJson.periodicRecords?.[recordIndex]
      if (record) {
        if (field === 'pulserSummary') record.pulserSummary = status
        else if (record.communications[field] !== '不适用') record.communications[field] = status
      }
      const nestedRecords = job.reportJson.testData?.periodicRecords
      if (Array.isArray(nestedRecords)) {
        const nested = nestedRecords[recordIndex] as typeof record | undefined
        if (nested) {
          if (field === 'pulserSummary') nested.pulserSummary = status
          else if (nested.communications?.[field] !== '不适用') nested.communications[field] = status
        }
      }
      job.testerReviewed = false
      job.testerReviewConfirmed = false
      writeTesterReview(job)
    })
    reviewConfirmed.value = false
    reportStage.value = 'editing'
    syncActiveReport()
    persistJobs()
  }

  function updateActiveRectifierRecordStatus(
    stageIndex: number,
    voltageStepIndex: number,
    loadStage: 'halfLoad' | 'fullLoad',
    output: '48v' | '90v',
    status: HaltHassPassResult,
  ): void {
    if (!['合格', '不合格'].includes(status)) return
    const now = new Date().toISOString()
    reportJobs.value.forEach((job) => {
      const record = job.reportJson.rectifierReport?.stages[stageIndex]
        ?.voltageSteps[voltageStepIndex]?.[loadStage]
      const review = output === '48v' ? record?.output48Result : record?.output90Result
      if (!review || review.result === status) return
      review.result = status
      review.modifiedBy = userInfo.value?.id
      review.modifiedAt = now
      job.testerReviewed = false
      job.testerReviewConfirmed = false
      writeTesterReview(job)
    })
    reviewConfirmed.value = false
    reportStage.value = 'editing'
    syncActiveReport()
    persistJobs()
  }

  function updateActiveBoardConclusion(boardIndex: number, status: HaltHassPassResult): void {
    if (!['合格', '不合格'].includes(status)) return
    const now = new Date().toISOString()
    reportJobs.value.forEach((job) => {
      const conclusion = job.reportJson.rectifierReport?.boardConclusions[boardIndex]
      if (!conclusion || conclusion.result === status) return
      conclusion.result = status
      conclusion.modifiedBy = userInfo.value?.id
      conclusion.modifiedAt = now
      job.testerReviewed = false
      job.testerReviewConfirmed = false
      writeTesterReview(job)
    })
    reviewConfirmed.value = false
    reportStage.value = 'editing'
    syncActiveReport()
    persistJobs()
  }

  function completeActiveReport(): boolean {
    const job = reportJobs.value[activeReportIndex.value]
    if (!job || (job.result !== TEST_RESULT.NORMAL && job.result !== TEST_RESULT.ABNORMAL)) {
      uploadError.value = '请选择当前报告的最终测试结论'
      return false
    }
    job.testerReviewed = true
    job.testerReviewConfirmed = false
    writeTesterReview(job)
    reviewConfirmed.value = false
    persistJobs()

    let nextIndex = reportJobs.value.findIndex((item, index) => (
      index > activeReportIndex.value && !item.testerReviewed
    ))
    if (nextIndex < 0) {
      nextIndex = reportJobs.value.findIndex((item, index) => (
        index < activeReportIndex.value && !item.testerReviewed
      ))
    }
    if (nextIndex >= 0) {
      selectReport(nextIndex)
    } else if (allReportsCompleted.value) {
      reportStage.value = 'review'
    }
    return true
  }

  function enterReportReview(): boolean {
    if (!allReportsCompleted.value) {
      uploadError.value = `还有 ${reportJobs.value.length - completedReportCount.value} 份报告未完成复核`
      return false
    }
    reportStage.value = 'review'
    reviewConfirmed.value = reportJobs.value.every(job => job.testerReviewConfirmed === true)
    uploadError.value = ''
    return true
  }

  function editReportFromReview(index: number): void {
    reportStage.value = 'editing'
    reviewConfirmed.value = false
    selectReport(index)
  }

  function setReviewConfirmed(confirmed: boolean): boolean {
    if (confirmed && !allReportsCompleted.value) return false
    reviewConfirmed.value = confirmed
    const confirmedAt = confirmed ? new Date().toISOString() : undefined
    reportJobs.value.forEach((job) => {
      job.testerReviewConfirmed = confirmed
      writeTesterReview(job, confirmedAt)
    })
    persistJobs()
    return true
  }

  function generateReport(params: {
    order: HaltHassOrder
    session: HaltHassTestSession
    process: HaltHassProcessJson
    boards: ScannedBoard[]
    startTime: Date
    endTime: Date
    nodeResults: NodeRunResult[]
    testData?: Record<string, unknown>
  }): void {
    const { order, session, process, boards, startTime, endTime, nodeResults, testData } = params
    const totalNodes = nodeResults.length
    const successNodes = nodeResults.filter(item => item.status === 'success').length
    const failedNodes = nodeResults.filter(item => item.status === 'error').length
    const periodicRecords: NonNullable<HaltHassReportJson['periodicRecords']> = Array.isArray(testData?.periodicRecords)
      ? testData.periodicRecords as NonNullable<HaltHassReportJson['periodicRecords']>
      : []
    const periodicAbnormal = periodicRecords.some(record => (
      record.pulserSummary === '异常'
      || Object.values(record.communications).includes('异常')
      || record.missingReasons.length > 0
    ))
    const reportType = process.metadata.reportType || 'drive_control'
    const suppliedRectifierReport = testData?.rectifierReport as HaltHassRectifierReportData | undefined
    const rectifierAbnormal = suppliedRectifierReport?.stages.some(stage => (
      stage.voltageSteps.some(step => (
        step.halfLoad.output48Result.result === '不合格'
        || step.halfLoad.output90Result.result === '不合格'
        || step.fullLoad.output48Result.result === '不合格'
        || step.fullLoad.output90Result.result === '不合格'
        || step.halfLoad.missingReasons.length > 0
        || step.fullLoad.missingReasons.length > 0
      ))
    )) ?? false
    testResult.value = failedNodes > 0 || (
      reportType === 'rectifier_regulator' ? rectifierAbnormal : periodicAbnormal
    )
      ? TEST_RESULT.ABNORMAL
      : TEST_RESULT.NORMAL

    const failedNodeNames = nodeResults
      .filter(item => item.status === 'error')
      .map(item => item.nodeName || item.nodeId)
    const recordReasons = reportType === 'rectifier_regulator'
      ? (suppliedRectifierReport?.stages || []).flatMap(stage => (
          stage.voltageSteps.flatMap(step => [
            ...step.halfLoad.missingReasons,
            ...step.fullLoad.missingReasons,
          ])
        ))
      : periodicRecords.flatMap(record => record.missingReasons)
    const generatedReasons = [...new Set([...failedNodeNames, ...recordReasons])]
    remark.value = generatedReasons.length
      ? `程序初始判断异常：${generatedReasons.join('；')}`
      : reportType === 'rectifier_regulator'
        ? '程序初始判断正常：各温度阶段的输入电压、半载和满载记录均在参考范围内。'
        : '程序初始判断正常：测试流、循环流及三分钟记录未发现异常。'

    const scannedBoardMap = new Map<string, ScannedBoard>()
    boards.forEach((board) => {
      const key = board.serial.trim().toUpperCase()
      if (key) scannedBoardMap.set(key, { ...board })
    })
    session.boards.forEach((board) => {
      const key = board.serial.trim().toUpperCase()
      if (!key || scannedBoardMap.has(key)) return
      scannedBoardMap.set(key, {
        serial: board.serial,
        targetBoardId: board.targetBoardId ?? undefined,
        orderId: board.orderId ?? undefined,
        role: board.role,
        slotNo: board.slotNo,
        boardModelId: board.boardModelId,
        boardModelName: board.boardModelName,
        boardModelCode: board.boardModelCode,
        scannedAt: board.joinedAt ? new Date(board.joinedAt) : startTime,
      })
    })
    const scannedBoardSnapshot = [...scannedBoardMap.values()]
      .sort((left, right) => (left.slotNo ?? 999) - (right.slotNo ?? 999))
    const targetBoardCount = scannedBoardSnapshot.filter(board => board.role === 'target').length
    const chartSummary = testData?.chartSummary as HaltHassReportJson['chartSummary']
    const defaultBoardResult: HaltHassPassResult = testResult.value === TEST_RESULT.ABNORMAL
      ? '不合格'
      : '合格'
    const boardConclusions: HaltHassBoardConclusion[] = (
      suppliedRectifierReport?.boardConclusions?.length
        ? suppliedRectifierReport.boardConclusions
        : scannedBoardSnapshot.map((board, index) => ({
            serial: board.serial,
            boardModelId: board.boardModelId,
            boardModelName: board.boardModelName || '',
            boardModelCode: board.boardModelCode,
            role: (board.role === 'companion' ? 'companion' : 'target') as 'target' | 'companion',
            slotNo: board.slotNo ?? index + 1,
            originalResult: defaultBoardResult,
            result: defaultBoardResult,
          }))
    ).map(item => ({ ...item }))
    const rectifierReport: HaltHassRectifierReportData | undefined = reportType === 'rectifier_regulator'
      ? {
          currentUnit: 'A',
          stages: (suppliedRectifierReport?.stages || []).map(stage => ({
            ...stage,
            voltageSteps: stage.voltageSteps.map(step => ({
              ...step,
              halfLoad: { ...step.halfLoad, missingReasons: [...step.halfLoad.missingReasons] },
              fullLoad: { ...step.fullLoad, missingReasons: [...step.fullLoad.missingReasons] },
            })),
          })),
          boardConclusions,
        }
      : undefined

    const jobs = session.boards
      .filter(board => board.role === 'target' && board.targetBoardId && board.orderId)
      .map((target) => {
        const selected = boards.find(board => board.targetBoardId === target.targetBoardId)
        const orderNo = selected?.orderNo || order.orderNo
        const json = buildReportJson({
          orderId: Number(target.orderId),
          orderNo,
          boards: scannedBoardSnapshot,
          startTime,
          endTime,
          flowchartResult: {
            nodes: nodeResults,
            nodeResults,
            totalNodes,
            successNodes,
            failedNodes,
          },
          testData,
          remark: remark.value,
        })
        json.sessionId = session.id
        json.sessionNo = session.sessionNo
        json.targetBoardId = Number(target.targetBoardId)
        json.targetSerial = target.serial
        json.boardModelName = target.boardModelName
        json.scannedBoardSummary = {
          scannedBoardCount: scannedBoardSnapshot.length,
          testedTargetBoardCount: targetBoardCount,
          nonTargetBoardCount: scannedBoardSnapshot.length - targetBoardCount,
          boards: scannedBoardSnapshot,
        }
        json.reportSubject = {
          targetBoardId: Number(target.targetBoardId),
          targetSerial: target.serial,
          targetBoardModel: target.boardModelName,
        }
        json.reportType = reportType
        json.currentUnit = reportType === 'rectifier_regulator' ? 'A' : 'mA'
        json.rectifierReport = rectifierReport
        const reportRecords = periodicRecords.map(record => ({
          ...record,
          communications: { ...record.communications },
          missingReasons: [...record.missingReasons],
        }))
        json.periodicRecords = reportRecords
        json.testData = {
          ...(json.testData || {}),
          periodicRecords: reportRecords,
        }
        json.chartSummary = chartSummary
        json.testerReview = {
          finalResult: testResult.value === TEST_RESULT.ABNORMAL
            ? TEST_RESULT.ABNORMAL
            : TEST_RESULT.NORMAL,
          completed: false,
          confirmed: false,
        }
        return {
          clientSubmitId: uuidv4(),
          sessionId: session.id,
          targetBoardId: Number(target.targetBoardId),
          orderId: Number(target.orderId),
          reportJson: normalizeHaltHassReportCurrentsToMa(json),
          result: testResult.value,
          remark: remark.value,
          testerReviewed: false,
          testerReviewConfirmed: false,
          createdAt: new Date().toISOString(),
        } satisfies PendingHaltHassBoardReport
      })

    reportJobs.value = jobs
    activeReportIndex.value = 0
    reportStage.value = 'editing'
    reviewConfirmed.value = false
    syncActiveReport()
    mergePendingHaltHassReports(jobs)
    uploadedCount.value = 0
    uploadedReportId.value = null
  }

  async function uploadJobs(jobs: PendingHaltHassBoardReport[]): Promise<boolean> {
    if (!userInfo.value) {
      uploadError.value = '用户信息不存在'
      return false
    }
    if (!jobs.length) {
      uploadError.value = '没有待上传的逐板报告'
      return false
    }
    if (jobs.some(job => (
      job.testerReviewed !== true
      || job.testerReviewConfirmed !== true
      || (job.result !== TEST_RESULT.NORMAL && job.result !== TEST_RESULT.ABNORMAL)
    ))) {
      uploadError.value = '请先逐份复核报告，并确认全部报告审核无误'
      return false
    }

    isUploading.value = true
    uploadProgress.value = 0
    uploadError.value = ''
    uploadedCount.value = 0
    for (let index = 0; index < jobs.length; index++) {
      const job = jobs[index]
      job.reportJson = normalizeHaltHassReportCurrentsToMa(job.reportJson)
      let chartFiles
      try {
        chartFiles = await generateHaltHassReportCharts(job.reportJson)
        job.reportJson.chartImages = chartFiles.map(file => file.metadata)
        persistJobs()
      } catch (error) {
        const message = `目标板 ${job.reportJson.targetSerial || job.targetBoardId} 曲线图片生成失败：${error instanceof Error ? error.message : String(error)}`
        updatePendingHaltHassReportError(job.clientSubmitId, message)
        uploadError.value = message
        isUploading.value = false
        return false
      }
      const result = await uploadReport({
        orderId: job.orderId,
        sessionId: job.sessionId,
        targetBoardId: job.targetBoardId,
        clientSubmitId: job.clientSubmitId,
        reportJson: job.reportJson,
        result: job.result,
        operatorId: userInfo.value.id,
        remark: job.remark,
        chartFiles,
      })
      if (!result.success) {
        const message = result.error || `目标板 ${job.reportJson.targetSerial || job.targetBoardId} 上传失败`
        updatePendingHaltHassReportError(job.clientSubmitId, message)
        uploadError.value = message
        isUploading.value = false
        return false
      }
      removePendingHaltHassReport(job.clientSubmitId)
      uploadedReportId.value = result.data?.id ?? uploadedReportId.value
      uploadedCount.value++
      uploadProgress.value = Math.round((index + 1) / jobs.length * 100)
    }
    reportJobs.value = []
    uploadProgress.value = 100
    isUploading.value = false
    return true
  }

  async function upload(): Promise<boolean> {
    return uploadJobs(reportJobs.value)
  }

  async function retryPending(): Promise<boolean> {
    const reviewed = loadPendingHaltHassReports().filter(job => (
      job.testerReviewed === true && job.testerReviewConfirmed === true
    ))
    if (!reviewed.length) return true
    return uploadJobs(reviewed)
  }

  function restorePendingForSession(sessionId: number): number {
    reportJobs.value = loadPendingHaltHassReports()
      .filter(item => item.sessionId === sessionId)
      .map(item => ({
        ...item,
        reportJson: normalizeHaltHassReportCurrentsToMa(item.reportJson),
      }))
    activeReportIndex.value = Math.max(0, reportJobs.value.findIndex(job => !job.testerReviewed))
    reportStage.value = reportJobs.value.length > 0 && reportJobs.value.every(job => job.testerReviewed)
      ? 'review'
      : 'editing'
    reviewConfirmed.value = reportJobs.value.length > 0
      && reportJobs.value.every(job => job.testerReviewConfirmed)
    syncActiveReport()
    return reportJobs.value.length
  }

  function reset(): void {
    reportJson.value = null
    reportJobs.value = []
    testResult.value = TEST_RESULT.NORMAL
    remark.value = ''
    isUploading.value = false
    uploadProgress.value = 0
    uploadError.value = ''
    uploadedReportId.value = null
    uploadedCount.value = 0
    activeReportIndex.value = 0
    reportStage.value = 'editing'
    reviewConfirmed.value = false
  }

  function getPreviewData() {
    if (!reportJson.value) return null
    const duration = reportJson.value.duration
    const hours = Math.floor(duration / 3600)
    const minutes = Math.floor((duration % 3600) / 60)
    const seconds = duration % 60
    return {
      orderNo: reportJson.value.orderNo,
      duration: hours > 0 ? `${hours}时${minutes}分${seconds}秒` : minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`,
      boardCount: reportJobs.value.length || 1,
      result: resultText.value,
      summary: {
        total: reportJson.value.flowchartResult.totalNodes,
        success: reportJson.value.flowchartResult.successNodes,
        failed: reportJson.value.flowchartResult.failedNodes,
      },
    }
  }

  return {
    reportJson, reportJobs, testResult, remark, isUploading, uploadProgress, uploadError,
    uploadedReportId, uploadedCount, activeReportIndex, reportStage, reviewConfirmed,
    completedReportCount, allReportsCompleted, canUploadReports,
    hasReport, resultText, flowchartSummary,
    generateReport, upload, retryPending, restorePendingForSession,
    selectReport, updateActiveResult, updateActiveRecordStatus,
    updateActiveRectifierRecordStatus, updateActiveBoardConclusion,
    completeActiveReport, enterReportReview, editReportFromReview, setReviewConfirmed,
    reset, getPreviewData,
  }
}
