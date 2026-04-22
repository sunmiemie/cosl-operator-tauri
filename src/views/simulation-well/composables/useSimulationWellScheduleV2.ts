import { computed, ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { getSimulatedWellOrderDetail, listSimulatedWellOrders, type SimulatedWellOrderDTO } from '@/services/simulated-well-api'
import type { CalendarDay, DownholeDevice, TimeSlot, UnscheduledDeviceRow, WorkOrder } from '../types'

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

function toYmd(val?: string | null) {
  const s = (val || '').trim()
  return s ? s.slice(0, 10) : ''
}

function normalizeText(val?: string | null) {
  return (val || '').trim()
}

export function useSimulationWellSchedule() {
  const { initAuth, getAuthHeaders } = useAuth()
  const searchKeyword = ref('')
  const slotHeightPx = 44
  const isDragging = ref(false)
  const draggedDeviceId = ref<string | null>(null)

  const workOrders = ref<WorkOrder[]>([])

  const refreshWorkOrders = async () => {
    await initAuth()
    const res = await listSimulatedWellOrders(
      { page: 1, pageSize: 2000, status: 1, includeDevices: true },
      getAuthHeaders()
    )
    if (!res.success) return
    if (res.data?.code !== 0) return

    workOrders.value = (res.data.data?.list || []).map((dto) => {
      const orderId = dto.task_number
      const devices = dto.devices || []
      return {
        id: orderId,
        dbId: dto.id,
        customer: normalizeText(dto.customer_unit) || '—',
        devices: dto.device_count ?? devices.length ?? 0,
        status: String(dto.status_text || dto.status || ''),
        createTime: toYmd(dto.created_at) || '',
        planTime: toYmd(dto.plan_date) || '',
        taskDesc: normalizeText(dto.task_desc) || '',
        deviceList: devices.map((d) => ({
          id: `${orderId}::${d.device_number}`,
          name: normalizeText(d.device_name) || '—',
          code: normalizeText(d.device_number) || '',
          template: normalizeText(d.device_number) || ''
        })),
        supportingTools: []
      }
    })
  }

  const fetchOrderDetail = async (dbId: number): Promise<SimulatedWellOrderDTO | null> => {
    await initAuth()
    const res = await getSimulatedWellOrderDetail(dbId, getAuthHeaders())
    if (!res.success) return null
    if (res.data?.code !== 0) return null
    return res.data.data
  }

  type ScheduledEvent = {
    deviceId: string
    orderId: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent>>({})
  const scheduledEventsTentative = ref<Record<string, ScheduledEvent>>({})
  const selectedScheduledDeviceIds = ref<string[]>([])

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
        isPast: dObj < today
      })
    }
    return days
  })

  const weekLabel = computed(() => '')

  const timeSlots = computed<TimeSlot[]>(() => {
    const slots: TimeSlot[] = []
    for (let h = 6; h <= 22; h++) {
      slots.push({
        key: `${String(h).padStart(2, '0')}00`,
        label: `${String(h).padStart(2, '0')}:00`,
        isHalf: false
      })
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
      map[cellKey].push(ev.deviceId)
    })
    return map
  })

  const scheduledOrdersTentative = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEventsTentative.value).forEach((ev) => {
      const cellKey = getCellKey(ev.dateStr, ev.startTimeKey)
      if (!map[cellKey]) map[cellKey] = []
      map[cellKey].push(ev.deviceId)
    })
    return map
  })

  type ScheduledLayoutItem = {
    deviceId: string
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
        .sort((a, b) => a.startIdx - b.startIdx || a.ev.deviceId.localeCompare(b.ev.deviceId))

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
        laneById[x.ev.deviceId] = lane
      })

      mapped.forEach((x) => {
        const cellKey = getCellKey(dateStr, x.ev.startTimeKey)
        let laneCount = 1
        for (let i = x.startIdx; i < x.endIdx; i++) {
          laneCount = Math.max(laneCount, counts[i] || 0)
        }
        out.push({
          deviceId: x.ev.deviceId,
          orderId: x.ev.orderId,
          dateStr,
          startTimeKey: x.ev.startTimeKey,
          startIdx: x.startIdx,
          span: x.span,
          lane: laneById[x.ev.deviceId] ?? 0,
          laneCount: Math.max(1, laneCount),
          cellKey,
          isTentative: x.ev.isTentative
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
  const todayScheduledDeviceIds = computed(() => {
    const ids = new Set<string>()
    Object.values(scheduledEvents.value).forEach((ev) => {
      if (ev.dateStr === todayDateStr.value) ids.add(ev.deviceId)
    })
    return Array.from(ids)
  })
  const todayScheduledOrderIds = computed(() => {
    const ids = new Set<string>()
    Object.values(scheduledEvents.value).forEach((ev) => {
      if (ev.dateStr === todayDateStr.value) ids.add(ev.orderId)
    })
    return Array.from(ids)
  })

  const todayScheduledDevices = computed<DownholeDevice[]>(() => {
    const list: DownholeDevice[] = []
    todayScheduledDeviceIds.value.forEach((deviceId) => {
      const row = getDeviceRow(deviceId)
      if (!row) return
      list.push({
        orderId: row.order.id,
        customer: row.order.customer,
        deviceName: row.deviceName,
        sn: row.deviceNumber,
        template: row.deviceNumber || 'DEFAULT_DOWNHOLE_REPORT'
      })
    })
    return list
  })

  const selectedStartDeviceIds = computed(() => {
    return selectedScheduledDeviceIds.value.filter((id) => !!scheduledEvents.value[id])
  })

  const selectedStartDevices = computed<DownholeDevice[]>(() => {
    const list: DownholeDevice[] = []
    selectedStartDeviceIds.value.forEach((deviceId) => {
      const row = getDeviceRow(deviceId)
      if (!row) return
      list.push({
        orderId: row.order.id,
        customer: row.order.customer,
        deviceName: row.deviceName,
        sn: row.deviceNumber,
        template: row.deviceNumber || 'DEFAULT_DOWNHOLE_REPORT'
      })
    })
    return list
  })

  const todayScheduledOrders = computed(() => {
    const map = new Map(workOrders.value.map((o) => [o.id, o]))
    return todayScheduledOrderIds.value.map((id) => map.get(id)).filter(Boolean) as WorkOrder[]
  })

  const selectedStartOrders = computed<WorkOrder[]>(() => {
    const selected = new Set(selectedStartDeviceIds.value)
    const out: WorkOrder[] = []
    workOrders.value.forEach((order) => {
      const filteredDevices = (order.deviceList || []).filter((d) => selected.has(d.id))
      if (!filteredDevices.length) return
      out.push({
        ...order,
        devices: filteredDevices.length,
        deviceList: filteredDevices
      })
    })
    return out
  })

  const getWorkOrderById = (id: string) => workOrders.value.find((o) => o.id === id)

  const deviceIndex = computed(() => {
    const map = new Map<string, { order: WorkOrder; deviceName: string; deviceNumber: string }>()
    workOrders.value.forEach((o) => {
      o.deviceList.forEach((d) => {
        const deviceNumber = normalizeText(d.code)
        map.set(d.id, { order: o, deviceName: d.name, deviceNumber })
      })
    })
    return map
  })

  const getDeviceRow = (deviceId: string) => deviceIndex.value.get(deviceId) || null

  const unscheduledOrders = computed(() => {
    const scheduledDeviceIds = new Set<string>([
      ...Object.keys(scheduledEvents.value),
      ...Object.keys(scheduledEventsTentative.value)
    ])
    const kw = searchKeyword.value.trim().toLowerCase()

    return workOrders.value.filter((order) => {
      const remaining = order.deviceList.filter((d) => !scheduledDeviceIds.has(d.id))
      if (remaining.length === 0) return false
      if (!kw) return true
      const deviceHay = remaining.map((d) => `${d.name} ${d.code || ''} ${d.sn || ''}`).join(' ')
      const hay = `${order.id} ${order.customer} ${order.planTime} ${order.taskDesc} ${deviceHay}`.toLowerCase()
      return hay.includes(kw)
    })
  })

  const unscheduledDevices = computed<UnscheduledDeviceRow[]>(() => {
    const scheduledDeviceIds = new Set<string>([
      ...Object.keys(scheduledEvents.value),
      ...Object.keys(scheduledEventsTentative.value)
    ])
    const kw = searchKeyword.value.trim().toLowerCase()
    const out: UnscheduledDeviceRow[] = []

    deviceIndex.value.forEach((v, deviceId) => {
      if (scheduledDeviceIds.has(deviceId)) return
      const order = v.order
      const row: UnscheduledDeviceRow = {
        deviceId,
        orderId: order.id,
        customer: order.customer,
        planTime: order.planTime,
        taskDesc: order.taskDesc,
        deviceName: v.deviceName,
        deviceNumber: v.deviceNumber
      }
      if (!kw) {
        out.push(row)
        return
      }
      const hay = `${row.orderId} ${row.customer} ${row.planTime} ${row.deviceName} ${row.deviceNumber} ${row.taskDesc}`.toLowerCase()
      if (hay.includes(kw)) out.push(row)
    })

    return out
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

  function loadPresetSchedule() {}

  function handleDeviceDragStart(e: DragEvent, device: { id: string }) {
    draggedDeviceId.value = device.id
    isDragging.value = true
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', device.id)
    }
  }

  function handleDragEnd() {
    draggedDeviceId.value = null
    isDragging.value = false
  }

  function handleDragOver(e: DragEvent, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
  }

  function handleDragLeave() {}

  function scheduleDevice(deviceId: string, dateStr: string, timeKey: string, isPast: boolean, isTentative: boolean) {
    if (isPast) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return
    if (scheduledEvents.value[deviceId] || scheduledEventsTentative.value[deviceId]) return

    const info = getDeviceRow(deviceId)
    if (!info) return

    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, timeSlots.value.length - 1 - startIdx)
    const nextEvent: ScheduledEvent = {
      deviceId,
      orderId: info.order.id,
      dateStr,
      startTimeKey: timeKey,
      span: Math.min(1, maxSpan)
    }

    if (isTentative) {
      scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [deviceId]: nextEvent }
    } else {
      scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: nextEvent }
    }

    if (isDragging.value) {
      isDragging.value = false
      draggedDeviceId.value = null
    }
  }

  function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    const deviceId = e.dataTransfer?.getData('text/plain') || draggedDeviceId.value
    if (!deviceId) return
    const isTentative = !!(e && (e.shiftKey || (e as DragEvent & { altKey?: boolean }).altKey))
    scheduleDevice(deviceId, dateStr, timeKey, isPast, isTentative)
  }

  function handleUnschedule(cellKey: string, deviceId: string) {
    void cellKey
    const next = { ...scheduledEvents.value }
    delete next[deviceId]
    scheduledEvents.value = next
    selectedScheduledDeviceIds.value = selectedScheduledDeviceIds.value.filter((x) => x !== deviceId)
  }

  function handleUnscheduleTentative(cellKey: string, deviceId: string) {
    void cellKey
    const next = { ...scheduledEventsTentative.value }
    delete next[deviceId]
    scheduledEventsTentative.value = next
  }

  function handleSelectScheduledDevice(deviceId: string) {
    const set = new Set(selectedScheduledDeviceIds.value)
    if (set.has(deviceId)) set.delete(deviceId)
    else set.add(deviceId)
    selectedScheduledDeviceIds.value = Array.from(set)
  }

  const getEvent = (deviceId: string) => {
    const normal = scheduledEvents.value[deviceId]
    if (normal) return { ...normal, isTentative: false }
    const tentative = scheduledEventsTentative.value[deviceId]
    if (tentative) return { ...tentative, isTentative: true }
    return null
  }

  const setEventSpan = (deviceId: string, span: number) => {
    const ev = getEvent(deviceId)
    if (!ev) return
    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return
    const maxSpan = Math.max(1, timeSlots.value.length - 1 - startIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    if (nextSpan === ev.span) return
    const next = { deviceId, orderId: ev.orderId, dateStr: ev.dateStr, startTimeKey: ev.startTimeKey, span: nextSpan }
    if (ev.isTentative) scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [deviceId]: next }
    else scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: next }
  }

  const resizing = ref<{
    deviceId: string
    startY: number
    originSpan: number
    originStartIdx: number
    mode: 'bottom' | 'top'
  } | null>(null)
  const resizingDeviceId = computed(() => resizing.value?.deviceId || null)
  const isResizing = computed(() => !!resizing.value)

  const setEventStartAndSpan = (deviceId: string, startIdx: number, span: number) => {
    const ev = getEvent(deviceId)
    if (!ev) return
    const maxStartIdx = Math.max(0, timeSlots.value.length - 2)
    const nextStartIdx = Math.max(0, Math.min(maxStartIdx, startIdx))
    const nextStartKey = timeSlots.value[nextStartIdx]?.key
    if (!nextStartKey) return
    const maxSpan = Math.max(1, timeSlots.value.length - 1 - nextStartIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    const next = { deviceId, orderId: ev.orderId, dateStr: ev.dateStr, startTimeKey: nextStartKey, span: nextSpan }
    if (ev.isTentative) scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [deviceId]: next }
    else scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: next }
  }

  const startResize = (deviceId: string, e: MouseEvent) => {
    const ev = getEvent(deviceId)
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { deviceId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'bottom' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      if (ctx.mode === 'bottom') {
        setEventSpan(ctx.deviceId, ctx.originSpan + deltaSlots)
        return
      }
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.deviceId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (deviceId: string, e: MouseEvent) => {
    const ev = getEvent(deviceId)
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { deviceId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'top' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.deviceId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  refreshWorkOrders()

  return {
    searchKeyword,
    workOrders,
    refreshWorkOrders,
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
    selectedScheduledDeviceIds,
    todayScheduledOrderIds,
    todayScheduledOrders,
    todayScheduledDeviceIds,
    todayScheduledDevices,
    selectedStartDeviceIds,
    selectedStartOrders,
    selectedStartDevices,
    fmtDate,
    getCellKey,
    prevWeek,
    nextWeek,
    gotoDate,
    loadPresetSchedule,
    unscheduledOrders,
    unscheduledDevices,
    fetchOrderDetail,
    handleDeviceDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleUnschedule,
    handleUnscheduleTentative,
    handleSelectScheduledDevice,
    getWorkOrderById,
    getDeviceRow,
    startResize,
    startResizeTop,
    resizingDeviceId,
    isResizing
  }
}
