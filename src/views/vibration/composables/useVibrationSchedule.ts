import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { TimeSlot, VibrationInstrument, WeekDay, WorkOrder, WorkOrderScheduleSegment } from '../types'
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

function createScheduleEventId(orderId: string) {
  return `${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const VIBRATION_RUNNING_INSTRUMENTS_KEY = 'vibration-running-instrument-ids'
const VIBRATION_COMPLETED_INSTRUMENTS_KEY = 'vibration-completed-instrument-ids-v2'

function getInstrumentRuntimeKeys(orderId: string, instrument: VibrationInstrument) {
  return Array.from(new Set([
    instrument.id,
    `${orderId}::${instrument.id}`,
    instrument.dbId ? `${orderId}::db:${instrument.dbId}` : '',
    instrument.sn ? `${orderId}::sn:${instrument.sn}` : '',
    instrument.name ? `${orderId}::name:${instrument.name}` : '',
  ].filter(Boolean)))
}

export function useVibrationSchedule() {
  const { initAuth, getAuthHeaders } = useAuth()
  const searchKeyword = ref('')
  const draggedOrder = ref<WorkOrder | null>(null)
  const selectedScheduledOrderIds = ref<string[]>([])
  const isDragging = ref(false)
  const slotHeightPx = 44
  const runningInstrumentIds = ref<Record<string, true>>({})
  const completedInstrumentIds = ref<Record<string, true>>({})

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
          quantity: item.quantity,
          weight: item.weight,
          length: item.length,
          maxDiameter: item.max_diameter,
          status: item.instrument_status ?? item.status,
          statusText: item.status_text || item.statusText,
          completed: item.is_completed === true || item.instrument_status === 2,
        }
      })
    }

    const fallbackSn = (dto as any).device_number || (dto as any).deviceNumber || dto.order_no
    return [{
      id: `vib-ins-${dto.id}-${fallbackSn}`,
      name: dto.device_name || '振动台仪器',
      sn: fallbackSn,
      status: dto.status,
      statusText: dto.status_text,
      completed: false,
    }]
  }

  function mapVibrationTableOrder(dto: VibrationTableOrderDTO): WorkOrder {
    const instruments = normalizeVibrationInstruments(dto)
    const scheduleSegments: WorkOrderScheduleSegment[] = Array.isArray(dto.schedule_segments)
      ? dto.schedule_segments
          .map((segment) => {
            const scheduledStartAt = segment?.scheduled_start_at || ''
            const scheduledEndAt = segment?.scheduled_end_at || ''
            if (!scheduledStartAt || !scheduledEndAt) return null
            return { scheduledStartAt, scheduledEndAt }
          })
          .filter(Boolean) as WorkOrderScheduleSegment[]
      : []
    return {
      id: dto.order_no,
      dbId: dto.id,
      status: dto.status,
      statusText: dto.status_text,
      scheduledStartAt: dto.scheduled_start_at || null,
      scheduledEndAt: dto.scheduled_end_at || null,
      scheduleSegments,
      planTime: dto.planned_time || dto.test_date || dto.application_date || null,
      deviceNumber: (dto as any).device_number || (dto as any).deviceNumber || '',
      orderType: dto.order_type || '',
      applicationUnit: dto.test_application_unit || '',
      applicationUnitManager: dto.test_application_unit_manager || '',
      applicationDate: dto.application_date || null,
      researchNumber: dto.research_number || '',
      projectBudgetNumber: dto.project_budget_number || '',
      projectName: dto.project_name || '',
      client: dto.client || '',
      taskNumber: dto.task_number || null,
      tableNo: dto.table_no || null,
      testType: dto.test_type || '',
      testDate: dto.test_date || null,
      vibrationDirection: dto.vibration_direction || '',
      acceleration: dto.acceleration || '',
      slope: dto.slope || '',
      frequency: dto.frequency || '',
      vibrationTimes: dto.vibration_times,
      projectMembers: dto.project_members || '',
      equipmentList: dto.equipment_list || '',
      instrumentCombination: dto.instrument_combination || '',
      testSteps: dto.test_steps || '',
      safetyRisks: dto.safety_risks || '',
      createdAt: dto.created_at || '',
      updatedAt: dto.updated_at || '',
      remark: dto.remark || '',
      type: dto.test_type || dto.order_type || '正式实验',
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
      reconcileRuntimeInstrumentCaches(nextOrders)
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
    eventId: string
    orderId: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent[]>>({})
  const pendingScheduleEvents = ref<Record<string, ScheduledEvent[] | null>>({})

  function cloneScheduledEventList(events?: ScheduledEvent[] | null) {
    return (events || []).map((event) => ({ ...event }))
  }

  function cloneScheduledEventMap(source: Record<string, ScheduledEvent[]> = scheduledEvents.value) {
    const next: Record<string, ScheduledEvent[]> = {}
    Object.entries(source).forEach(([orderId, events]) => {
      next[orderId] = cloneScheduledEventList(events)
    })
    return next
  }

  function sortScheduledEvents(events: ScheduledEvent[]) {
    return [...events].sort((a, b) => {
      if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr)
      if (a.startTimeKey !== b.startTimeKey) return a.startTimeKey.localeCompare(b.startTimeKey)
      return a.eventId.localeCompare(b.eventId)
    })
  }

  function getOrderEvents(orderId: string) {
    return scheduledEvents.value[orderId] || []
  }

  function setOrderEvents(orderId: string, events: ScheduledEvent[]) {
    const next = { ...scheduledEvents.value }
    const normalized = sortScheduledEvents(cloneScheduledEventList(events))
    if (normalized.length) next[orderId] = normalized
    else delete next[orderId]
    scheduledEvents.value = next
  }

  function findEventById(eventId: string) {
    for (const [orderId, events] of Object.entries(scheduledEvents.value)) {
      const index = events.findIndex((event) => event.eventId === eventId)
      if (index !== -1) {
        return { orderId, index, event: events[index] }
      }
    }
    return null
  }

  function markPendingSchedule(orderId: string, events: ScheduledEvent[] | null) {
    pendingScheduleEvents.value = {
      ...pendingScheduleEvents.value,
      [orderId]: events ? cloneScheduledEventList(events) : null,
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

  function eventsFromOrder(order: WorkOrder): ScheduledEvent[] {
    const segments = order.scheduleSegments?.length
      ? order.scheduleSegments
      : order.scheduledStartAt && order.scheduledEndAt
        ? [{ scheduledStartAt: order.scheduledStartAt, scheduledEndAt: order.scheduledEndAt }]
        : []

    return segments
      .map((segment, index) => {
        const start = parseBackendDateTime(segment.scheduledStartAt)
        const end = parseBackendDateTime(segment.scheduledEndAt)
        if (!start || !end || end <= start) return null
        const startTimeKey = `${String(start.getHours()).padStart(2, '0')}00`
        if (timeKeyToIndex.value[startTimeKey] === undefined) return null
        const span = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (60 * 60 * 1000)))
        return {
          eventId: `${order.id}-${index}-${start.getTime()}-${end.getTime()}`,
          orderId: order.id,
          dateStr: fmtDate(start),
          startTimeKey,
          span,
        }
      })
      .filter(Boolean) as ScheduledEvent[]
  }

  function restoreScheduledEvents(orders: WorkOrder[]) {
    const next: Record<string, ScheduledEvent[]> = {}
    orders.forEach((order) => {
      const events = eventsFromOrder(order)
      if (events.length) next[order.id] = events
    })
    Object.entries(pendingScheduleEvents.value).forEach(([orderId, event]) => {
      if (event?.length) {
        next[orderId] = cloneScheduledEventList(event)
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

  type ScheduleChangeSegment = {
    eventId: string
    orderId: string
    dateStr: string
    startTimeKey: string
    endTimeKey: string
    span: number
    startAtHour: string
    endAtHour: string
    scheduledStartAt: string
    scheduledEndAt: string
  }

  type ScheduleChangePayload = {
    orderId: string
    dateStr: string
    startTimeKey: string
    endTimeKey: string
    span: number
    startAtHour: string
    endAtHour: string
    scheduledStartAt: string
    scheduledEndAt: string
    scheduleSegments: Array<{
      scheduled_start_at: string
      scheduled_end_at: string
    }>
    segments: ScheduleChangeSegment[]
  }

  const getScheduleChangePayload = (orderId: string): ScheduleChangePayload | null => {
    const events = getOrderEvents(orderId)
    if (!events.length) return null
    const segments = events
      .map((ev) => {
        const endTimeKey = getEndTimeKey(ev.startTimeKey, ev.span)
        if (!endTimeKey) return null
        const startHh = timeKeyToHour(ev.startTimeKey)
        const endHh = timeKeyToHour(endTimeKey)
        if (!startHh || !endHh) return null
        return {
          eventId: ev.eventId,
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
      })
      .filter((segment): segment is ScheduleChangeSegment => !!segment)

    if (!segments.length) return null

    const sorted = [...segments].sort((a, b) => {
      if (a.scheduledStartAt !== b.scheduledStartAt) return a.scheduledStartAt.localeCompare(b.scheduledStartAt)
      return a.scheduledEndAt.localeCompare(b.scheduledEndAt)
    })
    const first = sorted[0]
    const last = sorted[sorted.length - 1]

    return {
      orderId,
      dateStr: first.dateStr,
      startTimeKey: first.startTimeKey,
      endTimeKey: last.endTimeKey,
      span: sorted.reduce((sum, item) => sum + item.span, 0),
      startAtHour: first.startAtHour,
      endAtHour: last.endAtHour,
      scheduledStartAt: first.scheduledStartAt,
      scheduledEndAt: last.scheduledEndAt,
      scheduleSegments: sorted.map((item) => ({
        scheduled_start_at: item.scheduledStartAt,
        scheduled_end_at: item.scheduledEndAt,
      })),
      segments: sorted,
    }
  }

  async function persistScheduledEvent(orderId: string, fallback?: ScheduledEvent[]) {
    const order = getOrderById(orderId)
    const schedule = getScheduleChangePayload(orderId)
    if (!order?.dbId) return true

    markPendingSchedule(orderId, getOrderEvents(orderId))
    try {
      const authOk = await initAuth()
      if (!authOk) {
        if (fallback !== undefined) setOrderEvents(orderId, fallback)
        ElMessage.error('登录状态失效，请重新登录后再保存排期')
        return false
      }
      const resp = schedule
        ? await saveVibrationTableOrderSchedule(
            order.dbId,
            {
              scheduled_start_at: schedule.scheduledStartAt,
              scheduled_end_at: schedule.scheduledEndAt,
              schedule_segments: schedule.scheduleSegments,
            },
            getAuthHeaders()
          )
        : await clearVibrationTableOrderSchedule(order.dbId, getAuthHeaders())
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        if (fallback !== undefined) setOrderEvents(orderId, fallback)
        ElMessage.error(resp.data?.msg || resp.error || '排期保存失败')
        return false
      }
      const saved = resp.data.data
      if (saved) {
        const updated = mapVibrationTableOrder(saved)
        workOrders.value = workOrders.value.map(item => item.id === updated.id ? updated : item)
        setOrderEvents(updated.id, eventsFromOrder(updated))
      }
      return true
    } finally {
      clearPendingSchedule(orderId)
    }
  }

  const scheduledOrders = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEvents.value).forEach((events) => {
      events.forEach((ev) => {
        const cellKey = getCellKey(ev.dateStr, ev.startTimeKey)
        if (!map[cellKey]) map[cellKey] = []
        map[cellKey].push(ev.orderId)
      })
    })
    return map
  })

  type ScheduledLayoutItem = {
    eventId: string
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
    Object.values(scheduledEvents.value).forEach((events) => {
      events.forEach((ev) => {
        if (!dayMap[ev.dateStr]) dayMap[ev.dateStr] = []
        dayMap[ev.dateStr].push(ev)
      })
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
      const laneByEventId: Record<string, number> = {}
      mapped.forEach((x) => {
        let lane = laneEnds.findIndex((le) => le <= x.startIdx)
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(x.endIdx)
        } else {
          laneEnds[lane] = x.endIdx
        }
        laneByEventId[x.ev.eventId] = lane
      })

      mapped.forEach((x) => {
        const cellKey = getCellKey(dateStr, x.ev.startTimeKey)
        let laneCount = 1
        for (let i = x.startIdx; i < x.endIdx; i++) {
          laneCount = Math.max(laneCount, counts[i] || 0)
        }
        out.push({
          eventId: x.ev.eventId,
          orderId: x.ev.orderId,
          dateStr,
          startTimeKey: x.ev.startTimeKey,
          startIdx: x.startIdx,
          span: x.span,
          lane: laneByEventId[x.ev.eventId] ?? 0,
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
    const kw = searchKeyword.value.trim()
    return workOrders.value.filter(o => {
      const visibleInstruments = getVisibleOrderInstruments(o)
      if (visibleInstruments.length === 0) return false
      if (!kw) return true
      return (
        o.id.includes(kw) ||
        o.applicant.includes(kw) ||
        o.device.includes(kw) ||
        o.type.includes(kw) ||
        o.level.includes(kw) ||
        visibleInstruments.some((item) => item.name.includes(kw) || item.sn.includes(kw))
      )
    })
  })

  const selectedScheduledOrders = computed(() => {
    return selectedScheduledOrderIds.value.map(id => getOrderById(id)).filter(Boolean) as WorkOrder[]
  })

  function reconcileRuntimeInstrumentCaches(orders: WorkOrder[]) {
    const nextRunning = { ...runningInstrumentIds.value }
    const nextCompleted = { ...completedInstrumentIds.value }
    let runningChanged = false
    let completedChanged = false

    orders.forEach((order) => {
      order.instruments.forEach((instrument) => {
        const keys = getInstrumentRuntimeKeys(order.id, instrument)
        const isBackendRunning = instrument.status === 1
        const isBackendCompleted = isInstrumentCompleted(order, instrument)

        if (!isBackendRunning) {
          keys.forEach((key) => {
            if (!nextRunning[key]) return
            delete nextRunning[key]
            runningChanged = true
          })
        }

        if (!isBackendCompleted) {
          keys.forEach((key) => {
            if (!nextCompleted[key]) return
            delete nextCompleted[key]
            completedChanged = true
          })
        }
      })
    })

    if (runningChanged) {
      runningInstrumentIds.value = nextRunning
      persistRunningInstrumentIds()
    }
    if (completedChanged) {
      completedInstrumentIds.value = nextCompleted
      persistCompletedInstrumentIds()
    }
  }

  function persistRunningInstrumentIds() {
    try {
      window.localStorage.setItem(VIBRATION_RUNNING_INSTRUMENTS_KEY, JSON.stringify(runningInstrumentIds.value))
    } catch {
      // ignore storage failures
    }
  }

  function persistCompletedInstrumentIds() {
    try {
      window.localStorage.setItem(VIBRATION_COMPLETED_INSTRUMENTS_KEY, JSON.stringify(completedInstrumentIds.value))
    } catch {
      // ignore storage failures
    }
  }

  function hydrateRunningInstrumentIds() {
    try {
      const raw = window.localStorage.getItem(VIBRATION_RUNNING_INSTRUMENTS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, true>
      runningInstrumentIds.value = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      runningInstrumentIds.value = {}
    }
  }

  function hydrateCompletedInstrumentIds() {
    try {
      const raw = window.localStorage.getItem(VIBRATION_COMPLETED_INSTRUMENTS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, true>
      completedInstrumentIds.value = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      completedInstrumentIds.value = {}
    }
  }

  hydrateRunningInstrumentIds()
  hydrateCompletedInstrumentIds()

  function markInstrumentsRunning(orderId: string, instruments: VibrationInstrument[]) {
    const next = { ...runningInstrumentIds.value }
    instruments.forEach((instrument) => {
      getInstrumentRuntimeKeys(orderId, instrument).forEach((key) => {
        next[key] = true
      })
    })
    runningInstrumentIds.value = next
    persistRunningInstrumentIds()
  }

  function clearRunningInstruments(orderId: string, instruments: VibrationInstrument[]) {
    const next = { ...runningInstrumentIds.value }
    instruments.forEach((instrument) => {
      getInstrumentRuntimeKeys(orderId, instrument).forEach((key) => {
        delete next[key]
      })
    })
    runningInstrumentIds.value = next
    persistRunningInstrumentIds()
  }

  function markInstrumentsCompleted(orderId: string, instruments: VibrationInstrument[]) {
    const next = { ...completedInstrumentIds.value }
    instruments.forEach((instrument) => {
      getInstrumentRuntimeKeys(orderId, instrument).forEach((key) => {
        next[key] = true
      })
    })
    completedInstrumentIds.value = next
    persistCompletedInstrumentIds()
    const completedIds = new Set(instruments.map((instrument) => instrument.id))
    workOrders.value = workOrders.value.map((order) => {
      if (order.id !== orderId) return order
      return {
        ...order,
        instruments: order.instruments.map((instrument) =>
          completedIds.has(instrument.id) ? { ...instrument, completed: true } : instrument
        ),
      }
    })
  }

  function isInstrumentCompleted(_order: WorkOrder, instrument: VibrationInstrument) {
    return (
      instrument.completed === true ||
      instrument.status === 2 ||
      instrument.status === 5
    )
  }

  function getVisibleOrderInstruments(order: WorkOrder) {
    return order.instruments.filter((instrument) => !isInstrumentCompleted(order, instrument))
  }

  function getInstrumentStatusText(order: WorkOrder, instrumentId: string) {
    const instrument = order.instruments.find((item) => item.id === instrumentId)
    const isRunning = instrument
      ? getInstrumentRuntimeKeys(order.id, instrument).some((key) => runningInstrumentIds.value[key])
      : Boolean(runningInstrumentIds.value[instrumentId])
    if (isRunning || instrument?.status === 1) return '测试中'
    if (instrument && isInstrumentCompleted(order, instrument)) return '已完成'
    if (instrument?.status === 6) return '异常'
    if (getOrderEvents(order.id).length > 0) return '已排程'
    if (instrument?.statusText?.trim()) return instrument.statusText
    return '待排程'
  }

  function prevWeek() { calBase.value = addDays(calBase.value, -7) }
  function nextWeek() { calBase.value = addDays(calBase.value, 7) }
  function gotoDate(e: Event) {
    const val = (e.target as HTMLInputElement).value
    if (val) calBase.value = getMonday(new Date(val))
  }

  function loadPresetSchedule() {
    const base = calBase.value
    const scheduled = new Set(Object.keys(scheduledEvents.value))
    const presets = workOrders.value
      .slice(0, 3)
      .filter((order) => !scheduled.has(order.id))
      .map((order, index) => ({
        d: index,
        t: ['0800', '1000', '1400'][index] || '0800',
        id: order.id,
      }))

    presets.forEach((preset) => {
      const dateStr = fmtDate(addDays(base, preset.d))
      void scheduleOrder(preset.id, dateStr, preset.t, false)
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

  async function scheduleOrder(orderId: string, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return
    const currentEvents = getOrderEvents(orderId)
    if (currentEvents.some((event) => event.dateStr === dateStr && event.startTimeKey === timeKey)) return
    const previousEvents = cloneScheduledEventMap()
    const previousSelected = [...selectedScheduledOrderIds.value]
    const order = getOrderById(orderId)
    const span = Math.max(1, Math.ceil(Number(order?.duration || 0) / 60) || 1)
    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, (timeSlots.value.length - 1) - startIdx)
    setOrderEvents(orderId, [
      ...currentEvents,
      {
        eventId: createScheduleEventId(orderId),
        orderId,
        dateStr,
        startTimeKey: timeKey,
        span: Math.min(span, maxSpan),
      },
    ])
    selectedScheduledOrderIds.value = [orderId]
    if (isDragging.value) {
      isDragging.value = false
      draggedOrder.value = null
    }
    try {
      const saved = await persistScheduledEvent(orderId, previousEvents[orderId] || [])
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

  async function handleUnschedule(_cellKey: string, orderId: string, eventId: string) {
    const previousEvents = cloneScheduledEventMap()
    const previousSelected = [...selectedScheduledOrderIds.value]
    const wasSelected = selectedScheduledOrderIds.value.includes(orderId)
    const nextEvents = getOrderEvents(orderId).filter((event) => event.eventId !== eventId)
    setOrderEvents(orderId, nextEvents)
    if (wasSelected) {
      selectedScheduledOrderIds.value = nextEvents.length
        ? selectedScheduledOrderIds.value
        : selectedScheduledOrderIds.value.filter(id => id !== orderId)
    }
    const order = getOrderById(orderId)
    if (!order?.dbId) return

    const rollback = () => {
      scheduledEvents.value = previousEvents
      if (wasSelected) selectedScheduledOrderIds.value = previousSelected
    }

    try {
      const saved = await persistScheduledEvent(orderId, previousEvents[orderId] || [])
      if (!saved) {
        rollback()
        return
      }
    } catch (error) {
      rollback()
      ElMessage.error(error instanceof Error ? error.message : '取消排期失败')
    }
  }

  function removeScheduledOrder(orderId: string) {
    if (!orderId) return
    setOrderEvents(orderId, [])
    selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
  }

  function selectScheduledOrder(orderId: string) {
    const arr = selectedScheduledOrderIds.value
    selectedScheduledOrderIds.value = arr.includes(orderId) ? arr.filter(id => id !== orderId) : [...arr, orderId]
  }

  const getEvent = (eventId: string) => findEventById(eventId)?.event

  const setEventSpan = (eventId: string, span: number) => {
    const located = findEventById(eventId)
    const ev = located?.event
    if (!located || !ev) return
    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    if (nextSpan === ev.span) return
    const nextEvents = getOrderEvents(located.orderId).map((event) =>
      event.eventId === eventId ? { ...event, span: nextSpan } : event
    )
    setOrderEvents(located.orderId, nextEvents)
  }

  const resizing = ref<{ eventId: string; orderId: string; startY: number; originSpan: number; originStartIdx: number; mode: 'bottom' | 'top' } | null>(null)
  const resizingOrderId = computed(() => resizing.value?.eventId || null)
  const isResizing = computed(() => !!resizing.value)

  const setEventStartAndSpan = (eventId: string, startIdx: number, span: number) => {
    const located = findEventById(eventId)
    const ev = located?.event
    if (!located || !ev) return
    const maxStartIdx = Math.max(0, timeSlots.value.length - 2)
    const nextStartIdx = Math.max(0, Math.min(maxStartIdx, startIdx))
    const nextStartKey = timeSlots.value[nextStartIdx]?.key
    if (!nextStartKey) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - nextStartIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    const nextEvents = getOrderEvents(located.orderId).map((event) =>
      event.eventId === eventId ? { ...event, startTimeKey: nextStartKey, span: nextSpan } : event
    )
    setOrderEvents(located.orderId, nextEvents)
  }

  function persistResizeChange(eventId: string, previous: ScheduledEvent) {
    const previousOrderEvents = getOrderEvents(previous.orderId).map((event) =>
      event.eventId === eventId ? previous : event
    )
    void persistScheduledEvent(previous.orderId, previousOrderEvents).catch((error) => {
      setOrderEvents(previous.orderId, previousOrderEvents)
      ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
    })
  }

  const startResize = (eventId: string, e: MouseEvent) => {
    const ev = getEvent(eventId)
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { eventId, orderId: ev.orderId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'bottom' }

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
      const previous = ev
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      persistResizeChange(eventId, previous)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (eventId: string, e: MouseEvent) => {
    const ev = getEvent(eventId)
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { eventId, orderId: ev.orderId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'top' }

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
      const previous = ev
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      persistResizeChange(eventId, previous)
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
    loadPresetSchedule,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    scheduleOrder,
    handleUnschedule,
    removeScheduledOrder,
    markInstrumentsRunning,
    clearRunningInstruments,
    markInstrumentsCompleted,
    getVisibleOrderInstruments,
    getInstrumentStatusText,
    selectScheduledOrder,
    getEvent,
    startResize,
    startResizeTop,
    getScheduleChangePayload,
    resizingOrderId,
    isResizing,
  }
}
