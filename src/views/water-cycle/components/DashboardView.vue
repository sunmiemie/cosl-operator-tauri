<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { updateWaterCycleOrder, type WaterCycleOrder } from '@/services/water-cycle-api'
import { pushEngineerAssistantSchedules, resolveEngineerAssistantTestTypeId } from '@/services'
import { useAuth } from '@/composables/useAuth'

// 跳出一层目录 (../) 找到逻辑层
import { useSchedule } from '../composables/useSchedule'
import { currentView, selectedOrder, selectedWaterCycleInstrumentIds } from '../composables/useTestStore'

// 引入同级组件
import StartupCheckModal from './StartupCheckModal.vue'

const { initAuth, getAuthHeaders } = useAuth()

// 引入抽象出的排程逻辑
const {
  searchKeyword, scheduledLayoutItems, maxLaneCount, slotHeightPx, isDragging, isResizing, resizingOrderId, getEvent, startResize, startResizeTop, selectedScheduledOrderIds, currentWeekDays, weekLabel, timeSlots, calBase,
  unscheduledOrders, getOrderById, selectedScheduledOrders, fmtDate, prevWeek, nextWeek, getCellKey, getMonday,
  handleDragStart, handleDragEnd, handleDragOver, handleDragEnter, handleDragLeave, handleDrop, handleUnschedule, selectScheduledOrder, scheduleOrder,
  workOrdersLoading, refreshWorkOrders, getScheduleText, getScheduleChangePayload,
  getActiveInstruments, isInstrumentRunning, markInstrumentsRunning
} = useSchedule()

const timeColWidth = 60
const cellPadding = 3
const gridScrollRef = ref<HTMLElement | null>(null)
const gridViewportWidth = ref(0)
let ro: ResizeObserver | null = null
const gridInnerRef = ref<HTMLElement | null>(null)
const expandedOrderIds = ref<string[]>([])
const detailVisible = ref(false)
const detailOrder = ref<WaterCycleOrder | null>(null)
const instrumentPickerVisible = ref(false)
const pickerInstrumentIds = ref<string[]>([])
const handleWindowFocus = () => {
  if (workOrdersLoading.value) return
  refreshWorkOrders()
}
const handleVisibilityChange = () => {
  if (document.visibilityState !== 'visible') return
  if (workOrdersLoading.value) return
  refreshWorkOrders()
}

const maxLanesBeforeExpand = 2
const widthFactor = computed(() => Math.max(1, Math.ceil((maxLaneCount.value || 1) / maxLanesBeforeExpand)))
const gridInnerWidth = computed(() => {
  const base = Math.max(0, gridViewportWidth.value - timeColWidth)
  return timeColWidth + base * widthFactor.value
})

const scheduledOrderIdSet = computed(() => new Set(scheduledLayoutItems.value.map((item) => item.orderId)))

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

const getInstrumentCount = (order: WaterCycleOrder) => {
  const active = getActiveInstruments(order)
  if (active.length) return active.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
  return 1
}

const getOrderDeviceSummary = (order: WaterCycleOrder) => order.deviceName || order.testPlatform || '-'

