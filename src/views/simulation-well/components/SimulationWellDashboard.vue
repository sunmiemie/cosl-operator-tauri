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
  resizingEventId: string | null
  isResizing: boolean
  selectedScheduledEventIds: string[]
  hostDeviceTabs: string[]
  activeHostDeviceName: string
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
  unschedule: [cellKey: string, eventId: string]
  'unschedule-tentative': [cellKey: string, eventId: string]
  'select-scheduled-event': [eventId: string]
  'assign-host-device': [hostName: string]
  'start-resize': [eventId: string, e: MouseEvent]
  'start-resize-top': [eventId: string, e: MouseEvent]
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

type CollapsedTimeRange = 'early' | 'late'

type DisplayTimeRow =
  | { type: 'slot'; slot: TimeSlot; slotIndex: number }
  | { type: 'collapsed'; range: CollapsedTimeRange; label: string; startIdx: number; endIdx: number }

type SlotMetric = { top: number; bottom: number }

const isEarlyHoursExpanded = ref(false)
const isLateHoursExpanded = ref(false)

const collapseRanges: Record<CollapsedTimeRange, { label: string; startIdx: number; endIdx: number }> = {
  // endIdx 为排他边界：00:00–08:00 对应 0 至 8 点共 9 个时段。
  early: { label: '00:00–08:00', startIdx: 0, endIdx: 9 },
  late: { label: '18:00–23:00', startIdx: 18, endIdx: 24 }
}

const isRangeExpanded = (range: CollapsedTimeRange) =>
  range === 'early' ? isEarlyHoursExpanded.value : isLateHoursExpanded.value

const toggleTimeRange = (range: CollapsedTimeRange) => {
  if (range === 'early') isEarlyHoursExpanded.value = !isEarlyHoursExpanded.value
  else isLateHoursExpanded.value = !isLateHoursExpanded.value
}

const getExpandedRangeStart = (slotIndex: number): CollapsedTimeRange | null => {
  if (slotIndex === collapseRanges.early.startIdx && isRangeExpanded('early')) return 'early'
  if (slotIndex === collapseRanges.late.startIdx && isRangeExpanded('late')) return 'late'
  return null
}

const collapseExpandedRange = (slotIndex: number) => {
  const range = getExpandedRangeStart(slotIndex)
  if (range) toggleTimeRange(range)
}

const getCollapseTitle = (slotIndex: number) => {
  const range = getExpandedRangeStart(slotIndex)
  return range ? `收起 ${collapseRanges[range].label}` : ''
}

const displayTimeRows = computed<DisplayTimeRow[]>(() => {
  const rows: DisplayTimeRow[] = []
  // 24:00 仅作为排程结束边界，不能作为可编辑或可见的日历行。
  const displaySlots = props.timeSlots.slice(0, -1)

  displaySlots.forEach((slot, slotIndex) => {
    const range = slotIndex < collapseRanges.early.endIdx
      ? 'early'
      : slotIndex >= collapseRanges.late.startIdx
        ? 'late'
        : null

    if (range && !isRangeExpanded(range)) {
      if (slotIndex === collapseRanges[range].startIdx) {
        rows.push({ type: 'collapsed', range, ...collapseRanges[range] })
      }
      return
    }

    rows.push({ type: 'slot', slot, slotIndex })
  })

  return rows
})

const gridHeight = computed(() => displayTimeRows.value.length * props.slotHeightPx)

