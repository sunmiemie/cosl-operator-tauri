<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { CalendarDay, ScheduledItem, TimeSlot, WorkOrder } from '../types'

const props = defineProps<{
  searchKeyword: string
  unscheduledOrders: WorkOrder[]
  calBase: Date
  weekLabel: string
  currentWeekDays: CalendarDay[]
  timeSlots: TimeSlot[]
  scheduledOrders: Record<string, string[]>
  scheduledOrdersTentative: Record<string, string[]>
  scheduledLayoutItems: ScheduledItem[]
  maxLaneCount: number
  slotHeightPx: number
  isDragging: boolean
  resizingDeviceId: string | null
  isResizing: boolean
  selectedScheduledDeviceIds: string[]
  todayScheduledOrderIds: string[]
  fmtDate: (d: Date) => string
  getCellKey: (dateStr: string, timeKey: string) => string
  getWorkOrderById: (id: string) => WorkOrder | undefined
  getDeviceRow: (deviceId: string) => { order: WorkOrder; deviceName: string; deviceNumber: string } | null
}>()

const emit = defineEmits<{
  'update:searchKeyword': [value: string]
  'device-drag-start': [event: DragEvent, order: { id: string; label: string }]
  'drag-end': []
  'prev-week': []
  'next-week': []
  'goto-date': [event: Event]
  'load-preset-schedule': []
  'drag-over': [event: DragEvent, isPast: boolean]
  'drag-leave': []
  'drop': [event: DragEvent, dateStr: string, timeKey: string, isPast: boolean]
  unschedule: [cellKey: string, deviceId: string]
  'unschedule-tentative': [cellKey: string, deviceId: string]
  'select-scheduled-device': [deviceId: string]
  'start-resize': [deviceId: string, e: MouseEvent]
  'start-resize-top': [deviceId: string, e: MouseEvent]
  'start-scheduled-test': []
  'view-order-detail': [orderId: string]
}>()

const timeColWidth = 60
const cellPadding = 3
const gridScrollRef = ref<HTMLElement | null>(null)
const gridViewportWidth = ref(0)
const gridInnerRef = ref<HTMLElement | null>(null)
let ro: ResizeObserver | null = null

const gridInnerWidth = computed(() => {
  return Math.max(0, gridViewportWidth.value)
})

onMounted(() => {
  if (!gridScrollRef.value) return
  ro = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    gridViewportWidth.value = entry.contentRect.width
  })
  ro.observe(gridScrollRef.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})

const layoutWithDayIndex = computed(() => {
  return props.scheduledLayoutItems
    .map((x) => ({ ...x, dayIndex: props.currentWeekDays.findIndex((d) => d.dateStr === x.dateStr) }))
    .filter((x) => x.dayIndex >= 0)
})

const selectedOrderRows = computed(() => {
  const orderIds = new Set(
    props.scheduledLayoutItems
      .filter((item) => props.selectedScheduledDeviceIds.includes(item.deviceId))
      .map((item) => item.orderId)
  )
  return Array.from(orderIds)
    .map((id) => props.getWorkOrderById(id))
    .filter(Boolean) as WorkOrder[]
})

const scheduledOrderIdSet = computed(() => new Set(props.scheduledLayoutItems.map((item) => item.orderId)))
const getOrderStatusText = (order: WorkOrder) => scheduledOrderIdSet.value.has(order.id) ? '已排程' : '待排程'
const getOrderStatusClass = (order: WorkOrder) => scheduledOrderIdSet.value.has(order.id) ? 'scheduled' : 'pending'

const expandedOrderIds = ref<string[]>([])
const isExpanded = (orderId: string) => expandedOrderIds.value.includes(orderId)
const toggleExpanded = (orderId: string) => {
  const set = new Set(expandedOrderIds.value)
  if (set.has(orderId)) set.delete(orderId)
  else set.add(orderId)
  expandedOrderIds.value = Array.from(set)
}