const getOrderStatusText = (order: WaterCycleOrder) => {
  if (getActiveInstruments(order).some((item) => isInstrumentRunning(item.id))) return '测试中'
  if (order.status === 2) return '测试中'
  if (order.status === 5 || order.status === 3) return '已完成'
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

const getInstrumentStatusText = (order: WaterCycleOrder, instrumentId: string) => {
  if (isInstrumentRunning(instrumentId)) return '测试中'
  if (order.status === 2) return '待排程'
  if (scheduledOrderIdSet.value.has(order.id)) return '已排程'
  return '待排程'
}

const selectedOrderForPicker = computed(() => selectedScheduledOrders.value[0] as WaterCycleOrder | undefined)
const pickerRows = computed(() => {
  const order = selectedOrderForPicker.value
  return order ? getActiveInstruments(order) : []
})

function togglePickerInstrument(instrumentId: string, checked: boolean) {
  const set = new Set(pickerInstrumentIds.value)
  if (checked) set.add(instrumentId)
  else set.delete(instrumentId)
  pickerInstrumentIds.value = Array.from(set)
}

function selectAllPickerInstruments() {
  pickerInstrumentIds.value = pickerRows.value.map((item) => item.id)
}

function clearPickerInstruments() {
  pickerInstrumentIds.value = []
}

function openDetail(order: WaterCycleOrder) {
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
  refreshWorkOrders()
  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  window.removeEventListener('focus', handleWindowFocus)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

const getScheduledStyle = (item: any) => {
  const ev = getEvent(item.orderId)
  if (!ev) return {}
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
    zIndex: selectedScheduledOrderIds.value.includes(item.orderId) ? 12 : 10
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
  const orderId = e.dataTransfer?.getData('text/plain')
  if (!orderId) return
  scheduleOrder(orderId, target.dateStr, target.timeKey, target.isPast)
}

// 控制开机自检弹窗的显隐
const showStartupCheck = ref(false)

// 原生日历控件改变日期时的回调
function gotoDate(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (val) calBase.value = getMonday(new Date(val))
}

// 点击开始实验按钮
async function handleStartTest() {
  if (selectedScheduledOrders.value.length > 0) {
    const o = selectedScheduledOrders.value[0] as WaterCycleOrder
    const activeInstruments = getActiveInstruments(o)
    if (activeInstruments.length === 0) {
      ElMessage.warning('当前工单没有可开始测试的仪器')
      return
    }
    pickerInstrumentIds.value = activeInstruments.map((item) => item.id)
    instrumentPickerVisible.value = true
  }
}

async function confirmInstrumentSelection() {
  const o = selectedOrderForPicker.value
  if (!o) return
  if (pickerInstrumentIds.value.length === 0) {
    ElMessage.warning('请先选择本次要测试的仪器')
    return
  }
    const p = getScheduleChangePayload(o.id)
    console.log('[water-cycle schedule]', p ? `${p.startAtHour} ~ ${p.endAtHour}` : '', p)
    if (p) {
      const ok = await initAuth()
      if (!ok) {
        const cont = confirm('未登录，无法推送第三方排期，是否仍继续开始实验？')
        if (!cont) return
      } else {
        const headers = getAuthHeaders()
        const testType = (await resolveEngineerAssistantTestTypeId('水循环', headers)) || ''
        if (testType) {
          const equipmentId = String((o as any).testPlatform || (o as any).deviceNumber || (o as any).deviceName || (o as any).taskNumber || o.id)
          const testId = String((o as any).dbId ?? o.id)
          const resp = await pushEngineerAssistantSchedules(
            {
              schedulesInfo: [
                { testId, testType, equipmentId, startTime: p.startAtHour, endTime: p.endAtHour },
              ],
            },
            headers
          )
          if (!resp.success || !resp.data || resp.data.code !== 0) {
            const cont = confirm('推送第三方排期失败，是否仍继续开始实验？')
            if (!cont) return
          }
        } else {
          const cont = confirm('未匹配到第三方测试类型（水循环），是否仍继续开始实验？')
          if (!cont) return
        }
      }
    }
    // 将当前选中打算测试的工单存入全局状态，供后续页面使用
    selectedOrder.value = o
    selectedWaterCycleInstrumentIds.value = pickerInstrumentIds.value.slice()
    instrumentPickerVisible.value = false
    showStartupCheck.value = true
}

// 开机检查完毕，切换视图
async function onStartupComplete() {
  const order = selectedOrder.value
  const orderId = typeof order?.dbId === 'number' ? order.dbId : undefined
  if (orderId !== undefined) {
    await initAuth()
    const resp = await updateWaterCycleOrder(orderId, { status: 2 }, getAuthHeaders())
    if (!resp.success || !resp.data || resp.data.code !== 0) {
      const ok = confirm('工单状态更新失败，是否仍继续开始实验？')
      if (!ok) return
    } else {
      markInstrumentsRunning(selectedWaterCycleInstrumentIds.value)
      void refreshWorkOrders()
    }
  }
  showStartupCheck.value = false
  currentView.value = 'testing'
}
</script>

<template>
  <div class="layout-container">
    <div class="sidebar">
      <div class="panel-header">
        <div class="header-title"><Icon icon="mdi:format-list-bulleted" class="header-icon" /><span>待测试工单</span></div>
        <div class="header-actions">
          <button class="icon-btn" :disabled="workOrdersLoading" title="刷新" @click="refreshWorkOrders">
            <Icon icon="mdi:refresh" />
          </button>
          <span class="count-badge">{{ unscheduledOrders.length }}</span>
        </div>
      </div>
      
      <div class="search-box">
        <Icon icon="mdi:magnify" class="search-icon" />
        <input v-model="searchKeyword" type="text" placeholder="搜索工单号/设备..." />
        <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''"><Icon icon="mdi:close" /></button>
      </div>
      
      <div class="table-content">
        <div v-if="unscheduledOrders.length === 0" class="empty-state"><p>无待排程工单</p></div>
        <div v-else class="table-wrapper">
          <table class="water-order-table">
            <colgroup>
              <col class="col-applicant" />
              <col class="col-task" />
              <col class="col-device" />
              <col class="col-action" />
              <col class="col-status" />
            </colgroup>
            <thead>
              <tr>
                <th>申请人</th>
                <th>任务编号</th>
                <th>使用设备</th>
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
                  @dragstart="handleDragStart($event, order)"
                  @dragend="handleDragEnd"
                >
                  <td class="cell-applicant" :title="order.applicant">{{ order.applicant }}</td>
                  <td class="cell-id" :title="order.taskNumber">{{ order.taskNumber }}</td>
                  <td class="cell-device" :title="getOrderDeviceSummary(order)">
                    <div class="cell-detail">
                      <span class="expand-icon" @click.stop="toggleExpanded(order.id)">
                        <Icon :icon="isExpanded(order.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
                      </span>
                      <span class="device-summary">{{ getOrderDeviceSummary(order) }}</span>
                    </div>
                  </td>
                  <td class="cell-action">
                    <button class="op-btn view" @click.stop="openDetail(order)">详情</button>
                  </td>
                  <td class="cell-status" :title="getOrderStatusText(order)">
                    <span class="status-pill" :class="getStatusClass(getOrderStatusText(order))">
                      {{ getOrderStatusText(order) }}
                    </span>
                  </td>
                </tr>
                <tr v-if="isExpanded(order.id)" :key="order.id + '-expanded'">
                  <td class="expanded-cell" colspan="5">
                    <div class="instrument-panel">
                      <div class="instrument-panel-head">
                        <div>
                          <div class="instrument-title">设备明细</div>
                          <div class="instrument-subtitle">该工单包含的待测试设备</div>
                        </div>
                        <span class="instrument-count-pill">{{ getInstrumentCount(order) }} 台</span>
                      </div>
                      <div v-if="getActiveInstruments(order).length === 0" class="instrument-list">
                        <div class="instrument-item">
                          <div class="instrument-main">
                            <span class="instrument-name">{{ order.deviceName || '-' }}</span>
                            <span class="instrument-sn">{{ order.deviceNumber || '-' }}</span>
                          </div>
                          <span class="status-pill" :class="getStatusClass(getOrderStatusText(order))">{{ getOrderStatusText(order) }}</span>
                        </div>
                      </div>
                      <div v-else class="instrument-list">
                        <div v-for="instrument in getActiveInstruments(order)" :key="instrument.id" class="instrument-item">
                          <div class="instrument-main">
                            <span class="instrument-name">{{ instrument.name }}</span>
                            <span class="instrument-sn">{{ instrument.sn }}</span>
                          </div>
                          <span class="instrument-quantity">{{ instrument.quantity || 1 }} 台</span>
                          <span class="status-pill" :class="getStatusClass(getInstrumentStatusText(order, instrument.id))">{{ getInstrumentStatusText(order, instrument.id) }}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <table class="data-table">
            <thead><tr><th>任务单号</th><th>申请人</th><th>设备名称</th><th>流程长度</th><th>测试台</th></tr></thead>
            <tbody>
              <tr v-for="order in unscheduledOrders" :key="order.id" draggable="true" 
                  @dragstart="handleDragStart($event, order)" 
                  @dragend="handleDragEnd">
                <td class="cell-id">{{ order.taskNumber }}</td>
                <td class="cell-applicant">{{ order.applicant }}</td>
                <td class="cell-device" :title="order.deviceName">{{ order.deviceName }}</td>
                <td class="cell-flow">{{ order.flowProcess }}</td>
                <td class="cell-bench">{{ order.testPlatform }}</td>
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
          <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="gotoDate" />
          <span class="week-cal-label">{{ weekLabel }}</span>
          <button class="week-cal-nav" @click="nextWeek">下一周 ›</button>
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
            <div v-for="day in currentWeekDays" :key="day.dateStr" class="day-header" :class="{ 'is-today': day.isToday }">
              <div class="day-num" :class="{ 'is-weekend': day.isWeekend }">{{ day.month }}/{{ day.dayNum }}</div>
              <div class="day-name">周{{ day.dayName.replace('周', '') }}</div>
            </div>
          </div>

          <div class="grid-body">
            <div
              class="grid-inner"
              ref="gridInnerRef"
              :style="{
                height: `${timeSlots.length * slotHeightPx}px`,
                width: `${gridInnerWidth}px`
              }"
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
                    'is-selected': selectedScheduledOrderIds.includes(it.orderId),
                    'is-resizing': isResizing && resizingOrderId === it.orderId
                  }"
                  :style="getScheduledStyle(it)"
                  @click="selectScheduledOrder(it.orderId)"
                :title="`${getOrderById(it.orderId)?.taskNumber || ''} · ${getOrderById(it.orderId)?.deviceName || ''} · ${getScheduleText(it.orderId)}`"
                >
                  <div class="scheduled-content">
                    <span class="device-name">{{ getOrderById(it.orderId)?.taskNumber }}</span>
                    <button class="remove-btn" title="删除排程" @click.stop="handleUnschedule(it.cellKey, it.orderId)">
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">{{ getOrderById(it.orderId)?.deviceName }}</div>
                  <div class="resize-handle-top" @mousedown.stop.prevent="startResizeTop(it.orderId, $event)"></div>
                  <div class="resize-handle" @mousedown.stop.prevent="startResize(it.orderId, $event)"></div>
                </div>
              </div>

              <div v-for="slot in timeSlots" :key="slot.key" class="grid-row" :class="{ 'is-half': slot.isHalf }">
                <div class="time-label" :class="{ 'is-half': slot.isHalf }">{{ slot.label }}</div>

                <div
                  v-for="day in currentWeekDays"
                  :key="getCellKey(day.dateStr, slot.key)"
                  class="grid-cell"
                  :class="{ 'is-weekend': day.isWeekend, 'is-half-cell': slot.isHalf, 'is-past': day.isPast }"
                  @dragover="handleDragOver($event, day.isPast)"
                  @dragenter="handleDragEnter"
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
          <template v-if="selectedScheduledOrders.length">
            <div class="selected-order">
              <Icon icon="mdi:check" class="selected-icon" />
              <span class="selected-label">已选中工单: {{ selectedScheduledOrders.length }} 个</span>
            </div>
            <span class="selected-divider">|</span>
            <span class="selected-device" v-for="o in selectedScheduledOrders" :key="o.id">{{ o.taskNumber }} · {{ o.deviceName }}</span>
          </template>
          <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
        </div>
        <button class="primary-btn" :disabled="!selectedScheduledOrders.length" @click="handleStartTest"><Icon icon="mdi:play" class="start-icon" /> 开始实验</button>
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
          <span class="product-order">{{ selectedOrderForPicker?.taskNumber }} · {{ selectedOrderForPicker?.applicant }}</span>
        </label>
      </div>
      <div class="product-picker-footer">
        <button class="week-cal-nav" type="button" @click="instrumentPickerVisible = false">取消</button>
        <button class="primary-btn" type="button" @click="confirmInstrumentSelection">确认开始实验</button>
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
            <div class="detail-field">
              <span>申请人</span>
              <strong>{{ displayValue(detailOrder.applicant) }}</strong>
            </div>
            <div class="detail-field">
              <span>任务编号</span>
              <strong>{{ displayValue(detailOrder.taskNumber) }}</strong>
            </div>
            <div class="detail-field">
              <span>使用设备</span>
              <strong>{{ displayValue(getOrderDeviceSummary(detailOrder)) }}</strong>
            </div>
            <div class="detail-field">
              <span>测试台</span>
              <strong>{{ displayValue(detailOrder.testPlatform) }}</strong>
            </div>
            <div class="detail-field">
              <span>流程长度</span>
              <strong>{{ displayValue(detailOrder.flowProcess) }}</strong>
            </div>
            <div class="detail-field">
              <span>当前状态</span>
              <strong>{{ getOrderStatusText(detailOrder) }}</strong>
            </div>
          </div>
        </section>

        <section class="detail-card">
          <h3>设备明细</h3>
          <div class="detail-instrument-list">
            <div
              v-for="instrument in detailOrder.instruments"
              :key="instrument.id"
              class="detail-instrument-item"
            >
              <div>
                <strong>{{ displayValue(instrument.name) }}</strong>
                <span>{{ displayValue(instrument.sn) }}</span>
              </div>
              <span class="instrument-quantity">{{ instrument.quantity || 1 }} 台</span>
            </div>
            <div v-if="detailOrder.instruments.length === 0" class="detail-instrument-item">
              <div>
                <strong>{{ displayValue(detailOrder.deviceName) }}</strong>
                <span>{{ displayValue(detailOrder.deviceNumber) }}</span>
              </div>
              <span class="instrument-quantity">1 台</span>
            </div>
          </div>
        </section>

        <section class="detail-card">
          <h3>测试流程</h3>
          <div class="steps-list">
            <div class="step-item"><span>1</span><p>确认水循环管路、阀门和待测设备连接状态。</p></div>
            <div class="step-item"><span>2</span><p>完成启动前检查，确认水泵、传感器和采集通道正常。</p></div>
            <div class="step-item"><span>3</span><p>按排程开始水循环测试，实时记录流量、压力和温度等关键数据。</p></div>
            <div class="step-item"><span>4</span><p>测试结束后保存数据并进入报告/复核流程。</p></div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <StartupCheckModal v-if="showStartupCheck" @cancel="showStartupCheck = false" @complete="onStartupComplete" />
