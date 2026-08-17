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
import { changeVibrationTableOrderStatus } from '@/services/vibration-table-order-api'
import { pushEngineerAssistantSchedules, resolveEngineerAssistantTestTypeId } from '@/services'
import { useAuth } from '@/composables/useAuth'
import { ElMessage } from 'element-plus'
import type { Stage, VibrationInstrument, WorkOrder } from './types'

defineOptions({ name: 'VibrationPage' })

const stage = ref<Stage>('dashboard')
const currentWorkOrderId = ref<string | null>(null)
const currentWorkOrderSnapshot = ref<WorkOrder | null>(null)
const showConfirmStartModal = ref(false)
const calStep = ref<'amp' | 'dur'>('amp')
const productPickerVisible = ref(false)
const selectedInstrumentIds = ref<string[]>([])

const stepList = computed(() => [] as const)

const {
  searchKeyword,
  workOrdersLoading,
  orderStatusMutating,
  scheduleOperationLoading,
  scheduleOperationText,
  refreshWorkOrders,
  selectedScheduledOrderIds,
  selectedScheduledOrders,
  activeHostDeviceName,
  hostDeviceTabs,
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
  loadPresetSchedule,
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
  assignHostDeviceToCurrentScope,
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

type DashboardReturnOptions = {
  resetRunningInstruments?: boolean
  skipStatusMutation?: boolean
}

const productPickerRows = computed(() =>
  selectedScheduledOrders.value.flatMap((order) =>
    getVisibleOrderInstruments(order).map((instrument) => ({
      id: instrument.id,
      name: instrument.name,
      sn: instrument.sn,
      model: instrument.model,
      orderId: order.id,
      customer: order.applicant,
    }))
  )
)

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

const testing = useVibrationTesting({
  getCurrentWorkOrder: () => currentWorkOrder.value,
  getTestMode: () => testMode.value,
  onFinishToReport: (exportDir: string) => {
    stage.value = 'report'
    report.resetReportFiles()
    report.setExportDir(exportDir)
  },
  onFinishToDashboard: (finalStatus = 5, options = {}) => {
    backToDashboard(finalStatus, options)
  },
})

const report = useVibrationReport({
  getOscCanvas: () => testing.getOscCanvas(),
  getCsvContent: () => testing.getCsvContent(),
  getLatestCaptureBlob: () => testing.getLatestCaptureBlob(),
  getReportText: () => testing.getReportText(),
  getTestMode: () => testMode.value,
  ensureAuth: () => initAuth(),
  getAuthHeaders: () => getAuthHeaders(),
  getPreExperimentPayload: (exportDir: string) => {
    const tester = userInfo.value?.username || userInfo.value?.nickName || currentWorkOrder.value?.applicant || ''
    return testing.getPreExperimentPayload(exportDir, tester)
  },
  getFormalReportPayload: (clientSubmitId: string, softwareReportName: string) => {
    const tester = userInfo.value?.username || userInfo.value?.nickName || currentWorkOrder.value?.applicant || ''
    return testing.getFormalReportPayload(tester, clientSubmitId, softwareReportName)
  },
  onComplete: () => {
    stage.value = 'shutdown'
  },
})

const pageOperationVisible = computed(() =>
  workOrdersLoading.value ||
  scheduleOperationLoading.value ||
  orderStatusMutating.value ||
  report.reportProcessing.value ||
  report.fileGenRunning.value
)

const pageOperationText = computed(() => {
  if (report.reportProcessing.value || report.fileGenRunning.value) {
    return testMode.value === 'formal' ? '正在提交正式报告...' : '正在提交预实验结果...'
  }
  if (scheduleOperationLoading.value) return scheduleOperationText.value || '正在处理排程...'
  if (orderStatusMutating.value) return '正在同步工单状态...'
  if (workOrdersLoading.value) return '正在刷新排程数据...'
  return '正在处理，请稍候...'
})

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
  if (selectedScheduledOrders.value.length > 1) {
    ElMessage.warning('振动台一次实验请先选择一个工单')
    return
  }
  if (orderStatusMutating.value) {
    ElMessage.warning('当前正在更新工单状态，请稍后再试')
    return
  }
  if (!selectedInstrumentIds.value.length) selectAllInstruments()
  if (!productPickerRows.value.length) {
    ElMessage.warning('该工单暂无待测试仪器')
    return
  }
  productPickerVisible.value = true
}

