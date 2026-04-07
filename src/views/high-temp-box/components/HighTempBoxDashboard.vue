<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { HighTempBoxContext } from '../composables/useHighTempBox'

const props = defineProps<{ ctx: HighTempBoxContext }>()
const {
  searchKeyword,
  workOrdersLoading,
  refreshWorkOrders,
  orderStatusMutating,
  calBase,
  selectedScheduledOrder,
  filteredOrders,
  currentWeekDays,
  weekLabel,
  timeSlots,
  slotHeightPx,
  scheduledLayoutItems,
  maxLaneCount,
  isDragging,
  fmtDate,
  prevWeek,
  nextWeek,
  gotoDate,
  loadPresetSchedule,
  getCellKey,
  getOrderById,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleUnschedule,
  selectScheduledTask,
  selectedScheduledOrderInfo,
  startExperiment,
  scheduleOrder,
  startResize,
  startResizeTop,
  resizingOrderId,
  isResizing,
} = props.ctx

const selectedInfo = computed(() => selectedScheduledOrderInfo.value)
const canStartExperiment = computed(() => !!selectedInfo.value && !orderStatusMutating.value)

const timeColWidth = 60
const cellPadding = 3
const maxLanesBeforeExpand = 2
const gridScrollRef = ref<HTMLElement | null>(null)
const gridViewportWidth = ref(0)
const gridInnerRef = ref<HTMLElement | null>(null)
let ro: ResizeObserver | null = null

const widthFactor = computed(() => Math.max(1, Math.ceil((maxLaneCount.value || 1) / maxLanesBeforeExpand)))
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

