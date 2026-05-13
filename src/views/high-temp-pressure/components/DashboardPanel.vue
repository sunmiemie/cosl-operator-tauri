<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import WorkOrderDetailModal from './WorkOrderDetailModal.vue'
import type { ScheduledSelection, TimeSlotItem, WeekDayItem, WorkOrder } from '../types'

const props = defineProps<{
  unscheduledOrders: WorkOrder[]
  workOrdersLoading: boolean
  searchKeyword: string
  calBase: Date
  weekLabel: string
  currentWeekDays: WeekDayItem[]
  timeSlots: TimeSlotItem[]
  scheduledOrders: Record<string, string[]>
  scheduledLayoutItems: {
    instrumentId: string
    dateStr: string
    startTimeKey: string
    startIdx: number
    span: number
    lane: number
    laneCount: number
    cellKey: string
  }[]
  maxLaneCount: number
  slotHeightPx: number
  isDragging: boolean
  startResize: (instrumentId: string, e: MouseEvent) => void
  startResizeTop: (instrumentId: string, e: MouseEvent) => void
  resizingInstrumentId: string | null
  isResizing: boolean
  selectedScheduledOrderIds: string[]
  selectedScheduledOrders: ScheduledSelection[]
  fmtDate: (d: Date) => string
  getCellKey: (dateStr: string, timeKey: string) => string
  getInstrumentById: (id: string) => { id: string; label: string; sn: string } | null
  getOrderByInstrumentId: (id: string) => WorkOrder | undefined
  isInstrumentPending: (id: string) => boolean
}>()

const emit = defineEmits<{
  'update:searchKeyword': [value: string]
  'instrument-drag-start': [event: DragEvent, instrument: { id: string; label: string; sn: string }]
  'drag-end': [event: DragEvent]
  'prev-week': []
  'next-week': []
  'goto-date': [event: Event]
  'load-preset-schedule': []
  'drag-over': [event: DragEvent, isPast: boolean]
  'drag-leave': [event: DragEvent]
  'drop': [event: DragEvent, dateStr: string, timeKey: string, isPast: boolean]
  'select-scheduled-order': [orderId: string]
  unschedule: [cellKey: string, orderId: string]
  'start-scheduled-test': []
  'refresh': []
}>()

const detailVisible = ref(false)
const detailOrder = ref<WorkOrder | null>(null)

const openDetail = (order: WorkOrder) => {
  detailOrder.value = order
  detailVisible.value = true
}

const closeDetail = () => {
  detailVisible.value = false
  detailOrder.value = null
}

const timeColWidth = 60
const cellPadding = 3
const maxLanesBeforeExpand = 2

const gridScrollRef = ref<HTMLElement | null>(null)
const gridViewportWidth = ref(0)
const gridInnerRef = ref<HTMLElement | null>(null)
let ro: ResizeObserver | null = null

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

const widthFactor = computed(() => Math.max(1, Math.ceil((props.maxLaneCount || 1) / maxLanesBeforeExpand)))
const gridInnerWidth = computed(() => {
  const base = Math.max(0, gridViewportWidth.value - timeColWidth)
  return timeColWidth + base * widthFactor.value
})

const scheduledInstrumentIdSet = computed(() => {
  const set = new Set<string>()
  Object.values(props.scheduledOrders || {}).forEach((ids) => {
    ids.forEach((id) => set.add(id))
  })
  return set
})

const getPendingInstruments = (order: WorkOrder) => {
  return order.items.filter((item) => !scheduledInstrumentIdSet.value.has(item.id) && props.isInstrumentPending(item.id))
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
  emit('drop', e, target.dateStr, target.timeKey, target.isPast)
}
</script>

