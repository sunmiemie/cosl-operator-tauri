<script setup lang="ts">
import TestDashboardHeader from "./components/TestDashboardHeader.vue"
import TestStatSummaryGrid from "./components/TestStatSummaryGrid.vue"
import ScheduleBoard from "./components/ScheduleBoard.vue"
import TechWorkOrderPanel from "./components/TechWorkOrderPanel.vue"
import { useTestDashboard } from "./composables/use-test-dashboard"

const {
  role,
  orders,
  pendingOrders,
  inProgressOrders,
  todayCompleted,
  onlineLabel,
  subtitle,
  weekDays,
  weekLabel,
  timeSlots,
  selectedOrderIds,
  toggleOrderSelection,
  selectScheduleCell,
  isCellSelected,
  prevWeek,
  nextWeek,
  loadThisWeek,
  goToDate,
  startScheduledTask,
  claimAndStart,
  getToolDisplayName
} = useTestDashboard()
</script>

<template>
  <div class="scale-well-page">
    <TestDashboardHeader :subtitle="subtitle" />

    <TestStatSummaryGrid
      :pending="pendingOrders.length"
      :in-progress="inProgressOrders.length"
      :today-completed="todayCompleted"
      :online-label="onlineLabel"
    />

    <div class="sw-content-panel">
      <ScheduleBoard
        v-if="role === 'leader'"
        :orders="orders"
        :week-days="weekDays"
        :week-label="weekLabel"
        :time-slots="timeSlots"
        :selected-order-ids="selectedOrderIds"
        :get-tool-display-name="getToolDisplayName"
        :is-cell-selected="isCellSelected"
        @toggle-order="toggleOrderSelection"
        @select-cell="selectScheduleCell"
        @prev-week="prevWeek"
        @next-week="nextWeek"
        @load-this-week="loadThisWeek"
        @go-to-date="goToDate"
        @start-task="startScheduledTask"
      />

      <TechWorkOrderPanel
        v-else
        :orders="pendingOrders"
        :get-tool-display-name="getToolDisplayName"
        @claim="claimAndStart"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../shared/styles/scale-well-theme.scss";
</style>