async function confirmInstrumentSelection() {
  if (!selectedInstrumentIds.value.length) {
    ElMessage.warning('请先选择本次实际开始测试的仪器')
    return
  }

  const selected = selectedScheduledOrders.value[0]
  if (!selected) return
  const selectedInstruments = selected.instruments.filter((instrument) => selectedInstrumentIds.value.includes(instrument.id))
  if (!selectedInstruments.length) {
    ElMessage.warning('未找到已选择的仪器')
    return
  }
  beginSelectedVibrationExperiment(selected, selectedInstruments)
  void syncVibrationSchedulePush(selected, selectedInstruments)
}

function beginSelectedVibrationExperiment(selected: WorkOrder, selectedInstruments: VibrationInstrument[]) {
  markInstrumentsRunning(selected.id, selectedInstruments)
  currentWorkOrderId.value = selected.id
  currentWorkOrderSnapshot.value = {
    ...selected,
    selectedInstruments,
    deviceNumber: selectedInstruments.map((instrument) => instrument.sn).join('、') || selected.deviceNumber,
    device: selectedInstruments.map((instrument) => instrument.name).join('、') || selected.device,
  }
  forcedMode.value = 'pre'
  testing.resetCaptureSession()
  productPickerVisible.value = false
  resetStartupChecks()
  showStartupCheck.value = true
}