const getScheduledStyle = (item: any) => {
  const totalWidth = gridInnerWidth.value || 0
  const dayColW = totalWidth > timeColWidth ? (totalWidth - timeColWidth) / 7 : 0
  const laneCount = Math.max(1, item.laneCount || 1)
  const laneW = dayColW > 0 ? dayColW / laneCount : 0
  const top = item.startIdx * slotHeightPx + cellPadding
  const height = item.span * slotHeightPx - cellPadding * 2
  const left = timeColWidth + item.dayIndex * dayColW + item.lane * laneW + cellPadding
  const width = laneW - cellPadding * 2
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${Math.max(20, width)}px`,
    height: `${Math.max(slotHeightPx - cellPadding * 2, height)}px`,
    zIndex: selectedScheduledOrder.value === item.orderId ? 12 : 10,
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
  const slotIndex = Math.min(timeSlots.length - 1, Math.max(0, Math.floor(y / slotHeightPx)))
  const day = currentWeekDays[dayIndex]
  const slot = timeSlots[slotIndex]
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
  const orderId = e.dataTransfer?.getData('text/plain')
  if (!orderId) return
  scheduleOrder(orderId, target.dateStr, target.timeKey, target.isPast)
}

async function onStartExperiment() {
  if (!selectedInfo.value) return
  await startExperiment(selectedInfo.value.id)
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
        <div class="header-actions">
          <button class="icon-btn" :disabled="workOrdersLoading" title="刷新" @click="refreshWorkOrders">
            <Icon icon="mdi:refresh" />
          </button>
          <span class="count-badge">{{ filteredOrders.length }}</span>
        </div>
      </div>

      <div class="search-box">
        <Icon icon="mdi:magnify" class="search-icon" />
        <input v-model="searchKeyword" type="text" placeholder="搜索工单号/申请人" />
        <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''">
          <Icon icon="mdi:close" />
        </button>
      </div>

      <div class="table-content">
        <div v-if="filteredOrders.length === 0" class="empty-state">
          <p>无待排程工单</p>
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>任务单号</th>
                <th>申请人</th>
                <th>设备名称</th>
                <th>目标温度(°C)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in filteredOrders"
                :key="order.id"
                draggable="true"
                @dragstart="handleDragStart($event, order)"
                @dragend="handleDragEnd"
              >
                <td class="cell-id">{{ order.id }}</td>
                <td class="cell-applicant">{{ order.applicant }}</td>
                <td class="cell-device" :title="order.deviceName">{{ order.deviceName }}</td>
                <td class="cell-param">{{ order.targetTemp }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="main-content">
      <div class="panel-header">
        <div class="week-cal-toolbar">
          <button class="week-cal-nav" @click="prevWeek">‹ 上一周</button>
          <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="gotoDate" title="跳转到指定日期所在周" />
          <span class="week-cal-label">{{ weekLabel }}</span>
          <button class="week-cal-nav" @click="nextWeek">下一周 ›</button>
          <button class="week-cal-nav" @click="loadPresetSchedule">读取本周排程</button>
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
                  :key="it.orderId"
                  class="scheduled-item"
                  :class="{
                    'is-selected': selectedScheduledOrder === it.orderId,
                    'is-dragging': isDragging,
                    'is-resizing': isResizing && resizingOrderId === it.orderId
                  }"
                  :style="getScheduledStyle(it)"
                  @click="selectScheduledTask(it.orderId)"
                  :title="`${it.orderId} · ${getOrderById(it.orderId)?.deviceName || ''}`"
                >
                  <div class="resize-handle-top" @mousedown.stop.prevent="startResizeTop(it.orderId, $event)"></div>
                  <div class="scheduled-content">
                    <span class="device-name">{{ it.orderId }}</span>
                    <button class="remove-btn" title="删除排程" @click.stop="handleUnschedule(it.cellKey, it.orderId)">
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">{{ getOrderById(it.orderId)?.deviceName }}</div>
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
                  @dragover="handleDragOver($event, day.isPast)"
                  @dragleave="handleDragLeave"
                  @drop="handleDrop($event, day.dateStr, slot.key, day.isPast)"
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
          <template v-if="selectedInfo">
            <div class="selected-order">
              <Icon icon="mdi:check" class="selected-icon" />
              <span class="selected-label">已选中工单: {{ selectedInfo.id }}</span>
            </div>
            <span class="selected-divider">|</span>
            <span class="selected-device">{{ selectedInfo.deviceName }}</span>
            <span class="selected-process">{{ selectedInfo.targetTemp }}°C</span>
          </template>
          <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
        </div>

        <button class="primary-btn" :disabled="!canStartExperiment" @click.stop.prevent="onStartExperiment">
          <Icon icon="mdi:play" class="start-icon" />
          开始实验
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 直接从 index.vue 拆出的 dashboard 样式（不改任何数值），保证视觉一致 */
.layout-container { display:flex; flex:1; gap:16px; overflow:hidden; }
.sidebar { width:320px; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; }
.panel-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 18px; border-bottom:1px solid var(--color-border); font-size:15px; font-weight:600; color:var(--color-text-primary); background:var(--color-bg-secondary); flex-shrink:0; }
.panel-header .header-icon { font-size:16px; color:var(--color-text-secondary); background:none; width:auto; height:auto; border-radius:0; display:inline-flex; }
.sidebar .panel-header .header-title { display:flex; align-items:center; gap:8px; font-size:0.875rem; font-weight:500; }
.header-actions { display:flex; align-items:center; gap:10px; }
.icon-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-secondary); cursor:pointer; }
.icon-btn:disabled { opacity:.5; cursor:not-allowed; }
.icon-btn:hover:not(:disabled) { background:var(--color-bg-hover); color:var(--color-text-primary); }
.search-box { display:flex; align-items:center; gap:8px; padding:12px 18px; border-bottom:1px solid var(--color-border); background:var(--color-bg-secondary); }
.search-icon { font-size:18px; color:#94a3b8; }
.search-box input { flex:1; border:none; background:transparent; font-size:14px; color:#94a3b8; outline:none; }
.search-box input::placeholder { color:#94a3b8; }
.clear-btn { display:flex; align-items:center; justify-content:center; width:20px; height:20px; border:none; background:var(--color-bg-tertiary); color:var(--color-text-secondary); border-radius:50%; cursor:pointer; transition:all 0.2s; }
.clear-btn:hover { background:var(--color-error); color:white; }
.count-badge { padding:4px 10px; border-radius:9999px; font-size:12px; font-weight:500; background:rgba(59,130,246,0.15); color:rgb(96,165,250); }
.table-content { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--color-bg-secondary); }
.table-wrapper { flex:1; overflow:auto; }
.empty-state { text-align:center; padding:40px 20px; color:#94a3b8; font-size:13px; }
.data-table { width:100%; border-collapse:collapse; font-size:13px; }
.data-table thead { position:sticky; top:0; z-index:1; }
.data-table th { padding:12px 16px; text-align:left; font-weight:600; color:var(--color-text-secondary); background:var(--color-bg-secondary); border-bottom:1px solid var(--color-border); white-space:nowrap; }
.data-table tbody tr { transition:background-color 0.15s; }
.data-table tbody tr:hover { background:rgba(255,255,255,0.02); }
.data-table td { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.04); vertical-align:middle; }
.cell-id { font-weight:600; color:var(--color-accent-blue); }
.cell-device { max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cell-applicant, .cell-param { color:var(--color-text-secondary); }
.priority-tag { display:inline-flex; align-items:center; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; white-space:nowrap; }
.priority-tag.high { background:rgba(239,68,68,0.12); color:#ef4444; }
.priority-tag.normal { background:rgba(59,130,246,0.12); color:#3b82f6; }
.priority-tag.low { background:rgba(34,197,94,0.12); color:#22c55e; }
.main-content { flex:1; display:flex; flex-direction:column; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; overflow:hidden; }
.week-cal-toolbar { display:flex; align-items:center; gap:8px; flex:1; }
.week-cal-label { font-size:13px; font-weight:600; flex:1; text-align:center; white-space:nowrap; }
.week-cal-nav { padding:5px 10px; border:1px solid var(--color-border); border-radius:6px; background:var(--color-bg-primary); cursor:pointer; font-size:12px; color:var(--color-text-primary); transition:all 0.2s; }
.week-cal-nav:hover { background:var(--color-bg-hover); }
.week-cal-date-input { padding:5px 8px; border:1px solid var(--color-border); border-radius:6px; font-size:12px; background:var(--color-bg-primary); color:var(--color-text-primary); width:130px; }
.legend { display:flex; gap:16px; margin-left:auto; }
.legend-item { display:flex; align-items:center; font-size:13px; color:var(--color-text-secondary); }
.dot { width:8px; height:8px; border-radius:50%; margin-right:6px; }
.dot.pending { background:var(--color-border); }
.dot.occupied { background:var(--color-accent-blue); }
.calendar-grid { flex:1; display:flex; flex-direction:column; border-top:1px solid var(--color-border); border-bottom:1px solid var(--color-border); background:var(--color-bg-primary); overflow:hidden; }
.grid-scroll { flex:1; overflow:auto; }
.grid-header-row { display:grid; grid-template-columns:60px repeat(7,1fr); border-bottom:1px solid var(--color-border); background:var(--color-bg-tertiary); position:sticky; top:0; z-index:20; }
.time-column-header { padding:12px; text-align:center; border-right:1px solid var(--color-border); font-weight:600; font-size:12px; color:var(--color-text-secondary); }
.day-header { padding:8px; text-align:center; border-right:1px solid var(--color-border); }
.day-header.is-today { background:rgba(88,166,255,0.1); }
.day-num { font-size:16px; font-weight:700; color:var(--color-accent-blue); }
.day-num.is-weekend { color:var(--color-error); }
.day-name { font-size:11px; color:var(--color-text-secondary); margin-top:2px; }
.grid-body { position:relative; overflow:hidden; }
.grid-inner { position:relative; }
.events-overlay { position:absolute; inset:0; pointer-events:none; z-index:5; }
.grid-row { display:grid; grid-template-columns:60px repeat(7,1fr); border-bottom:1px solid var(--color-border); min-height:44px; }
.time-label { display:flex; align-items:center; justify-content:center; border-right:1px solid var(--color-border); font-size:11px; color:var(--color-text-tertiary); background:var(--color-bg-tertiary); font-family:monospace; }
.grid-cell { border-right:1px solid var(--color-border); position:relative; transition:background 0.2s; background:var(--color-bg-primary); padding:3px; }
.grid-cell.is-weekend { background:rgba(0,0,0,0.012); }
.grid-cell:hover:not(.is-past) { background:var(--color-bg-hover); }
.grid-cell.is-past { background:repeating-linear-gradient(45deg,var(--color-bg-tertiary),var(--color-bg-tertiary) 10px,var(--color-bg-secondary) 10px,var(--color-bg-secondary) 20px); opacity:0.7; cursor:not-allowed; }
.grid-cell.drag-over { background:rgba(88,166,255,0.1) !important; outline:2px dashed var(--color-accent-blue); outline-offset:-2px; }
.empty-slot-hint { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; opacity:0; color:var(--color-text-tertiary); pointer-events:none; font-size:20px; }
.grid-cell:hover .empty-slot-hint { opacity:0.5; }
.scheduled-item { position:absolute; padding:4px 6px; background:linear-gradient(135deg,var(--color-accent-blue),var(--color-accent-cyan,#06b6d4)); border-radius:4px; color:#fff; display:flex; flex-direction:column; justify-content:flex-start; cursor:pointer; user-select:none; transition:all 0.2s ease; overflow:hidden; pointer-events:auto; font-size:10px; }
.calendar-grid.is-dragging .scheduled-item, .scheduled-item.is-dragging { pointer-events:none; }
.scheduled-item:hover { transform:scale(1.02); box-shadow:0 2px 6px rgba(0,0,0,0.12); }
.scheduled-item.is-selected { outline:2px solid rgba(255,255,255,0.95); box-shadow:0 0 0 3px rgba(37,99,235,0.35); transform:scale(1.04); position:absolute !important; }
.scheduled-item.is-resizing { transition:none!important; transform:none!important; }
.scheduled-item.is-resizing:hover { transform:none!important; }
.scheduled-content { width:100%; display:flex; justify-content:space-between; align-items:flex-start; }
.device-name { font-size:11px; font-weight:600; color:#fff; line-height:1.2; padding-right:20px; overflow:hidden; word-break:break-all; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.scheduled-tag { font-size:9px; color:rgba(255,255,255,0.9); font-weight:500; margin-top:2px; overflow:hidden; word-break:break-all; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.remove-btn { position:absolute; top:4px; right:4px; width:18px; height:18px; align-items:center; justify-content:center; background:rgba(0,0,0,0.18); border:none; color:rgba(255,255,255,0.9); cursor:pointer; padding:0; border-radius:4px; opacity:0; pointer-events:none; transition:opacity 0.15s, background 0.15s; display:flex; }
.scheduled-item:hover .remove-btn { opacity:1; pointer-events:auto; }
.remove-btn:hover { background:rgba(0,0,0,0.28); color:#fff; }
.resize-handle { position:absolute; left:0; right:0; bottom:0; height:10px; cursor:ns-resize; background:linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.18)); z-index: 10; }
.resize-handle:hover { background:linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.28)); }
.resize-handle-top { position:absolute; left:0; right:0; top:0; height:10px; cursor:ns-resize; background:linear-gradient(0deg, rgba(255,255,255,0), rgba(255,255,255,0.18)); z-index: 10; }
.resize-handle-top:hover { background:linear-gradient(0deg, rgba(255,255,255,0), rgba(255,255,255,0.28)); }
.control-center { padding:16px; background:var(--color-bg-secondary); display:flex; align-items:center; justify-content:space-between; gap:16px; position:relative; z-index:2; }
.control-center-left { display:flex; align-items:center; gap:12px; min-width:0; flex:1; font-size:14px; }
.selected-order { display:flex; align-items:center; gap:8px; color:var(--color-accent-blue); font-weight:600; }
.selected-divider, .selected-device { color:var(--color-text-secondary); }
.selected-process { color:var(--color-accent-purple); white-space:nowrap; background:rgba(168,85,247,0.1); padding:2px 8px; border-radius:6px; font-size:12px; }
.selected-placeholder { color:#94a3b8; font-style:italic; }
.primary-btn { display:flex; align-items:center; gap:8px; padding:12px 24px; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; transition:all 0.2s ease; background:var(--color-primary,#3b82f6); color:white; position:relative; z-index:3; }
.primary-btn:hover:not(:disabled) { opacity:0.9; transform:translateY(-1px); }
.primary-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
</style>
