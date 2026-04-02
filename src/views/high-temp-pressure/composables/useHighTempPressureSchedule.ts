import { computed, ref } from 'vue'
import type { InstrumentItem, ScheduledSelection, TimeSlotItem, WeekDayItem, WorkOrder } from '../types'

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

export function useHighTempPressureSchedule() {
  const searchKeyword = ref('')
  const draggedOrder = ref<WorkOrder | null>(null)
  const selectedScheduledOrderIds = ref<string[]>([])
  const isDragging = ref(false)
  const slotHeightPx = 44

  type ScheduledEvent = {
    instrumentId: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent>>({})

  const workOrders = ref<WorkOrder[]>([
    {
      id: 'wo-A',
      no: 'WO-123',
      entrustNo: 'ENT-2026-001',
      applicant: '申请人A',
      applicantUnit: '单位甲',
      applyDate: '2026-03-01',
      receivingNo: 'RCV-0001',
      vesselType: '250L',
      type: '250L',
      targetTemp: '180 °C',
      targetPressure: '15 MPa',
      keepCondition: '30min 保温保压',
      status: '待排程',
      expanded: false,
      items: [
        { id: 'ins-A1', label: '仪器名: SN', sn: 'SN号: A001' },
        { id: 'ins-A2', label: '仪器A', sn: 'SN号: 015' },
        { id: 'ins-A3', label: '仪器A', sn: 'SN号: 016' },
      ],
    },
    {
      id: 'wo-B',
      no: 'WO-789',
      entrustNo: 'ENT-2026-002',
      applicant: '申请人B',
      applicantUnit: '单位乙',
      applyDate: '2026-03-02',
      receivingNo: 'RCV-0002',
      vesselType: '480L',
      type: '480L',
      targetTemp: '150 °C',
      targetPressure: '12 MPa',
      keepCondition: '20min 保温保压',
      status: '待排程',
      expanded: false,
      items: [
        { id: 'ins-B1', label: '仪器B', sn: 'SN号: 011' },
        { id: 'ins-B2', label: '仪器B', sn: 'SN号: 012' },
      ],
    },
    {
      id: 'wo-C',
      no: 'WO-456',
      entrustNo: 'ENT-2026-003',
      applicant: '申请人C',
      applicantUnit: '单位丙',
      applyDate: '2026-03-03',
      receivingNo: 'RCV-0003',
      vesselType: '250L',
      type: '250L',
      targetTemp: '120 °C',
      targetPressure: '10 MPa',
      keepCondition: '15min 保温保压',
      status: '待排程',
      expanded: false,
      items: [{ id: 'ins-C1', label: '仪器C', sn: 'SN号: 030' }],
    },
  ])

  const calBase = ref(getMonday(new Date()))

  const currentWeekDays = computed<WeekDayItem[]>(() => {
    const days: WeekDayItem[] = []
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
    void start
    void end
    return ''
  })

  const timeSlots = computed<TimeSlotItem[]>(() => {
    const slots: TimeSlotItem[] = []
    for (let hour = 6; hour <= 22; hour++) {
      slots.push({ key: `${String(hour).padStart(2, '0')}00`, label: `${String(hour).padStart(2, '0')}:00`, isHalf: false })
    }
    return slots
  })

  const getCellKey = (dateStr: string, timeKey: string) => `${dateStr}_${timeKey}`

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
      map[cellKey].push(ev.instrumentId)
    })
    return map
  })

  type ScheduledLayoutItem = {
    instrumentId: string
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
        .sort((a, b) => a.startIdx - b.startIdx || a.ev.instrumentId.localeCompare(b.ev.instrumentId))

      const counts = new Array(timeSlots.value.length + 1).fill(0)
      mapped.forEach((x) => {
        counts[x.startIdx] += 1
        counts[x.endIdx] -= 1
      })
      for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1]

      const laneEnds: number[] = []
      const laneById: Record<string, number> = {}
      mapped.forEach((x) => {
        let lane = laneEnds.findIndex((le) => le <= x.startIdx)
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(x.endIdx)
        } else {
          laneEnds[lane] = x.endIdx
        }
        laneById[x.ev.instrumentId] = lane
      })

      mapped.forEach((x) => {
        const cellKey = getCellKey(dateStr, x.ev.startTimeKey)
        let laneCount = 1
        for (let i = x.startIdx; i < x.endIdx; i++) {
          laneCount = Math.max(laneCount, counts[i] || 0)
        }
        out.push({
          instrumentId: x.ev.instrumentId,
          dateStr,
          startTimeKey: x.ev.startTimeKey,
          startIdx: x.startIdx,
          span: x.span,
          lane: laneById[x.ev.instrumentId] ?? 0,
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

  const unscheduledOrders = computed(() => {
    const scheduledInstrumentIds = new Set(Object.keys(scheduledEvents.value))
    return workOrders.value.filter(order =>
      order.status === '待排程' &&
      order.items.some(item => !scheduledInstrumentIds.has(item.id)) &&
      (searchKeyword.value === '' || order.no.includes(searchKeyword.value) || order.type.includes(searchKeyword.value) || order.applicant.includes(searchKeyword.value))
    )
  })

  const getOrderById = (id: string) => workOrders.value.find(o => o.id === id)

  const getInstrumentById = (id: string): InstrumentItem | null => {
    for (const o of workOrders.value) {
      const found = o.items.find(i => i.id === id)
      if (found) return found
    }
    return null
  }

  const getOrderByInstrumentId = (id: string) => workOrders.value.find(o => o.items.some(i => i.id === id))

  const selectedScheduledOrders = computed<ScheduledSelection[]>(() => {
    return selectedScheduledOrderIds.value
      .map(id => ({ instrument: getInstrumentById(id), order: getOrderByInstrumentId(id) }))
      .filter(obj => obj.instrument && obj.order)
      .map(obj => ({ instrument: obj.instrument as InstrumentItem, order: obj.order as WorkOrder }))
  })

  const currentSelected = computed<ScheduledSelection | null>(() => {
    const id = selectedScheduledOrderIds.value[0]
    if (!id) return null
    const order = getOrderByInstrumentId(id)
    const instrument = getInstrumentById(id)
    return order && instrument ? { order, instrument } : null
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
    const presets = [
      { d: 0, t: '0800', id: 'ins-A1' },
      { d: 0, t: '1000', id: 'ins-B1' },
      { d: 1, t: '1400', id: 'ins-C1' },
    ]
    const scheduled = new Set(Object.keys(scheduledEvents.value))

    presets.forEach(p => {
      if (scheduled.has(p.id)) return
      const d = addDays(base, p.d)
      const dateStr = fmtDate(d)
      const timeKey = p.t
      scheduleInstrument(p.id, dateStr, timeKey, false)
    })
  }

  function handleDragStart(e: DragEvent, order: WorkOrder) {
    draggedOrder.value = order
    isDragging.value = true
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', order.id)
    }
    ;(e.currentTarget as HTMLElement | null)?.classList.add('dragging')
  }

  function handleInstrumentDragStart(e: DragEvent, instrument: InstrumentItem) {
    isDragging.value = true
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', instrument.id)
    }
    ;(e.currentTarget as HTMLElement | null)?.classList.add('dragging')
  }

  function handleDragEnd(e: DragEvent) {
    ;(e.currentTarget as HTMLElement | null)?.classList.remove('dragging')
    draggedOrder.value = null
    isDragging.value = false
  }

  function handleDragOver(e: DragEvent, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    ;(e.currentTarget as HTMLElement | null)?.classList.add('drag-over')
  }

  function handleDragLeave(e: DragEvent) {
    ;(e.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
  }

  function scheduleInstrument(instrumentId: string, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    if (!instrumentId) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return
    if (scheduledEvents.value[instrumentId]) return
    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, (timeSlots.value.length - 1) - startIdx)
    scheduledEvents.value = {
      ...scheduledEvents.value,
      [instrumentId]: { instrumentId, dateStr, startTimeKey: timeKey, span: Math.min(1, maxSpan) },
    }
    if (isDragging.value) {
      isDragging.value = false
      draggedOrder.value = null
    }
  }

  function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
    if (!e.dataTransfer) return
    const instrumentId = e.dataTransfer.getData('text/plain')
    if (!instrumentId) return
    scheduleInstrument(instrumentId, dateStr, timeKey, isPast)
  }

  function handleSelectScheduledOrder(orderId: string) {
    const current = selectedScheduledOrderIds.value
    if (current.includes(orderId)) {
      selectedScheduledOrderIds.value = current.filter(id => id !== orderId)
    } else {
      selectedScheduledOrderIds.value = [...current, orderId]
    }
  }

  function handleUnschedule(cellKey: string, orderId: string) {
    void cellKey
    const next = { ...scheduledEvents.value }
    delete next[orderId]
    scheduledEvents.value = next
    if (selectedScheduledOrderIds.value.includes(orderId)) {
      selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
    }
  }

  function resetScheduleState() {
    scheduledEvents.value = {}
    selectedScheduledOrderIds.value = []
  }

  const getEvent = (instrumentId: string) => scheduledEvents.value[instrumentId]

  const setEventSpan = (instrumentId: string, span: number) => {
    const ev = scheduledEvents.value[instrumentId]
    if (!ev) return
    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    if (nextSpan === ev.span) return
    scheduledEvents.value = { ...scheduledEvents.value, [instrumentId]: { ...ev, span: nextSpan } }
  }

  const resizing = ref<{ instrumentId: string; startY: number; originSpan: number; originStartIdx: number; mode: 'bottom' | 'top' } | null>(null)
  const resizingInstrumentId = computed(() => resizing.value?.instrumentId || null)
  const isResizing = computed(() => !!resizing.value)

  const setEventStartAndSpan = (instrumentId: string, startIdx: number, span: number) => {
    const ev = scheduledEvents.value[instrumentId]
    if (!ev) return
    const maxStartIdx = Math.max(0, timeSlots.value.length - 2)
    const nextStartIdx = Math.max(0, Math.min(maxStartIdx, startIdx))
    const nextStartKey = timeSlots.value[nextStartIdx]?.key
    if (!nextStartKey) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - nextStartIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    scheduledEvents.value = { ...scheduledEvents.value, [instrumentId]: { ...ev, startTimeKey: nextStartKey, span: nextSpan } }
  }

  const startResize = (instrumentId: string, e: MouseEvent) => {
    const ev = scheduledEvents.value[instrumentId]
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { instrumentId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'bottom' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      if (ctx.mode === 'bottom') {
        setEventSpan(ctx.instrumentId, ctx.originSpan + deltaSlots)
        return
      }
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.instrumentId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (instrumentId: string, e: MouseEvent) => {
    const ev = scheduledEvents.value[instrumentId]
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { instrumentId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'top' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.instrumentId, nextStartIdx, endIdx - nextStartIdx)
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
    draggedOrder,
    workOrders,
    calBase,
    scheduledOrders,
    scheduledLayoutItems,
    maxLaneCount,
    slotHeightPx,
    isDragging,
    selectedScheduledOrderIds,
    currentWeekDays,
    weekLabel,
    timeSlots,
    unscheduledOrders,
    selectedScheduledOrders,
    currentSelected,
    getOrderById,
    getInstrumentById,
    getOrderByInstrumentId,
    getCellKey,
    fmtDate,
    prevWeek,
    nextWeek,
    gotoDate,
    loadPresetSchedule,
    handleDragStart,
    handleInstrumentDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    scheduleInstrument,
    handleSelectScheduledOrder,
    handleUnschedule,
    resetScheduleState,
    getEvent,
    startResize,
    startResizeTop,
    resizingInstrumentId,
    isResizing,
  }
}
