import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import {
  clearSimulatedWellDeviceSchedule,
  getSimulatedWellOrderDetail,
  listSimulatedWellOrders,
  type SimulatedWellOrderDTO,
} from '@/services/simulated-well-api'
import { listSimulatedWellDownholeWorks } from '@/services/simulated-well-downhole-api'
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
  const draggedOrderId = ref<string | null>(null)
  const draggedOrderMeta = ref<{ id: string; label: string } | null>(null)

  const workOrders = ref<WorkOrder[]>([])

  const buildSavedDownholeDeviceIds = (items: any[]) => {
    const set = new Set<string>()
    ;(items || []).forEach((work) => {
      const devices = Array.isArray(work?.devices) ? work.devices : []
      devices.forEach((device: any) => {
        const orderId = normalizeText(device?.orderId || device?.order_id || '')
        const sn = normalizeText(device?.sn || device?.code || device?.device_number || '')
        if (!orderId || !sn) return
        set.add(`${orderId}::${sn}`)
      })
    })
    return set
  }

  const refreshWorkOrders = async () => {
    await initAuth()
    const headers = getAuthHeaders()
    const [orderRes1, orderRes2, downholeRes] = await Promise.all([
      listSimulatedWellOrders(
        { page: 1, pageSize: 2000, status: 1, includeDevices: true },
        headers
      ),
      listSimulatedWellOrders(
        { page: 1, pageSize: 2000, status: 2, includeDevices: true },
        headers
      ),
      listSimulatedWellDownholeWorks({ page: 1, pageSize: 2000 }, headers)
    ])
    if (!orderRes1.success || !orderRes2.success) return
    if (orderRes1.data?.code !== 0 || orderRes2.data?.code !== 0) return

    const savedDownholeDeviceIds =
      downholeRes.success && downholeRes.data?.code === 0
        ? buildSavedDownholeDeviceIds(downholeRes.data.data?.list || [])
        : new Set<string>()

    const combined = [...(orderRes1.data.data?.list || []), ...(orderRes2.data.data?.list || [])]
    workOrders.value = combined
      .map((dto) => {
        const orderId = dto.task_number
        const devices = dto.devices || []
        const remainingDevices = devices.filter(
          (d) => !savedDownholeDeviceIds.has(`${orderId}::${normalizeText(d.device_number)}`)
        )
        return {
          id: orderId,
          dbId: dto.id,
          customer: normalizeText(dto.customer_unit) || '—',
          devices: remainingDevices.length,
          status: String(dto.status_text || dto.status || ''),
          createTime: toYmd(dto.created_at) || '',
          planTime: toYmd(dto.plan_date) || '',
          taskDesc: normalizeText(dto.project_name || dto.task_desc) || '',
          testPurpose: normalizeText(dto.test_purpose) || '',
          testSteps: normalizeText(dto.test_steps) || '',
          safetyRisks: normalizeText(dto.safety_risks) || '',
          deviceList: remainingDevices.map((d) => ({
            id: `${orderId}::${d.device_number}`,
            dbId: d.id,
            name: normalizeText(d.device_name) || '—',
            sn: normalizeText(d.device_number) || '',
            code: normalizeText(d.device_number) || '',
            template: normalizeText(d.device_number) || '',
            scheduledStartAt: d.scheduled_start_at || null,
            scheduledEndAt: d.scheduled_end_at || null
          })),
          supportingTools: []
        }
      })
      .filter((order) => order.devices > 0 && order.deviceList.length > 0)
    restoreScheduledEvents(workOrders.value)
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
    deviceName: string
    deviceNumber: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent>>({})
  const scheduledEventsTentative = ref<Record<string, ScheduledEvent>>({})
  const pendingScheduleEvents = ref<Record<string, ScheduledEvent | null>>({})
  const selectedScheduledDeviceIds = ref<string[]>([])

  function makeScheduleEventId(orderId: string) {
    return `${orderId}::evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function markPendingSchedule(deviceId: string, event: ScheduledEvent | null) {
    pendingScheduleEvents.value = {
      ...pendingScheduleEvents.value,
      [deviceId]: event ? { ...event } : null,
    }
  }

  function clearPendingSchedule(deviceId: string) {
    const next = { ...pendingScheduleEvents.value }
    delete next[deviceId]
    pendingScheduleEvents.value = next
  }

  function parseBackendDateTime(value?: string | null) {
    if (!value) return null
    const text = value.includes('T') ? value : value.replace(' ', 'T')
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  function eventFromDevice(order: WorkOrder, device: WorkOrder['deviceList'][number]): ScheduledEvent | null {
    const start = parseBackendDateTime(device.scheduledStartAt)
    const end = parseBackendDateTime(device.scheduledEndAt)
    if (!start || !end || end <= start) return null
    const startTimeKey = `${String(start.getHours()).padStart(2, '0')}00`
    if (timeKeyToIndex.value[startTimeKey] === undefined) return null
    const span = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (60 * 60 * 1000)))
    const deviceNumber = normalizeText(device.code || device.sn)
    const eventId = `${order.id}::saved-${device.id}`
    return {
      eventId,
      orderId: order.id,
      deviceName: device.name,
      deviceNumber,
      dateStr: fmtDate(start),
      startTimeKey,
      span,
    }
  }

  function restoreScheduledEvents(orders: WorkOrder[]) {
    const next: Record<string, ScheduledEvent> = {}
    orders.forEach((order) => {
      order.deviceList.forEach((device) => {
        const ev = eventFromDevice(order, device)
        if (ev) next[ev.eventId] = ev
      })
    })
    Object.entries(pendingScheduleEvents.value).forEach(([eventId, event]) => {
      if (event) next[eventId] = event
      else delete next[eventId]
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
      map[cellKey].push(ev.eventId)
    })
    return map
  })

  const scheduledOrdersTentative = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEventsTentative.value).forEach((ev) => {
      const cellKey = getCellKey(ev.dateStr, ev.startTimeKey)
      if (!map[cellKey]) map[cellKey] = []
      map[cellKey].push(ev.eventId)
    })
    return map
  })

  type ScheduledLayoutItem = {
    deviceId: string
    eventId: string
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
          deviceId: x.ev.eventId,
          eventId: x.ev.eventId,
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
      if (ev.dateStr === todayDateStr.value) ids.add(ev.eventId)
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
      ;(order.deviceList || []).forEach((device) => {
        const deviceNumber = normalizeText(device.code || device.sn)
        const key = `${order.id}::${deviceNumber}`
        if (list.has(key)) return
        list.set(key, {
          orderId: order.id,
          customer: order.customer,
          deviceName: device.name,
          sn: deviceNumber,
          template: device.template || deviceNumber || 'DEFAULT_DOWNHOLE_REPORT'
        })
      })
    })
    return Array.from(list.values())
  })

  const selectedStartDeviceIds = computed(() => {
    return selectedScheduledDeviceIds.value.filter((id) => !!scheduledEvents.value[id] || !!scheduledEventsTentative.value[id])
  })

  const selectedStartDevices = computed<DownholeDevice[]>(() => {
    const list = new Map<string, DownholeDevice>()
    selectedStartDeviceIds.value.forEach((eventId) => {
      const ev = scheduledEvents.value[eventId] || scheduledEventsTentative.value[eventId]
      const order = ev ? getWorkOrderById(ev.orderId) : null
      if (!order) return
      ;(order.deviceList || []).forEach((device) => {
        const deviceNumber = normalizeText(device.code || device.sn)
        const key = `${order.id}::${deviceNumber}`
        if (list.has(key)) return
        list.set(key, {
          orderId: order.id,
          customer: order.customer,
          deviceName: device.name,
          sn: deviceNumber,
          template: device.template || deviceNumber || 'DEFAULT_DOWNHOLE_REPORT'
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
      selectedStartDeviceIds.value
        .map((eventId) => scheduledEvents.value[eventId] || scheduledEventsTentative.value[eventId])
        .filter(Boolean)
        .map((event) => event!.orderId)
    )
    return workOrders.value
      .map((order) => {
        if (!selectedOrderIds.has(order.id)) return null
        const deviceList = order.deviceList
        return {
          ...order,
          devices: deviceList.length,
          deviceList,
        }
      })
      .filter((order): order is WorkOrder => !!order && order.deviceList.length > 0)
  })

  const getWorkOrderById = (id: string) => workOrders.value.find((o) => o.id === id)

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

  async function persistScheduledEvent(deviceId: string, fallback?: ScheduledEvent) {
    // 模拟井现在允许同一工单存在多个排程块，旧的单设备排程接口无法表达多块排程。
    void deviceId
    void fallback
    return true
  }
  /*
    const row = getDeviceRow(deviceId)
    const schedule = getScheduleChangePayload(deviceId)
    if (!row?.device?.dbId || !schedule) return true

    markPendingSchedule(deviceId, scheduledEvents.value[deviceId] || null)
    try {
      const authOk = await initAuth()
      if (!authOk) {
        if (fallback) scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: fallback }
        ElMessage.error('登录状态失效，请重新登录后再保存排期')
        return false
      }
      const resp = await saveSimulatedWellDeviceSchedule(
        row.device.dbId,
        {
          scheduled_start_at: schedule.scheduledStartAt,
          scheduled_end_at: schedule.scheduledEndAt,
        },
        getAuthHeaders()
      )
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        if (fallback) scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: fallback }
        ElMessage.error(resp.data?.msg || resp.error || '排期保存失败')
        return false
      }
      row.device.scheduledStartAt = resp.data.data?.scheduled_start_at || schedule.scheduledStartAt
      row.device.scheduledEndAt = resp.data.data?.scheduled_end_at || schedule.scheduledEndAt
      const savedEvent = eventFromDevice(row.order, row.device)
      if (savedEvent) scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: savedEvent }
      return true
    } finally {
      clearPendingSchedule(deviceId)
    }
  }

  */

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

  async function scheduleDevice(
    orderId: string,
    dateStr: string,
    timeKey: string,
    isPast: boolean,
    isTentative: boolean,
    meta?: { label?: string } | null
  ) {
    if (isPast) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return

    const order = getWorkOrderById(orderId)
    if (!order || !order.deviceList.length) return

    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, timeSlots.value.length - 1 - startIdx)
    const previousEvents = { ...scheduledEvents.value }
    const previousSelected = [...selectedScheduledDeviceIds.value]
    const eventId = makeScheduleEventId(order.id)
    const nextEvent: ScheduledEvent = {
      eventId,
      orderId: order.id,
      deviceName: normalizeText(meta?.label) || order.deviceList[0]?.name || order.id,
      deviceNumber: order.deviceList[0]?.code || order.deviceList[0]?.sn || '',
      dateStr,
      startTimeKey: timeKey,
      span: Math.min(1, maxSpan)
    }

    if (isTentative) {
      scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [eventId]: nextEvent }
    } else {
      scheduledEvents.value = { ...scheduledEvents.value, [eventId]: nextEvent }
      selectedScheduledDeviceIds.value = [eventId]
    }

    if (isDragging.value) {
      isDragging.value = false
      draggedOrderId.value = null
    }
    if (!isTentative) {
      try {
        const saved = await persistScheduledEvent(eventId)
        if (!saved) {
          scheduledEvents.value = previousEvents
          selectedScheduledDeviceIds.value = previousSelected
        }
      } catch (error) {
        scheduledEvents.value = previousEvents
        selectedScheduledDeviceIds.value = previousSelected
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

  async function handleUnschedule(cellKey: string, deviceId: string) {
    void cellKey
    const removed = scheduledEvents.value[deviceId]
    const previousSelected = [...selectedScheduledDeviceIds.value]
    const next = { ...scheduledEvents.value }
    delete next[deviceId]
    scheduledEvents.value = next
    selectedScheduledDeviceIds.value = selectedScheduledDeviceIds.value.filter((x) => x !== deviceId)
    const row = getDeviceRow(deviceId)
    if (!row?.device?.dbId) return
    markPendingSchedule(deviceId, null)

    const rollback = () => {
      if (removed) scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: removed }
      selectedScheduledDeviceIds.value = previousSelected
    }

    try {
      const authOk = await initAuth()
      if (!authOk) {
        rollback()
        ElMessage.error('登录状态失效，请重新登录后再取消排期')
        return
      }
      const resp = await clearSimulatedWellDeviceSchedule(row.device.dbId, getAuthHeaders())
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        rollback()
        ElMessage.error(resp.data?.msg || resp.error || '取消排期失败')
        return
      }
      row.device.scheduledStartAt = null
      row.device.scheduledEndAt = null
    } catch (error) {
      rollback()
      ElMessage.error(error instanceof Error ? error.message : '取消排期失败')
    } finally {
      clearPendingSchedule(deviceId)
    }
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
    selectedScheduledDeviceIds.value = selectedScheduledDeviceIds.value.filter((eventId) => {
      const event = nextScheduled[eventId] || nextTentative[eventId]
      return event && !affectedOrderIds.has(event.orderId)
    })
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
    const next: ScheduledEvent = {
      eventId: deviceId,
      orderId: ev.orderId,
      deviceName: ev.deviceName,
      deviceNumber: ev.deviceNumber,
      dateStr: ev.dateStr,
      startTimeKey: ev.startTimeKey,
      span: nextSpan
    }
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
    const next = {
      eventId: deviceId,
      orderId: ev.orderId,
      deviceName: ev.deviceName,
      deviceNumber: ev.deviceNumber,
      dateStr: ev.dateStr,
      startTimeKey: nextStartKey,
      span: nextSpan
    }
    if (ev.isTentative) scheduledEventsTentative.value = { ...scheduledEventsTentative.value, [deviceId]: next }
    else scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: next }
  }

  const startResize = (deviceId: string, e: MouseEvent) => {
    const ev = getEvent(deviceId)
    if (!ev) return
    const previous: ScheduledEvent = {
      eventId: deviceId,
      orderId: ev.orderId,
      deviceName: ev.deviceName,
      deviceNumber: ev.deviceNumber,
      dateStr: ev.dateStr,
      startTimeKey: ev.startTimeKey,
      span: ev.span
    }
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
      if (!ev.isTentative) {
        void persistScheduledEvent(deviceId, previous).catch((error) => {
          scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: previous }
          ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
        })
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (deviceId: string, e: MouseEvent) => {
    const ev = getEvent(deviceId)
    if (!ev) return
    const previous: ScheduledEvent = {
      eventId: deviceId,
      orderId: ev.orderId,
      deviceName: ev.deviceName,
      deviceNumber: ev.deviceNumber,
      dateStr: ev.dateStr,
      startTimeKey: ev.startTimeKey,
      span: ev.span
    }
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
      if (!ev.isTentative) {
        void persistScheduledEvent(deviceId, previous).catch((error) => {
          scheduledEvents.value = { ...scheduledEvents.value, [deviceId]: previous }
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
    consumeDevices,
    getWorkOrderById,
    getDeviceRow,
    startResize,
    startResizeTop,
    resizingDeviceId,
    isResizing
  }
}
