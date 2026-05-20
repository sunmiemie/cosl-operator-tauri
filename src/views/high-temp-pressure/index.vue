<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import DashboardPanel from './components/DashboardPanel.vue'
import StartupCheckModal from './components/StartupCheckModal.vue'
import StartPanel from './components/StartPanel.vue'
import TestingPanel from './components/TestingPanel.vue'
import ReportPanel from './components/ReportPanel.vue'
import ActionModals from './components/ActionModals.vue'
import { useHighTempPressureSchedule } from './composables/useHighTempPressureSchedule'
import { useHighTempPressureStartupCheck } from './composables/useHighTempPressureStartupCheck'
import { useHighTempPressureTesting } from './composables/useHighTempPressureTesting'
import { useAuth } from '@/composables/useAuth'
import { pushEngineerAssistantSchedules, resolveEngineerAssistantTestType } from '@/services'
import { finishHighTempPressureOrder, startHighTempPressureOrder } from '@/services/high-temp-pressure-api'
import type { ScheduledSelection } from './types'

const schedule = useHighTempPressureSchedule()
const startupCheck = useHighTempPressureStartupCheck()
const testing = useHighTempPressureTesting()
const { initAuth, getAuthHeaders } = useAuth()
const completedSelections = ref<ScheduledSelection[]>([])
const activeTestSelections = ref<ScheduledSelection[]>([])

function handleStartupCheckComplete() {
  startupCheck.showStartupCheck.value = false
  testing.showModal('confirm-start')
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
  const current = schedule.currentSelected.value
  if (!current) {
    ElMessage.warning('未找到已选中的仪器')
    return
  }
  const selectedScheduleInfos = schedule.selectedScheduledOrders.value
    .map((selection) => ({
      selection,
      scheduleInfo: schedule.getScheduleChangePayload(selection.instrument.id),
    }))
    .filter((item) => item.scheduleInfo)
  console.log('[high-temp-pressure schedule]', selectedScheduleInfos)
  if (selectedScheduleInfos.length) {
    const ok = await initAuth()
    if (!ok) {
      const cont = confirm('未登录，无法推送第三方排期，是否仍继续开始实验？')
      if (!cont) return
    } else {
      const headers = getAuthHeaders()
      const testTypeResult = await resolveEngineerAssistantTestType('高温高压井', headers)
      const testType = testTypeResult.typeId || ''
      if (testType) {
        if (testTypeResult.source === 'fallback') {
          const reason = testTypeResult.error ? `：${testTypeResult.error}` : ''
          ElMessage.warning(`未从接口匹配到高温高压井测试类型，已使用默认 testType=${testType}${reason}`)
        }
        const resp = await pushEngineerAssistantSchedules(
          {
            schedulesInfo: selectedScheduleInfos.map(({ selection, scheduleInfo }) => ({
              testId: String(selection.order.dbId ?? selection.order.id),
              testType,
              equipmentId: String(selection.instrument.id),
              startTime: scheduleInfo!.startAtHour,
              endTime: scheduleInfo!.endAtHour,
            })),
          },
          headers
        )
        if (!resp.success || !resp.data || resp.data.code !== 0) {
          const cont = confirm('推送第三方排期失败，是否仍继续开始实验？')
          if (!cont) return
        }
      } else {
        const availableTypes = testTypeResult.candidates
          .map((item) => item.typeName || item.name)
          .filter(Boolean)
          .slice(0, 6)
          .join('、')
        const detailLines = [
          testTypeResult.error ? `原因：${testTypeResult.error}` : '',
          availableTypes ? `当前返回类型：${availableTypes}` : '',
        ].filter(Boolean)
        const cont = confirm(`未匹配到第三方测试类型（高温高压井）${detailLines.length ? `\n${detailLines.join('\n')}` : ''}\n是否仍继续开始实验？`)
        if (!cont) return
      }
    }
  }
  startupCheck.openStartupCheck()
}

