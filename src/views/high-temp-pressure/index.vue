<script setup lang="ts">
import { onMounted } from 'vue'
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
import { pushEngineerAssistantSchedules, resolveEngineerAssistantTestTypeId } from '@/services'
import { finishHighTempPressureOrder, startHighTempPressureOrder } from '@/services/high-temp-pressure-api'

const schedule = useHighTempPressureSchedule()
const startupCheck = useHighTempPressureStartupCheck()
const testing = useHighTempPressureTesting()
const { initAuth, getAuthHeaders } = useAuth()

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
  const scheduleInfo = schedule.getScheduleChangePayload(current.instrument.id)
  console.log('[high-temp-pressure schedule]', scheduleInfo ? `${scheduleInfo.startAtHour} ~ ${scheduleInfo.endAtHour}` : '', scheduleInfo)
  if (scheduleInfo) {
    const ok = await initAuth()
    if (!ok) {
      const cont = confirm('未登录，无法推送第三方排期，是否仍继续开始实验？')
      if (!cont) return
    } else {
      const headers = getAuthHeaders()
      const testType = (await resolveEngineerAssistantTestTypeId('高温高压井', headers)) || ''
      if (testType) {
        const equipmentId = String(current.instrument.id)
        const testId = String(current.order.dbId ?? current.order.id)
        const resp = await pushEngineerAssistantSchedules(
          {
            schedulesInfo: [
              { testId, testType, equipmentId, startTime: scheduleInfo.startAtHour, endTime: scheduleInfo.endAtHour },
            ],
          },
          headers
        )
        if (!resp.success || !resp.data || resp.data.code !== 0) {
          const cont = confirm('推送第三方排期失败，是否仍继续开始实验？')
          if (!cont) return
        }
      } else {
        const cont = confirm('未匹配到第三方测试类型（高温高压井），是否仍继续开始实验？')
        if (!cont) return
      }
    }
  }
  startupCheck.openStartupCheck()
}

async function handleConfirmStart() {
  const current = schedule.currentSelected.value
  const dbId = current?.order?.dbId
  if (!dbId) {
    ElMessage.error('未找到工单ID')
    return
  }

  try {
    await initAuth()
    const res = await startHighTempPressureOrder(dbId, getAuthHeaders())
    if (res.success && res.data?.code === 0) {
      schedule.refreshWorkOrders()
      testing.confirmStart()
      return
    }
    ElMessage.error(res.data?.msg || res.error || '开始测试失败')
  } catch (e) {
    ElMessage.error('开始测试失败')
  }
}

async function handleConfirmEnd() {
  const current = schedule.currentSelected.value
  const dbId = current?.order?.dbId
  if (!dbId) {
    ElMessage.error('未找到工单ID')
    return
  }

  try {
    await initAuth()
    const res = await finishHighTempPressureOrder(dbId, getAuthHeaders())
    if (res.success && res.data?.code === 0) {
      await schedule.refreshWorkOrders()
      testing.endTest()
      return
    }
    ElMessage.error(res.data?.msg || res.error || '结束测试失败')
  } catch (e) {
    ElMessage.error('结束测试失败')
  }
}

onMounted(async () => {
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
        @pause="testing.pauseTest"
        @resume="testing.resumeTest"
        @open-stop-modal="testing.showModal('stop-test')"
        @open-end-modal="testing.showModal('end-test')"
      />

      <ReportPanel v-if="testing.currentPanel.value === 'report'" />
    </div>

    <ActionModals
      :active-modal="testing.activeModal.value"
      :current-selected="schedule.currentSelected.value"
      @close="testing.closeModal"
      @confirm-start="handleConfirmStart"
      @confirm-end="handleConfirmEnd"
      @confirm-stop="testing.stopTest"
    />
  </div>
</template>

<style scoped src="./components/high-temp-pressure.shared.css"></style>