<template>
  <div class="panel active">
    <div class="schedule-wrap">
      <div class="sidebar">
        <div class="panel-header">
          <div class="header-title">
            <Icon icon="mdi:format-list-bulleted" class="header-icon" />
            <span>待测试工单</span>
          </div>
          <div class="header-actions">
            <button class="icon-btn" :disabled="workOrdersLoading" title="刷新" @click="emit('refresh')">
              <Icon icon="mdi:refresh" />
            </button>
            <span class="count-badge">{{ unscheduledOrders.length }}</span>
          </div>
        </div>
        <div class="search-box">
          <Icon icon="mdi:magnify" class="search-icon" />
          <input
            :value="searchKeyword"
            type="text"
            placeholder="搜索任务编号/使用设备/申请人/仪器SN"
            @input="emit('update:searchKeyword', ($event.target as HTMLInputElement).value)"
          />
          <button v-if="searchKeyword" class="clear-btn" @click="emit('update:searchKeyword', '')">
            <Icon icon="mdi:close" />
          </button>
        </div>

        <div class="table-content">
          <div v-if="unscheduledOrders.length === 0" class="empty-state">
            <p>无待排程工单</p>
          </div>
          <div v-else class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>申请人</th>
                  <th>任务编号</th>
                  <th>使用设备</th>
                  <th>详情</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="order in unscheduledOrders" :key="order.id">
                  <tr class="work-order-row" :class="{ 'is-expanded': order.expanded }" @click="order.expanded = !order.expanded">
                    <td class="cell-applicant">{{ order.applicant }}</td>
                    <td class="cell-id">{{ order.no }}</td>
                    <td class="cell-device" :title="order.type">{{ order.type }}</td>
                    <td class="cell-detail">
                      <span class="detail-link" @click.stop="openDetail(order)">详情</span>
                      <span class="expand-icon" @click.stop="order.expanded = !order.expanded">
                        <Icon :icon="order.expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
                      </span>
                    </td>
                    <td><span class="status-tag status-pending">{{ order.status || '待排程' }}</span></td>
                  </tr>
                  <tr v-if="order.expanded" :key="order.id + '-expanded'">
                    <td class="expanded-cell" colspan="5">
                      <div class="instrument-panel">
                        <div class="instrument-panel-head">
                          <div>
                            <div class="instrument-title">待排程仪器</div>
                            <div class="instrument-subtitle">拖拽单台仪器到右侧日历完成排程</div>
                          </div>
                          <span class="instrument-count">{{ getPendingInstruments(order).length }} 台</span>
                        </div>
                        <div v-if="getPendingInstruments(order).length === 0" class="instrument-empty">
                          当前工单暂无待排程仪器
                        </div>
                        <div v-else class="instrument-list">
                          <div
                            v-for="item in getPendingInstruments(order)"
                            :key="item.id"
                            class="instrument-item"
                            draggable="true"
                            @dragstart="emit('instrument-drag-start', $event, item)"
                            @dragend="emit('drag-end', $event)"
                          >
                            <span class="instrument-name">
                              <Icon icon="mdi:drag-vertical" class="instrument-drag-icon" />
                              {{ item.label }}
                            </span>
                            <span class="instrument-sn">{{ item.sn }}</span>
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
            <input
              type="date"
              class="week-cal-date-input"
              :value="fmtDate(calBase)"
              @change="emit('goto-date', $event)"
              title="跳转到指定日期所在周"
            />
            <span class="week-cal-label">{{ weekLabel }}</span>
            <button class="week-cal-nav" @click="emit('next-week')">下一周 ›</button>
            <button class="week-cal-nav" @click="emit('load-preset-schedule')">读取本周排程</button>
          </div>
          <div class="legend">
            <div class="legend-item"><span class="dot pending"></span>空闲</div>
            <div class="legend-item"><span class="dot occupied"></span>已占用</div>
          </div>
        </div>

        <div class="calendar-grid" :class="{ 'is-dragging': isDragging }">
          <div class="grid-scroll" ref="gridScrollRef">
            <div class="grid-header-row" :style="{ width: `${gridInnerWidth}px` }">
              <div class="time-column-header">时间</div>
              <div
                v-for="day in currentWeekDays"
                :key="day.dateStr"
                class="day-header"
                :class="{ 'is-today': day.isToday }"
              >
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
                    v-for="it in scheduledLayoutItems
                      .map((x) => ({ ...x, dayIndex: currentWeekDays.findIndex((d) => d.dateStr === x.dateStr) }))
                      .filter((x) => x.dayIndex >= 0)"
                    :key="it.instrumentId"
                    class="scheduled-item"
                    :class="[
                      { 'is-selected': selectedScheduledOrderIds.includes(it.instrumentId) },
                      (isResizing && resizingInstrumentId === it.instrumentId ? 'is-resizing' : '')
                    ]"
                    :style="getScheduledStyle(it)"
                    @click.stop="emit('select-scheduled-order', it.instrumentId)"
                    :title="`${getInstrumentById(it.instrumentId)?.label || ''} · ${getInstrumentById(it.instrumentId)?.sn || ''} · ${getOrderByInstrumentId(it.instrumentId)?.no || ''}`"
                  >
                    <div class="scheduled-content">
                      <span class="device-name">{{ getInstrumentById(it.instrumentId)?.label }}</span>
                      <button class="remove-btn" title="删除排程" @click.stop="emit('unschedule', it.cellKey, it.instrumentId)">
                        <Icon icon="mdi:close" />
                      </button>
                    </div>
                    <div class="scheduled-tag">
                      {{ getInstrumentById(it.instrumentId)?.sn }} · {{ getOrderByInstrumentId(it.instrumentId)?.no }}
                    </div>
                    <div class="resize-handle-top" @mousedown.stop.prevent="startResizeTop(it.instrumentId, $event)"></div>
                    <div class="resize-handle" @mousedown.stop.prevent="startResize(it.instrumentId, $event)"></div>
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
                    @dragleave="emit('drag-leave', $event)"
                    @drop.capture="emit('drop', $event, day.dateStr, slot.key, day.isPast)"
                  >
                    <div class="empty-slot-hint"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="control-center">
          <div class="control-center-left">
            <template v-if="selectedScheduledOrders.length > 0">
              <div class="selected-order">
                <Icon icon="mdi:check" class="selected-icon" />
                <span class="selected-label">已选中工单: {{ selectedScheduledOrders.length }} 个</span>
              </div>
              <span class="selected-divider">|</span>
              <span v-for="o in selectedScheduledOrders" :key="o.instrument.id" class="selected-device">
                {{ o.order.no }} · {{ o.instrument.label }}
              </span>
            </template>
            <span v-else class="selected-placeholder">请在日历中选择已排程的工单</span>
          </div>

          <button class="primary-btn" :disabled="selectedScheduledOrders.length === 0" @click="emit('start-scheduled-test')">
            <Icon icon="mdi:play" class="start-icon" />
            开始实验
          </button>
        </div>
      </div>
    </div>
    <WorkOrderDetailModal :visible="detailVisible" :order="detailOrder" @close="closeDetail" />
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
<style scoped>
.grid-scroll { flex: 1; overflow: auto; }
.grid-body { position: relative; overflow: hidden; }
.grid-inner { position: relative; }
.events-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.scheduled-item { position: absolute; padding: 6px 8px; border-radius: 6px; color: #fff; display: flex; flex-direction: column; justify-content: flex-start; cursor: pointer; user-select: none; transition: all 0.2s ease; overflow: hidden; pointer-events: auto; z-index: 10; background: linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-cyan, #06b6d4)); }
.calendar-grid.is-dragging .scheduled-item { pointer-events: none; }
.scheduled-item.is-selected { position: absolute !important; outline: 2px solid rgba(255,255,255,.95); box-shadow: 0 0 0 3px rgba(37,99,235,.35); transform: scale(1.04); }
.scheduled-item.is-resizing { transition: none !important; transform: none !important; }
.scheduled-item.is-resizing:hover { transform: none !important; }
.scheduled-content { display: flex; align-items: flex-start; }
.device-name { font-size: 12px; font-weight: 800; line-height: 1.25; padding-right: 20px; overflow: hidden; word-break: break-all; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.scheduled-tag { font-size: 11px; font-weight: 600; margin-top: 4px; overflow: hidden; word-break: break-all; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: rgba(255,255,255,.92); }
.remove-btn { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; align-items: center; justify-content: center; background: rgba(0,0,0,.18); border: none; color: rgba(255,255,255,.9); cursor: pointer; padding: 0; border-radius: 4px; opacity: 0; pointer-events: none; transition: opacity .15s, background .15s; display: flex; }
.scheduled-item:hover .remove-btn { opacity: 1; pointer-events: auto; }
.remove-btn:hover { background: rgba(0,0,0,.28); color: #fff; }
.resize-handle-top { position: absolute; left: 0; right: 0; top: 0; height: 10px; cursor: ns-resize; background: linear-gradient(0deg, rgba(255,255,255,0), rgba(255,255,255,.18)); }
.resize-handle-top:hover { background: linear-gradient(0deg, rgba(255,255,255,0), rgba(255,255,255,.28)); }
.resize-handle { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; cursor: ns-resize; background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.18)); }
.resize-handle:hover { background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.28)); }

