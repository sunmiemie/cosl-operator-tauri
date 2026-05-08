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
import { updateVibrationTableOrder } from '@/services/vibration-table-order-api'
import { getEngineerAssistantApplicationForms, pushEngineerAssistantSchedules, resolveEngineerAssistantTestTypeId } from '@/services'
import { useAuth } from '@/composables/useAuth'
import { ElMessage } from 'element-plus'
import type { Stage, WorkOrder } from './types'

const stage = ref<Stage>('dashboard')
const currentWorkOrderId = ref<string | null>(null)
const currentWorkOrderSnapshot = ref<WorkOrder | null>(null)
const forcedMode = ref<'formal' | 'pre' | null>(null)
const showConfirmStartModal = ref(false)
const calStep = ref<'amp' | 'dur'>('amp')

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
  selectScheduledOrder,
  getScheduleChangePayload,
} = useVibrationSchedule()

const { initAuth, getAuthHeaders } = useAuth()

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

const testMode = computed<'formal' | 'pre'>(() =>
  forcedMode.value ? forcedMode.value : (currentWorkOrder.value?.mode === 'pre' ? 'pre' : 'formal')
)

const testing = useVibrationTesting({
  getCurrentWorkOrder: () => currentWorkOrder.value,
  getTestMode: () => testMode.value,
  onFinishToReport: (exportDir: string) => {
    stage.value = 'report'
    report.resetReportFiles()
    report.setExportDir(exportDir)
    report.startFileGen()
  },
  onFinishToDashboard: () => {
    backToDashboard(5)
  },
})

const report = useVibrationReport({
  getOscCanvas: () => testing.getOscCanvas(),
  getCsvContent: () => testing.getCsvContent(),
  getLatestCaptureBlob: () => testing.getLatestCaptureBlob(),
  getReportText: () => testing.getReportText(),
  onComplete: () => {
    stage.value = 'shutdown'
  },
})

