<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { HighTempBoxContext, WorkOrder } from '../composables/useHighTempBox'

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
  isDragging,
  fmtDate,
  prevWeek,
  nextWeek,
  gotoDate,
  loadPresetSchedule,
  getCellKey,
  getOrderById,
  getActiveInstruments,
  isInstrumentRunning,
  handleDragStart,
  handleDragEnd,
  handleDragLeave,
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
const expandedOrderIds = ref<string[]>([])
const detailVisible = ref(false)
const detailOrder = ref<WorkOrder | null>(null)
const instrumentPickerVisible = ref(false)
const pickerInstrumentIds = ref<string[]>([])

const timeColWidth = 60
const cellPadding = 3
const gridScrollRef = ref<HTMLElement | null>(null)
const gridViewportWidth = ref(0)
const gridInnerRef = ref<HTMLElement | null>(null)
let ro: ResizeObserver | null = null

const gridInnerWidth = computed(() => {
  return Math.max(0, gridViewportWidth.value)
})
const scheduledOrderIdSet = computed(() => new Set(scheduledLayoutItems.value.map((item) => item.orderId)))
const pickerRows = computed(() => selectedInfo.value ? getActiveInstruments(selectedInfo.value) : [])

const isExpanded = (orderId: string) => expandedOrderIds.value.includes(orderId)

function toggleExpanded(orderId: string) {
  const set = new Set(expandedOrderIds.value)
  if (set.has(orderId)) set.delete(orderId)
  else set.add(orderId)
  expandedOrderIds.value = Array.from(set)
}

const displayValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

const getOrderDeviceSummary = (order: WorkOrder) => order.deviceName || order.testPlatform || '-'
const getInstrumentCount = (order: WorkOrder) => getActiveInstruments(order).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)

const getOrderStatusText = (order: WorkOrder) => {
  if (getActiveInstruments(order).some((instrument) => isInstrumentRunning(instrument.id))) return '测试中'
  if (scheduledOrderIdSet.value.has(order.id)) return '已排程'
  return '待排程'
}

const getInstrumentStatusText = (order: WorkOrder, instrumentId: string) => {
  const instrument = order.instruments.find((item) => item.id === instrumentId)
  if (instrument?.completed || instrument?.status === 2) return '已完成'
  if (instrument?.status === 1 || isInstrumentRunning(instrumentId)) return '测试中'
  if (scheduledOrderIdSet.value.has(order.id)) return '已排程'
  return '待排程'
}

const getStatusClass = (statusText: string) => {
  if (statusText === '测试中') return 'status-running'
  if (statusText === '已排程') return 'status-scheduled'
  if (statusText === '已完成') return 'status-done'
  return 'status-pending'
}

function openDetail(order: WorkOrder) {
  detailOrder.value = order
  detailVisible.value = true
}

function closeDetail() {
  detailVisible.value = false
  detailOrder.value = null
}

function togglePickerInstrument(instrumentId: string, checked: boolean) {
  const set = new Set(pickerInstrumentIds.value)
  if (checked) set.add(instrumentId)
  else set.delete(instrumentId)
  pickerInstrumentIds.value = Array.from(set)
}

function selectAllPickerInstruments() {
  pickerInstrumentIds.value = pickerRows.value.map((instrument) => instrument.id)
}

function clearPickerInstruments() {
  pickerInstrumentIds.value = []
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
    zIndex: selectedScheduledOrder.value === item.eventId ? 12 : 10,
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
  const slotIndex = Math.min(timeSlots.value.length - 1, Math.max(0, Math.floor(y / slotHeightPx)))
  const day = currentWeekDays.value[dayIndex]
  const slot = timeSlots.value[slotIndex]
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
  const orderId = e.dataTransfer?.getData('text/plain')
  if (!orderId) return
  scheduleOrder(orderId, target.dateStr, target.timeKey, target.isPast)
}

