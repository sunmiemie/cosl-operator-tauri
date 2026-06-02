<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import VibrationDashboard from './components/VibrationDashboard.vue'
import VibrationFlow from './components/VibrationFlow.vue'
import VibrationGlobalModals from './components/VibrationGlobalModals.vue'
import { useVibrationSchedule } from './composables/useVibrationSchedule'
import { useVibrationChecks } from './composables/useVibrationChecks'
import { useVibrationTesting } from './composables/useVibrationTesting'
import { useVibrationReport } from './composables/useVibrationReport'
import { buildVibrationReportPayload, type VibrationReportFilePaths } from './utils/vibrationReportPayload'
import { changeVibrationTableOrderStatus } from '@/services/vibration-table-order-api'
import { createVibrationTableReport } from '@/services/vibration-table-report-api'
import { pushEngineerAssistantSchedules, resolveEngineerAssistantTestTypeId } from '@/services'
import { useAuth } from '@/composables/useAuth'
import { ElMessage } from 'element-plus'
import type { Stage, WorkOrder } from './types'

const stage = ref<Stage>('dashboard')
const currentWorkOrderId = ref<string | null>(null)
const currentWorkOrderSnapshot = ref<WorkOrder | null>(null)
const currentWorkOrderSnapshots = ref<WorkOrder[]>([])
const showConfirmStartModal = ref(false)
const calStep = ref<'amp' | 'dur'>('amp')
const productPickerVisible = ref(false)
const selectedInstrumentIds = ref<string[]>([])
const currentReportClientSubmitId = ref('')
const currentExperimentStartedAt = ref<string | null>(null)
const currentExperimentEndedAt = ref<string | null>(null)
const reportSubmitted = ref(false)

const stepList = computed(() => [] as const)

const {
  searchKeyword,
  workOrdersLoading,
  orderStatusMutating,
  refreshWorkOrders,
  selectedScheduledOrderIds,
  selectedScheduledOrders,
  calBase,
  currentWeekDays,
  weekLabel,
  timeSlots,
  scheduledOrders,
  scheduledLayoutItems,
  maxLaneCount,
  slotHeightPx,
  isDragging,
  unscheduledOrders,
  getOrderById,
  getCellKey,
  fmtDate,
  prevWeek,
  nextWeek,
  gotoDate,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDrop,
  startResize,
  startResizeTop,
  resizingOrderId,
  isResizing,
  handleUnschedule,
  removeScheduledOrder,
  markInstrumentsRunning,
  clearRunningInstruments,
  markInstrumentsCompleted,
  getVisibleOrderInstruments,
  getInstrumentStatusText,
  selectScheduledOrder,
  getScheduleChangePayload,
} = useVibrationSchedule()

const { initAuth, getAuthHeaders, userInfo } = useAuth()

const {
  showStartupCheck,
  checkItems,
  allChecked,
  devCheckItems,
  shutdownChecks,
  showSafetyWarning,
  devCheckDoneCount,
  devCheckAllAnswered,
  devCheckInvalidNoRemark,
  devCheckProgressPct,
  toggleCheck,
  resetStartupChecks,
  setDevCheckAnswer,
  resetDevCheck,
  resetShutdownChecks,
  passDevCheck,
} = useVibrationChecks()

const currentWorkOrder = computed(() => currentWorkOrderSnapshot.value)
const forcedMode = ref<'formal' | 'pre'>('pre')
const testMode = computed<'formal' | 'pre'>(() => forcedMode.value)

const productPickerRows = computed(() =>
  selectedScheduledOrders.value.flatMap((order) =>
    getVisibleOrderInstruments(order).map((instrument) => ({
      id: `${order.id}::${instrument.id}`,
      instrumentId: instrument.id,
      name: instrument.name,
      sn: instrument.sn,
      model: instrument.model,
      orderId: order.id,
      customer: order.applicant,
    }))
  )
)

const validSelectedInstrumentIds = computed(() => {
  const selected = new Set(selectedInstrumentIds.value)
  return productPickerRows.value
    .filter((row) => selected.has(row.id) || selected.has(row.instrumentId))
    .map((row) => row.id)
})

