<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import VibrationDashboard from './components/VibrationDashboard.vue'
import VibrationFlow from './components/VibrationFlow.vue'
import VibrationGlobalModals from './components/VibrationGlobalModals.vue'
import { useVibrationSchedule } from './composables/useVibrationSchedule'
import { useVibrationChecks } from './composables/useVibrationChecks'
import { useVibrationTesting } from './composables/useVibrationTesting'
import { useVibrationReport } from './composables/useVibrationReport'
import type { Stage } from './types'

const stage = ref<Stage>('dashboard')
const currentWorkOrderId = ref<string | null>(null)
const forcedMode = ref<'formal' | 'pre' | null>(null)
const showConfirmStartModal = ref(false)
const calStep = ref<'amp' | 'dur'>('amp')

const stepList = computed(() => [] as const)

const {
  searchKeyword,
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
  selectScheduledOrder,
} = useVibrationSchedule()

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

const currentWorkOrder = computed(() => {
  if (!currentWorkOrderId.value) return null
  return getOrderById(currentWorkOrderId.value) || null
})

const testMode = computed<'formal' | 'pre'>(() =>
  forcedMode.value ? forcedMode.value : (currentWorkOrder.value?.type === '模拟实验' ? 'pre' : 'formal')
)

const testing = useVibrationTesting({
  getCurrentWorkOrder: () => currentWorkOrder.value,
  getTestMode: () => testMode.value,
  onFinishToReport: () => {
    stage.value = 'report'
    report.resetReportFiles()
    report.startFileGen()
  },
  onFinishToDashboard: () => {
    backToDashboard()
  },
})

const report = useVibrationReport({
  getCurrentWorkOrder: () => currentWorkOrder.value,
  getOscCanvas: () => testing.getOscCanvas(),
})

function startExperiment() {
  if (!selectedScheduledOrders.value.length) return
  currentWorkOrderId.value = selectedScheduledOrders.value[0].id
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

function backToDashboard() {
  stage.value = 'dashboard'
  currentWorkOrderId.value = null
}

function goPrevStage() {
  if (stage.value === 'start') backToDashboard()
  else if (stage.value === 'calibration') stage.value = 'start'
  else if (stage.value === 'testing') stage.value = 'calibration'
  else if (stage.value === 'report') stage.value = 'testing'
  else if (stage.value === 'shutdown') stage.value = 'report'
}

function goNextStage() {
  if (stage.value === 'start') showConfirmStartModal.value = true
  else if (stage.value === 'calibration') {
    stage.value = 'testing'
    testing.startVibTestMonitor()
  } else if (stage.value === 'testing') stage.value = 'report'
  else if (stage.value === 'report') stage.value = 'shutdown'
}

function confirmStartVibration() {
  showConfirmStartModal.value = false
  if (testMode.value === 'formal') {
    stage.value = 'calibration'
    calStep.value = 'amp'
  } else {
    stage.value = 'testing'
    testing.startVibTestMonitor()
  }
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
  backToDashboard()
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
        @update:show-startup-check="showStartupCheck = $event"
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
        :vib-data-count="testing.vibDataCount.value"
        :formatted-duration="testing.formattedDuration.value"
        :is-running="testing.isRunning.value"
        :live-file-name="testing.liveFileName.value"
        :live-ax="testing.liveAx.value"
        :live-ay="testing.liveAy.value"
        :live-az="testing.liveAz.value"
        :test-mode="testMode"
        :report-progress="report.reportProgress.value"
        :report-files="report.reportFiles.value"
        :file-gen-running="report.fileGenRunning.value"
        :all-files-done="report.allFilesDone.value"
        :shutdown-checks="shutdownChecks"
        @back-to-dashboard="backToDashboard"
        @set-dev-check-answer="setDevCheckAnswer"
        @submit-dev-check="submitDevCheck"
        @reset-dev-check="resetDevCheck"
        @go-prev-stage="goPrevStage"
        @go-next-stage="goNextStage"
        @set-cal-step="calStep = $event"
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