async function onStartExperiment() {
  if (!selectedInfo.value) return
  const rows = pickerRows.value
  if (!rows.length) {
    alert('当前工单没有待测试仪器')
    return
  }
  pickerInstrumentIds.value = rows.map((instrument) => instrument.id)
  instrumentPickerVisible.value = true
}

async function confirmInstrumentSelection() {
  if (!selectedScheduledOrder.value) return
  if (!pickerInstrumentIds.value.length) {
    alert('请先选择本次实际开始测试的仪器')
    return
  }
  await startExperiment(selectedScheduledOrder.value, pickerInstrumentIds.value)
  instrumentPickerVisible.value = false
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
          <table class="data-table compact-order-table">
            <colgroup>
              <col class="col-applicant" />
              <col class="col-task" />
              <col class="col-action" />
              <col class="col-status" />
            </colgroup>
            <thead>
              <tr>
                <th>申请人</th>
                <th>任务编号</th>
                <th>操作</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="order in filteredOrders" :key="order.id">
                <tr
                  class="order-row"
                  :class="{ 'is-scheduled': scheduledOrderIdSet.has(order.id), 'is-expanded': isExpanded(order.id) }"
                  draggable="true"
                  @click="toggleExpanded(order.id)"
                  @dragstart="handleDragStart($event, order)"
                  @dragend="handleDragEnd"
                >
                  <td class="cell-applicant" :title="order.applicant">{{ order.applicant }}</td>
                  <td class="cell-id" :title="order.taskNumber">
                    <div class="cell-detail cell-task-detail">
                      <span class="expand-icon" @click.stop="toggleExpanded(order.id)">
                        <Icon :icon="isExpanded(order.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
                      </span>
                      <span class="device-summary" :title="order.taskNumber">{{ order.taskNumber }}</span>
                    </div>
                  </td>
                  <td class="cell-action">
                    <button class="op-btn view" type="button" @click.stop="openDetail(order)">详情</button>
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
                          <div class="instrument-title">设备/仪器明细</div>
                          <div class="instrument-subtitle">该工单当前未完成的测试仪器</div>
                        </div>
                        <span class="instrument-count-pill">{{ getInstrumentCount(order) }} 台</span>
                      </div>
                      <div class="instrument-list">
                        <div v-for="instrument in getActiveInstruments(order)" :key="instrument.id" class="instrument-item">
                          <div class="instrument-main">
                            <span class="instrument-name">{{ instrument.name }}</span>
                            <span class="instrument-sn">{{ instrument.sn || '-' }}</span>
                          </div>
                          <span class="instrument-quantity">{{ instrument.quantity || 1 }} 台</span>
                          <span class="status-pill" :class="getStatusClass(getInstrumentStatusText(order, instrument.id))">
                            {{ getInstrumentStatusText(order, instrument.id) }}
                          </span>
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
                  :key="it.eventId"
                  class="scheduled-item"
                  :class="{
                    'is-selected': selectedScheduledOrder === it.eventId,
                    'is-dragging': isDragging,
                    'is-resizing': isResizing && resizingOrderId === it.eventId
                  }"
                  :style="getScheduledStyle(it)"
                  @click="selectScheduledTask(it.eventId)"
                  :title="`${it.orderId} · ${getOrderById(it.orderId)?.deviceName || ''}`"
                >
                  <div class="resize-handle-top" @mousedown.stop.prevent="startResizeTop(it.eventId, $event)"></div>
                  <div class="scheduled-content">
                    <span class="device-name">{{ it.orderId }}</span>
                    <button class="remove-btn" title="删除排程" @click.stop="handleUnschedule(it.cellKey, it.orderId, it.eventId)">
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">{{ getOrderById(it.orderId)?.deviceName }}</div>
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

  <div v-if="instrumentPickerVisible" class="product-picker-mask">
    <div class="product-picker-dialog">
      <div class="product-picker-header">
        <div>
          <h3>选择测试仪器</h3>
          <p>已排程工单确认开始实验后，在这里选择本次实际开始测试的仪器。</p>
        </div>
        <button class="product-picker-close" type="button" @click="instrumentPickerVisible = false">
          <Icon icon="mdi:close" />
        </button>
      </div>
      <div class="product-picker-actions">
        <button class="week-cal-nav" type="button" @click="selectAllPickerInstruments">全选</button>
        <button class="week-cal-nav" type="button" @click="clearPickerInstruments">清空</button>
        <span>已选择 {{ pickerInstrumentIds.length }} / {{ pickerRows.length }} 台仪器</span>
      </div>
      <div class="product-picker-list">
        <label v-for="instrument in pickerRows" :key="instrument.id" class="product-picker-row">
          <input
            type="checkbox"
            :checked="pickerInstrumentIds.includes(instrument.id)"
            @change="togglePickerInstrument(instrument.id, ($event.target as HTMLInputElement).checked)"
          />
          <span class="product-main">{{ instrument.name }}</span>
          <span class="product-sub">{{ instrument.sn || '-' }}</span>
          <span class="product-order">{{ selectedInfo?.taskNumber }} · {{ selectedInfo?.applicant }}</span>
        </label>
      </div>
      <div class="product-picker-footer">
        <button class="week-cal-nav" type="button" @click="instrumentPickerVisible = false">取消</button>
        <button class="primary-btn" type="button" :disabled="pickerInstrumentIds.length === 0" @click="confirmInstrumentSelection">
          确认开始实验
        </button>
      </div>
    </div>
  </div>

  <div v-if="detailVisible" class="detail-modal-mask" @click.self="closeDetail">
    <div class="detail-modal">
      <div class="detail-modal-header">
        <div>
          <div class="detail-modal-title">工单详情</div>
          <div class="detail-modal-subtitle">{{ detailOrder?.taskNumber || '-' }}</div>
        </div>
        <button class="detail-close" type="button" @click="closeDetail">
          <Icon icon="mdi:close" />
        </button>
      </div>
      <div v-if="detailOrder" class="detail-body">
        <section class="detail-card">
          <h3>工单信息</h3>
          <div class="detail-grid">
            <div class="detail-field"><span>申请人</span><strong>{{ displayValue(detailOrder.applicant) }}</strong></div>
            <div class="detail-field"><span>任务编号</span><strong>{{ displayValue(detailOrder.taskNumber) }}</strong></div>
            <div class="detail-field"><span>使用设备</span><strong>{{ displayValue(getOrderDeviceSummary(detailOrder)) }}</strong></div>
            <div class="detail-field"><span>目标温度</span><strong>{{ displayValue(detailOrder.targetTemp) }} °C</strong></div>
            <div class="detail-field"><span>测试时长</span><strong>{{ displayValue(detailOrder.duration) }} 分钟</strong></div>
            <div class="detail-field"><span>当前状态</span><strong>{{ getOrderStatusText(detailOrder) }}</strong></div>
          </div>
        </section>
        <section class="detail-card">
          <h3>设备/仪器明细</h3>
          <div class="detail-instrument-list">
            <div v-for="instrument in detailOrder.instruments" :key="instrument.id" class="detail-instrument-item">
              <div>
                <strong>{{ displayValue(instrument.name) }}</strong>
                <span>{{ displayValue(instrument.sn) }}</span>
              </div>
              <span class="instrument-quantity">{{ instrument.quantity || 1 }} 台</span>
              <span class="status-pill" :class="getStatusClass(getInstrumentStatusText(detailOrder, instrument.id))">
                {{ instrument.completed ? '已完成' : getInstrumentStatusText(detailOrder, instrument.id) }}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 直接从 index.vue 拆出的 dashboard 样式（不改任何数值），保证视觉一致 */