const slotMetrics = computed<Record<number, SlotMetric>>(() => {
  const metrics: Record<number, SlotMetric> = {}
  displayTimeRows.value.forEach((row, rowIndex) => {
    if (row.type !== 'slot') return
    const top = rowIndex * props.slotHeightPx
    metrics[row.slotIndex] = { top, bottom: top + props.slotHeightPx }
  })
  return metrics
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

type DisplayScheduledItem = ScheduledItem & {
  dayIndex: number
  displayTop: number
  displayBottom: number
  isTopClipped: boolean
  isBottomClipped: boolean
}

const getDisplayScheduledItem = (item: ScheduledItem & { dayIndex: number }): DisplayScheduledItem | null => {
  const endIdx = Math.min(item.startIdx + Math.max(1, item.span), props.timeSlots.length - 1)
  const visibleSlotIndexes = Array.from({ length: Math.max(0, endIdx - item.startIdx) }, (_, offset) => item.startIdx + offset)
    .filter((slotIndex) => !!slotMetrics.value[slotIndex])

  if (!visibleSlotIndexes.length) return null

  const firstVisibleSlot = visibleSlotIndexes[0]
  const lastVisibleSlot = visibleSlotIndexes[visibleSlotIndexes.length - 1]
  const firstMetric = slotMetrics.value[firstVisibleSlot]
  const lastMetric = slotMetrics.value[lastVisibleSlot]
  if (!firstMetric || !lastMetric) return null

  return {
    ...item,
    displayTop: firstMetric.top,
    displayBottom: lastMetric.bottom,
    isTopClipped: firstVisibleSlot !== item.startIdx,
    isBottomClipped: lastVisibleSlot !== endIdx - 1
  }
}

const visibleLayoutWithDayIndex = computed<DisplayScheduledItem[]>(() =>
  layoutWithDayIndex.value
    .map((item) => getDisplayScheduledItem(item))
    .filter((item): item is DisplayScheduledItem => !!item)
)

const getCollapsedScheduleCount = (range: CollapsedTimeRange, dateStr: string) => {
  const { startIdx, endIdx } = collapseRanges[range]
  return new Set(
    layoutWithDayIndex.value
      .filter((item) => {
        if (item.dateStr !== dateStr) return false
        const itemEndIdx = item.startIdx + Math.max(1, item.span)
        return item.startIdx < endIdx && itemEndIdx > startIdx
      })
      .map((item) => item.eventId)
  ).size
}

const selectedOrderRows = computed(() => {
  const orderIds = new Set(
    props.scheduledLayoutItems
      .filter((item) => props.selectedScheduledEventIds.includes(item.eventId))
      .map((item) => item.orderId)
  )
  return Array.from(orderIds)
    .map((id) => props.getWorkOrderById(id))
    .filter(Boolean) as WorkOrder[]
})

const scheduledDeviceIdSet = computed(() => {
  const set = new Set<string>()
  Object.values(props.scheduledOrders || {}).forEach((deviceIds) => {
    deviceIds.forEach((deviceId) => set.add(deviceId))
  })
  return set
})
const isOrderScheduled = (order: WorkOrder) => order.deviceList.some((device) => scheduledDeviceIdSet.value.has(device.id))
const getOrderStatusText = (order: WorkOrder) => isOrderScheduled(order) ? '已排程' : '待排程'
const getOrderStatusClass = (order: WorkOrder) => isOrderScheduled(order) ? 'scheduled' : 'pending'
const getDeviceStatusText = (deviceId: string) => scheduledDeviceIdSet.value.has(deviceId) ? '已排程' : '待排程'
const getDeviceStatusClass = (deviceId: string) => scheduledDeviceIdSet.value.has(deviceId) ? 'scheduled' : 'pending'

const expandedOrderIds = ref<string[]>([])
const isExpanded = (orderId: string) => expandedOrderIds.value.includes(orderId)
const toggleExpanded = (orderId: string) => {
  const set = new Set(expandedOrderIds.value)
  if (set.has(orderId)) set.delete(orderId)
  else set.add(orderId)
  expandedOrderIds.value = Array.from(set)
}

const getScheduledStyle = (item: DisplayScheduledItem) => {
  const totalWidth = gridInnerWidth.value || 0
  const dayColW = totalWidth > timeColWidth ? (totalWidth - timeColWidth) / 7 : 0
  const laneCount = Math.max(1, item.laneCount || 1)
  const laneW = dayColW > 0 ? dayColW / laneCount : 0
  const top = item.displayTop + cellPadding
  const height = item.displayBottom - item.displayTop - cellPadding * 2
  const left = timeColWidth + item.dayIndex * dayColW + item.lane * laneW + cellPadding
  const width = laneW - cellPadding * 2
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${Math.max(20, width)}px`,
    height: `${Math.max(props.slotHeightPx - cellPadding * 2, height)}px`,
    zIndex: props.selectedScheduledEventIds.includes(item.eventId) ? 12 : 10,
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
  const rowIndex = Math.floor(y / props.slotHeightPx)
  const row = displayTimeRows.value[rowIndex]
  if (!row || row.type !== 'slot') return null
  const day = props.currentWeekDays[dayIndex]
  const slot = row.slot
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
      <div v-if="hostDeviceTabs.length" class="host-filter-tabs">
        <button
          v-for="host in hostDeviceTabs"
          :key="host"
          class="host-filter-tab"
          :class="{ active: activeHostDeviceName === host }"
          :title="host"
          @click="emit('assign-host-device', host)"
        >
          {{ host }}
        </button>
      </div>

      <div class="table-content">
        <div v-if="unscheduledOrders.length === 0" class="empty-state"><p>无待排程工单</p></div>
        <div v-else class="table-wrapper">
          <table class="data-table schedule-order-table">
            <thead>
              <tr>
                <th>工单号</th>
                <th>客户</th>
                <th>设备明细</th>
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
                  :class="{ 'is-scheduled': isOrderScheduled(order), 'is-expanded': isExpanded(order.id) }"
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
                          <span class="status-pill" :class="getDeviceStatusClass(d.id)">{{ getDeviceStatusText(d.id) }}</span>
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
              :style="{ height: `${gridHeight}px`, width: `${gridInnerWidth}px` }"
              @dragover.capture="handleGridDragOver"
              @drop.capture="handleGridDrop"
            >
              <div class="events-overlay">
                <div
                  v-for="it in visibleLayoutWithDayIndex"
                  :key="it.eventId"
                  class="scheduled-item"
                  :class="{
                    'is-selected': selectedScheduledEventIds.includes(it.eventId),
                    'is-dragging': isDragging,
                    'is-resizing': isResizing && resizingEventId === it.eventId,
                    'is-tentative': it.isTentative
                  }"
                  :style="getScheduledStyle(it)"
                  @click="emit('select-scheduled-event', it.eventId)"
                  :title="`${it.orderId} · ${getWorkOrderById(it.orderId)?.customer || ''} · ${getWorkOrderById(it.orderId)?.planTime || ''} · ${getWorkOrderById(it.orderId)?.taskDesc || ''}`"
                >
                  <div class="scheduled-content">
                    <span class="device-name">{{ it.orderId }}</span>
                    <button
                      v-if="!it.isTentative"
                      class="remove-btn"
                      title="删除排程"
                      @click.stop="emit('unschedule', it.cellKey, it.eventId)"
                    >
                      <Icon icon="mdi:close" />
                    </button>
                    <button
                      v-else
                      class="remove-btn"
                      title="删除待排程"
                      @click.stop="emit('unschedule-tentative', it.cellKey, it.eventId)"
                    >
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">
                    <template v-if="it.isTentative">待排程 · </template>{{ getWorkOrderById(it.orderId)?.customer || '-' }} ·
                    {{ getWorkOrderById(it.orderId)?.planTime || '-' }}
                  </div>
                  <div
                    v-if="!it.isTopClipped"
                    class="resize-handle-top"
                    @mousedown.stop.prevent="emit('start-resize-top', it.eventId, $event)"
                  ></div>
                  <div
                    v-if="!it.isBottomClipped"
                    class="resize-handle"
                    @mousedown.stop.prevent="emit('start-resize', it.eventId, $event)"
                  ></div>
                </div>
              </div>

              <div
                v-for="row in displayTimeRows"
                :key="row.type === 'slot' ? row.slot.key : `collapsed-${row.range}`"
                class="grid-row"
                :class="{ 'grid-row-collapsed': row.type === 'collapsed' }"
                @click="row.type === 'collapsed' && toggleTimeRange(row.range)"
              >
                <template v-if="row.type === 'slot'">
                  <div class="time-label" :class="{ 'expandable-time-label': getExpandedRangeStart(row.slotIndex) }">
                    <button
                      v-if="getExpandedRangeStart(row.slotIndex)"
                      class="collapse-time-button"
                      :title="getCollapseTitle(row.slotIndex)"
                      @click.stop="collapseExpandedRange(row.slotIndex)"
                    >
                      <Icon icon="mdi:chevron-up" />
                    </button>
                    <span>{{ row.slot.label }}</span>
                  </div>
                  <div
                    v-for="day in currentWeekDays"
                    :key="getCellKey(day.dateStr, row.slot.key)"
                    class="grid-cell"
                    :class="{ 'is-weekend': day.isWeekend, 'is-past': day.isPast }"
                    @dragleave="emit('drag-leave')"
                  >
                    <div class="empty-slot-hint">+</div>
                  </div>
                </template>
                <template v-else>
                  <div class="time-label collapsed-time-label">
                    <span>{{ row.label }}</span>
                    <Icon icon="mdi:chevron-down" class="collapsed-time-icon" />
                  </div>
                  <div
                    v-for="day in currentWeekDays"
                    :key="`${day.dateStr}_${row.range}_collapsed`"
                    class="grid-cell collapsed-time-cell"
                    :class="{ 'is-weekend': day.isWeekend }"
                  >
                    <span v-if="getCollapsedScheduleCount(row.range, day.dateStr)" class="collapsed-schedule-count">
                      {{ getCollapsedScheduleCount(row.range, day.dateStr) }} 项排程
                    </span>
                    <span v-else class="collapsed-expand-hint">点击展开</span>
                  </div>
                </template>
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
