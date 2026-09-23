<script setup lang="ts">
import { displayOrderNumber } from './utils/orderNumber'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DashboardPanel from './components/DashboardPanel.vue'
import StartupCheckModal from './components/StartupCheckModal.vue'
import StartPanel from './components/StartPanel.vue'
import TestingPanel from './components/TestingPanel.vue'
import ReportPanel from './components/ReportPanel.vue'
import ReportListPanel from './components/ReportListPanel.vue'
import ActionModals from './components/ActionModals.vue'
import { useHighTempPressureSchedule } from './composables/useHighTempPressureSchedule'
import { useHighTempPressureStartupCheck } from './composables/useHighTempPressureStartupCheck'
import { useHighTempPressureTesting } from './composables/useHighTempPressureTesting'
import { useAuth } from '@/composables/useAuth'
import { useLayout } from '@/composables/useLayout'
import {
  cancelHighTempPressureOrder,
  finishHighTempPressureOrder,
  retestHighTempPressureOrder,
  startHighTempPressureOrder,
} from '@/services/high-temp-pressure-api'
import type { ScheduledSelection, WorkOrder } from './types'
import {
  createHighTempPressureClientSubmitId,
  loadPendingHighTempPressureReports,
  removePendingHighTempPressureReport,
  savePendingHighTempPressureReport,
  type HighTempPressureReportDraft,
  type HighTempPressurePendingReport,
} from './utils/pendingReport'

const schedule = useHighTempPressureSchedule()
const startupCheck = useHighTempPressureStartupCheck()
const testing = useHighTempPressureTesting()
const { initAuth, getAuthHeaders } = useAuth()
const { enterEditMode, exitEditMode } = useLayout()
const completedSelections = ref<ScheduledSelection[]>([])
const activeTestSelections = ref<ScheduledSelection[]>([])
const productPickerVisible = ref(false)
const selectedProductIds = ref<string[]>([])
const pendingReportSession = ref<HighTempPressurePendingReport | null>(null)
const pendingReportSessions = ref<HighTempPressurePendingReport[]>([])
const pendingReportCount = computed(() => pendingReportSessions.value.length)
const reportCenterInitialTab = ref<'pending' | 'server'>('pending')
const testCompletionSaving = ref(false)
const testCompletionSavingText = ref('')
const testStartSubmitting = ref(false)
const backendTestStarted = ref(false)
const canReturnToScheduleBeforeTest = computed(() =>
  testing.currentPanel.value === 'testing' &&
  !backendTestStarted.value &&
  !testStartSubmitting.value &&
  !testing.testRunning.value &&
  !testing.captureOutputDir.value
)

watch(
  () => testing.currentPanel.value,
  (panel) => {
    if (panel === 'start' || panel === 'testing') {
      enterEditMode()
    } else {
      exitEditMode()
    }
  },
  { immediate: true }
)

const pageHeaderMeta = computed(() => {
  if (testing.currentPanel.value === 'reports') {
    return {
      icon: 'mdi:file-document-multiple-outline',
      title: '高温高压井报告中心',
      subtitle: '管理待填写报告并查看服务端测试报告',
    }
  }
  if (testing.currentPanel.value === 'report') {
    return {
      icon: 'mdi:file-document-edit-outline',
      title: '填写高温高压测试报告',
      subtitle: '按测试设备完善报告信息并提交审核',
    }
  }
  return {
    icon: 'mdi:gas-burner',
    title: '高温高压井',
    subtitle: '高温高压井测试系统',
  }
})

const productPickerRows = computed(() =>
  schedule.selectedScheduledOrders.value.map((selection) => ({
    id: selection.instrument.id,
    name: selection.instrument.label,
    sn: selection.instrument.sn,
    orderNo: displayOrderNumber(selection.order),
    customer: selection.order.applicant,
  }))
)

function refreshWorkOrdersInBackground() {
  void schedule.refreshWorkOrders()
}