watch(
  () => productPickerRows.value.map((row) => row.id).join('|'),
  () => {
    const validIds = new Set(productPickerRows.value.map((row) => row.id))
    selectedInstrumentIds.value = selectedInstrumentIds.value.filter((id) => validIds.has(id))
  }
)

function toggleInstrumentSelection(instrumentId: string, checked: boolean) {
  const set = new Set(selectedInstrumentIds.value)
  if (checked) set.add(instrumentId)
  else set.delete(instrumentId)
  selectedInstrumentIds.value = Array.from(set)
}

function selectAllInstruments() {
  selectedInstrumentIds.value = productPickerRows.value.map((row) => row.id)
}

function clearInstrumentSelection() {
  selectedInstrumentIds.value = []
}

function normalizeSelectedInstrumentIds() {
  selectedInstrumentIds.value = Array.from(new Set(validSelectedInstrumentIds.value))
}

const testing = useVibrationTesting({
  getCurrentWorkOrder: () => currentWorkOrder.value,
  getTestMode: () => testMode.value,
  onFinishToReport: (exportDir: string) => {
    currentExperimentEndedAt.value = new Date().toISOString()
    stage.value = 'report'
    report.resetReportFiles()
    report.setExportDir(exportDir)
    report.startFileGen()
  },
  onFinishToDashboard: (finalStatus = 5) => {
    backToDashboard(finalStatus)
  },
})

const report = useVibrationReport({
  getOscCanvas: () => testing.getOscCanvas(),
  getCsvContent: () => testing.getCsvContent(),
  getLatestCaptureBlob: () => testing.getLatestCaptureBlob(),
  getReportText: () => testing.getReportText(),
  submitReport: submitVibrationReport,
  onComplete: () => {
    stage.value = 'shutdown'
  },
})

async function submitVibrationReport(filePaths: VibrationReportFilePaths) {
  const authOk = await initAuth()
  if (!authOk) {
    throw new Error('未登录，无法将报告写入数据库')
  }
  const tester = userInfo.value?.nickName || userInfo.value?.username || '操作员'
  if (!currentReportClientSubmitId.value) {
    const order = currentWorkOrder.value
    currentReportClientSubmitId.value = `vibration-${order?.dbId || order?.id || 'order'}-${Date.now()}`
  }
  const payload = buildVibrationReportPayload({
    workOrder: currentWorkOrder.value,
    summary: testing.getAnalysisSummary(),
    tester,
    clientSubmitId: currentReportClientSubmitId.value,
    experimentStartedAt: currentExperimentStartedAt.value,
    experimentEndedAt: currentExperimentEndedAt.value,
    videoFileName: testing.videoFileName.value,
    videoPath: testing.videoPath.value,
    sampleIntervalSeconds: testing.sampleIntervalSeconds.value,
    reportText: testing.getReportText(),
    filePaths,
  })
  const resp = await createVibrationTableReport(payload, getAuthHeaders())
  if (!resp.success || !resp.data || resp.data.code !== 0) {
    throw new Error(resp.data?.msg || resp.error || '振动台报告入库失败')
  }
  reportSubmitted.value = true
  ElMessage.success('振动台报告已写入数据库，等待管理端审核')
}

async function resolveVibrationSchedulePayload(selected: WorkOrder, headers: Record<string, string>) {
  const fallbackTestType = (await resolveEngineerAssistantTestTypeId('振动台', headers))
    || (await resolveEngineerAssistantTestTypeId('振动', headers))
    || ''

  return {
    testId: String(selected.dbId ?? selected.id ?? ''),
    testType: fallbackTestType,
    equipmentId: String(selected.deviceNumber || selected.device || selected.id || ''),
  }
}

async function startExperiment() {
  if (!selectedScheduledOrders.value.length) {
    ElMessage.warning('请先在日历中选择一个已排程工单')
    return
  }
  if (orderStatusMutating.value) {
    ElMessage.warning('当前正在更新工单状态，请稍后再试')
    return
  }
  if (!productPickerRows.value.length) {
    ElMessage.warning('该工单暂无待测试仪器')
    return
  }
  normalizeSelectedInstrumentIds()
  if (!selectedInstrumentIds.value.length) selectAllInstruments()
  productPickerVisible.value = true
}

