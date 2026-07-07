<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { HaltHassOrder } from '../types'
import type { HaltHassScheduleContext } from '../composables/useHaltHassSchedule'

const props = defineProps<{ ctx: HaltHassScheduleContext }>()
const emit = defineEmits<{
  'start-scheduled-test': [order: HaltHassOrder]
}>()

const {
  searchKeyword,
  workOrdersLoading,
  schedulePersisting,
  refreshWorkOrders,
  calBase,
  selectedScheduledOrder,
  activeHostDeviceName,
  hostDeviceTabs,
  selectedScheduledOrderInfo,
  assignHostDeviceToCurrentScope,
  filteredOrders,
  currentWeekDays,
  weekLabel,
  timeSlots,
  slotHeightPx,
  scheduledLayoutItems,
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
  handleDragLeave,
  handleUnschedule,
  selectScheduledTask,
  scheduleOrder,
  startResize,
  startResizeTop,
  resizingEventId,
  isResizing,
} = props.ctx

const expandedOrderIds = ref<string[]>([])
const detailVisible = ref(false)
const detailOrder = ref<HaltHassOrder | null>(null)
const timeColWidth = 60
const cellPadding = 3
const gridScrollRef = ref<HTMLElement | null>(null)
const gridViewportWidth = ref(0)
const gridInnerRef = ref<HTMLElement | null>(null)
let ro: ResizeObserver | null = null

const gridContentWidth = computed(() => gridViewportWidth.value)

const selectedInfo = computed(() => selectedScheduledOrderInfo.value)
const canStartExperiment = computed(() => !!selectedInfo.value && !schedulePersisting.value)
const scheduledOrderIdSet = computed(() => new Set(scheduledLayoutItems.value.map((item) => item.orderId)))

const isExpanded = (orderId: string) => expandedOrderIds.value.includes(orderId)

function toggleExpanded(orderId: string) {
  const set = new Set(expandedOrderIds.value)
  if (set.has(orderId)) set.delete(orderId)
  else set.add(orderId)
  expandedOrderIds.value = Array.from(set)
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

function getOrderKey(order: HaltHassOrder) {
  return order.orderNo || String(order.id)
}

function getBoardCount(order: HaltHassOrder) {
  return order.boardCount || order.boardGroup?.boards?.length || 0
}

function getOrderStatusText(order: HaltHassOrder) {
  if (scheduledOrderIdSet.value.has(getOrderKey(order))) return '已排程'
  if (order.status === 2) return '测试中'
  if (order.status === 4) return '待重做'
  if (order.status === 7) return '暂存'
  return '待排程'
}

function getStatusClass(statusText: string) {
  if (statusText === '测试中') return 'status-running'
  if (statusText === '已排程') return 'status-scheduled'
  if (statusText === '暂存') return 'status-saved'
  if (statusText === '待重做') return 'status-redo'
  return 'status-pending'
}

function openDetail(order: HaltHassOrder) {
  detailOrder.value = order
  detailVisible.value = true
}

function closeDetail() {
  detailVisible.value = false
  detailOrder.value = null
}

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

function getScheduledStyle(item: any) {
  const totalWidth = gridInnerRef.value?.getBoundingClientRect().width || gridContentWidth.value || 0
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
    zIndex: selectedScheduledOrder.value === item.eventId ? 12 : 10,
  }
}

function getDropTarget(event: DragEvent) {
  if (!gridInnerRef.value) return null
  const rect = gridInnerRef.value.getBoundingClientRect()
  const totalWidth = rect.width || gridContentWidth.value
  const dayColW = totalWidth > timeColWidth ? (totalWidth - timeColWidth) / 7 : 0
  if (dayColW <= 0) return null

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const xInDays = x - timeColWidth
  if (xInDays < 0) return null

  const dayIndex = Math.min(6, Math.max(0, Math.floor(xInDays / dayColW)))
  const slotIndex = Math.min(timeSlots.value.length - 1, Math.max(0, Math.floor(y / slotHeightPx)))
  const day = currentWeekDays.value[dayIndex]
  const slot = timeSlots.value[slotIndex]
  if (!day || !slot) return null
  return { dateStr: day.dateStr, timeKey: slot.key, isPast: day.isPast }
}