function reloadPendingReports() {
  pendingReportSessions.value = loadPendingHighTempPressureReports()
}

function openReportCenter() {
  reloadPendingReports()
  pendingReportSession.value = null
  completedSelections.value = []
  reportCenterInitialTab.value = 'pending'
  testing.switchPanel('reports')
}

function returnToDashboard() {
  pendingReportSession.value = null
  completedSelections.value = []
  testing.switchPanel('dashboard')
}

async function handleHeaderReturnToDashboard() {
  if (canReturnToScheduleBeforeTest.value) {
    await testing.resetTestSession()
    backendTestStarted.value = false
  }
  returnToDashboard()
}

function openPendingReport(session: HighTempPressurePendingReport) {
  pendingReportSession.value = session
  completedSelections.value = session.selections.slice()
  testing.exportedCaptureDir.value = session.exportedCaptureDir
  testing.csvCount.value = session.csvCount
  testing.onlineSeconds.value = session.runtimeSeconds
  testing.switchPanel('report')
}

async function removePendingReport(session: HighTempPressurePendingReport) {
  try {
    await ElMessageBox.confirm(
      `确认从待办列表移除工单 ${Array.from(new Set(session.selections.map((item) => displayOrderNumber(item.order)))).join('、')} 的报告记录吗？采集目录中的文件不会被删除。`,
      '移除待报告记录',
      { type: 'warning', confirmButtonText: '确认移除', cancelButtonText: '取消' }
    )
    if (!removePendingHighTempPressureReport(session.clientSubmitId)) {
      throw new Error('本机缓存更新失败')
    }
    reloadPendingReports()
    ElMessage.success('待报告记录已移除，采集文件仍保留在原目录')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '移除失败')
  }
}

watch(
  () => productPickerRows.value.map((row) => row.id).join('|'),
  () => {
    const validIds = new Set(productPickerRows.value.map((row) => row.id))
    selectedProductIds.value = selectedProductIds.value.filter((id) => validIds.has(id))
  }
)

function toggleProductSelection(instrumentId: string, checked: boolean) {
  const set = new Set(selectedProductIds.value)
  if (checked) set.add(instrumentId)
  else set.delete(instrumentId)
  selectedProductIds.value = Array.from(set)
}

function selectAllProducts() {
  selectedProductIds.value = productPickerRows.value.map((row) => row.id)
}

function clearProductSelection() {
  selectedProductIds.value = []
}

function backToStartupCheck() {
  testing.switchPanel('dashboard')
  startupCheck.openStartupCheck()
}

async function handleStartScheduledTest() {
  if (schedule.selectedScheduledOrders.value.length === 0) {
    ElMessage.warning('请先在日历中选择已排程的仪器')
    return
  }
  if (selectedProductIds.value.length === 0) selectAllProducts()
  productPickerVisible.value = true
}

async function confirmProductSelection() {
  if (selectedProductIds.value.length === 0) {
    ElMessage.warning('请先选择要开始实验的测试产品')
    return
  }
  const selectedProductIdSet = new Set(selectedProductIds.value)
  const selectedSelections = schedule.selectedScheduledOrders.value.filter((selection) =>
    selectedProductIdSet.has(selection.instrument.id)
  )
  if (!selectedSelections.length) {
    ElMessage.warning('未找到已选中的仪器')
    return
  }
  const selectedTestTypes = new Set(
    selectedSelections.map((selection) => String(selection.order.testType || '').trim())
  )
  if (selectedTestTypes.size > 1) {
    ElMessage.warning('同一次实验请选择相同测试类型的设备')
    return
  }
  schedule.selectedScheduledOrderIds.value = selectedProductIds.value.slice()
  activeTestSelections.value = selectedSelections.slice()
  productPickerVisible.value = false
  startupCheck.openStartupCheck()
}

function handleStartupCheckComplete() {
  startupCheck.showStartupCheck.value = false
  testing.switchPanel('start')
}