async function confirmInstrumentSelection() {
  normalizeSelectedInstrumentIds()
  if (!selectedInstrumentIds.value.length) {
    ElMessage.warning('请先选择本次实际开始测试的仪器')
    return
  }

  const selectedOrderInfos = selectedScheduledOrders.value
    .map((order) => ({
      order,
      selectedInstruments: order.instruments.filter((instrument) =>
        selectedInstrumentIds.value.includes(`${order.id}::${instrument.id}`)
      ),
    }))
    .filter((item) => item.selectedInstruments.length)

  if (!selectedOrderInfos.length) {
    ElMessage.warning('未找到已选择的仪器')
    return
  }

  const authOk = await initAuth()
  const authHeaders = authOk ? getAuthHeaders() : undefined

  for (const { order, selectedInstruments } of selectedOrderInfos) {
    const scheduleInfo = getScheduleChangePayload(order.id)
    if (scheduleInfo) {
      console.log(
        '[vibration schedule]',
        order.id,
        scheduleInfo.segments.map((segment) => `${segment.startAtHour} ~ ${segment.endAtHour}`).join(' | ')
      )
    } else {
      console.log('[vibration schedule] no scheduled range', order.id)
    }
    if (scheduleInfo) {
      if (!authOk) {
        ElMessage.warning('未登录，已跳过第三方排期推送并继续开始实验')
      } else {
        const pushPayload = await resolveVibrationSchedulePayload(order, authHeaders || {})
        if (pushPayload.testType && pushPayload.testId && pushPayload.equipmentId) {
          console.log('[vibration schedule push]', pushPayload)
          const schedulePushList = scheduleInfo.segments.flatMap((segment) =>
            selectedInstruments.map((instrument) => ({
              testId: pushPayload.testId,
              testType: pushPayload.testType,
              equipmentId: String(instrument.dbId || instrument.sn || instrument.name || pushPayload.equipmentId),
              startTime: segment.startAtHour,
              endTime: segment.endAtHour,
            }))
          )
          const resp = await pushEngineerAssistantSchedules(
            {
              schedulesInfo: schedulePushList,
            },
            authHeaders || {}
          )
          if (!resp.success || !resp.data || resp.data.code !== 0) {
            ElMessage.warning(`推送第三方排期失败，已继续开始实验${resp.error ? `：${resp.error}` : ''}`)
          }
        } else {
          ElMessage.warning('未匹配到第三方测试类型（振动台），已跳过第三方排期推送并继续开始实验')
        }
      }
    }
  }

  {
    orderStatusMutating.value = true
    try {
      for (const { order, selectedInstruments } of selectedOrderInfos) {
        const runningInstrumentIds = selectedInstruments
          .map((instrument) => instrument.dbId)
          .filter((id): id is number | string => id !== undefined)
        const resp = await changeVibrationTableOrderStatus(
          order.dbId!,
          2,
          authHeaders,
          { runningInstrumentIds }
        )
        if (!resp.success || !resp.data || resp.data.code !== 0) {
          ElMessage.error(resp.data?.msg || resp.error || '工单状态更新失败')
          return
        }
      }
      void refreshWorkOrders()
    } catch {
      ElMessage.error('工单状态更新异常，请稍后重试')
      return
    } finally {
      orderStatusMutating.value = false
    }
  }

  const snapshots = selectedOrderInfos.map(({ order, selectedInstruments }) => {
    markInstrumentsRunning(order.id, selectedInstruments)
    return {
      ...order,
      selectedInstruments,
      deviceNumber: selectedInstruments.map((instrument) => instrument.sn).join('、') || order.deviceNumber,
      device: selectedInstruments.map((instrument) => instrument.name).join('、') || order.device,
    }
  })
  const primarySnapshot = snapshots[0]
  currentWorkOrderId.value = primarySnapshot?.id || null
  currentWorkOrderSnapshot.value = primarySnapshot || null
  currentWorkOrderSnapshots.value = snapshots
  currentReportClientSubmitId.value = `vibration-${primarySnapshot?.dbId || primarySnapshot?.id || 'order'}-${Date.now()}`
  currentExperimentStartedAt.value = new Date().toISOString()
  currentExperimentEndedAt.value = null
  reportSubmitted.value = false
  forcedMode.value = 'pre'
  productPickerVisible.value = false
  resetStartupChecks()
  showStartupCheck.value = true
}

