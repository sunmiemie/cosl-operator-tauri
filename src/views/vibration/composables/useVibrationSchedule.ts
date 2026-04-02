import { computed, onMounted, ref } from 'vue'
import type { TimeSlot, WeekDay, WorkOrder } from '../types'

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
  const searchKeyword = ref('')
  const draggedOrder = ref<WorkOrder | null>(null)
  const selectedScheduledOrderIds = ref<string[]>([])
  const isDragging = ref(false)
  const slotHeightPx = 44

  const workOrders = ref<WorkOrder[]>([
    { id: 'TMP-2026-001', type: '模拟实验', applicant: '张三', phone: '138****8888', device: '卫星姿控仪', level: '5G', duration: 30, purpose: '功能验证预实验' },
    { id: 'FOR-2026-001', type: '模拟实验', applicant: '李四', phone: '139****6666', device: '导航控制器', level: '8G', duration: 60, purpose: '环境适应性振动测试' },
    { id: 'FOR-2026-002', type: '正式测试', applicant: '王五', phone: '137****5555', device: '传感器模块', level: '10G', duration: 45, purpose: '结构完整性振动测试' },
    { id: 'TMP-2026-002', type: '模拟实验', applicant: '陈六', phone: '136****4444', device: '惯性测量单元', level: '3G', duration: 20, purpose: '安装工装验证' },
    { id: 'FOR-2026-003', type: '正式测试', applicant: '赵七', phone: '135****3333', device: '星敏感器', level: '6G', duration: 90, purpose: '正弦扫频耐久测试' },
    { id: 'FOR-2026-004', type: '模拟实验', applicant: '刘八', phone: '134****2222', device: '天线组件', level: '4G', duration: 120, purpose: '随机振动环境验证' },
  ])

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

  onMounted(() => {
    const base = getMonday(new Date())
    const presets = [
      { d: 0, t: '800', id: 'TMP-2026-001' },
      { d: 0, t: '1000', id: 'FOR-2026-001' },
      { d: 1, t: '1400', id: 'FOR-2026-002' },
      { d: 2, t: '900', id: 'TMP-2026-002' },
      { d: 3, t: '1000', id: 'FOR-2026-003' },
    ]
    presets.forEach(p => {
      const d = addDays(base, p.d)
      const timeKey = p.t.padStart(4, '0')
      const dateStr = fmtDate(d)
      scheduledEvents.value = {
        ...scheduledEvents.value,
        [p.id]: { orderId: p.id, dateStr, startTimeKey: timeKey, span: 1 },
      }
    })
  })

  const getOrderById = (id: string) => workOrders.value.find(w => w.id === id)

  const unscheduledOrders = computed(() => {
    const scheduled = new Set(Object.keys(scheduledEvents.value))
    const kw = searchKeyword.value.trim()
    return workOrders.value.filter(o => {
      if (scheduled.has(o.id)) return false
      if (!kw) return true
      return o.id.includes(kw) || o.applicant.includes(kw) || o.device.includes(kw) || o.type.includes(kw) || o.level.includes(kw)
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

  function loadPresetSchedule() {
    const base = calBase.value
    const presets = [
      { d: 0, t: '0800', id: 'TMP-2026-001' },
      { d: 1, t: '1000', id: 'FOR-2026-001' },
      { d: 2, t: '1400', id: 'FOR-2026-002' },
      { d: 3, t: '0900', id: 'TMP-2026-002' },
      { d: 4, t: '1000', id: 'FOR-2026-003' },
    ]
    presets.forEach(p => {
      const d = addDays(base, p.d)
      const cellKey = getCellKey(fmtDate(d), p.t)
      const arr = scheduledOrders.value[cellKey] || []
      if (!arr.includes(p.id)) {
        scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...arr, p.id] }
      }
    })
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

  function scheduleOrder(orderId: string, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return
    if (scheduledEvents.value[orderId]) return
    const order = getOrderById(orderId)
    const span = Math.max(1, Math.ceil(Number(order?.duration || 0) / 60) || 1)
    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, (timeSlots.value.length - 1) - startIdx)
    scheduledEvents.value = {
      ...scheduledEvents.value,
      [orderId]: { orderId, dateStr, startTimeKey: timeKey, span: Math.min(span, maxSpan) },
    }
    if (isDragging.value) {
      isDragging.value = false
      draggedOrder.value = null
    }
  }

  function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    if (!e.dataTransfer) return
    const orderId = e.dataTransfer.getData('text/plain')
    if (!orderId) return
    scheduleOrder(orderId, dateStr, timeKey, isPast)
  }

  function handleUnschedule(cellKey: string, orderId: string) {
    const next = { ...scheduledEvents.value }
    delete next[orderId]
    scheduledEvents.value = next
    if (selectedScheduledOrderIds.value.includes(orderId)) {
      selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
    }
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
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
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
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return {
    workOrders,
    searchKeyword,
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
    loadPresetSchedule,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    scheduleOrder,
    handleUnschedule,
    selectScheduledOrder,
    getEvent,
    startResize,
    startResizeTop,
    resizingOrderId,
    isResizing,
  }
}