async function syncVibrationSchedulePush(selected: WorkOrder, selectedInstruments: VibrationInstrument[]) {
  const authOk = await initAuth()
  const authHeaders = authOk ? getAuthHeaders() : undefined
  const scheduleInfo = getScheduleChangePayload(selected.id)
  if (scheduleInfo) {
    console.log(
      '[vibration schedule]',
      scheduleInfo.segments.map((segment) => `${segment.startAtHour} ~ ${segment.endAtHour}`).join(' | ')
    )
  } else {
    console.log('[vibration schedule] no scheduled range')
  }
  if (scheduleInfo) {
    if (!authOk) {
      ElMessage.warning('未登录，已跳过第三方排期推送并继续开始实验')
    } else {
      const pushPayload = await resolveVibrationSchedulePayload(selected, authHeaders || {})
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

async function startSelectedVibrationOrder() {
  if (orderStatusMutating.value) return false

  const selected = currentWorkOrderSnapshot.value
  const selectedInstruments = selected?.selectedInstruments || []
  if (!selected || !selectedInstruments.length) {
    ElMessage.error('未找到已选择的仪器')
    return false
  }

  if (selected.dbId === undefined) {
    ElMessage.error('未找到工单ID')
    return false
  }

  const authOk = await initAuth()
  if (!authOk) {
    ElMessage.error('登录已失效，请重新登录后再开始实验')
    return false
  }

  orderStatusMutating.value = true
  try {
    const authHeaders = getAuthHeaders()
    const runningInstrumentIds = selectedInstruments
      .map((instrument) => instrument.dbId)
      .filter((id): id is number | string => id !== undefined)
    const runningInstrumentSns = selectedInstruments.map((instrument) => instrument.sn).filter(Boolean)
    const resp = await changeVibrationTableOrderStatus(
      selected.dbId,
      2,
      authHeaders,
      { runningInstrumentIds, runningInstrumentSns }
    )
    if (!resp.success || !resp.data || resp.data.code !== 0) {
      ElMessage.error(resp.data?.msg || resp.error || '工单状态更新失败')
      return false
    } else {
      currentWorkOrderSnapshot.value = { ...selected, status: 2 }
      void refreshWorkOrders()
    }
  } catch {
    ElMessage.error('工单状态更新异常，请稍后重试')
    return false
  } finally {
    orderStatusMutating.value = false
  }

  return true
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

async function backToDashboard(finalStatus: number = 1, options: DashboardReturnOptions = {}) {
  if (orderStatusMutating.value) return

  const order = currentWorkOrderSnapshot.value
  const selectedInstruments = order?.selectedInstruments || []
  const selectedInstrumentDbIds = selectedInstruments
    .map((instrument) => instrument.dbId)
    .filter((id): id is number | string => id !== undefined)
  let nextOrderStatus = finalStatus
  let shouldRemoveSchedule = finalStatus === 5
  const completedInstrumentIds = finalStatus === 5
    ? selectedInstrumentDbIds
    : []
  const selectedInstrumentSns = selectedInstruments.map((instrument) => instrument.sn).filter(Boolean)
  const completedInstrumentSns = finalStatus === 5 ? selectedInstrumentSns : []
  const runningInstrumentIds = options.resetRunningInstruments ? selectedInstrumentDbIds : []
  const runningInstrumentSns = options.resetRunningInstruments ? selectedInstrumentSns : []
  if (order && selectedInstruments.length) {
    if (finalStatus === 5) {
      shouldRemoveSchedule = true
    } else if (options.resetRunningInstruments) {
      shouldRemoveSchedule = true
    }
    clearRunningInstruments(order.id, selectedInstruments)
  }

  if (order && order.dbId !== undefined && !options.skipStatusMutation) {
    const authOk = await initAuth()
    const authHeaders = authOk ? getAuthHeaders() : undefined
    orderStatusMutating.value = true
    try {
      const resp = await changeVibrationTableOrderStatus(
        order.dbId,
        nextOrderStatus,
        authHeaders,
        { completedInstrumentIds, completedInstrumentSns, runningInstrumentIds, runningInstrumentSns }
      )
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        ElMessage.error(resp.data?.msg || resp.error || '工单状态更新失败')
        return
      } else {
        if (finalStatus === 5 && selectedInstruments.length) {
          markInstrumentsCompleted(order.id, selectedInstruments)
        }
        void refreshWorkOrders()
      }
    } finally {
      orderStatusMutating.value = false
    }
  }

  if (shouldRemoveSchedule && currentWorkOrderId.value && !options.skipStatusMutation) {
    removeScheduledOrder(currentWorkOrderId.value)
  }

  stage.value = 'dashboard'
  currentWorkOrderId.value = null
  currentWorkOrderSnapshot.value = null
  selectedInstrumentIds.value = []
  productPickerVisible.value = false
  showStartupCheck.value = false
  if (options.skipStatusMutation) void refreshWorkOrders()
}

function handleCancelStartupCheck() {
  if (currentWorkOrderSnapshot.value) {
    clearRunningInstruments(
      currentWorkOrderSnapshot.value.id,
      currentWorkOrderSnapshot.value.selectedInstruments || []
    )
  }
  backToDashboard(1)
}

function goPrevStage() {
  if (stage.value === 'start') {
    if (currentWorkOrderSnapshot.value) {
      clearRunningInstruments(
        currentWorkOrderSnapshot.value.id,
        currentWorkOrderSnapshot.value.selectedInstruments || []
      )
    }
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

async function confirmStartVibration() {
  const started = await startSelectedVibrationOrder()
  if (!started) return

  showConfirmStartModal.value = false
  stage.value = 'calibration'
  calStep.value = 'amp'
}

async function convertToFormal() {
  if (testing.isFinalizing.value) return
  await testing.prepareFreshFormalSession()
  forcedMode.value = 'formal'
  devCheckItems.value.forEach(i => { i.answer = 'yes'; i.remark = '' })
  showSafetyWarning.value = false
  stage.value = 'devcheck'
}

function finishShutdown() {
  resetShutdownChecks()
  if (testMode.value === 'pre') {
    backToDashboard(1, { resetRunningInstruments: true })
    return
  }
  // 正式报告提交成功后，服务端已按设备重算为“测试中”或“待审核”；客户端不再越级改成已完成。
  backToDashboard(3, { skipStatusMutation: true })
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
        :host-device-tabs="hostDeviceTabs"
        :active-host-device-name="activeHostDeviceName"
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
        @load-preset-schedule="loadPresetSchedule"
        @drag-over="handleDragOver"
        @drop="handleDrop"
        @select-scheduled-order="selectScheduledOrder"
        @assign-host-device="assignHostDeviceToCurrentScope"
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
        :cal-step="calStep"
        :live-level="testing.liveLevel.value"
        :live-freq="testing.liveFreq.value"
        :live-input-level="testing.liveInputLevel.value"
        :live-drive="testing.liveDrive.value"
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
        :capture-device-ready="testing.captureDeviceReady.value"
        :capture-device-name="testing.selectedCaptureDeviceName.value || testing.selectedCaptureDevice.value"
        :device-refreshing="testing.deviceRefreshing.value"
        :ocr-ready="testing.ocrReady.value"
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
        :report-process-steps="report.reportProcessSteps.value"
        :report-processing="report.reportProcessing.value"
        :report-ready-to-process="report.reportReadyToProcess.value"
        :file-gen-running="report.fileGenRunning.value"
        :all-files-done="report.allFilesDone.value"
        :selected-third-party-report-name="report.selectedThirdPartyReportName.value"
        :selected-third-party-report-size-text="report.selectedThirdPartyReportSizeText.value"
        :selected-third-party-report-modified-at="report.selectedThirdPartyReportModifiedAt.value"
        :shutdown-checks="shutdownChecks"
        @back-to-dashboard="() => backToDashboard(1)"
        @set-dev-check-answer="setDevCheckAnswer"
        @submit-dev-check="submitDevCheck"
        @reset-dev-check="resetDevCheck"
        @go-prev-stage="goPrevStage"
        @go-next-stage="goNextStage"
        @set-cal-step="calStep = $event"
        @refresh-capture-devices="testing.refreshCaptureDevices"
        @start-vib-test="testing.startVibTestMonitor"
        @pause-vib-test="testing.pauseVibTest"
        @resume-vib-test="testing.resumeVibTest"
        @open-abort-warning="testing.showAbortWarning.value = true"
        @end-vib-test="testing.endVibTest"
        @convert-to-formal="convertToFormal"
        @set-stage-testing="stage = 'testing'"
        @set-stage-shutdown="stage = 'shutdown'"
        @select-third-party-report="report.selectThirdPartyReport"
        @clear-third-party-report="report.clearThirdPartyReport"
        @process-report="report.processReport"
        @toggle-shutdown-check="toggleShutdownCheck"
        @finish-shutdown="finishShutdown"
      />
    </div>

    <Transition name="operation-mask">
      <div
        v-if="pageOperationVisible"
        class="page-operation-mask"
        role="status"
        aria-live="assertive"
        aria-busy="true"
        @click.stop.prevent
        @mousedown.stop.prevent
        @touchstart.stop.prevent
      >
        <div class="page-operation-card">
          <span class="page-operation-spinner" aria-hidden="true"></span>
          <strong>{{ pageOperationText }}</strong>
          <span>操作完成前请勿重复点击或关闭页面</span>
        </div>
      </div>
    </Transition>

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
          <span>已选择 {{ selectedInstrumentIds.length }} / {{ productPickerRows.length }} 台仪器</span>
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
          <button class="primary-btn" :disabled="selectedInstrumentIds.length === 0" @click="confirmInstrumentSelection">
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
.page-operation-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.46);
  backdrop-filter: blur(3px);
  cursor: wait;
  pointer-events: auto;
}

.page-operation-card {
  min-width: 280px;
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 28px 32px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 16px;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
  text-align: center;
}

.page-operation-card strong {
  font-size: 17px;
}

.page-operation-card > span:last-child {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.page-operation-spinner {
  width: 38px;
  height: 38px;
  border: 4px solid rgba(59, 130, 246, 0.2);
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: page-operation-spin 0.8s linear infinite;
}

.operation-mask-enter-active,
.operation-mask-leave-active {
  transition: opacity 0.16s ease;
}

.operation-mask-enter-from,
.operation-mask-leave-to {
  opacity: 0;
}

@keyframes page-operation-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .page-operation-spinner {
    animation-duration: 1.6s;
  }
}

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