function handleStartupCheckComplete() {
  showStartupCheck.value = false
  stage.value = 'start'
}

function submitDevCheck() {
  const result = passDevCheck()
  if (!result.ok) {
    if (result.reason === 'has-no') showSafetyWarning.value = true
    return
  }
  stage.value = 'start'
}

function continueAfterSafetyWarning() {
  showSafetyWarning.value = false
  stage.value = 'start'
}

async function backToDashboard(finalStatus: number = 1) {
  if (orderStatusMutating.value) return

  const activeOrders = currentWorkOrderSnapshots.value.length
    ? currentWorkOrderSnapshots.value
    : currentWorkOrderSnapshot.value
      ? [currentWorkOrderSnapshot.value]
      : []
  let nextOrderStatus = finalStatus
  let shouldRemoveSchedule = finalStatus === 5
  activeOrders.forEach((order) => {
    const selectedInstruments = order.selectedInstruments || []
    if (selectedInstruments.length) {
      if (finalStatus === 5) {
        shouldRemoveSchedule = true
      }
      clearRunningInstruments(order.id, selectedInstruments)
    }
  })

  if (activeOrders.some((order) => order.dbId !== undefined)) {
    const authOk = await initAuth()
    const authHeaders = authOk ? getAuthHeaders() : undefined
    orderStatusMutating.value = true
    try {
      for (const order of activeOrders) {
        if (order.dbId === undefined) continue
        const selectedInstruments = order.selectedInstruments || []
        const completedInstrumentIds = finalStatus === 5
          ? selectedInstruments.map((instrument) => instrument.dbId).filter((id): id is number | string => id !== undefined)
          : []
        const resp = await changeVibrationTableOrderStatus(
          order.dbId,
          nextOrderStatus,
          authHeaders,
          { completedInstrumentIds }
        )
        if (!resp.success || !resp.data || resp.data.code !== 0) {
          ElMessage.error(resp.data?.msg || resp.error || '工单状态更新失败')
          return
        }
        if (finalStatus === 5 && selectedInstruments.length) {
          markInstrumentsCompleted(order.id, selectedInstruments)
        }
      }
      void refreshWorkOrders()
    } finally {
      orderStatusMutating.value = false
    }
  }

  if (shouldRemoveSchedule) {
    activeOrders.forEach((order) => removeScheduledOrder(order.id))
  }

  stage.value = 'dashboard'
  currentWorkOrderId.value = null
  currentWorkOrderSnapshot.value = null
  currentWorkOrderSnapshots.value = []
  currentReportClientSubmitId.value = ''
  currentExperimentStartedAt.value = null
  currentExperimentEndedAt.value = null
  reportSubmitted.value = false
  selectedInstrumentIds.value = []
  productPickerVisible.value = false
  showStartupCheck.value = false
}

function handleCancelStartupCheck() {
  backToDashboard(1)
}

function goPrevStage() {
  if (stage.value === 'start') {
    backToDashboard(1)
  }
  else if (stage.value === 'calibration') stage.value = 'start'
  else if (stage.value === 'testing') stage.value = 'calibration'
  else if (stage.value === 'report') stage.value = 'testing'
  else if (stage.value === 'shutdown') stage.value = 'report'
}

function goNextStage() {
  if (stage.value === 'start') showConfirmStartModal.value = true
  else if (stage.value === 'calibration') {
    stage.value = 'testing'
  } else if (stage.value === 'testing') stage.value = 'report'
  else if (stage.value === 'report') stage.value = 'shutdown'
}

function confirmStartVibration() {
  showConfirmStartModal.value = false
  stage.value = 'calibration'
  calStep.value = 'amp'
}

function convertToFormal() {
  testing.pauseVibTest()
  forcedMode.value = 'formal'
  devCheckItems.value.forEach(i => { i.answer = 'yes'; i.remark = '' })
  showSafetyWarning.value = false
  stage.value = 'devcheck'
}

function finishShutdown() {
  resetShutdownChecks()
  backToDashboard(5)
}

function toggleShutdownCheck(id: number) {
  const item = shutdownChecks.value.find(i => i.id === id)
  if (item) item.checked = !item.checked
}
</script>

