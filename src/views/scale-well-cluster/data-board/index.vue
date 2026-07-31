<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRouter } from "vue-router"
import { ElMessage } from "element-plus"
import TestDashboardHeader from "./components/TestDashboardHeader.vue"
import TestStatSummaryGrid from "./components/TestStatSummaryGrid.vue"
import ScaleWellScheduleDashboard from "./components/ScaleWellScheduleDashboard.vue"
import TechWorkOrderPanel from "./components/TechWorkOrderPanel.vue"
import CalibrationOrderDetailModal from "./components/CalibrationOrderDetailModal.vue"
import { useScaleWellSchedule } from "./composables/useScaleWellSchedule"
import { useScaleWellSession } from "../shared/composables/useScaleWellSession"
import type { CalibrationWorkOrder } from "../shared/types"
import { useAuth } from "@/composables/useAuth"
import { claimCalibrationOrder } from "@/services/scale-well-api"

const router = useRouter()
const schedule = useScaleWellSchedule()
const { role, loginTime, setActiveWorkOrder } = useScaleWellSession()
const { getAuthHeaders } = useAuth()

const onlineMinutes = ref(0)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailOrder = ref<CalibrationWorkOrder | null>(null)
let onlineTimer: ReturnType<typeof setInterval> | null = null

const calibrationList = computed(() => Object.values(schedule.calibrationOrders.value))
const pendingOrders = computed(() => calibrationList.value.filter((o) => o.status === "pending"))
const inProgressOrders = computed(() => calibrationList.value.filter((o) => o.status === "in_progress"))
const todayCompleted = computed(() => {
  const today = schedule.fmtDate(new Date())
  return calibrationList.value.filter((o) => o.status === "completed" && o.planDate === today).length
})

const subtitle = computed(() =>
  role.value === "leader" ? "拖拽工单到日历排程，选择时间段后开始刻度" : "可用工单 · 一键领取开始测试"
)

const onlineLabel = computed(() => {
  const h = Math.floor(onlineMinutes.value / 60)
  const m = onlineMinutes.value % 60
  return `${h}时${m}分`
})

const startCalibrationWithOrder = async (order: CalibrationWorkOrder) => {
  if (order.dbId && (order.statusCode === 1 || order.statusCode === 4)) {
    const response = await claimCalibrationOrder(order.dbId, getAuthHeaders())
    const payload = response.data
    if (!response.success || payload?.code !== 0) {
      ElMessage.error(payload?.msg || response.error || "认领工单失败")
      return
    }
    order = {
      ...order,
      status: "in_progress",
      statusCode: 2,
      statusText: payload.data.status_text || "测试中"
    }
  }
  setActiveWorkOrder(order)
  router.push("/scale-well-cluster/calibration")
}

const handleStartCalibration = async () => {
  const orders = schedule.selectedStartOrders.value
  if (!orders.length) {
    ElMessage.warning("请先在日历中选择已排程工单")
    return
  }
  const order = schedule.getCalibrationWorkOrder(orders[0].id)
  if (!order) {
    ElMessage.error("工单数据不存在")
    return
  }
  await startCalibrationWithOrder(order)
}

const handleViewOrderDetail = async (taskNumber: string) => {
  detailVisible.value = true
  detailLoading.value = true
  detailOrder.value = schedule.getCalibrationWorkOrder(taskNumber)
  try {
    detailOrder.value = (await schedule.fetchOrderDetail(taskNumber)) ?? detailOrder.value
  } finally {
    detailLoading.value = false
  }
}

const closeDetailModal = () => {
  detailVisible.value = false
  detailOrder.value = null
}

const claimAndStart = async (orderId: string) => {
  const order = schedule.getCalibrationWorkOrder(orderId)
  if (!order) return
  await startCalibrationWithOrder(order)
}

onMounted(() => {
  const tick = () => {
    onlineMinutes.value = Math.floor((Date.now() - loginTime.value) / 60000)
  }
  tick()
  onlineTimer = setInterval(tick, 30000)
})

onUnmounted(() => {
  if (onlineTimer) clearInterval(onlineTimer)
})
</script>

<template>
  <div class="scale-well-page">
    <TestDashboardHeader :subtitle="subtitle" title="工单排程" />

    <TestStatSummaryGrid
      :pending="pendingOrders.length"
      :in-progress="inProgressOrders.length"
      :today-completed="todayCompleted"
      :online-label="onlineLabel"
    />

    <div class="sw-content-panel">
      <ScaleWellScheduleDashboard
        v-if="role === 'leader'"
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
        :resizing-event-id="schedule.resizingEventId.value"
        :is-resizing="schedule.isResizing.value"
        :selected-scheduled-event-ids="schedule.selectedScheduledEventIds.value"
        :today-scheduled-order-ids="schedule.todayScheduledOrderIds.value"
        :fmt-date="schedule.fmtDate"
        :get-cell-key="schedule.getCellKey"
        :get-work-order-by-id="schedule.getWorkOrderById"
        :get-calibration-order="schedule.getCalibrationWorkOrder"
        :get-device-row="schedule.getDeviceRow"
        @update:search-keyword="schedule.searchKeyword.value = $event"
        @device-drag-start="schedule.handleDeviceDragStart"
        @drag-end="schedule.handleDragEnd"
        @prev-week="schedule.prevWeek"
        @next-week="schedule.nextWeek"
        @goto-date="schedule.gotoDate"
        @load-preset-schedule="schedule.loadPresetSchedule"
        @drop="schedule.handleDrop"
        @unschedule="schedule.handleUnschedule"
        @unschedule-tentative="schedule.handleUnscheduleTentative"
        @select-scheduled-event="schedule.handleSelectScheduledEvent"
        @start-resize="schedule.startResize"
        @start-resize-top="schedule.startResizeTop"
        @start-scheduled-test="handleStartCalibration"
        @view-order-detail="handleViewOrderDetail"
      />

      <TechWorkOrderPanel
        v-else
        :orders="pendingOrders"
        @claim="claimAndStart"
      />
    </div>

    <CalibrationOrderDetailModal
      :visible="detailVisible"
      :loading="detailLoading"
      :order="detailOrder"
      @close="closeDetailModal"
    />
  </div>
</template>

<style scoped lang="scss">
@import "../shared/styles/scale-well-theme.scss";

.sw-content-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-secondary);
}
</style>