function handleGridDragOver(event: DragEvent) {
  const target = getDropTarget(event)
  if (!target || target.isPast) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function handleGridDrop(event: DragEvent) {
  const target = getDropTarget(event)
  if (!target) return
  event.preventDefault()
  event.stopPropagation()
  const orderId = event.dataTransfer?.getData('text/plain')
  if (!orderId) return
  scheduleOrder(orderId, target.dateStr, target.timeKey, target.isPast)
}

function startSelectedOrder() {
  if (!selectedInfo.value) return
  emit('start-scheduled-test', selectedInfo.value)
}
</script>

<template>
  <div class="schedule-wrap">
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
        <input v-model="searchKeyword" type="text" placeholder="搜索工单号/工艺/电路板组" />
        <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''">
          <Icon icon="mdi:close" />
        </button>
      </div>

      <div v-if="hostDeviceTabs.length" class="host-filter-tabs">
        <button
          v-for="host in hostDeviceTabs"
          :key="host"
          class="host-filter-tab"
          :class="{ active: activeHostDeviceName === host }"
          :title="host"
          @click="assignHostDeviceToCurrentScope(host)"
        >
          {{ host }}
        </button>
      </div>

      <div class="table-content">
        <div v-if="filteredOrders.length === 0" class="empty-state">
          <p>无待排程工单</p>
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table compact-order-table">
            <colgroup>
              <col class="col-order" />
              <col class="col-process" />
              <col class="col-action" />
              <col class="col-status" />
            </colgroup>
            <thead>
              <tr>
                <th>工单号</th>
                <th>工艺</th>
                <th>操作</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="order in filteredOrders" :key="order.id">
                <tr
                  class="order-row"
                  :class="{ 'is-scheduled': scheduledOrderIdSet.has(getOrderKey(order)), 'is-expanded': isExpanded(getOrderKey(order)) }"
                  draggable="true"
                  @click="toggleExpanded(getOrderKey(order))"
                  @dragstart="handleDragStart($event, order)"
                  @dragend="handleDragEnd"
                >
                  <td class="cell-id" :title="order.orderNo">
                    <div class="cell-detail">
                      <span class="expand-icon" @click.stop="toggleExpanded(getOrderKey(order))">
                        <Icon :icon="isExpanded(getOrderKey(order)) ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
                      </span>
                      <span class="device-summary" :title="order.orderNo">{{ order.orderNo }}</span>
                    </div>
                  </td>
                  <td class="cell-process" :title="order.process?.name">{{ order.process?.name || '-' }}</td>
                  <td class="cell-action">
                    <button class="op-btn view" type="button" @click.stop="openDetail(order)">详情</button>
                  </td>
                  <td class="cell-status">
                    <span class="status-pill" :class="getStatusClass(getOrderStatusText(order))">
                      {{ getOrderStatusText(order) }}
                    </span>
                  </td>
                </tr>
                <tr v-if="isExpanded(getOrderKey(order))" :key="`${order.id}-expanded`">
                  <td class="expanded-cell" colspan="4">
                    <div class="board-panel">
                      <div class="board-panel-head">
                        <div>
                          <div class="board-title">电路板组明细</div>
                          <div class="board-subtitle">{{ order.boardGroup?.name || '-' }}</div>
                        </div>
                        <span class="board-count-pill">{{ getBoardCount(order) }} 块</span>
                      </div>
                      <div v-if="!order.boardGroup?.boards?.length" class="board-empty">暂无电路板型号</div>
                      <div v-else class="board-list">
                        <div v-for="board in order.boardGroup.boards" :key="board.id" class="board-item">
                          <div class="board-main">
                            <span class="board-name">{{ board.name }}</span>
                            <span class="board-code">{{ board.code || '-' }}</span>
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

      <div class="calendar-grid" :class="{ 'is-dragging': isDragging }">
        <div class="grid-scroll" ref="gridScrollRef">
          <div class="grid-header-row">
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
              :style="{ height: `${timeSlots.length * slotHeightPx}px` }"
              @dragover.capture="handleGridDragOver"
              @drop.capture="handleGridDrop"
            >
              <div class="events-overlay">
                <div
                  v-for="item in scheduledLayoutItems
                    .map((x) => ({ ...x, dayIndex: currentWeekDays.findIndex((d) => d.dateStr === x.dateStr) }))
                    .filter((x) => x.dayIndex >= 0)"
                  :key="item.eventId"
                  class="scheduled-item"
                  :class="{
                    'is-selected': selectedScheduledOrder === item.eventId,
                    'is-dragging': isDragging,
                    'is-resizing': isResizing && resizingEventId === item.eventId
                  }"
                  :style="getScheduledStyle(item)"
                  :title="`${item.orderId} · ${getOrderById(item.orderId)?.process?.name || ''}`"
                  @click="selectScheduledTask(item.eventId)"
                >
                  <div class="resize-handle-top" @mousedown.stop.prevent="startResizeTop(item.eventId, $event)"></div>
                  <div class="scheduled-content">
                    <span class="device-name">{{ item.orderId }}</span>
                    <button class="remove-btn" title="删除排程" @click.stop="handleUnschedule(item.cellKey, item.orderId, item.eventId)">
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">{{ getOrderById(item.orderId)?.process?.name || 'HALT-HASS' }}</div>
                  <div class="resize-handle" @mousedown.stop.prevent="startResize(item.eventId, $event)"></div>
                </div>
              </div>

              <div v-for="slot in timeSlots" :key="slot.key" class="grid-row">
                <div class="time-label">{{ slot.label }}</div>
                <div
                  v-for="day in currentWeekDays"
                  :key="getCellKey(day.dateStr, slot.key)"
                  class="grid-cell"
                  :class="{ 'is-weekend': day.isWeekend, 'is-past': day.isPast }"
                  @dragleave="handleDragLeave"
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
              <span class="selected-label">已选中工单: {{ selectedInfo.orderNo }}</span>
            </div>
            <span class="selected-divider">|</span>
            <span class="selected-device">{{ selectedInfo.boardGroup?.name || '-' }}</span>
            <span class="selected-process">{{ selectedInfo.process?.name || '-' }}</span>
          </template>
          <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
        </div>
        <button class="primary-btn" :disabled="!canStartExperiment" @click.stop.prevent="startSelectedOrder">
          <Icon icon="mdi:play" class="start-icon" />
          开始实验
        </button>
      </div>
    </div>
  </div>

  <div v-if="detailVisible" class="detail-modal-mask" @click.self="closeDetail">
    <div class="detail-modal">
      <div class="detail-modal-header">
        <div>
          <div class="detail-modal-title">工单详情</div>
          <div class="detail-modal-subtitle">{{ detailOrder?.orderNo || '-' }}</div>
        </div>
        <button class="detail-close" type="button" @click="closeDetail">
          <Icon icon="mdi:close" />
        </button>
      </div>
      <div v-if="detailOrder" class="detail-body">
        <section class="detail-card">
          <h3>工单信息</h3>
          <div class="detail-grid">
            <div class="detail-field"><span>工单号</span><strong>{{ displayValue(detailOrder.orderNo) }}</strong></div>
            <div class="detail-field"><span>电路板组</span><strong>{{ displayValue(detailOrder.boardGroup?.name) }}</strong></div>
            <div class="detail-field"><span>工艺</span><strong>{{ displayValue(detailOrder.process?.name) }}</strong></div>
            <div class="detail-field"><span>工艺版本</span><strong>{{ displayValue(detailOrder.process?.version) }}</strong></div>
            <div class="detail-field"><span>电路板数量</span><strong>{{ getBoardCount(detailOrder) }} 块</strong></div>
            <div class="detail-field"><span>当前状态</span><strong>{{ getOrderStatusText(detailOrder) }}</strong></div>
          </div>
        </section>
        <section class="detail-card">
          <h3>备注</h3>
          <div class="detail-note">{{ displayValue(detailOrder.remark) }}</div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.schedule-wrap { display:flex; flex:1; gap:16px; overflow:hidden; min-width:0; }