<template>
  <div class="vibration-page">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon">
          <Icon icon="mdi:vibrate" />
        </div>
        <div>
          <h1 class="header-title">振动台</h1>
          <p class="header-subtitle">振动测试系统</p>
        </div>
      </div>
      <div class="header-right"></div>
    </div>

    <div class="platform-root">
      <VibrationDashboard
        v-if="stage === 'dashboard'"
        :show-startup-check="showStartupCheck"
        :check-items="checkItems"
        :all-checked="allChecked"
        :unscheduled-orders="unscheduledOrders"
        :search-keyword="searchKeyword"
        :current-week-days="currentWeekDays"
        :time-slots="timeSlots"
        :cal-base="calBase"
        :week-label="weekLabel"
        :scheduled-orders="scheduledOrders"
        :scheduled-layout-items="scheduledLayoutItems"
        :max-lane-count="maxLaneCount"
        :slot-height-px="slotHeightPx"
        :is-dragging="isDragging"
        :start-resize="startResize"
        :start-resize-top="startResizeTop"
        :resizing-order-id="resizingOrderId"
        :is-resizing="isResizing"
        :selected-scheduled-order-ids="selectedScheduledOrderIds"
        :selected-scheduled-orders="selectedScheduledOrders"
        :fmt-date="fmtDate"
        :get-cell-key="getCellKey"
        :get-order-by-id="getOrderById"
        :get-visible-order-instruments="getVisibleOrderInstruments"
        :get-instrument-status-text="getInstrumentStatusText"
        :work-orders-loading="workOrdersLoading"
        :refresh-work-orders="refreshWorkOrders"
        @update:show-startup-check="val => val ? (showStartupCheck = true) : handleCancelStartupCheck()"
        @update:search-keyword="searchKeyword = $event"
        @toggle-check="toggleCheck"
        @startup-check-complete="handleStartupCheckComplete"
        @drag-start="handleDragStart"
        @drag-end="handleDragEnd"
        @prev-week="prevWeek"
        @next-week="nextWeek"
        @goto-date="gotoDate"
        @drag-over="handleDragOver"
        @drop="handleDrop"
        @select-scheduled-order="selectScheduledOrder"
        @unschedule="handleUnschedule"
        @start-experiment="startExperiment"
      />

      <VibrationFlow
        v-else
        :stage="stage"
        :step-list="stepList"
        :dev-check-items="devCheckItems"
        :dev-check-done-count="devCheckDoneCount"
        :dev-check-progress-pct="devCheckProgressPct"
        :dev-check-all-answered="devCheckAllAnswered"
        :dev-check-invalid-no-remark="devCheckInvalidNoRemark"
        :current-work-order="currentWorkOrder"
        :selected-work-orders="currentWorkOrderSnapshots"
        :cal-step="calStep"
        :live-level="testing.liveLevel.value"
        :live-freq="testing.liveFreq.value"
        :vib-data-count="testing.vibDataCount.value"
        :formatted-duration="testing.formattedDuration.value"
        :is-running="testing.isRunning.value"
        :is-paused="testing.isPaused.value"
        :is-finalizing="testing.isFinalizing.value"
        :live-file-name="testing.liveFileName.value"
        :live-ax="testing.liveAx.value"
        :live-ay="testing.liveAy.value"
        :live-az="testing.liveAz.value"
        :test-mode="testMode"
        :video-ready="testing.videoReady.value"
        :backend-processing-required="testing.backendProcessingRequired.value"
        :video-file-name="testing.videoFileName.value"
        :video-url="testing.videoUrl.value"
        :video-duration-text="testing.videoDurationText.value"
        :sample-interval-seconds="testing.sampleIntervalSeconds.value"
        :capture-status-text="testing.captureStatusText.value"
        :capture-progress-pct="testing.captureProgressPct.value"
        :latest-capture-url="testing.latestCaptureUrl.value"
        :analysis-completed="testing.analysisCompleted.value"
        :session-started="testing.sessionStarted.value"
        :analysis-summary="testing.analysisSummary.value"
        :analysis-preview-records="testing.analysisPreviewRecords.value"
        :report-progress="report.reportProgress.value"
        :report-files="report.reportFiles.value"
        :file-gen-running="report.fileGenRunning.value"
        :all-files-done="report.allFilesDone.value"
        :shutdown-checks="shutdownChecks"
        @back-to-dashboard="() => backToDashboard(1)"
        @set-dev-check-answer="setDevCheckAnswer"
        @submit-dev-check="submitDevCheck"
        @reset-dev-check="resetDevCheck"
        @go-prev-stage="goPrevStage"
        @go-next-stage="goNextStage"
        @set-cal-step="calStep = $event"
        @select-video="testing.selectVideoFile"
        @import-video-path="testing.importVideoFile"
        @clear-video="testing.clearVideoFile"
        @start-vib-test="testing.startVibTestMonitor"
        @pause-vib-test="testing.pauseVibTest"
        @resume-vib-test="testing.resumeVibTest"
        @open-abort-warning="testing.showAbortWarning.value = true"
        @end-vib-test="testing.endVibTest"
        @convert-to-formal="convertToFormal"
        @set-stage-testing="stage = 'testing'"
        @set-stage-shutdown="stage = 'shutdown'"
        @start-file-gen="report.startFileGen"
        @toggle-shutdown-check="toggleShutdownCheck"
        @finish-shutdown="finishShutdown"
      />
    </div>

    <div v-if="stage === 'dashboard' && productPickerVisible" class="product-picker-mask">
      <div class="product-picker-dialog">
        <div class="product-picker-header">
          <div>
            <h3>选择测试仪器</h3>
            <p>已排程工单确认开始实验后，在这里选择本次实际开始测试的仪器。</p>
          </div>
          <button class="product-picker-close" @click="productPickerVisible = false">×</button>
        </div>
        <div class="product-picker-actions">
          <button class="week-cal-nav" @click="selectAllInstruments">全选</button>
          <button class="week-cal-nav" @click="clearInstrumentSelection">清空</button>
          <span>已选择 {{ validSelectedInstrumentIds.length }} / {{ productPickerRows.length }} 台仪器</span>
        </div>
        <div class="product-picker-list">
          <label v-for="row in productPickerRows" :key="row.id" class="product-picker-row">
            <input
              type="checkbox"
              :checked="selectedInstrumentIds.includes(row.id)"
              @change="toggleInstrumentSelection(row.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="product-main">{{ row.name }}</span>
            <span class="product-sub">{{ row.sn || row.model || '-' }}</span>
            <span class="product-order">{{ row.orderId }} · {{ row.customer }}</span>
          </label>
        </div>
        <div class="product-picker-footer">
          <button class="week-cal-nav" @click="productPickerVisible = false">取消</button>
          <button class="primary-btn" :disabled="validSelectedInstrumentIds.length === 0" @click="confirmInstrumentSelection">
            确认开始实验
          </button>
        </div>
      </div>
    </div>

    <VibrationGlobalModals
      :show-safety-warning="showSafetyWarning"
      :show-confirm-start-modal="showConfirmStartModal"
      :show-abort-warning="testing.showAbortWarning.value"
      @update:show-safety-warning="showSafetyWarning = $event"
      @continue-after-safety-warning="continueAfterSafetyWarning"
      @update:show-confirm-start-modal="showConfirmStartModal = $event"
      @confirm-start-vibration="confirmStartVibration"
      @update:show-abort-warning="testing.showAbortWarning.value = $event"
      @confirm-abort="testing.confirmAbort"
    />
  </div>
</template>

<style scoped src="./components/vibration.shared.css"></style>
<style scoped>
.product-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
}

.product-picker-dialog {
  width: min(760px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-secondary);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
}

.product-picker-header,
.product-picker-actions,
.product-picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.product-picker-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.product-picker-header p {
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.product-picker-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 20px;
}

.product-picker-actions {
  justify-content: flex-start;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.product-picker-list {
  flex: 1;
  overflow: auto;
  padding: 8px 12px;
}

.product-picker-row {
  display: grid;
  grid-template-columns: 24px minmax(160px, 1fr) minmax(100px, 140px) minmax(180px, 1.2fr);
  align-items: center;
  gap: 12px;
  padding: 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  cursor: pointer;
}

.product-picker-row:hover {
  background: rgba(59, 130, 246, 0.08);
}

.product-main {
  font-weight: 600;
  color: var(--color-text-primary);
}

.product-sub,
.product-order {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.product-picker-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
  border-bottom: none;
}
</style>
