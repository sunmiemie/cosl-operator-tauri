<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { CalendarDay, TimeSlot, WorkOrder } from '../types'

const props = defineProps<{
  searchKeyword: string
  unscheduledOrders: WorkOrder[]
  calBase: Date
  weekLabel: string
  currentWeekDays: CalendarDay[]
  timeSlots: TimeSlot[]
  scheduledOrders: Record<string, string[]>
  scheduledOrdersTentative: Record<string, string[]>
  scheduledLayoutItems: {
    orderId: string
    dateStr: string
    startTimeKey: string
    startIdx: number
    span: number
    lane: number
    laneCount: number
    cellKey: string
    isTentative: boolean
  }[]
  maxLaneCount: number
  slotHeightPx: number
  isDragging: boolean
  resizingOrderId: string | null
  isResizing: boolean
  selectedScheduledOrderIds: string[]
  todayScheduledOrderIds: string[]
  fmtDate: (d: Date) => string
  getCellKey: (dateStr: string, timeKey: string) => string
  getWorkOrderById: (id: string) => WorkOrder | undefined
}>()

const emit = defineEmits<{
  'update:searchKeyword': [value: string]
  'drag-start': [event: DragEvent, order: WorkOrder]
  'drag-end': []
  'prev-week': []
  'next-week': []
  'goto-date': [event: Event]
  'load-preset-schedule': []
  'drag-over': [event: DragEvent, isPast: boolean]
  'drag-leave': []
  'drop': [event: DragEvent, dateStr: string, timeKey: string, isPast: boolean]
  unschedule: [cellKey: string, oid: string]
  'unschedule-tentative': [cellKey: string, oid: string]
  'select-scheduled-order': [oid: string]
  'start-resize': [oid: string, e: MouseEvent]
  'start-resize-top': [oid: string, e: MouseEvent]
  'start-scheduled-test': []
}>()

const timeColWidth = 60
const cellPadding = 3
const maxLanesBeforeExpand = 2
const gridScrollRef = ref<HTMLElement | null>(null)
const gridViewportWidth = ref(0)
const gridInnerRef = ref<HTMLElement | null>(null)
let ro: ResizeObserver | null = null

const widthFactor = computed(() => Math.max(1, Math.ceil((props.maxLaneCount || 1) / maxLanesBeforeExpand)))
const gridInnerWidth = computed(() => {
  const base = Math.max(0, gridViewportWidth.value - timeColWidth)
  return timeColWidth + base * widthFactor.value
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
    zIndex: props.selectedScheduledOrderIds.includes(item.orderId) ? 12 : 10,
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
          placeholder="搜索工单号/客户/设备/描述"
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
                <th>设备数</th>
                <th>计划时间</th>
                <th>描述</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in unscheduledOrders"
                :key="order.id"
                draggable="true"
                @dragstart="emit('drag-start', $event, order)"
                @dragend="emit('drag-end')"
              >
                <td class="cell-id">{{ order.id }}</td>
                <td class="cell-customer">{{ order.customer }}</td>
                <td class="cell-devices">{{ order.devices }}</td>
                <td class="cell-plan">{{ order.planTime }}</td>
                <td class="cell-desc">{{ order.taskDesc }}</td>
              </tr>
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
                  :key="it.orderId"
                  class="scheduled-item"
                  :class="{
                    'is-selected': selectedScheduledOrderIds.includes(it.orderId),
                    'is-dragging': isDragging,
                    'is-resizing': isResizing && resizingOrderId === it.orderId,
                    'is-tentative': it.isTentative
                  }"
                  :style="getScheduledStyle(it)"
                  @click="emit('select-scheduled-order', it.orderId)"
                  :title="`${it.orderId} · ${getWorkOrderById(it.orderId)?.customer || ''} · ${getWorkOrderById(it.orderId)?.deviceList?.[0]?.name || ''}`"
                >
                  <div class="scheduled-content">
                    <span class="device-name">{{ it.orderId }}</span>
                    <button
                      v-if="!it.isTentative"
                      class="remove-btn"
                      title="删除排程"
                      @click.stop="emit('unschedule', it.cellKey, it.orderId)"
                    >
                      <Icon icon="mdi:close" />
                    </button>
                    <button
                      v-else
                      class="remove-btn"
                      title="删除待排程"
                      @click.stop="emit('unschedule-tentative', it.cellKey, it.orderId)"
                    >
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">
                    <template v-if="it.isTentative">待排程 · </template>{{ getWorkOrderById(it.orderId)?.customer }} ·
                    {{ getWorkOrderById(it.orderId)?.deviceList?.[0]?.name }}
                  </div>
                  <div class="resize-handle-top" @mousedown.stop.prevent="emit('start-resize-top', it.orderId, $event)"></div>
                  <div class="resize-handle" @mousedown.stop.prevent="emit('start-resize', it.orderId, $event)"></div>
                </div>
              </div>

              <div v-for="slot in timeSlots" :key="slot.key" class="grid-row">
                <div class="time-label">{{ slot.label }}</div>
                <div
                  v-for="day in currentWeekDays"
                  :key="getCellKey(day.dateStr, slot.key)"
                  class="grid-cell"
                  :class="{ 'is-weekend': day.isWeekend, 'is-past': day.isPast }"
                  @dragover.capture="emit('drag-over', $event, day.isPast)"
                  @dragleave="emit('drag-leave')"
                  @drop.capture="emit('drop', $event, day.dateStr, slot.key, day.isPast)"
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
          <template v-if="todayScheduledOrderIds.length">
            <div class="selected-order">
              <Icon icon="mdi:check" class="selected-icon" />
              <span class="selected-label">今日排程工单: {{ todayScheduledOrderIds.length }} 个</span>
            </div>
            <span class="selected-divider">|</span>
            <span class="selected-device" v-for="oid in todayScheduledOrderIds" :key="oid">
              {{ oid }} · {{ getWorkOrderById(oid)?.customer }}
            </span>
          </template>
          <span v-else class="selected-placeholder">仅支持开始今日排程工单实验</span>
        </div>
        <button class="primary-btn" :disabled="todayScheduledOrderIds.length === 0" @click="emit('start-scheduled-test')">
          <Icon icon="mdi:play" class="start-icon" />开始实验
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./simulation-well.shared.css"></style>
