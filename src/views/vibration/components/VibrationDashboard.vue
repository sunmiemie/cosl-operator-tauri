<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { StartupCheckItem, TimeSlot, WeekDay, WorkOrder } from '../types'

const props = defineProps<{
  showStartupCheck: boolean
  checkItems: StartupCheckItem[]
  allChecked: boolean
  unscheduledOrders: WorkOrder[]
  searchKeyword: string
  currentWeekDays: WeekDay[]
  timeSlots: TimeSlot[]
  calBase: Date
  weekLabel: string
  scheduledOrders: Record<string, string[]>
  scheduledLayoutItems: {
    eventId: string
    orderId: string
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
  startResize: (eventId: string, e: MouseEvent) => void
  startResizeTop: (eventId: string, e: MouseEvent) => void
  resizingOrderId: string | null
  isResizing: boolean
  selectedScheduledOrderIds: string[]
  selectedScheduledOrders: WorkOrder[]
  fmtDate: (d: Date) => string
  getCellKey: (dateStr: string, timeKey: string) => string
  getOrderById: (id: string) => WorkOrder | undefined
  getVisibleOrderInstruments: (order: WorkOrder) => WorkOrder['instruments']
  getInstrumentStatusText: (order: WorkOrder, instrumentId: string) => string
  workOrdersLoading: boolean
  refreshWorkOrders: () => void
}>()

const emit = defineEmits<{
  'update:showStartupCheck': [value: boolean]
  'update:searchKeyword': [value: string]
  'toggle-check': [id: number]
  'startup-check-complete': []
  'drag-start': [event: DragEvent, order: WorkOrder]
  'drag-end': [event: DragEvent]
  'prev-week': []
  'next-week': []
  'goto-date': [event: Event]
  'drag-over': [event: DragEvent, isPast: boolean]
  'drop': [event: DragEvent, dateStr: string, timeKey: string, isPast: boolean]
  'select-scheduled-order': [orderId: string]
  'unschedule': [cellKey: string, orderId: string, eventId: string]
  'start-experiment': []
}>()

const timeColWidth = 60
const cellPadding = 3
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

const maxLanesBeforeExpand = 2
const widthFactor = computed(() => Math.max(1, Math.ceil((props.maxLaneCount || 1) / maxLanesBeforeExpand)))
const gridInnerWidth = computed(() => {
  const base = Math.max(0, gridViewportWidth.value - timeColWidth)
  return timeColWidth + base * widthFactor.value
})

const scheduledOrderIdSet = computed(() => new Set(props.scheduledLayoutItems.map((item) => item.orderId)))
const expandedOrderIds = ref<string[]>([])
const isExpanded = (orderId: string) => expandedOrderIds.value.includes(orderId)
const toggleExpanded = (orderId: string) => {
  const set = new Set(expandedOrderIds.value)
  if (set.has(orderId)) set.delete(orderId)
  else set.add(orderId)
  expandedOrderIds.value = Array.from(set)
}

const getOrderStatusText = (order: WorkOrder) => {
  const visibleInstruments = props.getVisibleOrderInstruments(order)
  const hasRunningInstrument = visibleInstruments.some((instrument) =>
    props.getInstrumentStatusText(order, instrument.id) === '测试中'
  )
  if (hasRunningInstrument) return '测试中'
  if (order.status === 5) return '已完成'
  if (order.status === 6) return '异常'
  if (scheduledOrderIdSet.value.has(order.id)) return '已排程'
  return '待排程'
}

const getStatusClass = (statusText: string) => {
  if (statusText === '测试中') return 'status-running'
  if (statusText === '已排程') return 'status-scheduled'
  if (statusText === '已完成') return 'status-done'
  if (statusText === '异常') return 'status-error'
  return 'status-pending'
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
</script>

<template>
  <div class="layout-container">
    <div v-if="showStartupCheck" class="modal-overlay">
      <div class="startup-check-modal">
        <h2 class="modal-title">开机检查</h2>
        <div class="check-list-container">
          <div class="check-list">
            <label
              v-for="item in checkItems"
              :key="item.id"
              class="check-item"
              :class="{ 'is-checked': item.checked }"
            >
              <div class="checkbox-wrapper">
                <input type="checkbox" :checked="item.checked" @change="emit('toggle-check', item.id)" />
                <div class="custom-checkbox">
                  <Icon v-if="item.checked" icon="mdi:check" />
                </div>
              </div>
              <span class="check-text">{{ item.text }}</span>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="emit('update:showStartupCheck', false)">取消</button>
          <button class="next-btn" :disabled="!allChecked" @click="emit('startup-check-complete')">
            下一步
          </button>
        </div>
      </div>
    </div>

    <div class="sidebar">
      <div class="panel-header">
        <div class="header-title">
          <Icon icon="mdi:format-list-bulleted" class="header-icon" />
          <span>待测试工单</span>
        </div>
        <div class="header-actions">
          <button class="icon-btn" :disabled="workOrdersLoading" title="刷新" @click="refreshWorkOrders">
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
          placeholder="搜索工单号/客户/设备/仪器"
          @input="emit('update:searchKeyword', ($event.target as HTMLInputElement).value)"
        />
        <button v-if="searchKeyword" class="clear-btn" @click="emit('update:searchKeyword', '')">
          <Icon icon="mdi:close" />
        </button>
      </div>

      <div class="table-content">
        <div v-if="unscheduledOrders.length === 0" class="empty-state">
          无待排程工单
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <colgroup>
              <col class="col-applicant" />
              <col class="col-task" />
              <col class="col-device" />
              <col class="col-status" />
            </colgroup>
            <thead>
              <tr>
                <th>申请人</th>
                <th>任务编号</th>
                <th>使用设备</th>
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
                  @dragstart="emit('drag-start', $event, order)"
                  @dragend="emit('drag-end', $event)"
                >
                  <td class="cell-applicant">{{ order.applicant }}</td>
                  <td class="cell-id">{{ order.id }}</td>
                  <td class="cell-device">
                    <div class="cell-detail">
                      <span class="expand-icon" @click.stop="toggleExpanded(order.id)">
                        <Icon :icon="isExpanded(order.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
                      </span>
                      <span class="device-summary" :title="order.device || '-'">{{ order.device || '-' }}</span>
                    </div>
                  </td>
                  <td class="cell-status">
                    <span class="status-pill" :class="getStatusClass(getOrderStatusText(order))">
                      {{ getOrderStatusText(order) }}
                    </span>
                  </td>
                </tr>
                <tr v-if="isExpanded(order.id)" :key="order.id + '-expanded'">
                  <td class="expanded-cell" colspan="4">
                    <div class="instrument-panel">
                      <div class="instrument-panel-head">
                        <div>
                          <div class="instrument-title">设备明细</div>
                          <div class="instrument-subtitle">该工单当前未完成的测试设备</div>
                        </div>
                        <span class="instrument-count-pill">{{ getVisibleOrderInstruments(order).length }} 台</span>
                      </div>
                      <div v-if="getVisibleOrderInstruments(order).length === 0" class="instrument-empty">
                        当前无待测试仪器
                      </div>
                      <div v-else class="instrument-list">
                        <div
                          v-for="instrument in getVisibleOrderInstruments(order)"
                          :key="instrument.id"
                          class="instrument-item"
                        >
                          <div class="instrument-main">
                            <span class="instrument-name">{{ instrument.name }}</span>
                            <span class="instrument-sn">{{ instrument.sn }}</span>
                          </div>
                          <div class="instrument-status-cell">
                            <span class="status-pill" :class="getStatusClass(getInstrumentStatusText(order, instrument.id))">
                              {{ getInstrumentStatusText(order, instrument.id) }}
                            </span>
                          </div>
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
          <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="emit('goto-date', $event)" title="跳转到指定日期所在周">
          <span class="week-cal-label">{{ weekLabel }}</span>
          <button class="week-cal-nav" @click="emit('next-week')">下一周 ›</button>
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
            <div
              v-for="day in currentWeekDays"
              :key="day.dateStr"
              class="day-header"
              :class="{ 'is-today': day.isToday }"
            >
              <div class="day-num" :class="{ 'is-weekend': day.isWeekend }">{{ day.month }}/{{ day.dayNum }}</div>
              <div class="day-name">周{{ day.dayName.replace('周', '') }}</div>
            </div>
          </div>

          <div class="grid-body">
            <div
              class="grid-inner"
              ref="gridInnerRef"
              :style="{ height: `${timeSlots.length * slotHeightPx}px`, width: `${gridInnerWidth}px` }"
            >
              <div class="events-overlay">
                <div
                  v-for="it in scheduledLayoutItems
                    .map((x) => ({ ...x, dayIndex: currentWeekDays.findIndex((d) => d.dateStr === x.dateStr) }))
                    .filter((x) => x.dayIndex >= 0)"
                  :key="it.eventId"
                  class="scheduled-item"
                  :class="[
                    { 'is-selected': selectedScheduledOrderIds.includes(it.orderId) },
                    'type-formal',
                    (isDragging ? 'is-dragging' : ''),
                    (isResizing && resizingOrderId === it.eventId ? 'is-resizing' : '')
                  ]"
                  :style="getScheduledStyle(it)"
                  @click="emit('select-scheduled-order', it.orderId)"
                  :title="`${getOrderById(it.orderId)?.id || ''} · ${getOrderById(it.orderId)?.device || ''} · ${getOrderById(it.orderId)?.instruments.length || 0}台`"
                >
                  <div class="scheduled-content">
                    <span class="device-name">{{ it.orderId }}</span>
                    <button class="remove-btn" title="删除排程" @click.stop="emit('unschedule', it.cellKey, it.orderId, it.eventId)">
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">{{ getOrderById(it.orderId)?.device }} · {{ getOrderById(it.orderId)?.instruments.length || 0 }}台</div>
                  <div class="resize-handle-top" @mousedown.stop.prevent="startResizeTop(it.eventId, $event)"></div>
                  <div class="resize-handle" @mousedown.stop.prevent="startResize(it.eventId, $event)"></div>
                </div>
              </div>

              <div v-for="slot in timeSlots" :key="slot.key" class="grid-row">
                <div class="time-label">{{ slot.label }}</div>

                <div
                  v-for="day in currentWeekDays"
                  :key="getCellKey(day.dateStr, slot.key)"
                  class="grid-cell"
                  :class="{ 'is-weekend': day.isWeekend, 'is-past': day.isPast }"
                  @dragover="emit('drag-over', $event, day.isPast)"
                  @drop="emit('drop', $event, day.dateStr, slot.key, day.isPast)"
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
          <template v-if="selectedScheduledOrders.length">
            <div class="selected-order">
              <Icon icon="mdi:check" class="selected-icon" />
              <span class="selected-label">已选中工单: {{ selectedScheduledOrders.length }} 个</span>
            </div>
            <span class="selected-divider">|</span>
            <span class="selected-device" v-for="o in selectedScheduledOrders" :key="o.id">{{ o.id }} · {{ o.device }}</span>
          </template>
          <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
        </div>

        <button class="primary-btn" :disabled="!selectedScheduledOrders.length" @click="emit('start-experiment')">
          <Icon icon="mdi:play" class="start-icon" />
          开始实验
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./vibration.shared.css"></style>
<style scoped>
.sidebar {
  width: 460px;
  min-width: 460px;
}

.grid-scroll { flex: 1; overflow: auto; }
.grid-body { position: relative; overflow: hidden; }
.grid-inner { position: relative; }
.events-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.grid-row { display: grid; grid-template-columns: 60px repeat(7, 1fr); border-bottom: 1px solid var(--color-border); min-height: 44px; }
.time-column-header { width: auto; }
.scheduled-item { position: absolute; padding: 4px 6px; cursor: pointer; overflow: hidden; pointer-events: auto; z-index: 10; }
.scheduled-item.is-selected { position: absolute !important; }
.scheduled-item { transform-origin: top left; }
.scheduled-item.is-dragging { pointer-events: none; }
.scheduled-item.is-resizing { transition: none !important; transform: none !important; }
.scheduled-item.is-resizing:hover { transform: none !important; }
.scheduled-content { display: flex; align-items: flex-start; }
.device-name { overflow: hidden; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.scheduled-tag { overflow: hidden; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.remove-btn { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; align-items: center; justify-content: center; background: rgba(0,0,0,.18); border: none; color: rgba(255,255,255,.9); cursor: pointer; padding: 0; border-radius: 4px; opacity: 0; pointer-events: none; transition: opacity .15s, background .15s; display: flex; }
.scheduled-item:hover .remove-btn { opacity: 1; pointer-events: auto; }
.remove-btn:hover { background: rgba(0,0,0,.28); color: #fff; }
.resize-handle-top { position: absolute; left: 0; right: 0; top: 0; height: 10px; cursor: ns-resize; background: linear-gradient(0deg, rgba(255,255,255,0), rgba(255,255,255,.18)); }
.resize-handle-top:hover { background: linear-gradient(0deg, rgba(255,255,255,0), rgba(255,255,255,.28)); }
.resize-handle { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; cursor: ns-resize; background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.18)); }
.resize-handle:hover { background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.28)); }
.empty-state { text-align:center; padding:40px 20px; color:#94a3b8; font-size:13px; }
.header-actions { display:flex; align-items:center; gap:10px; }
.icon-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; padding:0; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-secondary); cursor:pointer; }
.icon-btn:disabled { opacity:.5; cursor:not-allowed; }
.icon-btn:hover:not(:disabled) { background:var(--color-bg-hover); color:var(--color-text-primary); }

