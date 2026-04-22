<script setup lang="ts">
import { ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import DownholeWork from './downhole-work.vue'
import SimulationWellDashboard from './components/SimulationWellDashboard.vue'
import TestReport from './test-report.vue'
import { useSimulationWellSchedule } from './composables/useSimulationWellScheduleV2'
import { useRoute, useRouter } from 'vue-router'
import type { SimulationWellView } from './types'
import SanxinOrderDetailModal from './components/SanxinOrderDetailModal.vue'
import type { SimulatedWellOrderDTO } from '@/services/simulated-well-api'

const currentView = ref<SimulationWellView>('dashboard')
const schedule = useSimulationWellSchedule()
const route = useRoute()
const router = useRouter()

const sanxinDetailVisible = ref(false)
const sanxinDetailLoading = ref(false)
const sanxinDetailOrder = ref<SimulatedWellOrderDTO | null>(null)

const normalizeView = (v: unknown): SimulationWellView => {
  if (v === 'downhole-work' || v === 'test-report') return v
  return 'dashboard'
}

const syncViewFromRoute = () => {
  const next = normalizeView(route.query.view)
  if (next === 'dashboard') {
    currentView.value = 'dashboard'
    return
  }
  currentView.value = next
}

watch(
  () => route.query.view,
  () => syncViewFromRoute(),
  { immediate: true }
)

watch(
  () => schedule.selectedStartDeviceIds.value.length,
  () => syncViewFromRoute()
)

function handleStartScheduledTest() {
  if (schedule.selectedStartDeviceIds.value.length === 0) {
    ElMessage.warning('请先在日历中点击选择要开始试验的测试产品')
    return
  }
  router.replace({ path: '/simulation-well', query: { view: 'downhole-work' } })
}

function backToDashboard() {
  router.replace({ path: '/simulation-well' })
}

async function handleViewOrderDetail(orderId: string) {
  const order = schedule.getWorkOrderById(orderId)
  const dbId = order?.dbId
  if (!dbId) {
    ElMessage.error('未找到工单ID')
    return
  }
  sanxinDetailVisible.value = true
  sanxinDetailLoading.value = true
  sanxinDetailOrder.value = null
  try {
    const dto = await schedule.fetchOrderDetail(dbId)
    if (!dto) {
      ElMessage.error('获取详情失败')
      return
    }
    sanxinDetailOrder.value = dto
  } finally {
    sanxinDetailLoading.value = false
  }
}

function handleSaveDownhole(payload: unknown) {
  console.log('下井作业参数已保存', payload)
}
</script>

<template>
  <div class="simulation-well-page">
    <div class="page-header" v-if="currentView === 'dashboard'">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:pipe" /></div>
        <div>
          <h1 class="header-title">模拟井</h1>
          <p class="header-subtitle">模拟井测试系统</p>
        </div>
      </div>
      <div class="header-right"></div>
    </div>

    <SimulationWellDashboard
      v-if="currentView === 'dashboard'"
      :search-keyword="schedule.searchKeyword.value"
      :unscheduled-orders="schedule.unscheduledOrders.value"
      :cal-base="schedule.calBase.value"
      :week-label="schedule.weekLabel.value"
      :current-week-days="schedule.currentWeekDays.value"
      :time-slots="schedule.timeSlots.value"
      :scheduled-orders="schedule.scheduledOrders.value"
      :scheduled-orders-tentative="schedule.scheduledOrdersTentative.value"
      :scheduled-layout-items="schedule.scheduledLayoutItems.value"
      :max-lane-count="schedule.maxLaneCount.value"
      :slot-height-px="schedule.slotHeightPx"
      :is-dragging="schedule.isDragging.value"
      :resizing-device-id="schedule.resizingDeviceId.value"
      :is-resizing="schedule.isResizing.value"
      :selected-scheduled-device-ids="schedule.selectedScheduledDeviceIds.value"
      :today-scheduled-order-ids="schedule.todayScheduledOrderIds.value"
      :fmt-date="schedule.fmtDate"
      :get-cell-key="schedule.getCellKey"
      :get-work-order-by-id="schedule.getWorkOrderById"
      :get-device-row="schedule.getDeviceRow"
      @update:search-keyword="schedule.searchKeyword.value = $event"
      @device-drag-start="schedule.handleDeviceDragStart"
      @drag-end="schedule.handleDragEnd"
      @prev-week="schedule.prevWeek"
      @next-week="schedule.nextWeek"
      @goto-date="schedule.gotoDate"
      @load-preset-schedule="schedule.loadPresetSchedule"
      @drag-over="schedule.handleDragOver"
      @drag-leave="schedule.handleDragLeave"
      @drop="schedule.handleDrop"
      @unschedule="schedule.handleUnschedule"
      @unschedule-tentative="schedule.handleUnscheduleTentative"
      @select-scheduled-device="schedule.handleSelectScheduledDevice"
      @start-resize="schedule.startResize"
      @start-resize-top="schedule.startResizeTop"
      @start-scheduled-test="handleStartScheduledTest"
      @view-order-detail="handleViewOrderDetail"
    />

    <SanxinOrderDetailModal
      v-if="currentView === 'dashboard'"
      :visible="sanxinDetailVisible"
      :loading="sanxinDetailLoading"
      :order="sanxinDetailOrder"
      @close="sanxinDetailVisible = false"
    />

    <DownholeWork
      v-else-if="currentView === 'downhole-work'"
      :today-scheduled-orders="schedule.selectedStartOrders.value"
      :downhole-devices="schedule.selectedStartDevices.value"
      @back="backToDashboard"
      @save="handleSaveDownhole"
    />

    <TestReport
      v-else-if="currentView === 'test-report'"
      :selected-orders="schedule.selectedStartOrders.value"
      :selected-devices="schedule.selectedStartDevices.value"
      @back="backToDashboard"
    />
  </div>
</template>

<style scoped src="./components/simulation-well.shared.css"></style>