.table-wrapper {
  padding: 0;
}

.data-table {
  border-collapse: collapse;
  border-spacing: 0;
}

.data-table thead {
  top: 0;
}

.data-table th {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  letter-spacing: 0;
}

.work-order-row td {
  position: relative;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background-color 0.15s ease;
}

.work-order-row td:first-child {
  border-left: 3px solid transparent;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.work-order-row td:last-child {
  border-right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.work-order-row:hover td,
.work-order-row.is-expanded td {
  background: var(--color-bg-hover);
  box-shadow: none;
}

.work-order-row.is-expanded td:first-child,
.work-order-row:hover td:first-child {
  border-left-color: var(--color-accent-blue);
}

.cell-id {
  font-size: 13px;
  font-weight: 600;
}

.cell-applicant,
.cell-device {
  font-weight: 400;
}

.expanded-cell {
  padding: 0 16px 12px 19px !important;
  background: var(--color-bg-primary) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
}

.instrument-panel {
  margin: 0;
  padding: 10px 0 0;
  border-top: 1px solid var(--color-border);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.instrument-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.instrument-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.instrument-subtitle {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.instrument-count {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
}

.instrument-list {
  gap: 8px;
}

.instrument-item {
  align-items: center;
  padding: 6px 8px;
  border: 1px solid transparent;
  background: transparent;
}

.instrument-item:hover {
  border-color: var(--color-border);
  background: var(--color-bg-hover);
}

.instrument-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-weight: 400;
  color: var(--color-text-primary);
}

.instrument-drag-icon {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--color-text-tertiary);
}

.instrument-sn {
  flex-shrink: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: 11px;
}

.instrument-empty {
  padding: 8px 0;
  border: 0;
  border-radius: 0;
  color: var(--color-text-tertiary);
  text-align: left;
  font-size: 12px;
}
</style>