function normalizeText(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function collectStringValues(input: unknown, bucket: Set<string>, depth = 0) {
  if (input == null || depth > 4) return
  if (typeof input === 'string' || typeof input === 'number') {
    const text = String(input).trim()
    if (text) bucket.add(text.toLowerCase())
    return
  }
  if (Array.isArray(input)) {
    input.forEach(item => collectStringValues(item, bucket, depth + 1))
    return
  }
  if (typeof input === 'object') {
    Object.values(input as Record<string, unknown>).forEach(value => collectStringValues(value, bucket, depth + 1))
  }
}

function pickEquipmentIdFromDevice(device: any) {
  const candidates = [
    device?.equipmentId,
    device?.equipment_id,
    device?.deviceId,
    device?.device_id,
    device?.id,
    device?.deviceNumber,
    device?.device_number,
    device?.number,
    device?.sn,
    device?.code,
  ]
  const found = candidates.find(value => String(value || '').trim())
  return found ? String(found).trim() : ''
}

function findBestMatchedDevice(devices: any[], selected: WorkOrder) {
  const targetDeviceName = normalizeText(selected.device)
  const targetDeviceNumber = normalizeText(selected.deviceNumber)
  if (!Array.isArray(devices) || !devices.length) return null
  return devices
    .map((device) => {
      const values = new Set<string>()
      collectStringValues(device, values)
      let score = 0
      if (targetDeviceNumber && Array.from(values).some(value => value.includes(targetDeviceNumber))) score += 6
      if (targetDeviceName && Array.from(values).some(value => value.includes(targetDeviceName))) score += 4
      return { device, score }
    })
    .sort((a, b) => b.score - a.score)[0]?.device || null
}

async function resolveVibrationSchedulePayload(selected: WorkOrder, headers: Record<string, string>) {
  const fallbackTestType = (await resolveEngineerAssistantTestTypeId('振动台', headers))
    || (await resolveEngineerAssistantTestTypeId('振动', headers))
    || ''

  const fallback = {
    testId: String(selected.id || selected.dbId || ''),
    testType: fallbackTestType,
    equipmentId: String(selected.deviceNumber || selected.device || selected.id || ''),
  }

  const formsResp = await getEngineerAssistantApplicationForms(headers)
  const forms = formsResp.success && formsResp.data?.code === 0 ? formsResp.data.data?.list || [] : []
  if (!forms.length) return fallback

  const selectedOrderNo = normalizeText(selected.id)
  const selectedDeviceName = normalizeText(selected.device)
  const selectedApplicant = normalizeText(selected.applicant)

  const matched = forms
    .map((form) => {
      const haystack = new Set<string>()
      collectStringValues(form.baseInfo, haystack)
      collectStringValues(form.raw, haystack)
      const values = Array.from(haystack)
      let score = 0
      if (selectedOrderNo && (normalizeText(form.testId) === selectedOrderNo || values.some(value => value.includes(selectedOrderNo)))) score += 8
      if (selectedDeviceName && values.some(value => value.includes(selectedDeviceName))) score += 4
      if (selectedApplicant && values.some(value => value.includes(selectedApplicant))) score += 2
      if (normalizeText(form.testTypeName).includes('振动')) score += 1
      return { form, score }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.form

  if (!matched) return fallback

  const device = findBestMatchedDevice(Array.isArray(matched.devices) ? matched.devices as any[] : [], selected)
  const matchedEquipmentId = device ? pickEquipmentIdFromDevice(device) : ''

  return {
    testId: String(matched.testId || fallback.testId),
    testType: String(matched.testType || fallback.testType),
    equipmentId: matchedEquipmentId || fallback.equipmentId,
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

  const selected = selectedScheduledOrders.value[0]
  if (!selected) return
  const scheduleInfo = getScheduleChangePayload(selected.id)
  if (scheduleInfo) {
    console.log(`[vibration schedule] ${scheduleInfo.startAtHour} ~ ${scheduleInfo.endAtHour}`)
  } else {
    console.log('[vibration schedule] no scheduled range')
  }
  if (scheduleInfo) {
    const ok = await initAuth()
    if (!ok) {
      ElMessage.warning('未登录，已跳过第三方排期推送并继续开始实验')
    } else {
      const headers = getAuthHeaders()
      const pushPayload = await resolveVibrationSchedulePayload(selected, headers)
      if (pushPayload.testType && pushPayload.testId && pushPayload.equipmentId) {
        console.log('[vibration schedule push]', pushPayload)
        const resp = await pushEngineerAssistantSchedules(
          {
            schedulesInfo: [
              {
                testId: pushPayload.testId,
                testType: pushPayload.testType,
                equipmentId: pushPayload.equipmentId,
                startTime: scheduleInfo.startAtHour,
                endTime: scheduleInfo.endAtHour,
              },
            ],
          },
          headers
        )
        if (!resp.success || !resp.data || resp.data.code !== 0) {
          ElMessage.warning(`推送第三方排期失败，已继续开始实验${resp.error ? `：${resp.error}` : ''}`)
        }
      } else {
        ElMessage.warning('未匹配到可用的第三方 testId / testType / equipmentId，已跳过第三方排期推送并继续开始实验')
      }
    }
  }

  orderStatusMutating.value = true
  try {
    const resp = await updateVibrationTableOrder(selected.dbId!, { status: 2 })
    if (!resp.success || !resp.data || resp.data.code !== 0) {
      ElMessage.warning('工单状态更新失败，已继续进入实验流程')
    } else {
      void refreshWorkOrders()
    }
  } catch {
    ElMessage.warning('工单状态更新异常，已继续进入实验流程')
  } finally {
    orderStatusMutating.value = false
  }

  currentWorkOrderId.value = selected.id
  currentWorkOrderSnapshot.value = selected
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

  const order = currentWorkOrderSnapshot.value
  if (order && order.dbId !== undefined) {
    orderStatusMutating.value = true
    try {
      const resp = await updateVibrationTableOrder(order.dbId, { status: finalStatus })
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        const ok = confirm(`工单状态更新失败，是否仍返回主页？`)
        if (!ok) return
      } else {
        void refreshWorkOrders()
      }
    } finally {
      orderStatusMutating.value = false
    }
  }

  if (finalStatus === 5 && currentWorkOrderId.value) {
    removeScheduledOrder(currentWorkOrderId.value)
  }

  stage.value = 'dashboard'
  currentWorkOrderId.value = null
  currentWorkOrderSnapshot.value = null
  showStartupCheck.value = false
}

function handleCancelStartupCheck() {
  backToDashboard(1)
}

function goPrevStage() {
  if (stage.value === 'start') backToDashboard(1)
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
  if (currentWorkOrderSnapshot.value) {
    currentWorkOrderSnapshot.value = {
      ...currentWorkOrderSnapshot.value,
      mode: 'formal',
      type: '正式实验'
    }
  }
  devCheckItems.value.forEach(i => { i.answer = 'yes'; i.remark = '' })
  showSafetyWarning.value = false
  stage.value = 'devcheck'
}

function finishShutdown() {
  resetShutdownChecks()
  backToDashboard(5) // 完成整个测试，状态置为正常(5)
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
        :cal-step="calStep"
        :live-level="testing.liveLevel.value"
        :live-freq="testing.liveFreq.value"
        :vib-data-count="testing.vibDataCount.value"
        :formatted-duration="testing.formattedDuration.value"
        :is-running="testing.isRunning.value"
        :is-paused="testing.isPaused.value"
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