.layout-container { display:flex; flex:1; gap:16px; overflow:hidden; min-width:0; }
.sidebar { width:480px; flex:0 0 480px; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; }
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
.table-wrapper { flex:1; overflow-y:auto; overflow-x:hidden; }
.empty-state { text-align:center; padding:40px 20px; color:#94a3b8; font-size:13px; }
.data-table { width:100%; border-collapse:collapse; font-size:13px; }
.compact-order-table { table-layout:fixed; }
.compact-order-table .col-applicant { width:18%; }
.compact-order-table .col-task { width:42%; }
.compact-order-table .col-action { width:18%; }
.compact-order-table .col-status { width:22%; }
.data-table thead { position:sticky; top:0; z-index:1; }
.data-table th { padding:12px 16px; text-align:left; font-weight:600; color:var(--color-text-secondary); background:var(--color-bg-secondary); border-bottom:1px solid var(--color-border); white-space:nowrap; }
.data-table tbody tr { transition:background-color 0.15s; }
.data-table tbody tr:hover { background:rgba(255,255,255,0.02); }
.data-table td { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.04); vertical-align:middle; }
.compact-order-table th, .compact-order-table td { padding:10px 8px; min-width:0; }
.order-row { cursor:grab; }
.order-row:active { cursor:grabbing; }
.order-row.is-scheduled { background:rgba(59,130,246,0.04); }
.order-row.is-expanded { background:rgba(255,255,255,0.03); }
.cell-id { font-weight:600; color:var(--color-accent-blue); }
.cell-device, .cell-applicant, .cell-id { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cell-applicant, .cell-param { color:var(--color-text-secondary); }
.cell-detail { display:flex; align-items:center; gap:4px; min-width:0; }
.cell-task-detail { align-items:flex-start; }
.expand-icon { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 auto; color:var(--color-text-secondary); cursor:pointer; }
.device-summary { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cell-task-detail .device-summary { overflow:visible; text-overflow:clip; white-space:normal; word-break:break-word; overflow-wrap:anywhere; line-height:1.35; }
.op-btn { border:1px solid var(--color-border); border-radius:6px; background:var(--color-bg-primary); color:var(--color-text-primary); cursor:pointer; font-size:12px; padding:4px 8px; white-space:nowrap; }
.op-btn:hover { background:var(--color-bg-hover); }
.status-pill { display:inline-flex; align-items:center; justify-content:center; max-width:100%; padding:3px 7px; border-radius:999px; font-size:11px; font-weight:600; white-space:nowrap; }
.status-pending { color:#d97706; border:1px solid rgba(245,158,11,.35); background:rgba(245,158,11,.12); }
.status-scheduled { color:#2563eb; border:1px solid rgba(59,130,246,.35); background:rgba(59,130,246,.12); }
.status-running { color:#16a34a; border:1px solid rgba(34,197,94,.35); background:rgba(34,197,94,.12); }
.status-done { color:#64748b; border:1px solid rgba(100,116,139,.35); background:rgba(100,116,139,.12); }
.expanded-cell { padding:0 8px 10px !important; background:rgba(255,255,255,0.015); }
.instrument-panel { border-top:1px solid var(--color-border); padding:10px 0 0; }
.instrument-panel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px; }
.instrument-title { font-size:12px; font-weight:600; color:var(--color-text-secondary); }
.instrument-subtitle { margin-top:2px; font-size:11px; color:var(--color-text-tertiary); }
.instrument-count-pill { display:inline-flex; align-items:center; justify-content:center; height:22px; padding:0 8px; border-radius:999px; background:var(--color-bg-tertiary); color:var(--color-text-secondary); font-size:11px; white-space:nowrap; }
.instrument-list { display:flex; flex-direction:column; gap:6px; }
.instrument-item { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:8px; padding:7px 8px; border-radius:8px; background:var(--color-bg-primary); }
.instrument-main { min-width:0; display:flex; flex-direction:column; gap:2px; }
.instrument-name, .instrument-sn { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.instrument-name { color:var(--color-text-primary); font-weight:500; }
.instrument-sn, .instrument-quantity { color:var(--color-text-secondary); font-size:11px; white-space:nowrap; }
.priority-tag { display:inline-flex; align-items:center; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; white-space:nowrap; }
.priority-tag.high { background:rgba(239,68,68,0.12); color:#ef4444; }
.priority-tag.normal { background:rgba(59,130,246,0.12); color:#3b82f6; }
.priority-tag.low { background:rgba(34,197,94,0.12); color:#22c55e; }
.main-content { flex:1 1 0; min-width:0; display:flex; flex-direction:column; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; overflow:hidden; }
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
.grid-scroll { flex:1; overflow-y:auto; overflow-x:hidden; min-width:0; }
.grid-header-row { display:grid; grid-template-columns:60px repeat(7,1fr); border-bottom:1px solid var(--color-border); background:var(--color-bg-tertiary); position:sticky; top:0; z-index:20; }
.time-column-header { padding:12px; text-align:center; border-right:1px solid var(--color-border); font-weight:600; font-size:12px; color:var(--color-text-secondary); }
.day-header { padding:8px; text-align:center; border-right:1px solid var(--color-border); }
.day-header.is-today { background:rgba(88,166,255,0.1); }
.day-num { font-size:16px; font-weight:700; color:var(--color-accent-blue); }
.day-num.is-weekend { color:var(--color-error); }
.day-name { font-size:11px; color:var(--color-text-secondary); margin-top:2px; }
.grid-body { position:relative; overflow:hidden; }
.grid-inner { position:relative; min-width:0; }
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
.product-picker-mask, .detail-modal-mask { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(15,23,42,.55); backdrop-filter:blur(4px); }
.product-picker-dialog, .detail-modal { width:min(680px, 94vw); max-height:86vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border); border-radius:16px; background:var(--color-bg-secondary); box-shadow:0 24px 70px rgba(0,0,0,.35); }
.product-picker-header, .detail-modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:18px 20px; border-bottom:1px solid var(--color-border); }
.product-picker-header h3 { margin:0; font-size:18px; color:var(--color-text-primary); }
.product-picker-header p, .detail-modal-subtitle { margin:6px 0 0; color:var(--color-text-secondary); font-size:13px; }
.product-picker-close, .detail-close { width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-secondary); cursor:pointer; }
.product-picker-actions { display:flex; align-items:center; gap:10px; padding:12px 20px; border-bottom:1px solid var(--color-border); color:var(--color-text-secondary); font-size:13px; }
.product-picker-list { flex:1; overflow:auto; padding:10px 20px; display:flex; flex-direction:column; gap:8px; }
.product-picker-row { display:grid; grid-template-columns:auto minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr); gap:10px; align-items:center; padding:10px 12px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-bg-primary); cursor:pointer; }
.product-main { color:var(--color-text-primary); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.product-sub, .product-order { color:var(--color-text-secondary); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.product-picker-footer { display:flex; justify-content:flex-end; gap:10px; padding:14px 20px; border-top:1px solid var(--color-border); }
.detail-modal-title { font-size:18px; font-weight:700; color:var(--color-text-primary); }
.detail-body { overflow:auto; padding:18px 20px; display:flex; flex-direction:column; gap:14px; }
.detail-card { border:1px solid var(--color-border); border-radius:14px; background:var(--color-bg-primary); overflow:hidden; }
.detail-card h3 { margin:0; padding:14px 16px; border-bottom:1px solid var(--color-border); color:var(--color-text-primary); font-size:15px; }
.detail-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; padding:16px; }
.detail-field { min-width:0; display:flex; flex-direction:column; gap:5px; }
.detail-field span { color:var(--color-text-secondary); font-size:12px; }
.detail-field strong { color:var(--color-text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.detail-instrument-list { display:flex; flex-direction:column; gap:10px; padding:16px; }
.detail-instrument-item { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:12px; align-items:center; padding:12px 14px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-bg-secondary); }
.detail-instrument-item div { min-width:0; display:flex; flex-direction:column; gap:4px; }
.detail-instrument-item strong, .detail-instrument-item span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
@media (max-width: 900px) {
  .layout-container { flex-direction:column; }
  .sidebar { width:100%; min-height:320px; }
  .product-picker-row { grid-template-columns:auto minmax(0,1fr); }
  .product-sub, .product-order { grid-column:2; }
  .detail-grid { grid-template-columns:1fr; }
}
</style>
