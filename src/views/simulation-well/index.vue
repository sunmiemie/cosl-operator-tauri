<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import EquipmentPackage from './equipment-package.vue'
import SimulationWellDashboard from './components/SimulationWellDashboard.vue'
import { useSimulationWellSchedule } from './composables/useSimulationWellSchedule'
import { useSimulationWellDownhole } from './composables/useSimulationWellDownhole'
import type { SimulationWellView } from './types'

const currentView = ref<SimulationWellView>('dashboard')
const schedule = useSimulationWellSchedule()
const { downholeDevices } = useSimulationWellDownhole(schedule.todayScheduledOrders)

function handleStartScheduledTest() {
  if (schedule.todayScheduledOrderIds.value.length === 0) return
  currentView.value = 'downhole-operation'
}

function backToDashboard() {
  currentView.value = 'dashboard'
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
      :today-scheduled-order-ids="schedule.todayScheduledOrderIds.value"
      :fmt-date="schedule.fmtDate"
      :get-cell-key="schedule.getCellKey"
      :get-work-order-by-id="schedule.getWorkOrderById"
      @update:search-keyword="schedule.searchKeyword.value = $event"
      @drag-start="schedule.handleDragStart"
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
      @start-scheduled-test="handleStartScheduledTest"
    />

    <EquipmentPackage
      v-else-if="currentView === 'downhole-operation'"
      :today-scheduled-orders="schedule.todayScheduledOrders.value"
      :downhole-devices="downholeDevices"
      @back="backToDashboard"
      @save="handleSaveDownhole"
    />
  </div>
</template>

<style scoped src="./components/simulation-well.shared.css"></style>
