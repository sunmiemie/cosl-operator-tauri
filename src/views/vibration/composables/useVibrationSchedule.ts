import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { TimeSlot, VibrationInstrument, WeekDay, WorkOrder } from '../types'
import {
  clearVibrationTableOrderSchedule,
  listVibrationTableOrders,
  saveVibrationTableOrderSchedule,
  type VibrationTableOrderDTO,
} from '@/services/vibration-table-order-api'
import { useAuth } from '@/composables/useAuth'

function getMonday(d: Date) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(dt.setDate(diff))
}

function addDays(d: Date, days: number) {
  const result = new Date(d)
  result.setDate(result.getDate() + days)
  return result
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useVibrationSchedule() {
  const { initAuth, getAuthHeaders } = useAuth()
  const searchKeyword = ref('')
  const draggedOrder = ref<WorkOrder | null>(null)
  const selectedScheduledOrderIds = ref<string[]>([])
  const isDragging = ref(false)
  const slotHeightPx = 44

  const workOrders = ref<WorkOrder[]>([])
  const workOrdersLoading = ref(false)
  const orderStatusMutating = ref(false)

  const visibleOrderStatuses = [1, 2]

  function normalizeVibrationInstruments(dto: VibrationTableOrderDTO): VibrationInstrument[] {
    const rawList =
      dto.instruments ||
      dto.order_instruments ||
      dto.vibration_table_order_instruments ||
      dto.vibration_table_order_instrument ||
      []
    const list = Array.isArray(rawList) ? rawList : rawList ? [rawList] : []
    if (list.length) {
      return list.map((item, index) => {
        const dbId = item.id ?? item.instrument_id ?? item.instrumentId
        const name =
          item.instrument_name ||
          item.instrumentName ||
          item.name ||
          item.device_name ||
          dto.device_name ||
          `仪器${index + 1}`
        const sn =
          item.instrument_sn ||
          item.instrumentSn ||
          item.sn_numbers ||
          item.sn ||
          item.device_number ||
          item.deviceNumber ||
          item.code ||
          `${dto.order_no}-${index + 1}`
        return {
          id: `vib-ins-${dto.id}-${dbId ?? sn ?? index}`,
          dbId,
          name,
          sn,
          model: item.model,
          remark: item.remark,
          completed: item.is_completed === true,
        }
      })
    }

    const fallbackSn = (dto as any).device_number || (dto as any).deviceNumber || dto.order_no
    return [{
      id: `vib-ins-${dto.id}-${fallbackSn}`,
      name: dto.device_name || '振动台仪器',
      sn: fallbackSn,
      completed: false,
    }]
  }

  function mapVibrationTableOrder(dto: VibrationTableOrderDTO): WorkOrder {
    const instruments = normalizeVibrationInstruments(dto)
    return {
      id: dto.order_no,
      dbId: dto.id,
      status: dto.status,
      statusText: dto.status_text,
      scheduledStartAt: dto.scheduled_start_at || null,
      scheduledEndAt: dto.scheduled_end_at || null,
      planTime: dto.planned_time || dto.test_date || dto.application_date || null,
      deviceNumber: (dto as any).device_number || (dto as any).deviceNumber || '',
      type: '正式实验',
      applicant: dto.applicant || '',
      phone: dto.applicant_phone || '',
      device: dto.device_name,
      level: dto.level,
      duration: dto.duration,
      purpose: dto.test_purpose || dto.remark || '无',
      instruments,
    }
  }

  async function refreshWorkOrders() {
    workOrdersLoading.value = true
    try {
      const pageSize = 100
      const byId = new Map<string, WorkOrder>()
      for (const status of visibleOrderStatuses) {
        let page = 1
        let loaded = 0
        let total = Infinity

        while (loaded < total) {
          const resp = await listVibrationTableOrders({ page, pageSize, status })
          if (!resp.success || !resp.data || resp.data.code !== 0) break

          const list = resp.data.data.list
          list
            .filter(o => o.status === status)
            .map(mapVibrationTableOrder)
            .forEach(order => byId.set(order.id, order))

          loaded += list.length
          total = resp.data.data.total

          if (list.length === 0) break
          page += 1
          if (page > 50) break
        }
      }
      const nextOrders = Array.from(byId.values())
      workOrders.value = nextOrders
      restoreScheduledEvents(nextOrders)
      selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => byId.has(id))
    } catch (e) {
      console.error('refreshWorkOrders error:', e)
    } finally {
      workOrdersLoading.value = false
    }
  }

  const calBase = ref(getMonday(new Date()))

  const currentWeekDays = computed<WeekDay[]>(() => {
    const days: WeekDay[] = []
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

  const timeSlots = computed<TimeSlot[]>(() => {
    const slots: TimeSlot[] = []
    for (let hour = 6; hour <= 22; hour++) {
      slots.push({
        key: `${String(hour).padStart(2, '0')}00`,
        label: `${String(hour).padStart(2, '0')}:00`,
        isHalf: false,
      })
    }
    return slots
  })

  const getCellKey = (dateStr: string, timeKey: string) => `${dateStr}_${timeKey}`

  type ScheduledEvent = {
    orderId: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent>>({})
  const pendingScheduleEvents = ref<Record<string, ScheduledEvent | null>>({})

  function markPendingSchedule(orderId: string, event: ScheduledEvent | null) {
    pendingScheduleEvents.value = {
      ...pendingScheduleEvents.value,
      [orderId]: event ? { ...event } : null,
    }
  }

  function clearPendingSchedule(orderId: string) {
    const next = { ...pendingScheduleEvents.value }
    delete next[orderId]
    pendingScheduleEvents.value = next
  }

  function parseBackendDateTime(value?: string | null) {
    if (!value) return null
    const text = value.includes('T') ? value : value.replace(' ', 'T')
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  function eventFromOrder(order: WorkOrder): ScheduledEvent | null {
    const start = parseBackendDateTime(order.scheduledStartAt)
    const end = parseBackendDateTime(order.scheduledEndAt)
    if (!start || !end || end <= start) return null
    const startTimeKey = `${String(start.getHours()).padStart(2, '0')}00`
    if (timeKeyToIndex.value[startTimeKey] === undefined) return null
    const span = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (60 * 60 * 1000)))
    return {
      orderId: order.id,
      dateStr: fmtDate(start),
      startTimeKey,
      span,
    }
  }

  function restoreScheduledEvents(orders: WorkOrder[]) {
    const next: Record<string, ScheduledEvent> = {}
    orders.forEach((order) => {
      const ev = eventFromOrder(order)
      if (ev) next[order.id] = ev
    })
    Object.entries(pendingScheduleEvents.value).forEach(([orderId, event]) => {
      if (event) {
        next[orderId] = event
      } else {
        delete next[orderId]
      }
    })
    scheduledEvents.value = next
  }

  const timeKeyToIndex = computed(() => {
    const map: Record<string, number> = {}
    timeSlots.value.forEach((s, idx) => {
      map[s.key] = idx
    })
    return map
  })

  const timeKeyToHour = (timeKey: string) => {
    const hh = timeKey.slice(0, 2)
    if (!/^\d{2}$/.test(hh)) return ''
    return hh
  }

  const getEndTimeKey = (startTimeKey: string, span: number) => {
    const startIdx = timeKeyToIndex.value[startTimeKey]
    if (startIdx === undefined) return ''
    const endIdx = startIdx + Math.max(1, span)
    return timeSlots.value[endIdx]?.key || ''
  }

  const getScheduleChangePayload = (orderId: string) => {
    const ev = scheduledEvents.value[orderId]
    if (!ev) return null
    const endTimeKey = getEndTimeKey(ev.startTimeKey, ev.span)
    if (!endTimeKey) return null
    const startHh = timeKeyToHour(ev.startTimeKey)
    const endHh = timeKeyToHour(endTimeKey)
    if (!startHh || !endHh) return null
    return {
      orderId: ev.orderId,
      dateStr: ev.dateStr,
      startTimeKey: ev.startTimeKey,
      endTimeKey,
      span: ev.span,
      startAtHour: `${ev.dateStr} ${startHh}`,
      endAtHour: `${ev.dateStr} ${endHh}`,
      scheduledStartAt: `${ev.dateStr} ${startHh}:00:00`,
      scheduledEndAt: `${ev.dateStr} ${endHh}:00:00`,
    }
  }

  async function persistScheduledEvent(orderId: string, fallback?: ScheduledEvent) {
    const order = getOrderById(orderId)
    const schedule = getScheduleChangePayload(orderId)
    if (!order?.dbId || !schedule) return true

    markPendingSchedule(orderId, scheduledEvents.value[orderId] || null)
    try {
      const authOk = await initAuth()
      if (!authOk) {
        if (fallback) {
          scheduledEvents.value = { ...scheduledEvents.value, [orderId]: fallback }
        }
        ElMessage.error('登录状态失效，请重新登录后再保存排期')
        return false
      }
      const resp = await saveVibrationTableOrderSchedule(
        order.dbId,
        {
          scheduled_start_at: schedule.scheduledStartAt,
          scheduled_end_at: schedule.scheduledEndAt,
        },
        getAuthHeaders()
      )
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        if (fallback) {
          scheduledEvents.value = { ...scheduledEvents.value, [orderId]: fallback }
        }
        ElMessage.error(resp.data?.msg || resp.error || '排期保存失败')
        return false
      }
      const saved = resp.data.data
      if (saved) {
        const updated = mapVibrationTableOrder(saved)
        const savedEvent = eventFromOrder(updated)
        workOrders.value = workOrders.value.map(item => item.id === updated.id ? updated : item)
        if (savedEvent) {
          scheduledEvents.value = { ...scheduledEvents.value, [updated.id]: savedEvent }
        }
      }
      return true
    } finally {
      clearPendingSchedule(orderId)
    }
  }

  const scheduledOrders = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEvents.value).forEach((ev) => {
      const cellKey = getCellKey(ev.dateStr, ev.startTimeKey)
      if (!map[cellKey]) map[cellKey] = []
      map[cellKey].push(ev.orderId)
    })
    return map
  })

  type ScheduledLayoutItem = {
    orderId: string
    dateStr: string
    startTimeKey: string
    startIdx: number
    span: number
    lane: number
    laneCount: number
    cellKey: string
  }

  const scheduledLayoutItems = computed<ScheduledLayoutItem[]>(() => {
    const dayMap: Record<string, ScheduledEvent[]> = {}
    Object.values(scheduledEvents.value).forEach((ev) => {
      if (!dayMap[ev.dateStr]) dayMap[ev.dateStr] = []
      dayMap[ev.dateStr].push(ev)
    })

    const out: ScheduledLayoutItem[] = []

    Object.entries(dayMap).forEach(([dateStr, evs]) => {
      const mapped = evs
        .map((ev) => {
          const startIdx = timeKeyToIndex.value[ev.startTimeKey]
          return { ev, startIdx: startIdx ?? -1, span: Math.max(1, ev.span) }
        })
        .filter((x) => x.startIdx >= 0)
        .map((x) => ({ ...x, endIdx: x.startIdx + x.span }))
        .sort((a, b) => a.startIdx - b.startIdx || a.ev.orderId.localeCompare(b.ev.orderId))

      const counts = new Array(timeSlots.value.length + 1).fill(0)
      mapped.forEach((x) => {
        counts[x.startIdx] += 1
        counts[x.endIdx] -= 1
      })
      for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1]

      const laneEnds: number[] = []
      const laneByOrderId: Record<string, number> = {}
      mapped.forEach((x) => {
        let lane = laneEnds.findIndex((le) => le <= x.startIdx)
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(x.endIdx)
        } else {
          laneEnds[lane] = x.endIdx
        }
        laneByOrderId[x.ev.orderId] = lane
      })

      mapped.forEach((x) => {
        const cellKey = getCellKey(dateStr, x.ev.startTimeKey)
        let laneCount = 1
        for (let i = x.startIdx; i < x.endIdx; i++) {
          laneCount = Math.max(laneCount, counts[i] || 0)
        }
        out.push({
          orderId: x.ev.orderId,
          dateStr,
          startTimeKey: x.ev.startTimeKey,
          startIdx: x.startIdx,
          span: x.span,
          lane: laneByOrderId[x.ev.orderId] ?? 0,
          laneCount: Math.max(1, laneCount),
          cellKey,
        })
      })
    })

    return out
  })

  const maxLaneCount = computed(() => {
    if (!scheduledLayoutItems.value.length) return 1
    return Math.max(1, ...scheduledLayoutItems.value.map((x) => x.laneCount || 1))
  })

  const handleWindowFocus = () => {
    if (workOrdersLoading.value) return
    refreshWorkOrders()
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return
    if (workOrdersLoading.value) return
    refreshWorkOrders()
  }

  onMounted(() => {
    refreshWorkOrders()
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('focus', handleWindowFocus)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  const getOrderById = (id: string) => workOrders.value.find(w => w.id === id)

  const unscheduledOrders = computed(() => {
    const scheduled = new Set(Object.keys(scheduledEvents.value))
    const kw = searchKeyword.value.trim()
    return workOrders.value.filter(o => {
      if (scheduled.has(o.id)) return false
      if (!kw) return true
      return (
        o.id.includes(kw) ||
        o.applicant.includes(kw) ||
        o.device.includes(kw) ||
        o.type.includes(kw) ||
        o.level.includes(kw) ||
        o.instruments.some((item) => item.name.includes(kw) || item.sn.includes(kw))
      )
    })
  })

  const selectedScheduledOrders = computed(() => {
    return selectedScheduledOrderIds.value.map(id => getOrderById(id)).filter(Boolean) as WorkOrder[]
  })

  function prevWeek() { calBase.value = addDays(calBase.value, -7) }
  function nextWeek() { calBase.value = addDays(calBase.value, 7) }
  function gotoDate(e: Event) {
    const val = (e.target as HTMLInputElement).value
    if (val) calBase.value = getMonday(new Date(val))
  }

  function handleDragStart(e: DragEvent, order: WorkOrder) {
    draggedOrder.value = order
    isDragging.value = true
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', order.id)
    }
    const target = e.target as HTMLElement
    setTimeout(() => { target.style.opacity = '0.5' }, 0)
  }

  function handleDragEnd(e: DragEvent) {
    const target = e.target as HTMLElement
    target.style.opacity = '1'
    draggedOrder.value = null
    isDragging.value = false
  }

  function handleDragOver(e: DragEvent, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  async function scheduleOrder(orderId: string, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return
    if (scheduledEvents.value[orderId]) return
    const previousEvents = { ...scheduledEvents.value }
    const previousSelected = [...selectedScheduledOrderIds.value]
    const order = getOrderById(orderId)
    const span = Math.max(1, Math.ceil(Number(order?.duration || 0) / 60) || 1)
    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, (timeSlots.value.length - 1) - startIdx)
    scheduledEvents.value = {
      ...scheduledEvents.value,
      [orderId]: { orderId, dateStr, startTimeKey: timeKey, span: Math.min(span, maxSpan) },
    }
    selectedScheduledOrderIds.value = [orderId]
    if (isDragging.value) {
      isDragging.value = false
      draggedOrder.value = null
    }
    try {
      const saved = await persistScheduledEvent(orderId)
      if (!saved) {
        scheduledEvents.value = previousEvents
        selectedScheduledOrderIds.value = previousSelected
      }
    } catch (error) {
      scheduledEvents.value = previousEvents
      selectedScheduledOrderIds.value = previousSelected
      ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
    }
  }

  async function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    if (!e.dataTransfer) return
    const orderId = e.dataTransfer.getData('text/plain')
    if (!orderId) return
    await scheduleOrder(orderId, dateStr, timeKey, isPast)
  }

  async function handleUnschedule(_cellKey: string, orderId: string) {
    const next = { ...scheduledEvents.value }
    const removed = next[orderId]
    const wasSelected = selectedScheduledOrderIds.value.includes(orderId)
    delete next[orderId]
    scheduledEvents.value = next
    if (wasSelected) {
      selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
    }
    const order = getOrderById(orderId)
    if (!order?.dbId) return
    markPendingSchedule(orderId, null)

    const rollback = () => {
      if (removed) scheduledEvents.value = { ...scheduledEvents.value, [orderId]: removed }
      if (wasSelected) selectedScheduledOrderIds.value = [...selectedScheduledOrderIds.value, orderId]
    }

    try {
      const authOk = await initAuth()
      if (!authOk) {
        rollback()
        ElMessage.error('登录状态失效，请重新登录后再取消排期')
        return
      }
      const resp = await clearVibrationTableOrderSchedule(order.dbId, getAuthHeaders())
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        rollback()
        ElMessage.error(resp.data?.msg || resp.error || '取消排期失败')
        return
      }
      const saved = resp.data.data
      if (saved) {
        const updated = mapVibrationTableOrder(saved)
        workOrders.value = workOrders.value.map(item => item.id === updated.id ? updated : item)
      }
    } catch (error) {
      rollback()
      ElMessage.error(error instanceof Error ? error.message : '取消排期失败')
    } finally {
      clearPendingSchedule(orderId)
    }
  }

  function removeScheduledOrder(orderId: string) {
    if (!orderId) return
    const next = { ...scheduledEvents.value }
    delete next[orderId]
    scheduledEvents.value = next
    selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
  }

  function selectScheduledOrder(orderId: string) {
    const arr = selectedScheduledOrderIds.value
    selectedScheduledOrderIds.value = arr.includes(orderId) ? arr.filter(id => id !== orderId) : [...arr, orderId]
  }

  const getEvent = (orderId: string) => scheduledEvents.value[orderId]

  const setEventSpan = (orderId: string, span: number) => {
    const ev = scheduledEvents.value[orderId]
    if (!ev) return
    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    if (nextSpan === ev.span) return
    scheduledEvents.value = { ...scheduledEvents.value, [orderId]: { ...ev, span: nextSpan } }
  }

  const resizing = ref<{ orderId: string; startY: number; originSpan: number; originStartIdx: number; mode: 'bottom' | 'top' } | null>(null)
  const resizingOrderId = computed(() => resizing.value?.orderId || null)
  const isResizing = computed(() => !!resizing.value)

  const setEventStartAndSpan = (orderId: string, startIdx: number, span: number) => {
    const ev = scheduledEvents.value[orderId]
    if (!ev) return
    const maxStartIdx = Math.max(0, timeSlots.value.length - 2)
    const nextStartIdx = Math.max(0, Math.min(maxStartIdx, startIdx))
    const nextStartKey = timeSlots.value[nextStartIdx]?.key
    if (!nextStartKey) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - nextStartIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    scheduledEvents.value = { ...scheduledEvents.value, [orderId]: { ...ev, startTimeKey: nextStartKey, span: nextSpan } }
  }

  function persistResizeChange(orderId: string, previous: ScheduledEvent) {
    void persistScheduledEvent(orderId, previous).catch((error) => {
      scheduledEvents.value = { ...scheduledEvents.value, [orderId]: previous }
      ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
    })
  }

  const startResize = (orderId: string, e: MouseEvent) => {
    const ev = scheduledEvents.value[orderId]
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { orderId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'bottom' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      if (ctx.mode === 'bottom') {
        setEventSpan(ctx.orderId, ctx.originSpan + deltaSlots)
        return
      }
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.orderId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      const previous = ev
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      persistResizeChange(orderId, previous)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (orderId: string, e: MouseEvent) => {
    const ev = scheduledEvents.value[orderId]
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { orderId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'top' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.orderId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      const previous = ev
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      persistResizeChange(orderId, previous)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return {
    workOrders,
    searchKeyword,
    workOrdersLoading,
    orderStatusMutating,
    refreshWorkOrders,
    selectedScheduledOrderIds,
    selectedScheduledOrders,
    calBase,
    currentWeekDays,
    weekLabel,
    timeSlots,
    scheduledOrders,
    scheduledLayoutItems,
    maxLaneCount,
    slotHeightPx,
    isDragging,
    unscheduledOrders,
    getOrderById,
    getCellKey,
    getMonday,
    addDays,
    fmtDate,
    prevWeek,
    nextWeek,
    gotoDate,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    scheduleOrder,
    handleUnschedule,
    removeScheduledOrder,
    selectScheduledOrder,
    getEvent,
    startResize,
    startResizeTop,
    getScheduleChangePayload,
    resizingOrderId,
    isResizing,
  }
}