async function handleConfirmStart() {
  const selections = activeTestSelections.value.length ? activeTestSelections.value : schedule.selectedScheduledOrders.value
  if (!selections.length) {
    ElMessage.error('未找到已选中的仪器')
    return
  }

  backendTestStarted.value = false
  completedSelections.value = []
  await testing.confirmStart(String(selections[0]?.order.testType || '').trim())
}

async function handleBeginTest() {
  if (testStartSubmitting.value || backendTestStarted.value) return

  const selections = activeTestSelections.value.length ? activeTestSelections.value : schedule.selectedScheduledOrders.value
  if (!selections.length) {
    ElMessage.error('未找到已选中的仪器')
    return
  }
  if (testing.ocrDeviceIndex.value === null) {
    ElMessage.warning('请先选择采集卡，再开始测试')
    return
  }
  const runningInstrumentIds = selections.map((selection) => selection.instrument.id)
  const uniqueOrders = Array.from(new Map(selections.map((selection) => [selection.order.id, selection.order])).values())
  const missingDbOrder = uniqueOrders.find((order) => typeof order.dbId !== 'number')
  if (missingDbOrder) {
    ElMessage.error('未找到工单ID')
    return
  }

  testStartSubmitting.value = true
  try {
    const authOk = await initAuth()
    if (!authOk) {
      ElMessage.error('登录已失效，请重新登录后再开始实验')
      return
    }

    // 状态2工单中的其他未测试设备/重测设备也必须通知服务端开始，不能只改本地状态。
    const startResults = await Promise.all(uniqueOrders.map(async (order) => {
      const dbId = order.dbId
      if (typeof dbId !== 'number') {
        throw new Error(`工单 ${displayOrderNumber(order)} 未找到工单ID`)
      }
      const orderInstrumentSns = Array.from(new Set(
        selections
          .filter((selection) => selection.order.id === order.id)
          .map((selection) => selection.instrument.sn)
          .filter(Boolean)
      ))
      const res = await startHighTempPressureOrder(dbId, { instrument_sns: orderInstrumentSns }, getAuthHeaders())
      return { order, res }
    }))

    const failed = startResults.find(({ res }) => !res.success || res.data?.code !== 0)
    if (failed) {
      ElMessage.error(failed.res.data?.msg || failed.res.error || `工单 ${displayOrderNumber(failed.order)} 开始测试失败`)
      return
    }

    uniqueOrders.forEach((order) => schedule.markOrderStarted(order.id))
    schedule.markInstrumentsRunning(runningInstrumentIds)
    backendTestStarted.value = true
    refreshWorkOrdersInBackground()
    await testing.connectOcrDevice()
  } catch (e) {
    ElMessage.error('开始测试失败')
  } finally {
    testStartSubmitting.value = false
  }
}

async function handleOcrDeviceSelection(deviceIndex: number) {
  const selected = await testing.selectOcrDevice(deviceIndex)
  if (!selected || !backendTestStarted.value) return
  await testing.connectOcrDevice()
}