.table-wrapper {
  padding: 0;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: fixed;
}

.col-applicant { width: 16%; }
.col-task { width: 28%; }
.col-device { width: auto; }
.col-status { width: 88px; }

.data-table th {
  padding: 13px 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  letter-spacing: 0;
}

.order-row {
  cursor: grab;
}

.order-row:active {
  cursor: grabbing;
}

.order-row td {
  position: relative;
  padding: 14px 12px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background-color 0.15s ease;
  vertical-align: middle;
}

.order-row td:first-child {
  border-left: 3px solid transparent;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.order-row td:last-child {
  border-right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.order-row:hover td,
.order-row.is-expanded td {
  background: var(--color-bg-hover);
  box-shadow: none;
}

.order-row.is-expanded td:first-child,
.order-row:hover td:first-child {
  border-left-color: var(--color-accent-blue);
}

.cell-applicant,
.cell-id,
.cell-status {
  white-space: nowrap;
}

.cell-action,
.cell-status {
  text-align: center;
}

.cell-plan,
.cell-purpose {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.cell-plan {
  white-space: nowrap;
}

.cell-purpose {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.device-summary {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--color-text-secondary);
}

.cell-device {
  font-weight: 400;
  min-width: 0;
}

.cell-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 88px;
}

.op-btn {
  min-width: 56px;
  height: 28px;
  border: 1px solid rgba(59, 130, 246, 0.18);
  background: rgba(59, 130, 246, 0.08);
  color: var(--color-accent-blue);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 0 10px;
  border-radius: 8px;
}

.op-btn:hover {
  background: rgba(59, 130, 246, 0.14);
  border-color: rgba(59, 130, 246, 0.28);
}

.inline-status {
  min-width: 58px;
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

.instrument-count-pill {
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

.order-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin-bottom: 12px;
  padding: 0 2px;
}

.order-meta-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  font-size: 12px;
}

.meta-label {
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.meta-value {
  min-width: 0;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.instrument-item {
  align-items: center;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 10px;
}

.instrument-item:hover {
  border-color: var(--color-border);
  background: var(--color-bg-hover);
}

.instrument-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.instrument-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.instrument-sn {
  flex-shrink: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.instrument-status-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.instrument-empty {
  padding: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.cell-status {
  text-align: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.status-pending {
  color: #d97706;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.status-running {
  color: var(--color-accent-green, #10b981);
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.status-scheduled {
  color: var(--color-accent-blue);
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.status-done {
  color: var(--color-accent-green, #10b981);
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.status-error {
  color: #dc2626;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.2);
}
</style>
