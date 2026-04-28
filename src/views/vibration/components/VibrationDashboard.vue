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
  startResize: (orderId: string, e: MouseEvent) => void
  startResizeTop: (orderId: string, e: MouseEvent) => void
  resizingOrderId: string | null
  isResizing: boolean
  selectedScheduledOrderIds: string[]
  selectedScheduledOrders: WorkOrder[]
  fmtDate: (d: Date) => string
  getCellKey: (dateStr: string, timeKey: string) => string
  getOrderById: (id: string) => WorkOrder | undefined
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
  'unschedule': [cellKey: string, orderId: string]
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
          placeholder="搜索工单号/申请人/设备/类型"
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
            <thead>
              <tr>
                <th>工单号</th>
                <th>设备</th>
                <th>申请人</th>
                <th>参数</th>
                <th>类型</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in unscheduledOrders"
                :key="order.id"
                draggable="true"
                @dragstart="emit('drag-start', $event, order)"
                @dragend="emit('drag-end', $event)"
              >
                <td class="cell-id">{{ order.id }}</td>
                <td class="cell-device" :title="order.device">{{ order.device }}</td>
                <td class="cell-applicant">{{ order.applicant }}</td>
                <td class="cell-param">{{ order.level }} / {{ order.duration }}分</td>
                <td class="cell-type">
                  <span class="type-tag" :class="order.mode === 'pre' ? 'sim' : 'formal'">
                    {{ order.type }}
                  </span>
                </td>
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
                  :key="it.orderId"
                  class="scheduled-item"
                  :class="[
                    { 'is-selected': selectedScheduledOrderIds.includes(it.orderId) },
                    (getOrderById(it.orderId)?.mode === 'pre' ? 'type-sim' : 'type-formal'),
                    (isDragging ? 'is-dragging' : ''),
                    (isResizing && resizingOrderId === it.orderId ? 'is-resizing' : '')
                  ]"
                  :style="getScheduledStyle(it)"
                  @click="emit('select-scheduled-order', it.orderId)"
                  :title="`${getOrderById(it.orderId)?.id || ''} · ${getOrderById(it.orderId)?.device || ''}`"
                >
                  <div class="scheduled-content">
                    <span class="device-name">{{ it.orderId }}</span>
                    <button class="remove-btn" title="删除排程" @click.stop="emit('unschedule', it.cellKey, it.orderId)">
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">{{ getOrderById(it.orderId)?.device }}</div>
                  <div class="resize-handle-top" @mousedown.stop.prevent="startResizeTop(it.orderId, $event)"></div>
                  <div class="resize-handle" @mousedown.stop.prevent="startResize(it.orderId, $event)"></div>
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
.scheduled-item.type-sim.is-selected { background: linear-gradient(135deg, #facc15, #eab308) !important; box-shadow: 0 0 0 3px rgba(234, 179, 8, 0.35) !important; }
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
</style>