async function handleConfirmStart() {
  const selections = schedule.selectedScheduledOrders.value
  if (!selections.length) {
    ElMessage.error('未找到已选中的仪器')
    return
  }
  completedSelections.value = []
  const uniqueOrders = Array.from(new Map(selections.map((selection) => [selection.order.id, selection.order])).values())
  const ordersNeedingStart = uniqueOrders.filter((order) => order.statusCode !== 2)
  const missingDbOrder = ordersNeedingStart.find((order) => typeof order.dbId !== 'number')
  if (missingDbOrder) {
    ElMessage.error('未找到工单ID')
    return
  }

  if (!ordersNeedingStart.length) {
    uniqueOrders.forEach((order) => schedule.markOrderStarted(order.id))
    activeTestSelections.value = selections.slice()
    testing.confirmStart()
    return
  }

  try {
    await initAuth()
    for (const order of ordersNeedingStart) {
      if (typeof order.dbId !== 'number') return
      const res = await startHighTempPressureOrder(order.dbId, getAuthHeaders())
      if (!res.success || res.data?.code !== 0) {
        ElMessage.error(res.data?.msg || res.error || `工单 ${order.no} 开始测试失败`)
        return
      }
      schedule.markOrderStarted(order.id)
    }
    await schedule.refreshWorkOrders()
    activeTestSelections.value = selections.slice()
    testing.confirmStart()
  } catch (e) {
    ElMessage.error('开始测试失败')
  }
}

async function handleConfirmEnd() {
  const selections = activeTestSelections.value.length
    ? activeTestSelections.value
    : schedule.selectedScheduledOrders.value.length
      ? schedule.selectedScheduledOrders.value
    : schedule.currentSelected.value
      ? [schedule.currentSelected.value]
      : []
  const selectedByInstrument = new Map(selections.map((selection) => [selection.instrument.id, selection]))
  const currentSelections = Array.from(selectedByInstrument.values())
  completedSelections.value = currentSelections.slice()

  if (!currentSelections.length) {
    ElMessage.error('未找到已选中的仪器')
    return
  }

  try {
    const captureSaved = await testing.finalizeVideoCapture()
    if (!captureSaved) return

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
        throw new Error(`工单 ${order.no} 未找到工单ID`)
      }
      ordersToFinish.push(order)
    })

    const finishedOrderNos: string[] = []
    if (ordersToFinish.length) {
      await initAuth()
      for (const order of ordersToFinish) {
        if (typeof order.dbId !== 'number') {
          throw new Error(`工单 ${order.no} 未找到工单ID`)
        }
        const orderSelections = groupedByOrder.get(order.id)?.selections || []
        const instrumentSns = Array.from(new Set(orderSelections.map((selection) => selection.instrument.sn).filter(Boolean)))
        const res = await finishHighTempPressureOrder(order.dbId, { instrument_sns: instrumentSns }, getAuthHeaders())
        if (!res.success || res.data?.code !== 0) {
          throw new Error(res.data?.msg || res.error || `工单 ${order.no} 结束测试失败`)
        }
        if (res.data.data?.after_status === 5) {
          finishedOrderNos.push(order.no)
        } else {
          partialOrderNos.push(order.no)
        }
      }
    }

    currentSelections.forEach((selection) => schedule.markInstrumentCompleted(selection.instrument.id))
    ordersToFinish
      .filter((order) => finishedOrderNos.includes(order.no))
      .forEach((order) => schedule.clearOrderProgress(order.id))
    await schedule.refreshWorkOrders()

    const uniqueFinishedOrderNos = Array.from(new Set(finishedOrderNos))
    const pendingOrderNos = Array.from(new Set(partialOrderNos))
    if (uniqueFinishedOrderNos.length && pendingOrderNos.length) {
      ElMessage.success(`已完成 ${uniqueFinishedOrderNos.join('、')}；${pendingOrderNos.join('、')} 仍有仪器待测试`)
    } else if (uniqueFinishedOrderNos.length) {
      ElMessage.success(`工单 ${uniqueFinishedOrderNos.join('、')} 已完成`)
    } else {
      ElMessage.success('当前仪器测试已完成，工单中其余仪器仍保留在待排程列表')
    }
    testing.endTest()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '结束测试失败')
  }
}

