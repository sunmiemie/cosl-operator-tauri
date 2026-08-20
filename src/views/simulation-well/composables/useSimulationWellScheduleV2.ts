import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import {
  clearSimulatedWellDeviceSchedule,
  getSimulatedWellOrderDetail,
  listSimulatedWellOrders,
  saveSimulatedWellDeviceSchedule,
  type SimulatedWellOrderDTO,
} from '@/services/simulated-well-api'
import { fetchScheduleHostDeviceNames } from '@/services/schedule-host-device-api'
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

function normalizeScheduleSegments(
  segments?: Array<{ scheduled_start_at?: string | null; scheduled_end_at?: string | null }> | null
) {
  return Array.isArray(segments)
    ? segments
        .map((segment) => {
          const scheduledStartAt = normalizeText(segment?.scheduled_start_at)
          const scheduledEndAt = normalizeText(segment?.scheduled_end_at)
          if (!scheduledStartAt || !scheduledEndAt) return null
          return { scheduledStartAt, scheduledEndAt }
        })
        .filter(Boolean) as Array<{ scheduledStartAt: string; scheduledEndAt: string }>
    : []
}

function normalizeOrderType(value: unknown): 0 | 1 {
  return Number(value) === 1 ? 1 : 0
}

export function useSimulationWellSchedule() {
  const { initAuth, getAuthHeaders } = useAuth()
  const searchKeyword = ref('')
  const slotHeightPx = 44
  const isDragging = ref(false)
  const draggedOrderId = ref<string | null>(null)
  const draggedOrderMeta = ref<{ id: string; label: string } | null>(null)

  const workOrders = ref<WorkOrder[]>([])
  const hostDeviceNames = ref<string[]>([])

  const refreshWorkOrders = async () => {
    await initAuth()
    const headers = getAuthHeaders()
    await refreshHostDeviceNames(headers)
    const [orderRes1, orderRes2, orderRes4] = await Promise.all([
      listSimulatedWellOrders(
        { page: 1, pageSize: 2000, status: 1, includeDevices: true },
        headers
      ),
      listSimulatedWellOrders(
        { page: 1, pageSize: 2000, status: 2, includeDevices: true },
        headers
      ),
      listSimulatedWellOrders(
        { page: 1, pageSize: 2000, status: 4, includeDevices: true },
        headers
      )
    ])
    if (!orderRes1.success || !orderRes2.success || !orderRes4.success) return
    if (orderRes1.data?.code !== 0 || orderRes2.data?.code !== 0 || orderRes4.data?.code !== 0) return

    const combined = [
      ...(orderRes1.data.data?.list || []),
      ...(orderRes2.data.data?.list || []),
      ...(orderRes4.data.data?.list || []),
    ]
    workOrders.value = combined
      .map((dto) => {
        const orderId = dto.task_number
        const devices = dto.devices || []
        const remainingDevices = devices.filter((d) => !d.is_completed && Number(d.instrument_status || 0) !== 2)
        return {
          id: orderId,
          dbId: dto.id,
          customer: normalizeText(dto.customer_unit) || '—',
          devices: remainingDevices.length,
          status: String(dto.status_text || dto.status || ''),
          createTime: toYmd(dto.created_at) || '',
          planTime: toYmd(dto.plan_date) || '',
          taskDesc: normalizeText(dto.project_name || dto.task_desc) || '',
          wellName: normalizeText(dto.well_name) || '',
          testPurpose: normalizeText(dto.test_purpose) || '',
          testSteps: normalizeText(dto.test_steps) || '',
          safetyRisks: normalizeText(dto.safety_risks) || '',
          orderType: normalizeOrderType(dto.order_type),
          deviceList: remainingDevices.map((d) => ({
            id: `${orderId}::${d.device_number}`,
            dbId: d.id,
            name: normalizeText(d.device_name) || '—',
            sn: normalizeText(d.device_number) || '',
            code: normalizeText(d.device_number) || '',
            template: normalizeText(d.device_number) || '',
            scheduledStartAt: d.scheduled_start_at || null,
            scheduledEndAt: d.scheduled_end_at || null,
            scheduleSegments: normalizeScheduleSegments(d.schedule_segments),
            instrumentStatus: Number(d.instrument_status || 0),
            isCompleted: !!d.is_completed,
          })),
          supportingTools: []
        }
      })
      .filter((order) => order.devices > 0 && order.deviceList.length > 0)
    restoreScheduledEvents(workOrders.value)
    syncActiveHostDeviceName()
  }

  const fetchOrderDetail = async (dbId: number): Promise<SimulatedWellOrderDTO | null> => {
    await initAuth()
    const res = await getSimulatedWellOrderDetail(dbId, getAuthHeaders())
    if (!res.success) return null
    if (res.data?.code !== 0) return null
    return res.data.data
  }

  type ScheduledEvent = {
    eventId: string
    orderId: string
    scheduleOwnerDeviceId: string
    deviceName: string
    deviceNumber: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent>>({})
  const scheduledEventsTentative = ref<Record<string, ScheduledEvent>>({})
  const pendingScheduleEvents = ref<Record<string, ScheduledEvent[] | null>>({})
  const selectedScheduledEventIds = ref<string[]>([])
  const activeHostDeviceName = ref('')

  function makeScheduleEventId(orderId: string, scheduleOwnerDeviceId: string) {
    return `${orderId}::${scheduleOwnerDeviceId}::evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function markPendingSchedule(scheduleOwnerDeviceId: string, events: ScheduledEvent[] | null) {
    pendingScheduleEvents.value = {
      ...pendingScheduleEvents.value,
      [scheduleOwnerDeviceId]: events ? events.map((event) => ({ ...event })) : null,
    }
  }

  function clearPendingSchedule(scheduleOwnerDeviceId: string) {
    const next = { ...pendingScheduleEvents.value }
    delete next[scheduleOwnerDeviceId]
    pendingScheduleEvents.value = next
  }

  function parseBackendDateTime(value?: string | null) {
    if (!value) return null
    const text = value.includes('T') ? value : value.replace(' ', 'T')
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  function createSavedScheduleEventId(orderId: string, scheduleOwnerDeviceId: string, dateStr: string, startTimeKey: string, span: number, index: number) {
    return `${orderId}::saved-${scheduleOwnerDeviceId}-${dateStr}-${startTimeKey}-${span}-${index}`
  }

  function eventsFromDevice(order: WorkOrder, device: WorkOrder['deviceList'][number]): ScheduledEvent[] {
    const deviceNumber = normalizeText(device.code || device.sn)
    const segments = device.scheduleSegments?.length
      ? device.scheduleSegments
      : device.scheduledStartAt && device.scheduledEndAt
        ? [{ scheduledStartAt: device.scheduledStartAt, scheduledEndAt: device.scheduledEndAt }]
        : []

    return segments
      .map((segment, index) => {
        const start = parseBackendDateTime(segment.scheduledStartAt)
        const end = parseBackendDateTime(segment.scheduledEndAt)
        if (!start || !end || end <= start) return null
        const startTimeKey = `${String(start.getHours()).padStart(2, '0')}00`
        if (timeKeyToIndex.value[startTimeKey] === undefined) return null
        const span = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (60 * 60 * 1000)))
        const dateStr = fmtDate(start)
        return {
          eventId: createSavedScheduleEventId(order.id, device.id, dateStr, startTimeKey, span, index),
          orderId: order.id,
          scheduleOwnerDeviceId: device.id,
          deviceName: device.name,
          deviceNumber,
          dateStr,
          startTimeKey,
          span,
        }
      })
      .filter(Boolean) as ScheduledEvent[]
  }

  function restoreScheduledEvents(orders: WorkOrder[]) {
    const next: Record<string, ScheduledEvent> = {}
    orders.forEach((order) => {
      order.deviceList.forEach((device) => {
        eventsFromDevice(order, device).forEach((event) => {
          next[event.eventId] = event
        })
      })
    })
    Object.entries(pendingScheduleEvents.value).forEach(([scheduleOwnerDeviceId, events]) => {
      Object.keys(next).forEach((eventId) => {
        if (next[eventId]?.scheduleOwnerDeviceId === scheduleOwnerDeviceId) delete next[eventId]
      })
      if (events?.length) {
        events.forEach((event) => {
          next[event.eventId] = { ...event }
        })
      }
    })
    scheduledEvents.value = next
  }

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
    for (let h = 0; h <= 24; h++) {
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
      map[cellKey].push(ev.scheduleOwnerDeviceId)
    })
    return map
  })

  const scheduledOrdersTentative = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEventsTentative.value).forEach((ev) => {
      const cellKey = getCellKey(ev.dateStr, ev.startTimeKey)
      if (!map[cellKey]) map[cellKey] = []
      map[cellKey].push(ev.scheduleOwnerDeviceId)
    })
    return map
  })

  type ScheduledLayoutItem = {
    deviceId: string
    eventId: string
    scheduleOwnerDeviceId: string
    orderId: string
    deviceName: string
    deviceNumber: string
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
    const activeScheduleHostName = activeHostDeviceName.value.trim()
    const dayMap: Record<string, Array<ScheduledEvent & { isTentative: boolean }>> = {}
    Object.values(scheduledEvents.value).forEach((ev) => {
      if (!doesScheduledEventMatchActiveHostDevice(ev, activeScheduleHostName)) return
      if (!dayMap[ev.dateStr]) dayMap[ev.dateStr] = []
      dayMap[ev.dateStr].push({ ...ev, isTentative: false })
    })
    Object.values(scheduledEventsTentative.value).forEach((ev) => {
      if (!doesScheduledEventMatchActiveHostDevice(ev, activeScheduleHostName)) return
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
        .sort((a, b) => a.startIdx - b.startIdx || a.ev.eventId.localeCompare(b.ev.eventId))

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
        laneById[x.ev.eventId] = lane
      })

      mapped.forEach((x) => {
        const cellKey = getCellKey(dateStr, x.ev.startTimeKey)
        let laneCount = 1
        for (let i = x.startIdx; i < x.endIdx; i++) {
          laneCount = Math.max(laneCount, counts[i] || 0)
        }
        out.push({
          deviceId: x.ev.scheduleOwnerDeviceId,
          eventId: x.ev.eventId,
          scheduleOwnerDeviceId: x.ev.scheduleOwnerDeviceId,
          orderId: x.ev.orderId,
          deviceName: x.ev.deviceName,
          deviceNumber: x.ev.deviceNumber,
          dateStr,
          startTimeKey: x.ev.startTimeKey,
          startIdx: x.startIdx,
          span: x.span,
          lane: laneById[x.ev.eventId] ?? 0,
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
      if (ev.dateStr === todayDateStr.value) ids.add(ev.scheduleOwnerDeviceId)
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
    const list = new Map<string, DownholeDevice>()
    todayScheduledOrderIds.value.forEach((orderId) => {
      const order = getWorkOrderById(orderId)
      if (!order) return
      ;(order.deviceList || []).filter((device) => todayScheduledDeviceIds.value.includes(device.id)).forEach((device) => {
        const deviceNumber = normalizeText(device.code || device.sn)
        const key = `${order.id}::${deviceNumber}`
        if (list.has(key)) return
        list.set(key, {
          orderId: order.id,
          orderDbId: order.dbId,
          deviceDbId: device.dbId,
          customer: order.customer,
          deviceName: device.name,
          sn: deviceNumber,
          template: device.template || deviceNumber || 'DEFAULT_DOWNHOLE_REPORT',
          orderType: order.orderType,
        })
      })
    })
    return Array.from(list.values())
  })

  const getScheduledEvent = (eventId: string) => scheduledEvents.value[eventId] || scheduledEventsTentative.value[eventId] || null

  const selectedStartEventIds = computed(() => {
    return selectedScheduledEventIds.value.filter((eventId) => !!getScheduledEvent(eventId) && isScheduledEventVisibleInActiveHost(eventId))
  })

  const selectedStartDevices = computed<DownholeDevice[]>(() => {
    const list = new Map<string, DownholeDevice>()
    selectedStartEventIds.value.forEach((eventId) => {
      const ev = getScheduledEvent(eventId)
      const order = ev ? getWorkOrderById(ev.orderId) : null
      if (!order) return
      ;(order.deviceList || []).filter((device) => device.id === ev.scheduleOwnerDeviceId).forEach((device) => {
        const deviceNumber = normalizeText(device.code || device.sn)
        const key = `${order.id}::${deviceNumber}`
        if (list.has(key)) return
        list.set(key, {
          orderId: order.id,
          orderDbId: order.dbId,
          deviceDbId: device.dbId,
          customer: order.customer,
          deviceName: device.name,
          sn: deviceNumber,
          template: device.template || deviceNumber || 'DEFAULT_DOWNHOLE_REPORT',
          orderType: order.orderType,
        })
      })
    })
    return Array.from(list.values())
  })

  const todayScheduledOrders = computed(() => {
    const map = new Map(workOrders.value.map((o) => [o.id, o]))
    return todayScheduledOrderIds.value.map((id) => map.get(id)).filter(Boolean) as WorkOrder[]
  })

  const selectedStartOrders = computed<WorkOrder[]>(() => {
    const selectedOrderIds = new Set(
      selectedStartEventIds.value
        .map((eventId) => getScheduledEvent(eventId))
        .filter(Boolean)
        .map((event) => event!.orderId)
    )
    return workOrders.value
      .map((order) => {
        if (!selectedOrderIds.has(order.id)) return null
        return {
          ...order,
          devices: order.deviceList.length,
          deviceList: order.deviceList,
        }
      })
      .filter((order): order is WorkOrder => !!order && order.deviceList.length > 0)
  })

  const getWorkOrderById = (id: string) => workOrders.value.find((o) => o.id === id)

  async function refreshHostDeviceNames(headers = getAuthHeaders()) {
    const result = await fetchScheduleHostDeviceNames('simulated-well', headers)
    if (!result.success) {
      console.warn('加载模拟井主机列表失败', result.error)
      return
    }

    hostDeviceNames.value = result.names
  }

  const deviceIndex = computed(() => {
    const map = new Map<string, { order: WorkOrder; device: WorkOrder['deviceList'][number]; deviceName: string; deviceNumber: string }>()
    workOrders.value.forEach((o) => {
      o.deviceList.forEach((d) => {
        const deviceNumber = normalizeText(d.code)
        map.set(d.id, { order: o, device: d, deviceName: d.name, deviceNumber })
      })
    })
    return map
  })

  const getDeviceRow = (deviceId: string) => deviceIndex.value.get(deviceId) || null

  function getEventHostDeviceName(event?: ScheduledEvent | null) {
    return event?.deviceName?.trim() || '-'
  }

  const hostDeviceTabs = computed(() => {
    return [...hostDeviceNames.value]
  })

  function doesScheduledEventMatchActiveHostDevice(event: ScheduledEvent, activeScheduleHostName: string) {
    if (!activeScheduleHostName) return true
    return getEventHostDeviceName(event) === activeScheduleHostName
  }

  function isScheduledEventVisibleInActiveHost(eventId: string) {
    const activeScheduleHostName = activeHostDeviceName.value.trim()
    if (!activeScheduleHostName) return true
    const event = getScheduledEvent(eventId)
    return !!event && doesScheduledEventMatchActiveHostDevice(event, activeScheduleHostName)
  }

  function pruneSelectedScheduledEventIdsForActiveHost() {
    selectedScheduledEventIds.value = selectedScheduledEventIds.value.filter((eventId) => isScheduledEventVisibleInActiveHost(eventId))
  }

  function syncActiveHostDeviceName() {
    if (!activeHostDeviceName.value || !hostDeviceTabs.value.includes(activeHostDeviceName.value)) {
      activeHostDeviceName.value = hostDeviceTabs.value[0] || ''
      pruneSelectedScheduledEventIdsForActiveHost()
    }
  }

  function assignHostDeviceToCurrentScope(hostName: string) {
    const nextHostName = hostName.trim()
    if (!nextHostName) return
    activeHostDeviceName.value = nextHostName
    pruneSelectedScheduledEventIdsForActiveHost()
  }

  const timeKeyToHour = (timeKey: string) => {
    const hh = timeKey.slice(0, 2)
    if (!/^\d{2}$/.test(hh)) return ''
    return hh
  }

  const getEndTimeKey = (startTimeKey: string, span: number) => {
    const startIdx = timeKeyToIndex.value[startTimeKey]
    if (startIdx === undefined) return ''
    // 结束时间封顶在当天最后一个槽位（24:00），不允许跨天产生非法时间（如 25:00）
    const endIdx = Math.min(startIdx + Math.max(1, span), timeSlots.value.length - 1)
    return timeSlots.value[endIdx]?.key || ''
  }

  function getOwnerEvents(scheduleOwnerDeviceId: string) {
    return Object.values(scheduledEvents.value)
      .filter((event) => event.scheduleOwnerDeviceId === scheduleOwnerDeviceId)
      .sort((a, b) => {
        if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr)
        if (a.startTimeKey !== b.startTimeKey) return a.startTimeKey.localeCompare(b.startTimeKey)
        return a.eventId.localeCompare(b.eventId)
      })
      .map((event) => ({ ...event }))
  }

  function setOwnerEvents(scheduleOwnerDeviceId: string, events: ScheduledEvent[]) {
    const next = { ...scheduledEvents.value }
    Object.keys(next).forEach((eventId) => {
      if (next[eventId]?.scheduleOwnerDeviceId === scheduleOwnerDeviceId) delete next[eventId]
    })
    events.forEach((event) => {
      next[event.eventId] = { ...event, scheduleOwnerDeviceId }
    })
    scheduledEvents.value = next
  }

  type ScheduleChangeSegment = ScheduledEvent & {
    endTimeKey: string
    scheduledStartAt: string
    scheduledEndAt: string
  }

  function getScheduleChangePayload(scheduleOwnerDeviceId: string) {
    const segments = getOwnerEvents(scheduleOwnerDeviceId)
      .map((event) => {
        const endTimeKey = getEndTimeKey(event.startTimeKey, event.span)
        const startHh = timeKeyToHour(event.startTimeKey)
        const endHh = timeKeyToHour(endTimeKey)
        if (!endTimeKey || !startHh || !endHh) return null
        return {
          ...event,
          endTimeKey,
          scheduledStartAt: `${event.dateStr} ${startHh}:00:00`,
          scheduledEndAt: `${event.dateStr} ${endHh}:00:00`,
        }
      })
      .filter((segment): segment is ScheduleChangeSegment => !!segment)
      .sort((a, b) => {
        if (a.scheduledStartAt !== b.scheduledStartAt) return a.scheduledStartAt.localeCompare(b.scheduledStartAt)
        return a.scheduledEndAt.localeCompare(b.scheduledEndAt)
      })

    if (!segments.length) return null
    const first = segments[0]
    const last = segments.reduce((latest, segment) =>
      segment.scheduledEndAt > latest.scheduledEndAt ? segment : latest
    , segments[0])

    return {
      scheduleOwnerDeviceId,
      orderId: first.orderId,
      scheduledStartAt: first.scheduledStartAt,
      scheduledEndAt: last.scheduledEndAt,
      scheduleSegments: segments.map((segment) => ({
        scheduled_start_at: segment.scheduledStartAt,
        scheduled_end_at: segment.scheduledEndAt,
      })),
      segments,
    }
  }

  function applySavedDeviceSchedule(
    scheduleOwnerDeviceId: string,
    schedule: ReturnType<typeof getScheduleChangePayload> | null,
    data?: {
      scheduled_start_at?: string | null
      scheduled_end_at?: string | null
      schedule_segments?: Array<{ scheduled_start_at?: string | null; scheduled_end_at?: string | null }>
    }
  ) {
    const row = getDeviceRow(scheduleOwnerDeviceId)
    if (!row) return
    row.device.scheduledStartAt = data?.scheduled_start_at || schedule?.scheduledStartAt || null
    row.device.scheduledEndAt = data?.scheduled_end_at || schedule?.scheduledEndAt || null
    const responseSegments = normalizeScheduleSegments(data?.schedule_segments)
    const payloadSegments = schedule?.scheduleSegments.map((segment) => ({
      scheduledStartAt: segment.scheduled_start_at,
      scheduledEndAt: segment.scheduled_end_at,
    })) || []
    row.device.scheduleSegments = responseSegments.length ? responseSegments : payloadSegments
    const selectedThisOwner = selectedScheduledEventIds.value.some(
      (eventId) => scheduledEvents.value[eventId]?.scheduleOwnerDeviceId === scheduleOwnerDeviceId
    )
    const savedEvents = eventsFromDevice(row.order, row.device)
    setOwnerEvents(scheduleOwnerDeviceId, savedEvents)
    if (selectedThisOwner) {
      const savedIds = new Set(savedEvents.map((event) => event.eventId))
      selectedScheduledEventIds.value = [
        ...selectedScheduledEventIds.value.filter((eventId) => {
          const event = scheduledEvents.value[eventId]
          return event && event.scheduleOwnerDeviceId !== scheduleOwnerDeviceId
        }),
        ...savedEvents.filter((event) => savedIds.has(event.eventId)).map((event) => event.eventId),
      ]
    }
  }

  async function persistOwnerSchedule(scheduleOwnerDeviceId: string, fallback?: ScheduledEvent[]) {
    const row = getDeviceRow(scheduleOwnerDeviceId)
    const schedule = getScheduleChangePayload(scheduleOwnerDeviceId)
    if (!row?.device?.dbId) return true

    markPendingSchedule(scheduleOwnerDeviceId, getOwnerEvents(scheduleOwnerDeviceId))
    try {
      const authOk = await initAuth()
      if (!authOk) {
        if (fallback !== undefined) setOwnerEvents(scheduleOwnerDeviceId, fallback)
        ElMessage.error('登录状态失效，请重新登录后再保存排期')
        return false
      }

      const resp = schedule
        ? await saveSimulatedWellDeviceSchedule(
            row.device.dbId,
            {
              scheduled_start_at: schedule.scheduledStartAt,
              scheduled_end_at: schedule.scheduledEndAt,
              schedule_segments: schedule.scheduleSegments,
            },
            getAuthHeaders()
          )
        : await clearSimulatedWellDeviceSchedule(row.device.dbId, getAuthHeaders())

      if (!resp.success || !resp.data || resp.data.code !== 0) {
        if (fallback !== undefined) setOwnerEvents(scheduleOwnerDeviceId, fallback)
        ElMessage.error(resp.data?.msg || resp.error || '排期保存失败')
        return false
      }

      if (schedule) {
        applySavedDeviceSchedule(scheduleOwnerDeviceId, schedule, resp.data.data)
      } else {
        row.device.scheduledStartAt = null
        row.device.scheduledEndAt = null
        row.device.scheduleSegments = []
        setOwnerEvents(scheduleOwnerDeviceId, [])
      }
      return true
    } finally {
      clearPendingSchedule(scheduleOwnerDeviceId)
    }
  }

  async function persistScheduledEvent(eventId: string, fallback?: ScheduledEvent[]) {
    const event = getScheduledEvent(eventId) || fallback?.[0]
    if (!event) return true
    return persistOwnerSchedule(event.scheduleOwnerDeviceId, fallback)
  }

  const unscheduledOrders = computed(() => {
    const kw = searchKeyword.value.trim().toLowerCase()

    return workOrders.value.filter((order) => {
      if (!kw) return true
      const deviceHay = order.deviceList.map((d) => `${d.name} ${d.code || ''} ${d.sn || ''}`).join(' ')
      const hay = `${order.id} ${order.customer} ${order.planTime} ${order.taskDesc} ${deviceHay}`.toLowerCase()
      return hay.includes(kw)
    })
  })

  const unscheduledDevices = computed<UnscheduledDeviceRow[]>(() => {
    const scheduledDeviceIds = new Set<string>([
      ...Object.values(scheduledEvents.value).map((event) => event.scheduleOwnerDeviceId),
      ...Object.values(scheduledEventsTentative.value).map((event) => event.scheduleOwnerDeviceId)
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

  function handleDeviceDragStart(e: DragEvent, order: { id: string; label: string }) {
    draggedOrderId.value = order.id
    draggedOrderMeta.value = order
    isDragging.value = true
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', order.id)
      e.dataTransfer.setData('application/json', JSON.stringify(order))
    }
  }

  function handleDragEnd() {
    draggedOrderId.value = null
    draggedOrderMeta.value = null
    isDragging.value = false
  }

  function handleDragOver(e: DragEvent, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
  }

  function handleDragLeave() {}

  function getScheduleOwnerDevice(order: WorkOrder) {
    return order.deviceList.find((device) => typeof device.dbId === 'number') || order.deviceList[0] || null
  }

  async function scheduleDevice(
    orderId: string,
    dateStr: string,
    timeKey: string,
    isPast: boolean,
    isTentative: boolean,
    meta?: { label?: string } | null
  ) {
    if (isPast) return
    // 24:00 是当天排程的结束边界；全天可排程的最后一个有效时段为 23:00–24:00。
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return

    const order = getWorkOrderById(orderId)
    if (!order || !order.deviceList.length) return
    const ownerDevice = getScheduleOwnerDevice(order)
    if (!ownerDevice) return

    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, timeSlots.value.length - 1 - startIdx)
    const previousOwnerEvents = getOwnerEvents(ownerDevice.id)
    const previousSelected = [...selectedScheduledEventIds.value]
    const eventId = makeScheduleEventId(order.id, ownerDevice.id)
    const nextEvent: ScheduledEvent = {
      eventId,
      orderId: order.id,
      scheduleOwnerDeviceId: ownerDevice.id,
      deviceName: normalizeText(meta?.label) || ownerDevice.name || order.id,
      deviceNumber: ownerDevice.code || ownerDevice.sn || '',
      dateStr,
      startTimeKey: timeKey,
      span: Math.min(1, maxSpan)
    }

    if (isTentative) {
      scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [eventId]: nextEvent }
    } else {
      scheduledEvents.value = { ...scheduledEvents.value, [eventId]: nextEvent }
      selectedScheduledEventIds.value = [eventId]
    }

    if (isDragging.value) {
      isDragging.value = false
      draggedOrderId.value = null
    }
    if (!isTentative) {
      try {
        const saved = await persistScheduledEvent(eventId, previousOwnerEvents)
        if (!saved) {
          setOwnerEvents(ownerDevice.id, previousOwnerEvents)
          selectedScheduledEventIds.value = previousSelected
        }
      } catch (error) {
        setOwnerEvents(ownerDevice.id, previousOwnerEvents)
        selectedScheduledEventIds.value = previousSelected
        ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
      }
    }
  }

  async function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    const orderId = e.dataTransfer?.getData('text/plain') || draggedOrderId.value
    if (!orderId) return
    let meta = draggedOrderMeta.value
    const raw = e.dataTransfer?.getData('application/json')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        meta = {
          id: String(parsed?.id || orderId),
          label: String(parsed?.label || '')
        }
      } catch {}
    }
    const isTentative = !!(e && (e.shiftKey || (e as DragEvent & { altKey?: boolean }).altKey))
    await scheduleDevice(orderId, dateStr, timeKey, isPast, isTentative, meta)
  }

  async function handleUnschedule(cellKey: string, eventId: string) {
    void cellKey
    const removed = scheduledEvents.value[eventId]
    if (!removed) return
    const previousOwnerEvents = getOwnerEvents(removed.scheduleOwnerDeviceId)
    const previousSelected = [...selectedScheduledEventIds.value]
    const next = { ...scheduledEvents.value }
    delete next[eventId]
    scheduledEvents.value = next
    selectedScheduledEventIds.value = selectedScheduledEventIds.value.filter((x) => x !== eventId)

    const rollback = () => {
      setOwnerEvents(removed.scheduleOwnerDeviceId, previousOwnerEvents)
      selectedScheduledEventIds.value = previousSelected
    }

    try {
      const saved = await persistOwnerSchedule(removed.scheduleOwnerDeviceId, previousOwnerEvents)
      if (!saved) {
        rollback()
      }
    } catch (error) {
      rollback()
      ElMessage.error(error instanceof Error ? error.message : '取消排期失败')
    }
  }

  function handleUnscheduleTentative(cellKey: string, eventId: string) {
    void cellKey
    const next = { ...scheduledEventsTentative.value }
    delete next[eventId]
    scheduledEventsTentative.value = next
  }

  function handleSelectScheduledEvent(eventId: string) {
    const set = new Set(selectedScheduledEventIds.value)
    if (set.has(eventId)) set.delete(eventId)
    else set.add(eventId)
    selectedScheduledEventIds.value = Array.from(set)
  }

  function consumeDevices(deviceIds: string[]) {
    const consumed = new Set((deviceIds || []).filter(Boolean))
    if (consumed.size === 0) return

    const affectedOrderIds = new Set<string>()
    workOrders.value.forEach((order) => {
      if ((order.deviceList || []).some((d) => consumed.has(d.id))) affectedOrderIds.add(order.id)
    })

    workOrders.value = workOrders.value
      .map((order) => {
        const nextDeviceList = (order.deviceList || []).filter((d) => !consumed.has(d.id))
        return {
          ...order,
          devices: nextDeviceList.length,
          deviceList: nextDeviceList
        }
      })
      .filter((order) => order.devices > 0 && order.deviceList.length > 0)

    const nextScheduled = { ...scheduledEvents.value }
    const nextTentative = { ...scheduledEventsTentative.value }
    Object.entries(nextScheduled).forEach(([eventId, event]) => {
      if (affectedOrderIds.has(event.orderId)) delete nextScheduled[eventId]
    })
    Object.entries(nextTentative).forEach(([eventId, event]) => {
      if (affectedOrderIds.has(event.orderId)) delete nextTentative[eventId]
    })
    scheduledEvents.value = nextScheduled
    scheduledEventsTentative.value = nextTentative
    selectedScheduledEventIds.value = selectedScheduledEventIds.value.filter((eventId) => {
      const event = nextScheduled[eventId] || nextTentative[eventId]
      return event && !affectedOrderIds.has(event.orderId)
    })
  }

  const getEvent = (eventId: string) => {
    const normal = scheduledEvents.value[eventId]
    if (normal) return { ...normal, isTentative: false }
    const tentative = scheduledEventsTentative.value[eventId]
    if (tentative) return { ...tentative, isTentative: true }
    return null
  }

  const setEventSpan = (eventId: string, span: number) => {
    const ev = getEvent(eventId)
    if (!ev) return
    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return
    const maxSpan = Math.max(1, timeSlots.value.length - 1 - startIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    if (nextSpan === ev.span) return
    const next: ScheduledEvent = {
      eventId,
      orderId: ev.orderId,
      scheduleOwnerDeviceId: ev.scheduleOwnerDeviceId,
      deviceName: ev.deviceName,
      deviceNumber: ev.deviceNumber,
      dateStr: ev.dateStr,
      startTimeKey: ev.startTimeKey,
      span: nextSpan
    }
    if (ev.isTentative) scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [eventId]: next }
    else scheduledEvents.value = { ...scheduledEvents.value, [eventId]: next }
  }

  const resizing = ref<{
    eventId: string
    startY: number
    originSpan: number
    originStartIdx: number
    mode: 'bottom' | 'top'
  } | null>(null)
  const resizingEventId = computed(() => resizing.value?.eventId || null)
  const isResizing = computed(() => !!resizing.value)

  const setEventStartAndSpan = (eventId: string, startIdx: number, span: number) => {
    const ev = getEvent(eventId)
    if (!ev) return
    const maxStartIdx = Math.max(0, timeSlots.value.length - 2)
    const nextStartIdx = Math.max(0, Math.min(maxStartIdx, startIdx))
    const nextStartKey = timeSlots.value[nextStartIdx]?.key
    if (!nextStartKey) return
    const maxSpan = Math.max(1, timeSlots.value.length - 1 - nextStartIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    const next = {
      eventId,
      orderId: ev.orderId,
      scheduleOwnerDeviceId: ev.scheduleOwnerDeviceId,
      deviceName: ev.deviceName,
      deviceNumber: ev.deviceNumber,
      dateStr: ev.dateStr,
      startTimeKey: nextStartKey,
      span: nextSpan
    }
    if (ev.isTentative) scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [eventId]: next }
    else scheduledEvents.value = { ...scheduledEvents.value, [eventId]: next }
  }

  const startResize = (eventId: string, e: MouseEvent) => {
    const ev = getEvent(eventId)
    if (!ev) return
    const previousOwnerEvents = getOwnerEvents(ev.scheduleOwnerDeviceId)
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { eventId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'bottom' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      if (ctx.mode === 'bottom') {
        setEventSpan(ctx.eventId, ctx.originSpan + deltaSlots)
        return
      }
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.eventId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      if (!ev.isTentative) {
        void persistScheduledEvent(eventId, previousOwnerEvents).catch((error) => {
          setOwnerEvents(ev.scheduleOwnerDeviceId, previousOwnerEvents)
          ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
        })
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (eventId: string, e: MouseEvent) => {
    const ev = getEvent(eventId)
    if (!ev) return
    const previousOwnerEvents = getOwnerEvents(ev.scheduleOwnerDeviceId)
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { eventId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'top' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.eventId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      if (!ev.isTentative) {
        void persistScheduledEvent(eventId, previousOwnerEvents).catch((error) => {
          setOwnerEvents(ev.scheduleOwnerDeviceId, previousOwnerEvents)
          ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
        })
      }
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
    selectedScheduledEventIds,
    activeHostDeviceName,
    hostDeviceTabs,
    todayScheduledOrderIds,
    todayScheduledOrders,
    todayScheduledDeviceIds,
    todayScheduledDevices,
    selectedStartEventIds,
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
    handleSelectScheduledEvent,
    assignHostDeviceToCurrentScope,
    consumeDevices,
    getWorkOrderById,
    getDeviceRow,
    startResize,
    startResizeTop,
    resizingEventId,
    isResizing
  }
}