async function handleConfirmEnd() {
  if (testCompletionSaving.value) return

  const currentSelections = activeTestSelections.value.length
    ? activeTestSelections.value
    : schedule.selectedScheduledOrders.value
  completedSelections.value = currentSelections.slice()

  if (!currentSelections.length) {
    ElMessage.error('未找到已选中的仪器')
    return
  }

  // 结束测试会固化 OCR 数据、写入本地恢复记录并更新服务端状态，必须串行执行。
  testCompletionSaving.value = true
  testCompletionSavingText.value = '正在停止采集并保存 OCR 数据…'
  const endConfirmedAt = Date.now()

  try {
    const orderNumbers = Array.from(new Set(
      currentSelections.map((selection) => selection.order.no.trim()).filter(Boolean)
    ))
    const captureSaved = await testing.finalizeOcrCapture({
      orderNumbers,
      completedAtMs: endConfirmedAt,
    })
    if (!captureSaved) return

    testCompletionSavingText.value = '正在固化待提交报告数据…'
    const recoverySession: HighTempPressurePendingReport = {
      version: 1,
      phase: 'finishing',
      selections: currentSelections,
      exportedCaptureDir: testing.exportedCaptureDir.value,
      csvCount: testing.csvCount.value,
      runtimeSeconds: testing.onlineSeconds.value,
      clientSubmitId: createHighTempPressureClientSubmitId(),
      savedAt: new Date().toISOString(),
    }
    if (!savePendingHighTempPressureReport(recoverySession)) {
      ElMessage.error('无法保存待提交报告的恢复记录，请检查客户端存储后重试结束测试')
      return
    }
    pendingReportSession.value = recoverySession

    const groupedByOrder = new Map<string, { order: ScheduledSelection['order']; selections: ScheduledSelection[] }>()
    currentSelections.forEach((selection) => {
      const group = groupedByOrder.get(selection.order.id)
      if (group) {
        group.selections.push(selection)
        return
      }
      groupedByOrder.set(selection.order.id, { order: selection.order, selections: [selection] })
    })

    const ordersToFinish: ScheduledSelection['order'][] = []
    const partialOrderNos: string[] = []
    groupedByOrder.forEach(({ order }) => {
      if (typeof order.dbId !== 'number') {
        throw new Error(`工单 ${displayOrderNumber(order)} 未找到工单ID`)
      }
      ordersToFinish.push(order)
    })

    const readyReportOrderNos: string[] = []
    if (ordersToFinish.length) {
      testCompletionSavingText.value = '正在更新工单和设备测试状态…'
      const authOk = await initAuth()
      if (!authOk) {
        throw new Error('登录已失效，请重新登录后再结束测试')
      }
      for (const order of ordersToFinish) {
        if (typeof order.dbId !== 'number') {
          throw new Error(`工单 ${displayOrderNumber(order)} 未找到工单ID`)
        }
        const orderSelections = groupedByOrder.get(order.id)?.selections || []
        const instrumentSns = Array.from(new Set(orderSelections.map((selection) => selection.instrument.sn).filter(Boolean)))
        const res = await finishHighTempPressureOrder(order.dbId, { instrument_sns: instrumentSns }, getAuthHeaders())
        if (!res.success || res.data?.code !== 0) {
          throw new Error(res.data?.msg || res.error || `工单 ${displayOrderNumber(order)} 结束测试失败`)
        }
        if ((res.data.data?.remaining_count ?? 0) === 0) {
          readyReportOrderNos.push(displayOrderNumber(order))
        } else {
          partialOrderNos.push(displayOrderNumber(order))
        }
      }
    }

    currentSelections.forEach((selection) => schedule.markInstrumentCompleted(selection.instrument.id))
    recoverySession.phase = 'report'
    recoverySession.savedAt = new Date().toISOString()
    savePendingHighTempPressureReport(recoverySession)
    reloadPendingReports()
    testCompletionSavingText.value = '正在刷新排程状态…'
    await schedule.refreshWorkOrders()

    const uniqueReadyReportOrderNos = Array.from(new Set(readyReportOrderNos))
    const pendingOrderNos = Array.from(new Set(partialOrderNos))
    if (uniqueReadyReportOrderNos.length && pendingOrderNos.length) {
      ElMessage.success(`${uniqueReadyReportOrderNos.join('、')} 的报告已进入报告中心；${pendingOrderNos.join('、')} 仍有仪器待测试`)
    } else if (uniqueReadyReportOrderNos.length) {
      ElMessage.success(`工单 ${uniqueReadyReportOrderNos.join('、')} 已完成测试，报告已进入报告中心`)
    } else {
      ElMessage.success('当前仪器测试已完成，报告已进入报告中心，其余仪器仍保留在待排程列表')
    }
    testing.endTest(endConfirmedAt)
    schedule.clearSelectedSchedule()
    activeTestSelections.value = []
    completedSelections.value = []
    pendingReportSession.value = null
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '结束测试失败')
  } finally {
    testCompletionSaving.value = false
    testCompletionSavingText.value = ''
  }
}