</template>

<style scoped>
.layout-container { display:flex; flex:1; min-height:0; gap:16px; overflow:hidden; }
.sidebar { width:520px; min-width:480px; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; }
.main-content { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; }
.panel-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 18px; border-bottom:1px solid var(--color-border); font-size:15px; font-weight:600; color:var(--color-text-primary); background:var(--color-bg-secondary); flex-shrink:0; }
.sidebar .panel-header .header-title { display:flex; align-items:center; gap:8px; font-size:.875rem; font-weight:500; }
.header-actions { display:flex; align-items:center; gap:10px; }
.icon-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-secondary); cursor:pointer; }
.icon-btn:disabled { opacity:.5; cursor:not-allowed; }
.icon-btn:hover:not(:disabled) { background:var(--color-bg-hover); color:var(--color-text-primary); }
.count-badge { padding:4px 10px; border-radius:9999px; font-size:12px; font-weight:500; background:rgba(59,130,246,.15); color:rgb(96,165,250); }
.search-box { display:flex; align-items:center; gap:8px; padding:12px 18px; border-bottom:1px solid var(--color-border); background:var(--color-bg-secondary); }
.search-icon { font-size:18px; color:var(--color-text-tertiary); }
.search-box input { flex:1; border:none; background:transparent; font-size:14px; color:var(--color-text-primary); outline:none; }
.clear-btn { display:flex; align-items:center; justify-content:center; width:20px; height:20px; border:none; background:var(--color-bg-tertiary); color:var(--color-text-secondary); border-radius:50%; cursor:pointer; transition:all .2s; }
.clear-btn:hover { background:var(--color-error); color:#fff; }
.table-content { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--color-bg-secondary); }
.table-wrapper { flex:1; overflow:auto; }
.empty-state { text-align:center; padding:40px 20px; color:#94a3b8; font-size:13px; }
.data-table { display:none; }
.water-order-table { width:100%; min-width:0; border-collapse:collapse; table-layout:fixed; font-size:13px; }
.water-order-table .col-applicant { width:15%; }
.water-order-table .col-task { width:26%; }
.water-order-table .col-device { width:24%; }
.water-order-table .col-action { width:15%; }
.water-order-table .col-status { width:20%; }
.water-order-table thead { position:sticky; top:0; z-index:2; }
.water-order-table th { padding:12px 6px; text-align:left; font-weight:700; color:var(--color-text-secondary); background:var(--color-bg-secondary); border-bottom:1px solid var(--color-border); white-space:nowrap; }
.water-order-table td { padding:13px 6px; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.order-row { position:relative; cursor:grab; user-select:none; transition:background .18s ease; }
.order-row:active { cursor:grabbing; }
.order-row td { background:var(--color-bg-secondary); border-bottom:1px solid rgba(255,255,255,.04); transition:background-color .15s ease; }
.order-row td:first-child { border-left:3px solid transparent; }
.order-row:hover td,
.order-row.is-expanded td,
.order-row.is-scheduled td { background:var(--color-bg-hover); }
.order-row:hover td:first-child,
.order-row.is-expanded td:first-child,
.order-row.is-scheduled td:first-child { border-left-color:var(--color-accent-blue); }
.cell-detail { display:flex; align-items:center; gap:4px; min-width:0; }
.expand-icon { width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; color:var(--color-text-secondary); }
.device-summary { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cell-action,.cell-status { text-align:center; }
.op-btn { min-width:48px; height:26px; padding:0 8px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; transition:all .18s ease; }
.op-btn.view { color:#006be6; border:1px solid rgba(37,99,235,.25); background:rgba(59,130,246,.1); }
.op-btn.view:hover { background:rgba(59,130,246,.18); }
.status-pill { display:inline-flex; align-items:center; justify-content:center; min-width:54px; height:26px; padding:0 8px; border-radius:999px; font-size:11px; font-weight:700; white-space:nowrap; letter-spacing:.01em; }
.status-pending { color:#d97706; border:1px solid rgba(245,158,11,.35); background:rgba(245,158,11,.12); }
.status-scheduled { color:#006be6; border:1px solid rgba(37,99,235,.3); background:rgba(59,130,246,.12); }
.status-running { color:#059669; border:1px solid rgba(16,185,129,.35); background:rgba(16,185,129,.14); }
.status-done { color:#64748b; border:1px solid rgba(100,116,139,.2); background:rgba(100,116,139,.1); }
.status-error { color:#dc2626; border:1px solid rgba(239,68,68,.25); background:rgba(239,68,68,.1); }
.expanded-cell { padding:0 16px 12px 19px!important; white-space:normal!important; background:var(--color-bg-primary)!important; border-bottom:1px solid rgba(255,255,255,.04)!important; }
.instrument-panel { margin:0; border-top:1px solid var(--color-border); padding:10px 0 0; border-radius:0; background:transparent; box-shadow:none; }
.instrument-panel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:10px; }
.instrument-title { font-size:12px; font-weight:600; color:var(--color-text-secondary); }
.instrument-subtitle { margin-top:2px; font-size:11px; color:var(--color-text-tertiary); }
.instrument-count-pill { display:inline-flex; align-items:center; justify-content:center; min-width:44px; height:22px; padding:0 8px; border-radius:999px; background:var(--color-bg-tertiary); color:var(--color-text-secondary); font-size:11px; font-weight:500; white-space:nowrap; }
.instrument-list { display:flex; flex-direction:column; gap:8px; }
.instrument-item { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:10px; padding:8px 10px; border:1px solid transparent; border-radius:10px; background:transparent; }
.instrument-item:hover { border-color:var(--color-border); background:var(--color-bg-hover); }
.instrument-main { min-width:0; display:flex; flex-direction:column; gap:3px; }
.instrument-name { color:var(--color-text-primary); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.instrument-sn { color:var(--color-text-secondary); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.instrument-quantity { color:var(--color-text-secondary); font-size:11px; font-weight:600; white-space:nowrap; }
.data-table thead { position:sticky; top:0; z-index:1; }
.data-table th { padding:12px 16px; text-align:left; font-weight:600; color:var(--color-text-secondary); background:var(--color-bg-secondary); border-bottom:1px solid var(--color-border); white-space:nowrap; }
.data-table td { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,.04); vertical-align:middle; }
.cell-id { font-weight:600; color:var(--color-accent-blue); }
.cell-device,.cell-applicant,.cell-flow,.cell-bench { color:var(--color-text-secondary); }
.priority-tag { display:inline-flex; align-items:center; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; white-space:nowrap; }
.priority-tag.normal { background:rgba(59,130,246,.12); color:var(--color-accent-blue); }
.priority-tag.urgent { background:rgba(239,68,68,.12); color:#ef4444; }
.week-cal-toolbar { display:flex; align-items:center; gap:8px; flex:1; }
.week-cal-label { font-size:13px; font-weight:600; flex:1; text-align:center; white-space:nowrap; }
.week-cal-nav { padding:5px 10px; border:1px solid var(--color-border); border-radius:6px; background:var(--color-bg-primary); cursor:pointer; font-size:12px; color:var(--color-text-primary); transition:all .2s; }
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
.day-header:last-child { border-right:none; }
.day-header.is-today { background:rgba(88,166,255,.1); }
.day-num { font-size:16px; font-weight:700; color:var(--color-accent-blue); }
.day-num.is-weekend { color:#ef4444; }
.day-name { font-size:11px; color:var(--color-text-secondary); margin-top:2px; }
.grid-body { position:relative; }
.grid-inner { position:relative; }
.events-overlay { position:absolute; inset:0; pointer-events:none; z-index:5; }
.grid-row { display:grid; grid-template-columns:60px repeat(7,1fr); border-bottom:1px solid var(--color-border); min-height:44px; }
.grid-row.is-half { border-bottom:1px dashed var(--color-border); }
.time-label { display:flex; align-items:center; justify-content:center; border-right:1px solid var(--color-border); font-size:11px; color:var(--color-text-tertiary); background:var(--color-bg-tertiary); font-family:monospace; }
.time-label.is-half { font-size:11px; color:var(--color-text-secondary); }
.grid-cell { border-right:1px solid var(--color-border); position:relative; transition:background .2s; background:var(--color-bg-primary); padding:3px; }
.grid-cell.is-weekend { background:rgba(0,0,0,.012); }
.grid-cell.is-half-cell { border-top:1px dashed rgba(0,0,0,.05); }
.grid-cell:hover:not(.is-past) { background:var(--color-bg-hover); }
.grid-cell.is-past { background:repeating-linear-gradient(45deg,var(--color-bg-tertiary),var(--color-bg-tertiary) 10px,var(--color-bg-secondary) 10px,var(--color-bg-secondary) 20px); opacity:.7; cursor:not-allowed; }
.grid-cell.drag-over { background:rgba(88,166,255,.1)!important; outline:2px dashed var(--color-accent-blue); outline-offset:-2px; }
.empty-slot-hint { position:absolute; inset:0; pointer-events:none; opacity:0; color:var(--color-text-tertiary); font-size:20px; display:flex; align-items:center; justify-content:center; }
.grid-cell:hover .empty-slot-hint { opacity:.5; }
.scheduled-item { position:absolute; padding:4px 6px; background:linear-gradient(135deg,var(--color-accent-blue),var(--color-accent-cyan)); border-radius:4px; color:#fff; display:flex; flex-direction:column; justify-content:flex-start; cursor:pointer; user-select:none; transition:all .2s ease; overflow:hidden; pointer-events:auto; font-size:10px; }
.calendar-grid.is-dragging .scheduled-item { pointer-events:none; }
.scheduled-item:hover { transform:scale(1.02); box-shadow:0 2px 6px rgba(0,0,0,.12); }
.scheduled-item.is-selected { outline:2px solid rgba(255,255,255,.95); box-shadow:0 0 0 3px rgba(37,99,235,.35); transform:scale(1.04); }
.scheduled-item.is-resizing { transition:none!important; transform:none!important; }
.scheduled-item.is-resizing:hover { transform:none!important; }
.scheduled-content { display:flex; align-items:flex-start; justify-content:flex-start; }
.device-name { font-size:11px; font-weight:600; color:#fff; line-height:1.2; padding-right:20px; overflow:hidden; word-break:break-all; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.scheduled-tag { font-size:9px; color:rgba(255,255,255,.9); font-weight:500; margin-top:2px; overflow:hidden; word-break:break-all; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.remove-btn { position:absolute; top:4px; right:4px; width:18px; height:18px; align-items:center; justify-content:center; background:rgba(0,0,0,.18); border:none; color:rgba(255,255,255,.9); cursor:pointer; padding:0; border-radius:4px; opacity:0; pointer-events:none; transition:opacity .15s, background .15s; display:flex; }
.scheduled-item:hover .remove-btn { opacity:1; pointer-events:auto; }
.remove-btn:hover { background:rgba(0,0,0,.28); color:#fff; }
.resize-handle-top { position:absolute; left:0; right:0; top:0; height:10px; cursor:ns-resize; background:linear-gradient(0deg, rgba(255,255,255,0), rgba(255,255,255,.18)); }
.resize-handle-top:hover { background:linear-gradient(0deg, rgba(255,255,255,0), rgba(255,255,255,.28)); }
.resize-handle { position:absolute; left:0; right:0; bottom:0; height:10px; cursor:ns-resize; background:linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.18)); }
.resize-handle:hover { background:linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.28)); }
.control-center { padding:16px; background:var(--color-bg-secondary); display:flex; align-items:center; justify-content:space-between; gap:16px; }
.control-center-left { display:flex; align-items:center; gap:12px; min-width:0; flex:1; font-size:14px; }
.selected-order { display:flex; align-items:center; gap:8px; color:var(--color-accent-blue); font-weight:600; }
.selected-icon { font-size:18px; }
.selected-divider { color:var(--color-border); }
.selected-device { color:var(--color-text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
.selected-placeholder { color:#94a3b8; font-style:italic; }
.primary-btn { display:flex; align-items:center; gap:8px; padding:12px 24px; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; transition:all .2s ease; background:var(--color-primary); color:white; }
.primary-btn:hover:not(:disabled) { opacity:.9; transform:translateY(-1px); }
.primary-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.start-icon { font-size:20px; }
.product-picker-mask { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:32px; background:rgba(15,23,42,.5); backdrop-filter:blur(4px); }
.product-picker-dialog { width:min(820px,92vw); max-height:82vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border); border-radius:18px; background:var(--color-bg-secondary); box-shadow:0 24px 80px rgba(15,23,42,.25); }
.product-picker-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:22px 26px; border-bottom:1px solid var(--color-border); }
.product-picker-header h3 { margin:0; font-size:20px; font-weight:800; color:var(--color-text-primary); }
.product-picker-header p { margin:8px 0 0; color:var(--color-text-secondary); font-size:13px; }
.product-picker-close { width:40px; height:40px; display:flex; align-items:center; justify-content:center; border:none; border-radius:12px; background:var(--color-bg-tertiary); color:var(--color-text-primary); cursor:pointer; }
.product-picker-actions { display:flex; align-items:center; gap:12px; padding:16px 26px; border-bottom:1px solid var(--color-border); color:var(--color-text-secondary); }
.product-picker-list { overflow:auto; padding:0 26px; }
.product-picker-row { display:grid; grid-template-columns:24px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1.6fr); align-items:center; gap:16px; padding:16px 0; border-bottom:1px solid var(--color-border); cursor:pointer; }
.product-picker-row input { width:16px; height:16px; accent-color:var(--color-primary); }
.product-main { font-weight:800; color:var(--color-text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.product-sub,.product-order { color:var(--color-text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.product-picker-footer { display:flex; justify-content:flex-end; align-items:center; gap:14px; padding:18px 26px; border-top:1px solid var(--color-border); }
.detail-modal-mask { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:32px; background:rgba(15,23,42,.48); backdrop-filter:blur(4px); }
.detail-modal { width:min(920px, 92vw); max-height:86vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border); border-radius:18px; background:var(--color-bg-secondary); box-shadow:0 24px 80px rgba(15,23,42,.24); }
.detail-modal-header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:22px 26px; border-bottom:1px solid var(--color-border); background:var(--color-bg-secondary); }
.detail-modal-title { font-size:20px; font-weight:800; color:var(--color-text-primary); }
.detail-modal-subtitle { margin-top:6px; font-size:13px; color:var(--color-text-secondary); }
.detail-close { width:40px; height:40px; display:flex; align-items:center; justify-content:center; border:none; border-radius:12px; background:var(--color-bg-tertiary); color:var(--color-text-primary); cursor:pointer; font-size:20px; transition:all .18s ease; }
.detail-close:hover { background:var(--color-bg-hover); }
.detail-body { flex:1; overflow:auto; padding:22px 26px 26px; display:flex; flex-direction:column; gap:16px; }
.detail-card { border:1px solid var(--color-border); border-radius:14px; background:var(--color-bg-primary); overflow:hidden; }
.detail-card h3 { margin:0; padding:16px 18px; border-bottom:1px solid var(--color-border); font-size:16px; font-weight:800; color:var(--color-text-primary); }
.detail-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; padding:16px 18px; }
.detail-field { min-width:0; padding:12px 14px; border-radius:10px; background:var(--color-bg-secondary); border:1px solid rgba(148,163,184,.18); }
.detail-field span { display:block; margin-bottom:6px; font-size:12px; color:var(--color-text-secondary); }
.detail-field strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:15px; color:var(--color-text-primary); }
.detail-instrument-list { display:flex; flex-direction:column; gap:10px; padding:16px 18px; }
.detail-instrument-item { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 16px; border:1px solid var(--color-border); border-radius:12px; background:var(--color-bg-secondary); }
.detail-instrument-item div { min-width:0; display:flex; flex-direction:column; gap:4px; }
.detail-instrument-item strong { color:var(--color-text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.detail-instrument-item span { color:var(--color-text-secondary); }
.steps-list { display:grid; gap:10px; padding:16px 18px; }
.step-item { display:grid; grid-template-columns:28px minmax(0,1fr); align-items:start; gap:10px; padding:12px; border-radius:12px; background:var(--color-bg-secondary); }
.step-item span { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:999px; color:#fff; background:var(--color-primary); font-weight:800; }
.step-item p { margin:4px 0 0; color:var(--color-text-primary); line-height:1.55; }

@media (max-width: 1180px) {
  .layout-container { gap:12px; }
  .sidebar { width:460px; min-width:420px; }
  .water-order-table .col-applicant { width:14%; }
  .water-order-table .col-device { width:24%; }
}

@media (max-width: 920px) {
  .layout-container { flex-direction:column; }
  .sidebar { width:100%; min-width:0; min-height:420px; }
  .detail-grid { grid-template-columns:1fr; }
}
</style>
