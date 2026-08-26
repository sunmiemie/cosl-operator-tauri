import { computed, ref } from 'vue'
import type { CalendarDay, TimeSlot, WorkOrder } from '../types'
import extractedData from '../extracted_fields.json'

function getMonday(d: Date) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function addDays(d: Date, days: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

function fmtDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useSimulationWellSchedule() {
  const searchKeyword = ref('')
  const draggedOrder = ref<WorkOrder | null>(null)
  const isDragging = ref(false)
  const slotHeightPx = 44

  type ScheduledEvent = {
    orderId: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent>>({})
  const scheduledEventsTentative = ref<Record<string, ScheduledEvent>>({})
  const selectedScheduledOrderIds = ref<string[]>([])

  const workOrders = ref<WorkOrder[]>(extractedData.map(item => ({
    id: item.tableRefNo,
    customer: item.fileName.split(' ')[0] || "未知客户",
    devices: item.testProducts.length,
    status: "approved",
    createTime: "2026-03-01",
    planTime: "2026-03-17", // 默认设为今天以便测试显示
    taskDesc: item.fileName,
    orderType: 0,
    deviceList: item.testProducts.map(p => ({
      id: p.code,
      name: p.zh,
      code: p.code,
      template: p.code
    })),
    supportingTools: item.supportingTools.map(s => ({
      id: s.code,
      name: s.zh,
      code: s.code,
      template: s.code
    }))
  })))

  const calBase = ref(getMonday(new Date()))
  const currentWeekDays = computed<CalendarDay[]>(() => {
    const days: CalendarDay[] = []
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
    const s = currentWeekDays.value[0]
    const e = currentWeekDays.value[6]
    void s
    void e
    return ''
  })

  const timeSlots = computed<TimeSlot[]>(() => {
    const slots: TimeSlot[] = []
    for (let h = 6; h <= 22; h++) {
      slots.push({ key: `${String(h).padStart(2, '0')}00`, label: `${String(h).padStart(2, '0')}:00`, isHalf: false })
    }
    return slots
  })

  function getCellKey(dateStr: string, timeKey: string) {
    return `${dateStr}_${timeKey}`
  }

  const timeKeyToIndex = computed(() => {
    const map: Record<string, number> = {}
    timeSlots.value.forEach((s, idx) => {
      map[s.key] = idx
    })
    return map
  })

  const scheduledOrders = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEvents.value).forEach((ev) => {
      const cellKey = getCellKey(ev.dateStr, ev.startTimeKey)
      if (!map[cellKey]) map[cellKey] = []
      map[cellKey].push(ev.orderId)
    })
    return map
  })

  const scheduledOrdersTentative = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEventsTentative.value).forEach((ev) => {
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
    isTentative: boolean
  }

  const scheduledLayoutItems = computed<ScheduledLayoutItem[]>(() => {
    const dayMap: Record<string, Array<ScheduledEvent & { isTentative: boolean }>> = {}
    Object.values(scheduledEvents.value).forEach((ev) => {
      if (!dayMap[ev.dateStr]) dayMap[ev.dateStr] = []
      dayMap[ev.dateStr].push({ ...ev, isTentative: false })
    })
    Object.values(scheduledEventsTentative.value).forEach((ev) => {
      if (!dayMap[ev.dateStr]) dayMap[ev.dateStr] = []
      dayMap[ev.dateStr].push({ ...ev, isTentative: true })
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
          isTentative: x.ev.isTentative,
        })
      })
    })

    return out
  })

  const maxLaneCount = computed(() => {
    if (!scheduledLayoutItems.value.length) return 1
    return Math.max(1, ...scheduledLayoutItems.value.map((x) => x.laneCount || 1))
  })

  const todayDateStr = computed(() => fmtDate(new Date()))
  const todayScheduledOrderIds = computed(() => {
    const ids = new Set<string>()
    Object.values(scheduledEvents.value).forEach((ev) => {
      if (ev.dateStr === todayDateStr.value) ids.add(ev.orderId)
    })
    return Array.from(ids)
  })

  const todayScheduledOrders = computed(() => {
    return todayScheduledOrderIds.value
      .map(id => workOrders.value.find(o => o.id === id))
      .filter(Boolean) as WorkOrder[]
  })

  const unscheduledOrders = computed(() => {
    const scheduledIds = new Set([...Object.keys(scheduledEvents.value), ...Object.keys(scheduledEventsTentative.value)])
    const kw = searchKeyword.value.trim()
    return workOrders.value.filter(o => {
      if (scheduledIds.has(o.id)) return false
      if (o.status === 'completed') return false
      if (!kw) return true
      const deviceNames = (o.deviceList || []).map(d => d.name).join(' ')
      return o.id.includes(kw) || o.customer.includes(kw) || deviceNames.includes(kw) || (o.taskDesc || '').includes(kw)
    })
  })

  function prevWeek() {
    calBase.value = addDays(calBase.value, -7)
  }

  function nextWeek() {
    calBase.value = addDays(calBase.value, 7)
  }

  function gotoDate(e: Event) {
    const val = (e.target as HTMLInputElement).value
    if (!val) return
    calBase.value = getMonday(new Date(val))
  }

  function loadPresetSchedule() {
    const base = calBase.value
    const firstThreeIds = workOrders.value.slice(0, 3).map(o => o.id)
    if (firstThreeIds.length < 3) return

    const presets = [
      { d: 0, t: '0800', id: firstThreeIds[0] },
      { d: 0, t: '1000', id: firstThreeIds[1] },
      { d: 1, t: '1400', id: firstThreeIds[2] },
    ]
    const globalScheduled = new Set([...Object.keys(scheduledEvents.value), ...Object.keys(scheduledEventsTentative.value)])
    presets.forEach(p => {
      if (globalScheduled.has(p.id)) return
      const d = addDays(base, p.d)
      scheduleOrder(p.id, fmtDate(d), p.t, false, false)
    })
  }

  function initializeScheduleFromPlanTime() {
    const timeKeys = timeSlots.value.map(s => s.key).filter(k => k !== timeSlots.value[timeSlots.value.length - 1]?.key)
    let idx = 0
    workOrders.value.forEach(order => {
      if (order.status === 'completed' || !order.planTime) return
      const dateStr = order.planTime.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
      const alreadyScheduled = !!scheduledEvents.value[order.id] || !!scheduledEventsTentative.value[order.id]
      if (alreadyScheduled) return
      const preferred = timeKeys[idx % timeKeys.length]
      idx += 1
      const candidateKeys = [preferred, ...timeKeys.filter(t => t !== preferred)]
      const targetTime = candidateKeys.find(t => (scheduledOrders.value[getCellKey(dateStr, t)] || []).length === 0)
      if (!targetTime) return
      scheduleOrder(order.id, dateStr, targetTime, false, false)
    })
  }

  initializeScheduleFromPlanTime()

  function handleDragStart(e: DragEvent, order: WorkOrder) {
    draggedOrder.value = order
    isDragging.value = true
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', order.id)
    }
  }

  function handleDragEnd() {
    draggedOrder.value = null
    isDragging.value = false
  }

  function handleDragOver(e: DragEvent, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
  }

  function handleDragLeave() {}

  function scheduleOrder(orderId: string, dateStr: string, timeKey: string, isPast: boolean, isTentative: boolean) {
    if (isPast) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return
    if (scheduledEvents.value[orderId] || scheduledEventsTentative.value[orderId]) return
    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const nextEvent: ScheduledEvent = { orderId, dateStr, startTimeKey: timeKey, span: Math.min(1, maxSpan) }

    if (isTentative) {
      scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [orderId]: nextEvent }
    } else {
      scheduledEvents.value = { ...scheduledEvents.value, [orderId]: nextEvent }
    }

    if (isDragging.value) {
      isDragging.value = false
      draggedOrder.value = null
    }
  }

  function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    const orderId = e.dataTransfer?.getData('text/plain') || draggedOrder.value?.id
    if (!orderId) return
    const isTentative = !!(e && (e.shiftKey || (e as DragEvent & { altKey?: boolean }).altKey))
    scheduleOrder(orderId, dateStr, timeKey, isPast, isTentative)
  }

  function handleUnschedule(cellKey: string, oid: string) {
    void cellKey
    const next = { ...scheduledEvents.value }
    delete next[oid]
    scheduledEvents.value = next
    selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(x => x !== oid)
  }

  function handleUnscheduleTentative(cellKey: string, oid: string) {
    void cellKey
    const next = { ...scheduledEventsTentative.value }
    delete next[oid]
    scheduledEventsTentative.value = next
  }

  function handleSelectScheduledOrder(oid: string) {
    const set = new Set(selectedScheduledOrderIds.value)
    if (set.has(oid)) set.delete(oid)
    else set.add(oid)
    selectedScheduledOrderIds.value = Array.from(set)
  }

  function getWorkOrderById(id: string) {
    return workOrders.value.find(o => o.id === id)
  }

  const getEvent = (orderId: string) => {
    const normal = scheduledEvents.value[orderId]
    if (normal) return { ...normal, isTentative: false }
    const tentative = scheduledEventsTentative.value[orderId]
    if (tentative) return { ...tentative, isTentative: true }
    return null
  }

  const setEventSpan = (orderId: string, span: number) => {
    const ev = getEvent(orderId)
    if (!ev) return
    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    if (nextSpan === ev.span) return
    const next = { orderId, dateStr: ev.dateStr, startTimeKey: ev.startTimeKey, span: nextSpan }
    if (ev.isTentative) scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [orderId]: next }
    else scheduledEvents.value = { ...scheduledEvents.value, [orderId]: next }
  }

  const resizing = ref<{ orderId: string; startY: number; originSpan: number; originStartIdx: number; mode: 'bottom' | 'top' } | null>(null)
  const resizingOrderId = computed(() => resizing.value?.orderId || null)
  const isResizing = computed(() => !!resizing.value)

  const setEventStartAndSpan = (orderId: string, startIdx: number, span: number) => {
    const ev = getEvent(orderId)
    if (!ev) return
    const maxStartIdx = Math.max(0, timeSlots.value.length - 2)
    const nextStartIdx = Math.max(0, Math.min(maxStartIdx, startIdx))
    const nextStartKey = timeSlots.value[nextStartIdx]?.key
    if (!nextStartKey) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - nextStartIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    const next = { orderId, dateStr: ev.dateStr, startTimeKey: nextStartKey, span: nextSpan }
    if (ev.isTentative) scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [orderId]: next }
    else scheduledEvents.value = { ...scheduledEvents.value, [orderId]: next }
  }

  const startResize = (orderId: string, e: MouseEvent) => {
    const ev = getEvent(orderId)
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
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (orderId: string, e: MouseEvent) => {
    const ev = getEvent(orderId)
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
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return {
    searchKeyword,
    workOrders,
    calBase,
    currentWeekDays,
    weekLabel,
    timeSlots,
    scheduledOrders,
    scheduledOrdersTentative,
    scheduledLayoutItems,
    maxLaneCount,
    slotHeightPx,
    isDragging,
    scheduleOrder,
    selectedScheduledOrderIds,
    todayScheduledOrderIds,
    todayScheduledOrders,
    unscheduledOrders,
    fmtDate,
    getCellKey,
    prevWeek,
    nextWeek,
    gotoDate,
    loadPresetSchedule,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleUnschedule,
    handleUnscheduleTentative,
    handleSelectScheduledOrder,
    getWorkOrderById,
    startResize,
    startResizeTop,
    resizingOrderId,
    isResizing,
  }
}
