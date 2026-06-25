import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import {
  clearHaltHassOrderSchedule,
  listHaltHassOrders,
  mapHaltHassOrder,
  saveHaltHassOrderSchedule,
} from '@/services/halt-hass-order'
import type { HaltHassOrder } from '../types'
import { isMockHaltHassOrder, MOCK_HALT_HASS_ORDER } from '../mock-halt-hass-fixture'

type ScheduledEvent = {
  eventId: string
  orderId: string
  dateStr: string
  startTimeKey: string
  span: number
}

export type HaltHassWeekDay = {
  dateStr: string
  dayName: string
  dayNum: number
  month: number
  isToday: boolean
  isWeekend: boolean
  isPast: boolean
}

export type HaltHassTimeSlot = {
  key: string
  label: string
  isHalf: boolean
}

function getMonday(d: Date) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function addDays(d: Date, days: number) {
  const result = new Date(d)
  result.setDate(result.getDate() + days)
  return result
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getOrderKey(order: HaltHassOrder) {
  return order.orderNo || String(order.id)
}

export function useHaltHassSchedule() {
  const { initAuth, getAuthHeaders } = useAuth()
  const searchKeyword = ref('')
  const workOrders = ref<HaltHassOrder[]>([])
  const workOrdersLoading = ref(false)
  const schedulePersisting = ref(false)
  const selectedScheduledOrder = ref<string | null>(null)
  const draggedOrderId = ref<string | null>(null)
  const isDragging = ref(false)
  const calBase = ref(getMonday(new Date()))
  const slotHeightPx = 44
  const scheduledEvents = ref<Record<string, ScheduledEvent>>({})
  const visibleOrderStatuses = [1, 4, 7]

  const currentWeekDays = computed<HaltHassWeekDay[]>(() => {
    const days: HaltHassWeekDay[] = []
    const todayStr = fmtDate(new Date())
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < 7; i++) {
      const d = addDays(calBase.value, i)
      const dateStr = fmtDate(d)
      const dObj = new Date(d)
      dObj.setHours(0, 0, 0, 0)
      days.push({
        dateStr,
        dayName: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()],
        dayNum: d.getDate(),
        month: d.getMonth() + 1,
        isToday: dateStr === todayStr,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
        isPast: dObj < today,
      })
    }
    return days
  })

  const weekLabel = computed(() => {
    const start = currentWeekDays.value[0]
    const end = currentWeekDays.value[6]
    return start && end ? `${start.month}月${start.dayNum}日 ～ ${end.month}月${end.dayNum}日` : ''
  })

  const timeSlots = computed<HaltHassTimeSlot[]>(() => {
    const slots: HaltHassTimeSlot[] = []
    for (let hour = 6; hour <= 22; hour++) {
      slots.push({
        key: `${String(hour).padStart(2, '0')}00`,
        label: `${String(hour).padStart(2, '0')}:00`,
        isHalf: false,
      })
    }
    return slots
  })

  const timeKeyToIndex = computed(() => {
    const map: Record<string, number> = {}
    timeSlots.value.forEach((slot, index) => {
      map[slot.key] = index
    })
    return map
  })

  const filteredOrders = computed(() => {
    const keyword = searchKeyword.value.trim().toLowerCase()
    return workOrders.value.filter((order) => {
      if (!visibleOrderStatuses.includes(order.status)) return false
      if (!keyword) return true
      const boardNames = (order.boardGroup?.boards || []).map((board) => `${board.name || ''} ${board.code || ''}`).join(' ')
      return [
        order.orderNo,
        order.boardGroup?.name,
        order.process?.name,
        order.process?.version,
        order.remark,
        boardNames,
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  })

  const selectedScheduledOrderInfo = computed(() => {
    if (!selectedScheduledOrder.value) return null
    const event = scheduledEvents.value[selectedScheduledOrder.value]
    return event ? getOrderById(event.orderId) : null
  })

  function getCellKey(dateStr: string, timeKey: string) {
    return `${dateStr}_${timeKey}`
  }

  function getOrderById(orderId: string) {
    return workOrders.value.find((order) => getOrderKey(order) === orderId)
  }

  function parseBackendDateTime(value?: string | null) {
    if (!value) return null
    const text = value.includes('T') ? value : value.replace(' ', 'T')
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  function eventFromScheduleRange(
    order: HaltHassOrder,
    startValue?: string | null,
    endValue?: string | null,
    suffix = ''
  ): ScheduledEvent | null {
    const start = parseBackendDateTime(startValue)
    const end = parseBackendDateTime(endValue)
    if (!start || !end || end <= start) return null

    const startTimeKey = `${String(start.getHours()).padStart(2, '0')}00`
    const startIdx = timeKeyToIndex.value[startTimeKey]
    if (startIdx === undefined || startIdx >= timeSlots.value.length - 1) return null

    const span = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (60 * 60 * 1000)))
    const maxSpan = Math.max(1, timeSlots.value.length - 1 - startIdx)
    const dateStr = fmtDate(start)
    const orderId = getOrderKey(order)
    return {
      eventId: `${orderId}-${dateStr}-${startTimeKey}-${end.getTime()}${suffix}`,
      orderId,
      dateStr,
      startTimeKey,
      span: Math.min(span, maxSpan),
    }
  }

  function eventsFromOrderSchedule(order: HaltHassOrder): ScheduledEvent[] {
    const segmentEvents = (order.scheduleSegments || [])
      .map((segment, index) => eventFromScheduleRange(
        order,
        segment.scheduledStartAt || segment.scheduled_start_at,
        segment.scheduledEndAt || segment.scheduled_end_at,
        `-${index}`,
      ))
      .filter((event): event is ScheduledEvent => Boolean(event))

    if (segmentEvents.length) return segmentEvents
    const event = eventFromOrderSchedule(order)
    return event ? [event] : []
  }

  function eventFromOrderSchedule(order: HaltHassOrder): ScheduledEvent | null {
    return eventFromScheduleRange(order, order.scheduledStartAt, order.scheduledEndAt)
  }

  function restoreScheduledEvents(orders: HaltHassOrder[]) {
    const next: Record<string, ScheduledEvent> = {}
    orders.forEach((order) => {
      eventsFromOrderSchedule(order).forEach((event) => {
        next[event.eventId] = event
      })
    })
    scheduledEvents.value = next
  }

  async function refreshWorkOrders() {
    workOrdersLoading.value = true
    try {
      const byId = new Map<number, HaltHassOrder>()
      const pageSize = 100
      let requestFailed = false

      for (const status of visibleOrderStatuses) {
        let page = 1
        let loaded = 0
        let total = Infinity

        while (loaded < total) {
          const resp = await listHaltHassOrders({ page, pageSize, status })
          if (!resp.success || !resp.data || resp.data.code !== 0) {
            requestFailed = true
            break
          }

          const list = resp.data.data.list
          list.map(mapHaltHassOrder).forEach((order) => byId.set(order.id, order))

          loaded += list.length
          total = resp.data.data.total
          if (list.length === 0) break
          page += 1
          if (page > 50) break
        }

        if (requestFailed) break
      }

      const nextOrders = Array.from(byId.values())
      const shouldUseFallbackMock = requestFailed && !nextOrders.length && !byId.has(MOCK_HALT_HASS_ORDER.id)
      if (shouldUseFallbackMock) {
        nextOrders.push(MOCK_HALT_HASS_ORDER)
      }
      workOrders.value = nextOrders
      restoreScheduledEvents(nextOrders)
      selectedScheduledOrder.value = selectedScheduledOrder.value && scheduledEvents.value[selectedScheduledOrder.value]
        ? selectedScheduledOrder.value
        : null
      if (shouldUseFallbackMock) {
        ElMessage.warning('未获取到真实 HALT-HASS 工单，已载入演示工单用于流程测试')
      } else if (requestFailed) {
        ElMessage.warning('部分 HALT-HASS 工单加载失败，请稍后重新读取本周排程')
      }
    } catch (error) {
      console.error('[halt-hass schedule] refresh failed:', error)
      workOrders.value = [MOCK_HALT_HASS_ORDER]
      restoreScheduledEvents(workOrders.value)
      ElMessage.warning('未获取到真实 HALT-HASS 工单，已载入演示工单用于流程测试')
    } finally {
      workOrdersLoading.value = false
    }
  }

  const scheduledOrders = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEvents.value).forEach((event) => {
      const cellKey = getCellKey(event.dateStr, event.startTimeKey)
      if (!map[cellKey]) map[cellKey] = []
      map[cellKey].push(event.eventId)
    })
    return map
  })

  type ScheduledLayoutItem = ScheduledEvent & {
    startIdx: number
    lane: number
    laneCount: number
    cellKey: string
  }

  const scheduledLayoutItems = computed<ScheduledLayoutItem[]>(() => {
    const dayMap: Record<string, ScheduledEvent[]> = {}
    Object.values(scheduledEvents.value).forEach((event) => {
      if (!dayMap[event.dateStr]) dayMap[event.dateStr] = []
      dayMap[event.dateStr].push(event)
    })

    const out: ScheduledLayoutItem[] = []
    Object.entries(dayMap).forEach(([dateStr, events]) => {
      const mapped = events
        .map((event) => ({
          event,
          startIdx: timeKeyToIndex.value[event.startTimeKey] ?? -1,
          span: Math.max(1, event.span),
        }))
        .filter((item) => item.startIdx >= 0)
        .map((item) => ({ ...item, endIdx: item.startIdx + item.span }))
        .sort((a, b) => a.startIdx - b.startIdx || a.event.eventId.localeCompare(b.event.eventId))

      const counts = new Array(timeSlots.value.length + 1).fill(0)
      mapped.forEach((item) => {
        counts[item.startIdx] += 1
        counts[item.endIdx] -= 1
      })
      for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1]

      const laneEnds: number[] = []
      const laneByEventId: Record<string, number> = {}
      mapped.forEach((item) => {
        let lane = laneEnds.findIndex((end) => end <= item.startIdx)
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(item.endIdx)
        } else {
          laneEnds[lane] = item.endIdx
        }
        laneByEventId[item.event.eventId] = lane
      })

      mapped.forEach((item) => {
        let laneCount = 1
        for (let i = item.startIdx; i < item.endIdx; i++) {
          laneCount = Math.max(laneCount, counts[i] || 0)
        }
        out.push({
          ...item.event,
          startIdx: item.startIdx,
          lane: laneByEventId[item.event.eventId] ?? 0,
          laneCount: Math.max(1, laneCount),
          cellKey: getCellKey(dateStr, item.event.startTimeKey),
        })
      })
    })

    return out
  })

  const maxLaneCount = computed(() => {
    if (!scheduledLayoutItems.value.length) return 1
    return Math.max(1, ...scheduledLayoutItems.value.map((item) => item.laneCount || 1))
  })

  function prevWeek() { calBase.value = addDays(calBase.value, -7) }
  function nextWeek() { calBase.value = addDays(calBase.value, 7) }
  function gotoDate(event: Event) {
    const value = (event.target as HTMLInputElement).value
    if (value) calBase.value = getMonday(new Date(value))
  }
  async function loadPresetSchedule() { await refreshWorkOrders() }

  function timeKeyToHour(timeKey: string) {
    const hour = timeKey.slice(0, 2)
    return /^\d{2}$/.test(hour) ? hour : ''
  }

  function getEndTimeKey(startTimeKey: string, span: number) {
    const startIdx = timeKeyToIndex.value[startTimeKey]
    if (startIdx === undefined) return ''
    return timeSlots.value[startIdx + Math.max(1, span)]?.key || ''
  }

  function getScheduleChangePayload(eventId = selectedScheduledOrder.value || '') {
    const event = scheduledEvents.value[eventId]
    if (!event) return null
    const endTimeKey = getEndTimeKey(event.startTimeKey, event.span)
    const startHour = timeKeyToHour(event.startTimeKey)
    const endHour = timeKeyToHour(endTimeKey)
    if (!endTimeKey || !startHour || !endHour) return null
    return {
      orderId: event.orderId,
      eventId: event.eventId,
      dateStr: event.dateStr,
      startTimeKey: event.startTimeKey,
      endTimeKey,
      span: event.span,
      startAtHour: `${event.dateStr} ${startHour}`,
      endAtHour: `${event.dateStr} ${endHour}`,
      scheduledStartAt: `${event.dateStr} ${startHour}:00:00`,
      scheduledEndAt: `${event.dateStr} ${endHour}:00:00`,
    }
  }

  function getOrderEvents(orderId: string) {
    return Object.values(scheduledEvents.value).filter((event) => event.orderId === orderId)
  }

  function setOrderEvents(orderId: string, events: ScheduledEvent[]) {
    const next = { ...scheduledEvents.value }
    Object.keys(next).forEach((eventId) => {
      if (next[eventId].orderId === orderId) delete next[eventId]
    })
    events.forEach((event) => {
      next[event.eventId] = event
    })
    scheduledEvents.value = next
  }

  async function persistScheduledEvent(orderId: string, eventId: string | null, fallback: ScheduledEvent[]) {
    const order = getOrderById(orderId)
    if (!order?.id) return true

    if (isMockHaltHassOrder(order)) {
      return true
    }

    const schedule = eventId ? getScheduleChangePayload(eventId) : null
    schedulePersisting.value = true
    try {
      const authOk = await initAuth()
      if (!authOk) {
        setOrderEvents(orderId, fallback)
        ElMessage.error('登录状态失效，请重新登录后再保存排程')
        return false
      }

      const resp = schedule
        ? await saveHaltHassOrderSchedule(
            order.id,
            {
              scheduled_start_at: schedule.scheduledStartAt,
              scheduled_end_at: schedule.scheduledEndAt,
            },
            getAuthHeaders()
          )
        : await clearHaltHassOrderSchedule(order.id, getAuthHeaders())

      if (!resp.success || !resp.data || resp.data.code !== 0) {
        setOrderEvents(orderId, fallback)
        ElMessage.error(resp.data?.msg || resp.error || '排程保存失败')
        return false
      }

      if (resp.data.data) {
        const scheduleData = resp.data.data as Record<string, unknown>
        const scheduleSegments = scheduleData.scheduleSegments ?? scheduleData.schedule_segments
        const updated: HaltHassOrder = {
          ...order,
          scheduledStartAt: (scheduleData.scheduledStartAt ?? scheduleData.scheduled_start_at ?? null) as string | null,
          scheduledEndAt: (scheduleData.scheduledEndAt ?? scheduleData.scheduled_end_at ?? null) as string | null,
          scheduleSegments: Array.isArray(scheduleSegments) ? scheduleSegments : [],
        }
        const restored = eventsFromOrderSchedule(updated)
        workOrders.value = workOrders.value.map((item) => getOrderKey(item) === orderId ? updated : item)
        setOrderEvents(orderId, restored)
        selectedScheduledOrder.value = restored[0]?.eventId || null
      }
      return true
    } finally {
      schedulePersisting.value = false
    }
  }

  function handleDragStart(event: DragEvent, order: HaltHassOrder) {
    const orderId = getOrderKey(order)
    draggedOrderId.value = orderId
    isDragging.value = true
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', orderId)
    }
    const target = event.target as HTMLElement
    setTimeout(() => {
      target.style.opacity = '0.5'
    }, 0)
  }

  function handleDragEnd(event: DragEvent) {
    const target = event.target as HTMLElement
    target.style.opacity = '1'
    draggedOrderId.value = null
    isDragging.value = false
  }

  function handleDragLeave(event: DragEvent) {
    ;(event.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
  }

  function scheduleOrder(orderId: string, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast || !orderId) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return

    const startIdx = timeKeyToIndex.value[timeKey]
    if (startIdx === undefined) return
    const fallback = getOrderEvents(orderId)
    const maxSpan = Math.max(1, timeSlots.value.length - 1 - startIdx)
    const eventId = `${orderId}-${dateStr}-${timeKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const event = {
      eventId,
      orderId,
      dateStr,
      startTimeKey: timeKey,
      span: Math.min(1, maxSpan),
    }
    setOrderEvents(orderId, [event])
    selectedScheduledOrder.value = eventId
    isDragging.value = false
    draggedOrderId.value = null
    void persistScheduledEvent(orderId, eventId, fallback)
  }

  function handleDrop(event: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    event.preventDefault()
    ;(event.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
    const orderId = event.dataTransfer?.getData('text/plain')
    if (!orderId) return
    scheduleOrder(orderId, dateStr, timeKey, isPast)
  }

  function handleUnschedule(_cellKey: string, orderId: string, eventId: string) {
    const fallback = getOrderEvents(orderId)
    if (selectedScheduledOrder.value === eventId) selectedScheduledOrder.value = null
    const next = { ...scheduledEvents.value }
    delete next[eventId]
    scheduledEvents.value = next
    void persistScheduledEvent(orderId, null, fallback)
  }

  function selectScheduledTask(eventId: string) {
    selectedScheduledOrder.value = selectedScheduledOrder.value === eventId ? null : eventId
  }

  const setEventSpan = (eventId: string, span: number) => {
    const event = scheduledEvents.value[eventId]
    if (!event) return
    const startIdx = timeKeyToIndex.value[event.startTimeKey]
    if (startIdx === undefined) return
    const nextSpan = Math.min(Math.max(1, timeSlots.value.length - 1 - startIdx), Math.max(1, span))
    scheduledEvents.value = { ...scheduledEvents.value, [eventId]: { ...event, span: nextSpan } }
  }

  const setEventStartAndSpan = (eventId: string, newStartIdx: number, newSpan: number) => {
    const event = scheduledEvents.value[eventId]
    if (!event) return
    const safeStartIdx = Math.max(0, Math.min(newStartIdx, timeSlots.value.length - 2))
    const safeSpan = Math.max(1, Math.min(newSpan, timeSlots.value.length - 1 - safeStartIdx))
    const newTimeKey = timeSlots.value[safeStartIdx]?.key
    if (!newTimeKey) return
    scheduledEvents.value = {
      ...scheduledEvents.value,
      [eventId]: { ...event, startTimeKey: newTimeKey, span: safeSpan },
    }
  }

  const resizing = ref<{ eventId: string; orderId: string; startY: number; originSpan: number; originStartIdx?: number; isTop?: boolean; fallback: ScheduledEvent[] } | null>(null)
  const resizingEventId = computed(() => resizing.value?.eventId || null)
  const isResizing = computed(() => !!resizing.value)

  const startResize = (eventId: string, event: MouseEvent) => {
    const scheduled = scheduledEvents.value[eventId]
    if (!scheduled) return
    resizing.value = {
      eventId,
      orderId: scheduled.orderId,
      startY: event.clientY,
      originSpan: scheduled.span,
      fallback: getOrderEvents(scheduled.orderId),
    }

    const onMove = (moveEvent: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx || ctx.isTop) return
      const delta = moveEvent.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      setEventSpan(ctx.eventId, ctx.originSpan + deltaSlots)
    }
    const onUp = () => {
      const ctx = resizing.value
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      if (ctx) void persistScheduledEvent(ctx.orderId, ctx.eventId, ctx.fallback)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (eventId: string, event: MouseEvent) => {
    const scheduled = scheduledEvents.value[eventId]
    if (!scheduled) return
    const startIdx = timeKeyToIndex.value[scheduled.startTimeKey]
    if (startIdx === undefined) return

    resizing.value = {
      eventId,
      orderId: scheduled.orderId,
      startY: event.clientY,
      originSpan: scheduled.span,
      originStartIdx: startIdx,
      isTop: true,
      fallback: getOrderEvents(scheduled.orderId),
    }

    const onMove = (moveEvent: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx?.isTop || ctx.originStartIdx === undefined) return
      const delta = moveEvent.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      const newSpan = ctx.originSpan - deltaSlots
      if (newSpan < 1) return
      setEventStartAndSpan(ctx.eventId, ctx.originStartIdx + deltaSlots, newSpan)
    }
    const onUp = () => {
      const ctx = resizing.value
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      if (ctx) void persistScheduledEvent(ctx.orderId, ctx.eventId, ctx.fallback)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  onMounted(() => {
    void refreshWorkOrders()
  })

  return {
    searchKeyword,
    workOrdersLoading,
    schedulePersisting,
    selectedScheduledOrder,
    selectedScheduledOrderInfo,
    filteredOrders,
    currentWeekDays,
    weekLabel,
    timeSlots,
    slotHeightPx,
    scheduledOrders,
    scheduledLayoutItems,
    maxLaneCount,
    isDragging,
    calBase,
    fmtDate,
    getCellKey,
    getOrderById,
    prevWeek,
    nextWeek,
    gotoDate,
    loadPresetSchedule,
    refreshWorkOrders,
    handleDragStart,
    handleDragEnd,
    handleDragLeave,
    handleDrop,
    handleUnschedule,
    selectScheduledTask,
    scheduleOrder,
    startResize,
    startResizeTop,
    resizingEventId,
    isResizing,
    getScheduleChangePayload,
  }
}

export type HaltHassScheduleContext = ReturnType<typeof useHaltHassSchedule>