const getScheduledStyle = (item: any) => {
  const totalWidth = gridInnerWidth.value || 0
  const dayColW = totalWidth > timeColWidth ? (totalWidth - timeColWidth) / 7 : 0
  const laneCount = Math.max(1, item.laneCount || 1)
  const laneW = dayColW > 0 ? dayColW / laneCount : 0
  const top = item.startIdx * props.slotHeightPx + cellPadding
  const height = item.span * props.slotHeightPx - cellPadding * 2
  const left = timeColWidth + item.dayIndex * dayColW + item.lane * laneW + cellPadding
  const width = laneW - cellPadding * 2
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${Math.max(20, width)}px`,
    height: `${Math.max(props.slotHeightPx - cellPadding * 2, height)}px`,
    zIndex: props.selectedScheduledDeviceIds.includes(item.deviceId) ? 12 : 10,
  }
}

const getDropTarget = (e: DragEvent) => {
  if (!gridInnerRef.value) return null
  const rect = gridInnerRef.value.getBoundingClientRect()
  const totalW = gridInnerWidth.value || rect.width
  const dayColW = totalW > timeColWidth ? (totalW - timeColWidth) / 7 : 0
  if (dayColW <= 0) return null

  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const xInDays = x - timeColWidth
  if (xInDays < 0) return null

  const dayIndex = Math.min(6, Math.max(0, Math.floor(xInDays / dayColW)))
  const slotIndex = Math.min(props.timeSlots.length - 1, Math.max(0, Math.floor(y / props.slotHeightPx)))
  const day = props.currentWeekDays[dayIndex]
  const slot = props.timeSlots[slotIndex]
  if (!day || !slot) return null
  return { dateStr: day.dateStr, timeKey: slot.key, isPast: day.isPast }
}

const handleGridDragOver = (e: DragEvent) => {
  const target = getDropTarget(e)
  if (!target) return
  if (target.isPast) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

const handleGridDrop = (e: DragEvent) => {
  const target = getDropTarget(e)
  if (!target) return
  e.preventDefault()
  e.stopPropagation()
  emit('drop', e, target.dateStr, target.timeKey, target.isPast)
}
</script>

<template>
  <div class="layout-container">
    <div class="sidebar">
      <div class="panel-header">
        <div class="header-title">
          <Icon icon="mdi:format-list-bulleted" class="header-icon" />
          <span>待测试工单</span>
        </div>
        <span class="count-badge">{{ unscheduledOrders.length }}</span>
      </div>
      <div class="search-box">
        <Icon icon="mdi:magnify" class="search-icon" />
        <input
          :value="searchKeyword"
          type="text"
          placeholder="搜索工单号/客户/设备/测试工单内容"
          @input="emit('update:searchKeyword', ($event.target as HTMLInputElement).value)"
        />
        <button v-if="searchKeyword" class="clear-btn" @click="emit('update:searchKeyword', '')">
          <Icon icon="mdi:close" />
        </button>
      </div>
      <div class="table-content">
        <div v-if="unscheduledOrders.length === 0" class="empty-state"><p>无待排程工单</p></div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>工单号</th>
                <th>客户</th>
                <th>设备</th>
                <th>计划时间</th>
                <th>测试工单内容</th>
                <th>操作</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="order in unscheduledOrders" :key="order.id">
                <tr
                  class="order-row"
                  :class="{ 'is-scheduled': scheduledOrderIdSet.has(order.id), 'is-expanded': isExpanded(order.id) }"
                  draggable="true"
                  @click="toggleExpanded(order.id)"
                  @dragstart="emit('device-drag-start', $event, { id: order.id, label: order.id })"
                  @dragend="emit('drag-end')"
                >
                  <td class="cell-id">{{ order.id }}</td>
                  <td class="cell-customer">{{ order.customer }}</td>
                  <td class="cell-device cell-detail">
                    <span class="expand-icon" @click.stop="toggleExpanded(order.id)">
                      <Icon :icon="isExpanded(order.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
                    </span>
                    {{ order.deviceList?.length || 0 }}台
                  </td>
                  <td class="cell-plan">{{ order.planTime || '-' }}</td>
                  <td class="cell-desc">{{ order.taskDesc || '-' }}</td>
                  <td style="text-align: center">
                    <button class="op-btn view" @click.stop="emit('view-order-detail', order.id)">详情</button>
                  </td>
                  <td><span class="status-pill" :class="getOrderStatusClass(order)">{{ getOrderStatusText(order) }}</span></td>
                </tr>
                <tr v-if="isExpanded(order.id)" :key="order.id + '-expanded'">
                  <td class="expanded-cell" colspan="7">
                    <div class="instrument-panel">
                      <div class="instrument-panel-head">
                        <div>
                          <div class="instrument-title">设备明细</div>
                          <div class="instrument-subtitle">该工单包含的待测试设备</div>
                        </div>
                        <span class="instrument-count">{{ (order.deviceList || []).length }} 台</span>
                      </div>
                      <div v-if="(order.deviceList || []).length === 0" class="instrument-empty">
                        当前无待排程设备
                      </div>
                      <div v-else class="instrument-list">
                        <div
                          v-for="d in (order.deviceList || [])"
                          :key="d.id"
                          class="instrument-item"
                        >
                          <span class="instrument-name">{{ d.name }}</span>
                          <span class="instrument-sn">{{ d.code || d.sn }}</span>
                          <span class="status-pill" :class="getOrderStatusClass(order)">{{ getOrderStatusText(order) }}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="main-content">
      <div class="panel-header">
        <div class="week-cal-toolbar">
          <button class="week-cal-nav" @click="emit('prev-week')">‹ 上一周</button>
          <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="emit('goto-date', $event)" title="跳转到指定日期所在周" />
          <span class="week-cal-label">{{ weekLabel }}</span>
          <button class="week-cal-nav" @click="emit('next-week')">下一周 ›</button>
          <button class="week-cal-nav" @click="emit('load-preset-schedule')">读取本周排程</button>
        </div>
        <div class="legend">
          <div class="legend-item"><span class="dot pending"></span>空闲</div>
          <div class="legend-item"><span class="dot occupied"></span>已占用</div>
        </div>
      </div>

      <div class="calendar-grid">
        <div class="grid-scroll" ref="gridScrollRef">
          <div class="grid-header-row" :style="{ width: `${gridInnerWidth}px` }">
            <div class="time-column-header">时间</div>
            <div v-for="day in currentWeekDays" :key="day.dateStr" class="day-header" :class="{ 'is-today': day.isToday }">
              <div class="day-num" :class="{ 'is-weekend': day.isWeekend }">{{ day.month }}/{{ day.dayNum }}</div>
              <div class="day-name">{{ day.dayName }}</div>
            </div>
          </div>

          <div class="grid-body">
            <div
              class="grid-inner"
              ref="gridInnerRef"
              :style="{ height: `${timeSlots.length * slotHeightPx}px`, width: `${gridInnerWidth}px` }"
              @dragover.capture="handleGridDragOver"
              @drop.capture="handleGridDrop"
            >
              <div class="events-overlay">
                <div
                  v-for="it in layoutWithDayIndex"
                  :key="it.deviceId"
                  class="scheduled-item"
                  :class="{
                    'is-selected': selectedScheduledDeviceIds.includes(it.deviceId),
                    'is-dragging': isDragging,
                    'is-resizing': isResizing && resizingDeviceId === it.deviceId,
                    'is-tentative': it.isTentative
                  }"
                  :style="getScheduledStyle(it)"
                  @click="emit('select-scheduled-device', it.deviceId)"
                  :title="`${it.orderId} · ${getWorkOrderById(it.orderId)?.customer || ''} · ${getWorkOrderById(it.orderId)?.planTime || ''} · ${getWorkOrderById(it.orderId)?.taskDesc || ''}`"
                >
                  <div class="scheduled-content">
                    <span class="device-name">{{ it.orderId }}</span>
                    <button
                      v-if="!it.isTentative"
                      class="remove-btn"
                      title="删除排程"
                      @click.stop="emit('unschedule', it.cellKey, it.deviceId)"
                    >
                      <Icon icon="mdi:close" />
                    </button>
                    <button
                      v-else
                      class="remove-btn"
                      title="删除待排程"
                      @click.stop="emit('unschedule-tentative', it.cellKey, it.deviceId)"
                    >
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">
                    <template v-if="it.isTentative">待排程 · </template>{{ getWorkOrderById(it.orderId)?.customer || '-' }} ·
                    {{ getWorkOrderById(it.orderId)?.planTime || '-' }}
                  </div>
                  <div class="resize-handle-top" @mousedown.stop.prevent="emit('start-resize-top', it.deviceId, $event)"></div>
                  <div class="resize-handle" @mousedown.stop.prevent="emit('start-resize', it.deviceId, $event)"></div>
                </div>
              </div>

              <div v-for="slot in timeSlots" :key="slot.key" class="grid-row">
                <div class="time-label">{{ slot.label }}</div>
                <div
                  v-for="day in currentWeekDays"
                  :key="getCellKey(day.dateStr, slot.key)"
                  class="grid-cell"
                  :class="{ 'is-weekend': day.isWeekend, 'is-past': day.isPast }"
                  @dragleave="emit('drag-leave')"
                >
                  <div class="empty-slot-hint">+</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="control-center">
        <div class="control-center-left">
          <template v-if="selectedOrderRows.length">
            <div class="selected-order">
              <Icon icon="mdi:check" class="selected-icon" />
              <span class="selected-label">已选择工单: {{ selectedOrderRows.length }} 个</span>
            </div>
            <span class="selected-divider">|</span>
            <span class="selected-device" v-for="r in selectedOrderRows" :key="r.id">
              {{ r.id }} · {{ r.customer }}
            </span>
          </template>
          <span v-else class="selected-placeholder">请在日历中点击选择要开始实验的工单</span>
        </div>
        <button class="primary-btn" :disabled="selectedOrderRows.length === 0" @click="emit('start-scheduled-test')">
          <Icon icon="mdi:play" class="start-icon" />开始实验
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./simulation-well.shared.css"></style>