.sidebar { width:440px; flex:0 0 440px; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; }
.panel-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 18px; border-bottom:1px solid var(--color-border); font-size:15px; font-weight:600; color:var(--color-text-primary); background:var(--color-bg-secondary); flex-shrink:0; }
.header-title { display:flex; align-items:center; gap:8px; min-width:0; }
.header-icon { font-size:16px; color:var(--color-text-secondary); }
.header-actions { display:flex; align-items:center; gap:10px; }
.icon-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-secondary); cursor:pointer; }
.icon-btn:disabled { opacity:.5; cursor:not-allowed; }
.icon-btn:hover:not(:disabled) { background:var(--color-bg-hover); color:var(--color-text-primary); }
.count-badge { padding:4px 10px; border-radius:999px; font-size:12px; font-weight:500; background:rgba(59,130,246,.15); color:rgb(96,165,250); }
.search-box { display:flex; align-items:center; gap:8px; padding:12px 18px; border-bottom:1px solid var(--color-border); background:var(--color-bg-secondary); }
.search-icon { font-size:18px; color:#94a3b8; }
.search-box input { flex:1; min-width:0; border:none; background:transparent; color:var(--color-text-primary); outline:none; font-size:14px; }
.search-box input::placeholder { color:#94a3b8; }
.clear-btn { display:flex; align-items:center; justify-content:center; width:22px; height:22px; border:none; border-radius:999px; background:var(--color-bg-tertiary); color:var(--color-text-secondary); cursor:pointer; }
.table-content { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; background:var(--color-bg-secondary); }
.table-wrapper { flex:1; overflow:auto; }
.empty-state { padding:40px 20px; text-align:center; color:var(--color-text-secondary); }
.data-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:13px; }
.data-table th { padding:12px 8px; text-align:left; font-weight:600; color:var(--color-text-secondary); background:var(--color-bg-secondary); border-bottom:1px solid var(--color-border); white-space:nowrap; }
.data-table td { padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.04); vertical-align:middle; }
.col-order { width:35%; }
.col-process { width:27%; }
.col-action { width:17%; }
.col-status { width:21%; }
.order-row { cursor:grab; transition:background-color .15s; }
.order-row:hover,
.order-row.is-expanded,
.order-row.is-scheduled { background:var(--color-bg-hover); }
.cell-id { font-weight:600; color:var(--color-accent-blue); }
.cell-process { color:var(--color-text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cell-detail { display:flex; align-items:center; gap:4px; min-width:0; }
.expand-icon { width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; color:var(--color-text-secondary); cursor:pointer; }
.device-summary { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cell-action,.cell-status { text-align:center; }
.op-btn { min-width:48px; height:26px; padding:0 8px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; transition:all .18s ease; white-space:nowrap; }
.op-btn.view { color:#006be6; border:1px solid rgba(37,99,235,.25); background:rgba(59,130,246,.1); }
.op-btn.view:hover { background:rgba(59,130,246,.18); }
.status-pill { display:inline-flex; align-items:center; justify-content:center; max-width:100%; min-width:54px; height:26px; padding:0 8px; border-radius:999px; font-size:11px; font-weight:700; white-space:nowrap; }
.status-pending { color:#d97706; border:1px solid rgba(245,158,11,.35); background:rgba(245,158,11,.12); }
.status-scheduled { color:#2563eb; border:1px solid rgba(59,130,246,.35); background:rgba(59,130,246,.12); }
.status-running { color:#16a34a; border:1px solid rgba(34,197,94,.35); background:rgba(34,197,94,.12); }
.status-saved { color:#7c3aed; border:1px solid rgba(124,58,237,.32); background:rgba(124,58,237,.12); }
.status-redo { color:#dc2626; border:1px solid rgba(239,68,68,.25); background:rgba(239,68,68,.1); }
.expanded-cell { padding:0 8px 10px!important; background:rgba(255,255,255,.015); }
.board-panel { border-top:1px solid var(--color-border); padding:10px 0 0; }
.board-panel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px; }
.board-title { font-size:12px; font-weight:700; color:var(--color-text-secondary); }
.board-subtitle { margin-top:2px; font-size:11px; color:var(--color-text-tertiary); }
.board-count-pill { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:999px; background:var(--color-bg-tertiary); color:var(--color-text-secondary); font-size:11px; white-space:nowrap; }
.board-list { display:flex; flex-direction:column; gap:6px; }
.board-item { padding:8px; border-radius:8px; background:var(--color-bg-primary); }
.board-main { display:flex; flex-direction:column; gap:2px; min-width:0; }
.board-name { color:var(--color-text-primary); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.board-code,.board-empty { color:var(--color-text-secondary); font-size:11px; }
.main-content { flex:1 1 0; min-width:0; display:flex; flex-direction:column; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; overflow:hidden; }
.week-cal-toolbar { display:flex; align-items:center; gap:8px; flex:1; min-width:0; }
.week-cal-label { font-size:13px; font-weight:600; flex:1; min-width:100px; text-align:center; white-space:nowrap; color:var(--color-text-primary); }
.week-cal-nav { height:30px; padding:0 10px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-primary); cursor:pointer; font-size:12px; white-space:nowrap; transition:all .18s ease; }
.week-cal-nav:hover { background:var(--color-bg-hover); }
.week-cal-date-input { height:30px; width:130px; padding:0 8px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-primary); font-size:12px; }
.legend { display:flex; gap:16px; margin-left:auto; }
.legend-item { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--color-text-secondary); white-space:nowrap; }
.dot { width:8px; height:8px; border-radius:50%; }
.dot.pending { background:var(--color-border); }
.dot.occupied { background:var(--color-accent-blue); }
.calendar-grid { flex:1; min-height:0; background:var(--color-bg-primary); overflow:hidden; border-top:1px solid var(--color-border); border-bottom:1px solid var(--color-border); }
.grid-scroll { width:100%; height:100%; overflow-x:hidden; overflow-y:auto; position:relative; }
.grid-scroll::-webkit-scrollbar { width:6px; height:0; }
.grid-scroll::-webkit-scrollbar-thumb { background:var(--color-scrollbar); border-radius:3px; }
.grid-header-row { display:grid; grid-template-columns:60px repeat(7, 1fr); position:sticky; top:0; z-index:20; width:100%; background:var(--color-bg-tertiary); border-bottom:1px solid var(--color-border); }
.time-column-header,.day-header { height:46px; display:flex; align-items:center; justify-content:center; border-right:1px solid var(--color-border); color:var(--color-text-secondary); font-size:12px; }
.day-header { flex-direction:column; gap:2px; }
.day-header.is-today { color:var(--color-accent-blue); background:rgba(59,130,246,.08); }
.day-num { font-size:16px; font-weight:700; color:var(--color-accent-blue); }
.day-num.is-weekend { color:#ef4444; }
.grid-body { position:relative; overflow:hidden; }
.grid-inner { position:relative; width:100%; min-width:0; }
.grid-row { display:grid; grid-template-columns:60px repeat(7, 1fr); height:44px; }
.time-label { display:flex; align-items:flex-start; justify-content:center; padding-top:4px; border-right:1px solid var(--color-border); border-bottom:1px solid var(--color-border); color:var(--color-text-secondary); font-size:11px; background:var(--color-bg-secondary); }
.grid-cell { position:relative; border-right:1px solid var(--color-border); border-bottom:1px solid var(--color-border); background:var(--color-bg-primary); }
.grid-cell.is-weekend { background:rgba(0,0,0,.012); }
.grid-cell.is-past { background:repeating-linear-gradient(45deg, var(--color-bg-tertiary), var(--color-bg-tertiary) 10px, var(--color-bg-secondary) 10px, var(--color-bg-secondary) 20px); opacity:.7; cursor:not-allowed; }
.grid-cell.drag-over { background:rgba(59,130,246,.14); }
.empty-slot-hint { position:absolute; inset:3px; border-radius:6px; pointer-events:none; }
.grid-cell:not(.is-past):hover .empty-slot-hint { border:1px dashed rgba(59,130,246,.3); background:rgba(59,130,246,.04); }
.events-overlay { position:absolute; inset:0; pointer-events:none; z-index:10; }
.scheduled-item { position:absolute; display:flex; flex-direction:column; justify-content:flex-start; gap:2px; padding:4px 6px; border-radius:4px; color:#fff; background:linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-cyan, #06b6d4)); cursor:pointer; pointer-events:auto; user-select:none; overflow:hidden; transition:all .2s ease; font-size:10px; }
.calendar-grid.is-dragging .scheduled-item { pointer-events:none; }
.scheduled-item:hover { transform:scale(1.02); box-shadow:0 2px 6px rgba(0,0,0,.12); }
.scheduled-item.is-selected { outline:2px solid rgba(255,255,255,.95); box-shadow:0 0 0 3px rgba(37,99,235,.35); transform:scale(1.04); }
.scheduled-item.is-resizing { transition:none!important; transform:none!important; }
.scheduled-item.is-resizing:hover { transform:none!important; }
.scheduled-content { display:flex; align-items:flex-start; justify-content:space-between; gap:6px; min-width:0; }
.device-name { min-width:0; overflow:hidden; word-break:break-all; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; font-size:11px; font-weight:700; color:#fff; line-height:1.2; padding-right:20px; }
.scheduled-tag { overflow:hidden; word-break:break-all; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; color:rgba(255,255,255,.9); font-size:9px; font-weight:500; margin-top:2px; }
.remove-btn { width:18px; height:18px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; border:none; border-radius:4px; background:transparent; color:var(--color-text-tertiary); cursor:pointer; opacity:.6; transition:all .2s; }
.scheduled-item:hover .remove-btn { opacity:1; pointer-events:auto; }
.remove-btn:hover { color:#fff; background:rgba(255,255,255,.2); }
.host-filter-tabs { display:flex; flex-wrap:wrap; gap:8px; padding:8px 10px 10px; border-bottom:1px solid var(--color-border); }
.host-filter-tab { height:30px; max-width:136px; padding:0 12px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-secondary); font-size:12px; font-weight:700; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.host-filter-tab.active { border-color:var(--color-accent-blue); background:rgba(59,130,246,.12); color:var(--color-accent-blue); }
.resize-handle,.resize-handle-top { position:absolute; left:0; right:0; height:10px; cursor:ns-resize; z-index:2; }
.resize-handle { bottom:0; background:linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.18)); }
.resize-handle-top { top:0; background:linear-gradient(0deg, rgba(255,255,255,0), rgba(255,255,255,.18)); }
.control-center { padding:16px; display:flex; align-items:center; justify-content:space-between; gap:16px; background:var(--color-bg-secondary); }
.control-center-left { display:flex; align-items:center; gap:10px; min-width:0; flex:1; font-size:14px; }
.selected-order { display:flex; align-items:center; gap:8px; min-width:0; color:var(--color-accent-blue); font-weight:700; }
.selected-label,.selected-device,.selected-process { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.selected-divider,.selected-device { color:var(--color-text-secondary); }
.selected-process { color:#f97316; background:rgba(249,115,22,.1); padding:2px 8px; border-radius:6px; font-size:12px; }
.selected-placeholder { color:#94a3b8; font-style:italic; }
.primary-btn { height:38px; display:flex; align-items:center; gap:8px; padding:0 22px; border:none; border-radius:10px; background:var(--color-primary,#3b82f6); color:#fff; font-size:14px; font-weight:700; cursor:pointer; transition:all .18s ease; }
.primary-btn:hover:not(:disabled) { opacity:.9; transform:translateY(-1px); }
.primary-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.detail-modal-mask { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(15,23,42,.55); backdrop-filter:blur(4px); }
.detail-modal { width:min(720px, 94vw); max-height:86vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border); border-radius:16px; background:var(--color-bg-secondary); box-shadow:0 24px 70px rgba(0,0,0,.35); }
.detail-modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:18px 20px; border-bottom:1px solid var(--color-border); }
.detail-modal-title { font-size:18px; font-weight:700; color:var(--color-text-primary); }
.detail-modal-subtitle { margin-top:6px; color:var(--color-text-secondary); font-size:13px; }
.detail-close { width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-secondary); cursor:pointer; }
.detail-body { overflow:auto; padding:18px 20px; display:flex; flex-direction:column; gap:14px; }
.detail-card { border:1px solid var(--color-border); border-radius:14px; background:var(--color-bg-primary); overflow:hidden; }
.detail-card h3 { margin:0; padding:14px 16px; border-bottom:1px solid var(--color-border); color:var(--color-text-primary); font-size:15px; }
.detail-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; padding:16px; }
.detail-field { min-width:0; display:flex; flex-direction:column; gap:5px; }
.detail-field span { color:var(--color-text-secondary); font-size:12px; }
.detail-field strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--color-text-primary); }
.detail-note { padding:16px; color:var(--color-text-secondary); line-height:1.6; }
@media (max-width: 1100px) {
  .schedule-wrap { flex-direction:column; }
  .sidebar { width:100%; flex-basis:360px; }
}
@media (max-width: 720px) {
  .panel-header,.control-center { align-items:flex-start; flex-direction:column; }
  .week-cal-toolbar { flex-wrap:wrap; }
  .legend { margin-left:0; }
  .detail-grid { grid-template-columns:1fr; }
}
</style>