function handleConfirmStop() {
  const current = schedule.currentSelected.value
  testing.stopTest()
  schedule.cancelScheduledInstrument(current?.instrument.id)
  ElMessage.info('已中止本次测试，视频采集状态已重置')
}

async function handleShutdownComplete() {
  completedSelections.value = []
  activeTestSelections.value = []
  schedule.clearSelectedSchedule()
  testing.resetTestSession()
  testing.switchPanel('dashboard')
  await schedule.refreshWorkOrders()
}

onMounted(async () => {
  testing.resetTestSession()
  schedule.resetScheduleState()
  await schedule.refreshWorkOrders()
})
</script>

<template>
  <div class="high-temp-pressure-page">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon">
          <Icon icon="mdi:gas-burner" />
        </div>
        <div>
          <h1 class="header-title">高温高压井</h1>
          <p class="header-subtitle">高温高压井测试系统</p>
        </div>
      </div>
      <div class="header-right"></div>
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
        :search-keyword="schedule.searchKeyword.value"
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
        :resizing-instrument-id="schedule.resizingInstrumentId.value"
        :is-resizing="schedule.isResizing.value"
        :selected-scheduled-order-ids="schedule.selectedScheduledOrderIds.value"
        :selected-scheduled-orders="schedule.selectedScheduledOrders.value"
        :fmt-date="schedule.fmtDate"
        :get-cell-key="schedule.getCellKey"
        :get-instrument-by-id="schedule.getInstrumentById"
        :get-order-by-instrument-id="schedule.getOrderByInstrumentId"
        :is-instrument-pending="schedule.isInstrumentPending"
        @update:search-keyword="schedule.searchKeyword.value = $event"
        @instrument-drag-start="schedule.handleInstrumentDragStart"
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
        @refresh="schedule.refreshWorkOrders"
      />

      <StartPanel
        v-if="testing.currentPanel.value === 'start'"
        :current-selected="schedule.currentSelected.value"
        @back-to-startup-check="backToStartupCheck"
        @open-startup-check="startupCheck.openStartupCheck"
      />

      <TestingPanel
        v-if="testing.currentPanel.value === 'testing'"
        :t1="testing.state.chartData.t1"
        :t2="testing.state.chartData.t2"
        :p="testing.state.chartData.p"
        :test-running="testing.testRunning.value"
        :csv-count="testing.csvCount.value"
        :current-selected="schedule.currentSelected.value"
        :video-file-name="testing.videoFileName.value"
        :video-url="testing.videoUrl.value"
        :capture-progress-pct="testing.captureProgressPct.value"
        :capture-status-text="testing.captureStatusText.value"
        :latest-frame-url="testing.latestFrameUrl.value"
        :exported-capture-dir="testing.exportedCaptureDir.value"
        :video-measurements="testing.videoMeasurements.value"
        @select-video="testing.selectVideoFile"
        @pause="testing.pauseTest"
        @resume="testing.resumeTest"
        @open-stop-modal="testing.showModal('stop-test')"
        @open-end-modal="testing.showModal('end-test')"
      />

      <ReportPanel
        v-if="testing.currentPanel.value === 'report'"
        :current-selected="schedule.currentSelected.value"
        :selected-scheduled-orders="completedSelections.length ? completedSelections : schedule.selectedScheduledOrders.value"
        :csv-count="testing.csvCount.value"
        :exported-capture-dir="testing.exportedCaptureDir.value"
        @shutdown-complete="handleShutdownComplete"
      />
    </div>

    <ActionModals
      :active-modal="testing.activeModal.value"
      :current-selected="schedule.currentSelected.value"
      :selected-scheduled-orders="schedule.selectedScheduledOrders.value"
      @close="testing.closeModal"
      @confirm-start="handleConfirmStart"
      @confirm-end="handleConfirmEnd"
      @confirm-stop="handleConfirmStop"
    />
  </div>
</template>

<style scoped src="./components/high-temp-pressure.shared.css"></style>