async function handleRetestInstrument(order: WorkOrder, instrumentSn: string) {
  if (typeof order.dbId !== 'number' || !instrumentSn) {
    ElMessage.error('未找到重测设备对应的工单信息')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认重新测试设备 ${instrumentSn} 吗？当前报告将退出待审核并保留为历史记录。`,
      '重新测试',
      { type: 'warning', confirmButtonText: '确认重测', cancelButtonText: '取消' }
    )
    const authOk = await initAuth()
    if (!authOk) {
      ElMessage.error('登录已失效，请重新登录后再操作')
      return
    }
    const res = await retestHighTempPressureOrder(
      order.dbId,
      { instrument_sns: [instrumentSn] },
      getAuthHeaders()
    )
    if (!res.success || res.data?.code !== 0) {
      throw new Error(res.data?.msg || res.error || '重测设置失败')
    }
    await schedule.refreshWorkOrders()
    ElMessage.success(`设备 ${instrumentSn} 已恢复为待排程`)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '重测设置失败')
  }
}

async function handleReportSubmitted() {
  const submittedSession = pendingReportSession.value
  if (submittedSession) {
    removePendingHighTempPressureReport(submittedSession.clientSubmitId)
  }
  reloadPendingReports()
  pendingReportSession.value = null
  completedSelections.value = []
  reportCenterInitialTab.value = 'server'
  testing.switchPanel('reports')
  await schedule.refreshWorkOrders()
}

function handleReportDraftChange(draft: HighTempPressureReportDraft) {
  if (!pendingReportSession.value) return
  pendingReportSession.value.draft = draft
  pendingReportSession.value.savedAt = new Date().toISOString()
  savePendingHighTempPressureReport(pendingReportSession.value)
}

async function handleConfirmStop() {
  const currentSelections = activeTestSelections.value.length
    ? activeTestSelections.value
    : schedule.selectedScheduledOrders.value
  await testing.stopTest()

  if (!currentSelections.length) {
    ElMessage.info('已中止本次测试，OCR 采集状态已重置')
    return
  }

  const groupedByOrder = new Map<string, { order: ScheduledSelection['order']; selections: ScheduledSelection[] }>()
  currentSelections.forEach((selection) => {
    const group = groupedByOrder.get(selection.order.id)
    if (group) {
      group.selections.push(selection)
      return
    }
    groupedByOrder.set(selection.order.id, { order: selection.order, selections: [selection] })
  })

  try {
    const authOk = await initAuth()
    if (!authOk) {
      throw new Error('登录已失效，请重新登录后再中止测试')
    }

    for (const { order, selections } of groupedByOrder.values()) {
      if (typeof order.dbId !== 'number') {
        throw new Error(`工单 ${displayOrderNumber(order)} 未找到工单ID`)
      }
      const instrumentSns = Array.from(new Set(selections.map((selection) => selection.instrument.sn).filter(Boolean)))
      const res = await cancelHighTempPressureOrder(order.dbId, { instrument_sns: instrumentSns }, getAuthHeaders())
      if (!res.success || res.data?.code !== 0) {
        throw new Error(res.data?.msg || res.error || `工单 ${displayOrderNumber(order)} 中止测试失败`)
      }
    }

    currentSelections.forEach((selection) => schedule.cancelScheduledInstrument(selection.instrument.id))
    schedule.clearRunningInstruments(currentSelections.map((selection) => selection.instrument.id))
    activeTestSelections.value = []
    await schedule.refreshWorkOrders()
    ElMessage.info('已中止本次测试，工单已回到待排程')
  } catch (e) {
    await schedule.refreshWorkOrders()
    ElMessage.error(e instanceof Error ? e.message : '中止测试失败，工单状态未回退')
  }
}

async function handleShutdownComplete() {
  pendingReportSession.value = null
  completedSelections.value = []
  activeTestSelections.value = []
  schedule.clearSelectedSchedule()
  await testing.resetTestSession()
  testing.switchPanel('dashboard')
  await schedule.refreshWorkOrders()
}

onMounted(async () => {
  await testing.resetTestSession()
  schedule.resetScheduleState()
  await schedule.refreshWorkOrders()
  reloadPendingReports()
  if (pendingReportSessions.value.length > 0) {
    ElMessage.info(`发现 ${pendingReportSessions.value.length} 份待处理的高温高压报告，可从报告中心继续填写`)
  }
})

onUnmounted(() => {
  exitEditMode()
})
</script>

<template>
  <div
    class="high-temp-pressure-page"
    :class="{ 'is-testing-panel': testing.currentPanel.value === 'testing' }"
  >
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon">
          <Icon :icon="pageHeaderMeta.icon" />
        </div>
        <div>
          <h1 class="header-title">{{ pageHeaderMeta.title }}</h1>
          <p class="header-subtitle">{{ pageHeaderMeta.subtitle }}</p>
        </div>
      </div>
      <div class="header-right">
        <button
          v-if="testing.currentPanel.value === 'dashboard'"
          class="report-center-button"
          @click="openReportCenter"
        >
          <Icon icon="mdi:file-document-multiple-outline" />
          报告中心
          <span v-if="pendingReportCount" class="report-count-badge">{{ pendingReportCount }}</span>
        </button>
        <button
          v-if="testing.currentPanel.value === 'report'"
          class="week-cal-nav header-nav-button"
          @click="openReportCenter"
        >
          <Icon icon="mdi:format-list-bulleted" /> 报告列表
        </button>
        <button
          v-if="testing.currentPanel.value === 'start' || canReturnToScheduleBeforeTest || testing.currentPanel.value === 'reports' || testing.currentPanel.value === 'report'"
          class="week-cal-nav header-nav-button"
          @click="handleHeaderReturnToDashboard"
        >
          <Icon icon="mdi:calendar-clock-outline" /> 返回排程
        </button>
      </div>
    </div>

    <StartupCheckModal
      :visible="startupCheck.showStartupCheck.value"
      :check-items="startupCheck.checkItems.value"
      :all-checked="startupCheck.allChecked.value"
      @toggle-check="startupCheck.toggleCheck"
      @close="startupCheck.showStartupCheck.value = false"
      @complete="handleStartupCheckComplete"
    />

    <div class="content-area">
      <DashboardPanel
        v-if="testing.currentPanel.value === 'dashboard'"
        :unscheduled-orders="schedule.unscheduledOrders.value"
        :work-orders-loading="schedule.workOrdersLoading.value"
        :schedule-operation-loading="schedule.scheduleOperationLoading.value"
        :search-keyword="schedule.searchKeyword.value"
        :host-device-tabs="schedule.hostDeviceTabs.value"
        :active-host-device-name="schedule.activeHostDeviceName.value"
        :current-assign-order-id="schedule.currentAssignOrderId.value"
        :cal-base="schedule.calBase.value"
        :week-label="schedule.weekLabel.value"
        :current-week-days="schedule.currentWeekDays.value"
        :time-slots="schedule.timeSlots.value"
        :scheduled-orders="schedule.scheduledOrders.value"
        :scheduled-layout-items="schedule.scheduledLayoutItems.value"
        :max-lane-count="schedule.maxLaneCount.value"
        :slot-height-px="schedule.slotHeightPx"
        :is-dragging="schedule.isDragging.value"
        :start-resize="schedule.startResize"
        :start-resize-top="schedule.startResizeTop"
        :resizing-event-id="schedule.resizingEventId.value"
        :is-resizing="schedule.isResizing.value"
        :selected-scheduled-order-ids="schedule.selectedScheduledOrderIds.value"
        :selected-scheduled-orders="schedule.selectedScheduledOrders.value"
        :fmt-date="schedule.fmtDate"
        :get-cell-key="schedule.getCellKey"
        :get-instrument-by-id="schedule.getInstrumentById"
        :get-order-by-instrument-id="schedule.getOrderByInstrumentId"
        :is-instrument-pending="schedule.isInstrumentPending"
        :is-instrument-running="schedule.isInstrumentRunning"
        @update:search-keyword="schedule.searchKeyword.value = $event"
        @assign-host-device="schedule.assignHostDeviceToCurrentOrder"
        @select-assign-order="schedule.selectAssignOrder"
        @order-drag-start="schedule.handleOrderDragStart"
        @drag-end="schedule.handleDragEnd"
        @prev-week="schedule.prevWeek"
        @next-week="schedule.nextWeek"
        @goto-date="schedule.gotoDate"
        @load-preset-schedule="schedule.loadPresetSchedule"
        @drag-over="schedule.handleDragOver"
        @drag-leave="schedule.handleDragLeave"
        @drop="schedule.handleDrop"
        @select-scheduled-order="schedule.handleSelectScheduledOrder"
        @unschedule="schedule.handleUnschedule"
        @start-scheduled-test="handleStartScheduledTest"
        @retest-instrument="handleRetestInstrument"
        @refresh="schedule.refreshWorkOrders"
      />

      <StartPanel
        v-if="testing.currentPanel.value === 'start'"
        :current-selected="schedule.currentSelected.value"
        :selected-scheduled-orders="activeTestSelections.length ? activeTestSelections : schedule.selectedScheduledOrders.value"
        @back-to-startup-check="backToStartupCheck"
        @confirm-start="handleConfirmStart"
      />

      <TestingPanel
        v-if="testing.currentPanel.value === 'testing'"
        :t1="testing.state.chartData.t1"
        :t2="testing.state.chartData.t2"
        :p="testing.state.chartData.p"
        :test-running="testing.testRunning.value"
        :test-started="backendTestStarted"
        :start-submitting="testStartSubmitting"
        :test-start-time="testing.testStartTime.value"
        :online-timer-str="testing.onlineTimerStr.value"
        :csv-count="testing.csvCount.value"
        :current-selected="schedule.currentSelected.value"
        :ocr-device-index="testing.ocrDeviceIndex.value"
        :ocr-device-name="testing.ocrDeviceName.value"
        :ocr-devices="testing.ocrDevices.value"
        :ocr-devices-loading="testing.ocrDevicesLoading.value"
        :ocr-ready-pct="testing.ocrReadyPct.value"
        :capture-status-text="testing.captureStatusText.value"
        :latest-frame-url="testing.latestFrameUrl.value"
        :exported-capture-dir="testing.exportedCaptureDir.value"
        :ocr-measurements="testing.ocrMeasurements.value"
        :chart-window-minutes="testing.chartWindowMinutes.value"
        :chart-range-locked="testing.chartRangeLocked.value"
        :chart-summary="testing.chartSummary"
        :chart-series-visibility="testing.chartSeriesVisibility"
        @start-test="handleBeginTest"
        @refresh-ocr-devices="testing.refreshOcrDevices"
        @select-ocr-device="handleOcrDeviceSelection"
        @set-chart-window="testing.setChartWindowMinutes"
        @toggle-chart-series="testing.toggleChartSeries"
        @show-all-chart-series="testing.showAllChartSeries"
        @pause="testing.pauseTest"
        @resume="testing.resumeTest"
        @open-stop-modal="testing.showModal('stop-test')"
        @open-end-modal="testing.showModal('end-test')"
      />

      <ReportListPanel
        v-if="testing.currentPanel.value === 'reports'"
        :pending-reports="pendingReportSessions"
        :initial-tab="reportCenterInitialTab"
        @open-pending="openPendingReport"
        @remove-pending="removePendingReport"
        @back="returnToDashboard"
      />

      <ReportPanel
        v-if="testing.currentPanel.value === 'report'"
        :key="pendingReportSession?.clientSubmitId || 'submitted-report'"
        :current-selected="schedule.currentSelected.value"
        :selected-scheduled-orders="completedSelections.length ? completedSelections : schedule.selectedScheduledOrders.value"
        :csv-count="testing.csvCount.value"
        :exported-capture-dir="testing.exportedCaptureDir.value"
        :runtime-seconds="testing.onlineSeconds.value"
        :client-submit-id="pendingReportSession?.clientSubmitId || ''"
        :initial-draft="pendingReportSession?.draft"
        @report-draft-change="handleReportDraftChange"
        @report-submitted="handleReportSubmitted"
        @shutdown-complete="handleShutdownComplete"
      />
    </div>

    <div v-if="testing.currentPanel.value === 'dashboard' && productPickerVisible" class="product-picker-mask">
      <div class="product-picker-dialog">
        <div class="product-picker-header">
          <div>
            <h3>选择测试产品</h3>
            <p>已排程工单确认开始实验后，在这里选择本次实际开始测试的产品。</p>
          </div>
          <button class="product-picker-close" @click="productPickerVisible = false">×</button>
        </div>
        <div class="product-picker-actions">
          <button class="week-cal-nav" @click="selectAllProducts">全选</button>
          <button class="week-cal-nav" @click="clearProductSelection">清空</button>
          <span>已选择 {{ selectedProductIds.length }} / {{ productPickerRows.length }} 个产品</span>
        </div>
        <div class="product-picker-list">
          <label v-for="row in productPickerRows" :key="row.id" class="product-picker-row">
            <input
              type="checkbox"
              :checked="selectedProductIds.includes(row.id)"
              @change="toggleProductSelection(row.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="product-main">{{ row.name }}</span>
            <span class="product-sub">{{ row.sn || '-' }}</span>
            <span class="product-order">{{ row.orderNo }} · {{ row.customer }}</span>
          </label>
        </div>
        <div class="product-picker-footer">
          <button class="week-cal-nav" @click="productPickerVisible = false">取消</button>
          <button class="primary-btn" :disabled="selectedProductIds.length === 0" @click="confirmProductSelection">
            确认开始实验
          </button>
        </div>
      </div>
    </div>

    <ActionModals
      :active-modal="testing.activeModal.value"
      :current-selected="schedule.currentSelected.value"
      :selected-scheduled-orders="schedule.selectedScheduledOrders.value"
      :confirm-end-saving="testCompletionSaving"
      :confirm-end-saving-text="testCompletionSavingText"
      @close="testing.closeModal"
      @confirm-start="handleConfirmStart"
      @confirm-end="handleConfirmEnd"
      @confirm-stop="handleConfirmStop"
    />
  </div>
</template>

<style scoped src="./components/high-temp-pressure.shared.css"></style>
<style scoped>
.report-center-button,
.header-nav-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.high-temp-pressure-page.is-testing-panel .page-header {
  min-height: 42px;
  margin-bottom: 8px;
}

.high-temp-pressure-page.is-testing-panel .header-left {
  gap: 10px;
}

.high-temp-pressure-page.is-testing-panel .page-header .header-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  font-size: 17px;
}

.high-temp-pressure-page.is-testing-panel .header-title {
  font-size: 16px;
  line-height: 1.2;
}

.high-temp-pressure-page.is-testing-panel .header-subtitle {
  margin-top: 1px;
  font-size: 12px;
  line-height: 1.2;
}

.high-temp-pressure-page.is-testing-panel .header-nav-button {
  min-height: 34px;
  padding: 7px 11px;
}

.report-center-button {
  padding: 9px 13px;
  border: 1px solid rgba(59, 130, 246, 0.28);
  border-radius: 9px;
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-accent-blue);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.report-center-button:hover {
  background: rgba(59, 130, 246, 0.16);
}

.report-count-badge {
  min-width: 21px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--color-error);
  color: white;
  font-size: 11px;
  line-height: 17px;
  text-align: center;
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
