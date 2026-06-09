import { computed, ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { http } from '@/services/http'
import {
  clearHighTempPressureInstrumentSchedule,
  listHighTempPressureOrders,
  saveHighTempPressureInstrumentSchedule,
  type HighTempPressureOrderDTO,
} from '@/services/high-temp-pressure-api'
import { ElMessage } from 'element-plus'
import type { InstrumentItem, InstrumentScheduleSegment, ScheduledSelection, TimeSlotItem, WeekDayItem, WorkOrder } from '../types'

const HTP_PROGRESS_STORAGE_KEY = 'high-temp-pressure-progress'

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

function createScheduleEventId(orderId: string, dateStr: string, startTimeKey: string, span: number) {
  return `${orderId}-${dateStr}-${startTimeKey}-${span}`
}

const VISIBLE_ORDER_STATUSES = [1, 2]

function getStatusText(status?: number, fallback?: string) {
  const statusMap: Record<number, string> = {
    0: '已创建',
    1: '待领取',
    2: '测试中',
    3: '待审核',
    4: '待重做',
    5: '已完成',
    6: '异常',
    7: '暂存',
    8: '疑问',
  }

  if (status !== undefined && statusMap[status]) return statusMap[status]
  if (fallback?.trim()) return fallback
  return status === undefined ? '未知状态' : `状态${status}`
}

function formatDisplayValue(value: number | string | undefined | null, unit: string) {
  if (value === undefined || value === null || value === '') return '-'
  return `${value} ${unit}`
}

function formatHoldTime(value: number | string | undefined | null) {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

function applyTaskDragPreview(e: DragEvent, order: WorkOrder) {
  if (!e.dataTransfer || typeof document === 'undefined') return
  const preview = document.createElement('div')
  preview.style.position = 'fixed'
  preview.style.top = '-9999px'
  preview.style.left = '-9999px'
  preview.style.padding = '8px 12px'
  preview.style.borderRadius = '10px'
  preview.style.background = 'linear-gradient(135deg, #3b82f6, #06b6d4)'
  preview.style.color = '#ffffff'
  preview.style.boxShadow = '0 10px 24px rgba(37, 99, 235, 0.22)'
  preview.style.fontFamily = 'Microsoft YaHei, sans-serif'
  preview.style.pointerEvents = 'none'
  preview.style.minWidth = '160px'

  const title = document.createElement('div')
  title.textContent = order.no || '未命名任务'
  title.style.fontSize = '13px'
  title.style.fontWeight = '700'
  title.style.lineHeight = '1.3'

  const subtitle = document.createElement('div')
  subtitle.textContent = `${order.applicant || '-'} · ${order.type || '-'}`
  subtitle.style.marginTop = '4px'
  subtitle.style.fontSize = '11px'
  subtitle.style.opacity = '0.92'
  subtitle.style.lineHeight = '1.2'

  preview.appendChild(title)
  preview.appendChild(subtitle)
  document.body.appendChild(preview)
  e.dataTransfer.setDragImage(preview, 18, 18)
  window.setTimeout(() => preview.remove(), 0)
}

function normalizeInstrumentItems(dto: HighTempPressureOrderDTO, useDevice: string, taskNumber: string) {
  const list = Array.isArray(dto.instruments) ? dto.instruments : []
  if (list.length) return list
  const fallbackName = useDevice || dto.device_name?.trim() || dto.test_platform?.trim() || '仪器'
  const fallbackSn = dto.device_number?.trim() || taskNumber
  return [{ instrument_name: fallbackName, instrument_sn: fallbackSn, test_type: '', quantity: 1, max_diameter: null }]
}

function mapHighTempPressureOrder(dto: HighTempPressureOrderDTO): WorkOrder {
  const statusCode = Number(dto.status)
  const taskNumber = dto.task_number?.trim() || `HTP-${dto.id}`
  const useDevice = dto.use_device?.trim() || dto.device_name?.trim() || dto.test_platform?.trim() || '-'
  const itemsDto = normalizeInstrumentItems(dto, useDevice, taskNumber)
  const items: InstrumentItem[] = itemsDto.map((it, idx) => {
    const name = (it.instrument_name || '').trim() || useDevice || '仪器'
    const sn = (it.instrument_sn || '').trim() || `${taskNumber}-${idx + 1}`
    const scheduleSegments: InstrumentScheduleSegment[] = Array.isArray(it.schedule_segments)
      ? it.schedule_segments
          .map((segment) => {
            const scheduledStartAt = segment?.scheduled_start_at || ''
            const scheduledEndAt = segment?.scheduled_end_at || ''
            if (!scheduledStartAt || !scheduledEndAt) return null
            return { scheduledStartAt, scheduledEndAt }
          })
          .filter(Boolean) as InstrumentScheduleSegment[]
      : []
    return {
      id: `ins-${dto.id}-${sn || idx}`,
      dbId: it.id,
      label: name,
      sn,
      testType: it.test_type || '',
      quantity: it.quantity || 1,
      instrumentLength: it.instrument_length || '',
      maxDiameter: formatDisplayValue(it.max_diameter, 'mm'),
      scheduledStartAt: it.scheduled_start_at || null,
      scheduledEndAt: it.scheduled_end_at || null,
      scheduleSegments,
      status: Number(it.instrument_status ?? (it.is_completed ? 2 : 0)),
      completed: it.is_completed === true || Number(it.instrument_status) === 2,
    }
  })
  const rawSig = dto.admin_signature_url?.trim()
  const sigUrl = rawSig ? (rawSig.startsWith('/') ? `${http.getBaseUrl()}${rawSig}` : rawSig) : undefined
  const confirmDate = dto.sanxin_confirm_date?.trim() || undefined
  const item1 = (dto.sanxin_tester_item_1 || '').trim().toLowerCase()
  const item2 = (dto.sanxin_tester_item_2 || '').trim().toLowerCase()
  const isSanxinRaw = dto.sanxin_is_sanxin
  const isSanxin =
    isSanxinRaw === true || isSanxinRaw === 1 || String(isSanxinRaw || '').toLowerCase() === 'true'

  return {
    id: `wo-${dto.id}`,
    dbId: dto.id,
    no: taskNumber,
    tableNo: dto.table_no?.trim() || '',
    entrustNo: taskNumber,
    applicant: dto.applicant?.trim() || '-',
    applicantPhone: dto.applicant_phone || '',
    applicantUnit: dto.test_application_unit?.trim() || dto.test_platform?.trim() || '-',
    applicantUnitManager: dto.test_application_unit_manager || '',
    applyDate: dto.test_date || '-',
    applicationDate: dto.application_date || '-',
    researchNumber: dto.research_number || '',
    projectBudgetNumber: dto.project_budget_number || '',
    projectName: dto.project_name || '',
    client: dto.client || '',
    plannedTime: dto.planned_time || '',
    receivingNo: items[0]?.sn || taskNumber,
    vesselType: useDevice,
    type: useDevice,
    targetTemp: formatDisplayValue(dto.target_temp, 'C'),
    targetPressure: formatDisplayValue(dto.target_pressure, 'MPa'),
    keepCondition: formatHoldTime(dto.hold_time),
    maxDiameter: formatDisplayValue(dto.max_diameter, 'mm'),
    testType: dto.test_type || '',
    projectMembers: dto.project_members || '',
    equipmentList: dto.equipment_list || '',
    instrumentCombination: dto.instrument_combination || '',
    testSteps: dto.test_steps || '',
    safetyRisks: dto.safety_risks || '',
    remark: dto.remark?.trim() || '-',
    status: getStatusText(Number.isFinite(statusCode) ? statusCode : undefined, dto.status_text),
    statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
    createdAt: dto.created_at || '-',
    updatedAt: dto.updated_at || '-',
    expanded: false,
    items,
    adminSignatureUrl: sigUrl,
    sanxinConfirmDate: confirmDate,
    sanxinTesterItem1: item1 === 'yes' || item1 === 'no' ? (item1 as 'yes' | 'no') : null,
    sanxinTesterItem2: item2 === 'yes' || item2 === 'no' ? (item2 as 'yes' | 'no') : null,
    sanxinIsSanxin: isSanxin,
  }
}

export function useHighTempPressureSchedule() {
  const { initAuth, validateToken, getAuthHeaders } = useAuth()
  const searchKeyword = ref('')
  const draggedOrder = ref<WorkOrder | null>(null)
  const selectedScheduledOrderIds = ref<string[]>([])
  const isDragging = ref(false)
  const slotHeightPx = 44
  const completedInstrumentIds = ref<Record<string, true>>({})
  const startedOrderIds = ref<Record<string, true>>({})
  const runningInstrumentIds = ref<Record<string, true>>({})

  type ScheduledEvent = {
    eventId: string
    orderId: string
    instrumentId: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent[]>>({})
  const pendingScheduleEvents = ref<Record<string, ScheduledEvent[] | null>>({})
  const workOrders = ref<WorkOrder[]>([])
  const workOrdersLoading = ref(false)
  const workOrdersError = ref<string | null>(null)

  function cloneScheduledEventList(events?: ScheduledEvent[] | null) {
    return (events || []).map((event) => ({ ...event }))
  }

  function cloneScheduledEventMap(source: Record<string, ScheduledEvent[]> = scheduledEvents.value) {
    const next: Record<string, ScheduledEvent[]> = {}
    Object.entries(source).forEach(([instrumentId, events]) => {
      next[instrumentId] = cloneScheduledEventList(events)
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

  function getInstrumentEvents(instrumentId: string) {
    return scheduledEvents.value[instrumentId] || []
  }

  function setInstrumentEvents(instrumentId: string, events: ScheduledEvent[]) {
    const next = { ...scheduledEvents.value }
    const normalized = sortScheduledEvents(cloneScheduledEventList(events))
    if (normalized.length) next[instrumentId] = normalized
    else delete next[instrumentId]
    scheduledEvents.value = next
  }

  function markPendingSchedule(instrumentId: string, events: ScheduledEvent[] | null) {
    pendingScheduleEvents.value = {
      ...pendingScheduleEvents.value,
      [instrumentId]: events ? cloneScheduledEventList(events) : null,
    }
  }

  function clearPendingSchedule(instrumentId: string) {
    const next = { ...pendingScheduleEvents.value }
    delete next[instrumentId]
    pendingScheduleEvents.value = next
  }

  function parseBackendDateTime(value?: string | null) {
    if (!value) return null
    const text = value.includes('T') ? value : value.replace(' ', 'T')
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  function eventsFromInstrument(instrument: InstrumentItem, orderId: string): ScheduledEvent[] {
    const segments = instrument.scheduleSegments?.length
      ? instrument.scheduleSegments
      : instrument.scheduledStartAt && instrument.scheduledEndAt
        ? [{ scheduledStartAt: instrument.scheduledStartAt, scheduledEndAt: instrument.scheduledEndAt }]
        : []

    return segments
      .map((segment) => {
        const start = parseBackendDateTime(segment.scheduledStartAt)
        const end = parseBackendDateTime(segment.scheduledEndAt)
        if (!start || !end || end <= start) return null
        const startTimeKey = `${String(start.getHours()).padStart(2, '0')}00`
        if (timeKeyToIndex.value[startTimeKey] === undefined) return null
        const span = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (60 * 60 * 1000)))
        const dateStr = fmtDate(start)
        return {
          eventId: createScheduleEventId(orderId, dateStr, startTimeKey, span),
          orderId,
          instrumentId: instrument.id,
          dateStr,
          startTimeKey,
          span,
        }
      })
      .filter(Boolean) as ScheduledEvent[]
  }

  function shouldRestoreInstrumentSchedule(order: WorkOrder, instrument: InstrumentItem) {
    return eventsFromInstrument(instrument, order.id).length > 0
  }

  function restoreScheduledEvents(orders: WorkOrder[]) {
    const next: Record<string, ScheduledEvent[]> = {}
    orders.forEach((order) => {
      order.items.forEach((instrument) => {
        if (instrument.completed || completedInstrumentIds.value[instrument.id]) return
        if (!shouldRestoreInstrumentSchedule(order, instrument)) return
        const events = eventsFromInstrument(instrument, order.id)
        if (events.length) next[instrument.id] = events
      })
    })
    Object.entries(pendingScheduleEvents.value).forEach(([instrumentId, events]) => {
      if (events?.length) next[instrumentId] = cloneScheduledEventList(events)
      else delete next[instrumentId]
    })
    scheduledEvents.value = next
  }

  const persistProgressState = () => {
    try {
      window.localStorage.setItem(
        HTP_PROGRESS_STORAGE_KEY,
        JSON.stringify({
          completedInstrumentIds: completedInstrumentIds.value,
          startedOrderIds: startedOrderIds.value,
          runningInstrumentIds: runningInstrumentIds.value,
        })
      )
    } catch {
      // ignore storage failures
    }
  }

  const hydrateProgressState = () => {
    try {
      const raw = window.localStorage.getItem(HTP_PROGRESS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        completedInstrumentIds?: Record<string, true>
        startedOrderIds?: Record<string, true>
        runningInstrumentIds?: Record<string, true>
      }
      completedInstrumentIds.value = parsed.completedInstrumentIds || {}
      startedOrderIds.value = parsed.startedOrderIds || {}
      runningInstrumentIds.value = parsed.runningInstrumentIds || {}
    } catch {
      completedInstrumentIds.value = {}
      startedOrderIds.value = {}
      runningInstrumentIds.value = {}
    }
  }

  hydrateProgressState()

  async function refreshWorkOrders() {
    workOrdersLoading.value = true
    workOrdersError.value = null

    try {
      await initAuth()

      const byId = new Map<string, WorkOrder>()
      const pageSize = 100

      for (const status of VISIBLE_ORDER_STATUSES) {
        let page = 1
        let loaded = 0
        let total = Infinity

        while (loaded < total) {
          const response = await listHighTempPressureOrders(
            { page, pageSize, status },
            getAuthHeaders()
          )

          if (!response.success || !response.data) {
            workOrdersError.value = response.error || '加载高温高压井工单失败'
            break
          }

          if (response.data.code !== 0) {
            workOrdersError.value = response.data.msg || '加载高温高压井工单失败'
            break
          }

          const list = response.data.data.list
          list
            .filter((item) => Number(item.status) === status)
            .map(mapHighTempPressureOrder)
            .forEach((order) => byId.set(order.id, order))

          loaded += list.length
          total = response.data.data.total

          if (list.length === 0) break
          page += 1
          if (page > 50) break
        }
      }

      const all = Array.from(byId.values())
      const startedOrders = all.filter(order => order.statusCode === 2)
      const startedOrderIdsFromServer = new Set(startedOrders.map(order => order.id))
      const allInstrumentIdsFromServer = new Set(
        all.flatMap(order => order.items.map(item => item.id))
      )
      const orderStatusByInstrumentId = new Map(
        all.flatMap(order => order.items.map(item => [item.id, order.statusCode] as const))
      )
      const completedInstrumentIdsFromServer = new Set(
        all.flatMap(order => order.items.filter(item => item.completed).map(item => item.id))
      )
      const nextStartedOrderIds = Object.fromEntries(
        Array.from(startedOrderIdsFromServer, orderId => [orderId, true] as const)
      ) as Record<string, true>
      const nextCompletedEntries: Array<[string, true]> = [
        ...Array.from(completedInstrumentIdsFromServer, instrumentId => [instrumentId, true] as [string, true]),
      ]
      const nextCompletedInstrumentIds = Object.fromEntries(nextCompletedEntries) as Record<string, true>
      const nextRunningEntries: Array<[string, true]> = [
        ...Object.entries(runningInstrumentIds.value)
          .filter(([instrumentId]) =>
            allInstrumentIdsFromServer.has(instrumentId) &&
            !nextCompletedInstrumentIds[instrumentId] &&
            orderStatusByInstrumentId.get(instrumentId) === 2
          )
          .map(([instrumentId]) => [instrumentId, true] as [string, true]),
      ]
      const nextRunningInstrumentIds = Object.fromEntries(nextRunningEntries) as Record<string, true>

      startedOrderIds.value = nextStartedOrderIds
      completedInstrumentIds.value = nextCompletedInstrumentIds
      runningInstrumentIds.value = nextRunningInstrumentIds

      workOrders.value = all
      restoreScheduledEvents(all)
      selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter((id) => (scheduledEvents.value[id] || []).length)
      persistProgressState()
    } catch (error) {
      workOrdersError.value = error instanceof Error ? error.message : '加载高温高压井工单失败'
    } finally {
      workOrdersLoading.value = false
    }
  }

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
    if (!start || !end) return ''
    return `${start.month}/${start.dayNum} - ${end.month}/${end.dayNum}`
  })

  const timeSlots = computed<TimeSlotItem[]>(() => {
    const slots: TimeSlotItem[] = []
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
    instrumentId: string
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
    instrumentId: string
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

  const getScheduleChangePayload = (instrumentId: string): ScheduleChangePayload | null => {
    const events = getInstrumentEvents(instrumentId)
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
          instrumentId: ev.instrumentId,
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
      instrumentId,
      orderId: first.orderId,
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

  async function persistScheduledEvent(instrumentId: string, fallback?: ScheduledEvent[]) {
    const instrument = getInstrumentById(instrumentId)
    const schedule = getScheduleChangePayload(instrumentId)
    if (!instrument?.dbId) return true

    markPendingSchedule(instrumentId, getInstrumentEvents(instrumentId))
    try {
      const authOk = await initAuth()
      const tokenOk = authOk && await validateToken()
      if (!tokenOk) {
        if (fallback !== undefined) setInstrumentEvents(instrumentId, fallback)
        ElMessage.error('登录状态失效，请重新登录后再保存排期')
        return false
      }
      const resp = schedule
        ? await saveHighTempPressureInstrumentSchedule(
            instrument.dbId,
            {
              scheduled_start_at: schedule.scheduledStartAt,
              scheduled_end_at: schedule.scheduledEndAt,
              schedule_segments: schedule.scheduleSegments,
            },
            getAuthHeaders()
          )
        : await clearHighTempPressureInstrumentSchedule(instrument.dbId, getAuthHeaders())
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        if (fallback !== undefined) setInstrumentEvents(instrumentId, fallback)
        if (resp.status === 401) {
          ElMessage.error('登录状态失效，请重新登录后再保存排期')
        } else if (resp.status === 403) {
          ElMessage.error('当前账号没有高温高压井排程权限，请联系管理员开通权限')
        } else {
          ElMessage.error(resp.data?.msg || resp.error || '排期保存失败')
        }
        return false
      }
      instrument.scheduledStartAt = resp.data.data?.scheduled_start_at || null
      instrument.scheduledEndAt = resp.data.data?.scheduled_end_at || null
      instrument.scheduleSegments = Array.isArray(resp.data.data?.schedule_segments)
        ? resp.data.data!.schedule_segments!
            .map((segment) => {
              const scheduledStartAt = segment?.scheduled_start_at || ''
              const scheduledEndAt = segment?.scheduled_end_at || ''
              if (!scheduledStartAt || !scheduledEndAt) return null
              return { scheduledStartAt, scheduledEndAt }
            })
            .filter(Boolean) as InstrumentScheduleSegment[]
        : []
      const order = getOrderByInstrumentId(instrumentId)
      setInstrumentEvents(instrumentId, order ? eventsFromInstrument(instrument, order.id) : [])
      return true
    } finally {
      clearPendingSchedule(instrumentId)
    }
  }

  const scheduledOrders = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEvents.value).forEach((events) => {
      events.forEach((ev) => {
        const cellKey = getCellKey(ev.dateStr, ev.startTimeKey)
        if (!map[cellKey]) map[cellKey] = []
        map[cellKey].push(ev.instrumentId)
      })
    })
    return map
  })

  type ScheduledLayoutItem = {
    eventId: string
    instrumentId: string
    instrumentIds: string[]
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
    const groupedEvents = new Map<string, ScheduledEvent & { instrumentIds: string[] }>()
    Object.values(scheduledEvents.value).forEach((events) => {
      events.forEach((ev) => {
        const group = groupedEvents.get(ev.eventId)
        if (group) {
          group.instrumentIds.push(ev.instrumentId)
          return
        }
        groupedEvents.set(ev.eventId, { ...ev, instrumentIds: [ev.instrumentId] })
      })
    })

    const dayMap: Record<string, (ScheduledEvent & { instrumentIds: string[] })[]> = {}
    Array.from(groupedEvents.values()).forEach((ev) => {
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
          eventId: x.ev.eventId,
          instrumentId: x.ev.instrumentId,
          instrumentIds: x.ev.instrumentIds,
          orderId: x.ev.orderId,
          dateStr,
          startTimeKey: x.ev.startTimeKey,
          startIdx: x.startIdx,
          span: x.span,
          lane: laneById[x.ev.eventId] ?? 0,
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
    const keyword = searchKeyword.value.trim().toLowerCase()

    return workOrders.value.filter((order) =>
      order.items.some((item) => !item.completed && !completedInstrumentIds.value[item.id]) &&
      (
        keyword === '' ||
        order.no.toLowerCase().includes(keyword) ||
        order.type.toLowerCase().includes(keyword) ||
        order.applicant.toLowerCase().includes(keyword) ||
        order.receivingNo.toLowerCase().includes(keyword) ||
        order.items.some(
          (it) => it.label.toLowerCase().includes(keyword) || it.sn.toLowerCase().includes(keyword)
        )
      )
    )
  })

  const getOrderById = (id: string) => workOrders.value.find((o) => o.id === id)

  const getInstrumentById = (id: string): InstrumentItem | null => {
    for (const order of workOrders.value) {
      const found = order.items.find((item) => item.id === id)
      if (found) return found
    }
    return null
  }

  const getOrderByInstrumentId = (id: string) => workOrders.value.find((o) => o.items.some((item) => item.id === id))

  const selectedScheduledOrders = computed<ScheduledSelection[]>(() => {
    return selectedScheduledOrderIds.value
      .map((id) => ({ instrument: getInstrumentById(id), order: getOrderByInstrumentId(id) }))
      .filter((obj) => obj.instrument && obj.order && isInstrumentPending(obj.instrument.id))
      .map((obj) => ({ instrument: obj.instrument as InstrumentItem, order: obj.order as WorkOrder }))
  })

  const currentSelected = computed<ScheduledSelection | null>(() => {
    const id = selectedScheduledOrderIds.value[0]
    if (!id) return null

    const order = getOrderByInstrumentId(id)
    const instrument = getInstrumentById(id)
    return order && instrument && isInstrumentPending(instrument.id) ? { order, instrument } : null
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
    const presets = workOrders.value
      .flatMap((order) => order.items)
      .slice(0, 3)
      .map((item, index) => ({
        d: index,
        t: ['0800', '1000', '1400'][index] || '0800',
        id: item.id,
      }))

    const scheduled = new Set(Object.keys(scheduledEvents.value))

    presets.forEach((p) => {
      if (scheduled.has(p.id)) return
      const d = addDays(base, p.d)
      const dateStr = fmtDate(d)
      void scheduleInstrument(p.id, dateStr, p.t, false)
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

  function handleOrderDragStart(e: DragEvent, order: WorkOrder, instrumentIds: string[]) {
    draggedOrder.value = order
    isDragging.value = true
    const ids = instrumentIds.filter((id) => !completedInstrumentIds.value[id])
    if (!ids.length) {
      e.preventDefault()
      isDragging.value = false
      draggedOrder.value = null
      return
    }
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'high-temp-pressure-order', instrumentIds: ids }))
      applyTaskDragPreview(e, order)
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

  async function scheduleInstrument(instrumentId: string, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast || !instrumentId) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return
    const order = getOrderByInstrumentId(instrumentId)
    const currentEvents = getInstrumentEvents(instrumentId)
    if (currentEvents.some((event) => event.dateStr === dateStr && event.startTimeKey === timeKey)) return

    const previousEvents = cloneScheduledEventMap()
    const previousSelected = [...selectedScheduledOrderIds.value]
    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const span = Math.min(1, maxSpan)

    setInstrumentEvents(instrumentId, [
      ...currentEvents,
      {
        eventId: createScheduleEventId(order?.id || instrumentId, dateStr, timeKey, span),
        orderId: order?.id || instrumentId,
        instrumentId,
        dateStr,
        startTimeKey: timeKey,
        span,
      },
    ])
    selectedScheduledOrderIds.value = [instrumentId]

    if (isDragging.value) {
      isDragging.value = false
      draggedOrder.value = null
    }
    try {
      const saved = await persistScheduledEvent(instrumentId, previousEvents[instrumentId] || [])
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
    ;(e.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
    if (!e.dataTransfer) return

    const payload = e.dataTransfer.getData('text/plain')
    if (!payload) return
    try {
      const parsed = JSON.parse(payload) as { instrumentIds?: string[] }
      if (Array.isArray(parsed.instrumentIds) && parsed.instrumentIds.length) {
        await Promise.all(
          parsed.instrumentIds.map((instrumentId) => scheduleInstrument(instrumentId, dateStr, timeKey, isPast))
        )
        selectedScheduledOrderIds.value = parsed.instrumentIds.filter((id) => (scheduledEvents.value[id] || []).length)
        return
      }
    } catch {
      // Legacy single-instrument drag payload.
    }
    await scheduleInstrument(payload, dateStr, timeKey, isPast)
  }

  function handleSelectScheduledOrder(instrumentIds: string | string[]) {
    const targetIds = normalizeInstrumentIds(instrumentIds)
    const current = selectedScheduledOrderIds.value
    const allSelected = targetIds.every((id) => current.includes(id))
    if (allSelected) {
      selectedScheduledOrderIds.value = current.filter((id) => !targetIds.includes(id))
    } else {
      selectedScheduledOrderIds.value = Array.from(new Set([...current, ...targetIds]))
    }
  }

  async function handleUnschedule(instrumentIds: string | string[], eventId: string) {
    const previousSelected = [...selectedScheduledOrderIds.value]
    const previousEvents = cloneScheduledEventMap()
    const targetIds = normalizeInstrumentIds(instrumentIds)
    targetIds.forEach((id) => {
      const nextEvents = getInstrumentEvents(id).filter((event) => event.eventId !== eventId)
      setInstrumentEvents(id, nextEvents)
      if (!nextEvents.length) {
        selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter((selectedId) => selectedId !== id)
      }
    })

    const instruments = targetIds
      .map((id) => ({ id, instrument: getInstrumentById(id) }))
      .filter((entry) => !!entry.instrument?.dbId)

    if (!instruments.length) return

    const rollback = () => {
      scheduledEvents.value = previousEvents
      selectedScheduledOrderIds.value = previousSelected
    }

    try {
      const results = await Promise.all(
        instruments.map(({ id }) =>
          persistScheduledEvent(id, previousEvents[id] || [])
        )
      )

      const failed = results.some((saved) => !saved)
      if (failed) {
        rollback()
        return
      }

      instruments.forEach(({ instrument }) => {
        if (!instrument) return
        if ((getInstrumentEvents(instrument.id) || []).length) return
        instrument.scheduledStartAt = null
        instrument.scheduledEndAt = null
        instrument.scheduleSegments = []
      })
    } catch (error) {
      rollback()
      ElMessage.error(error instanceof Error ? error.message : '取消排期失败')
    } finally {
      targetIds.forEach((id) => clearPendingSchedule(id))
    }
  }

  function removeScheduledInstrumentLocal(instrumentId: string) {
    setInstrumentEvents(instrumentId, [])
    if (selectedScheduledOrderIds.value.includes(instrumentId)) {
      selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter((id) => id !== instrumentId)
    }
  }

  function clearSelectedSchedule() {
    selectedScheduledOrderIds.value = []
  }

  function cancelScheduledInstrument(instrumentId?: string) {
    if (instrumentId) {
      removeScheduledInstrumentLocal(instrumentId)
      return
    }
    clearSelectedSchedule()
  }

  function resetScheduleState() {
    scheduledEvents.value = {}
    selectedScheduledOrderIds.value = []
  }

  const getEvent = (instrumentId: string) => getInstrumentEvents(instrumentId)[0] || null

  const normalizeInstrumentIds = (instrumentIds: string | string[]) =>
    Array.isArray(instrumentIds) ? instrumentIds : [instrumentIds]

  const setEventSpan = (instrumentIds: string | string[], eventId: string, span: number) => {
    const ids = normalizeInstrumentIds(instrumentIds)
    const instrumentId = ids[0]
    const ev = getInstrumentEvents(instrumentId).find((event) => event.eventId === eventId)
    if (!ev) return

    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return

    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    if (nextSpan === ev.span) return

    ids.forEach((id) => {
      const nextEvents = getInstrumentEvents(id).map((event) =>
        event.eventId === eventId
          ? {
              ...event,
              span: nextSpan,
              eventId: createScheduleEventId(event.orderId, event.dateStr, event.startTimeKey, nextSpan),
            }
          : event
      )
      setInstrumentEvents(id, nextEvents)
    })
  }

  const resizing = ref<{
    eventId: string
    instrumentIds: string[]
    startY: number
    originSpan: number
    originStartIdx: number
    mode: 'bottom' | 'top'
  } | null>(null)
  const resizingEventId = computed(() => resizing.value?.eventId || null)
  const isResizing = computed(() => !!resizing.value)

  const setEventStartAndSpan = (instrumentIds: string | string[], eventId: string, startIdx: number, span: number) => {
    const ids = normalizeInstrumentIds(instrumentIds)
    const instrumentId = ids[0]
    const ev = getInstrumentEvents(instrumentId).find((event) => event.eventId === eventId)
    if (!ev) return

    const maxStartIdx = Math.max(0, timeSlots.value.length - 2)
    const nextStartIdx = Math.max(0, Math.min(maxStartIdx, startIdx))
    const nextStartKey = timeSlots.value[nextStartIdx]?.key
    if (!nextStartKey) return

    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - nextStartIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    ids.forEach((id) => {
      const nextEvents = getInstrumentEvents(id).map((event) =>
        event.eventId === eventId
          ? {
              ...event,
              startTimeKey: nextStartKey,
              span: nextSpan,
              eventId: createScheduleEventId(event.orderId, event.dateStr, nextStartKey, nextSpan),
            }
          : event
      )
      setInstrumentEvents(id, nextEvents)
    })
  }

  const startResize = (instrumentIds: string | string[], eventId: string, e: MouseEvent) => {
    const ids = normalizeInstrumentIds(instrumentIds)
    const instrumentId = ids[0]
    const ev = getInstrumentEvents(instrumentId).find((event) => event.eventId === eventId)
    if (!ev) return
    const previousEvents = cloneScheduledEventMap()

    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return

    resizing.value = { eventId, instrumentIds: ids, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'bottom' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      if (ctx.mode === 'bottom') {
        setEventSpan(ctx.instrumentIds, ctx.eventId, ctx.originSpan + deltaSlots)
        return
      }
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.instrumentIds, ctx.eventId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      Promise.all(ids.map((id) => persistScheduledEvent(id, previousEvents[id] || []))).then((results) => {
        if (results.some((saved) => !saved)) {
          scheduledEvents.value = previousEvents
        }
      }).catch((error) => {
        scheduledEvents.value = previousEvents
        ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (instrumentIds: string | string[], eventId: string, e: MouseEvent) => {
    const ids = normalizeInstrumentIds(instrumentIds)
    const instrumentId = ids[0]
    const ev = getInstrumentEvents(instrumentId).find((event) => event.eventId === eventId)
    if (!ev) return
    const previousEvents = cloneScheduledEventMap()

    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return

    resizing.value = { eventId, instrumentIds: ids, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'top' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.instrumentIds, ctx.eventId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      Promise.all(ids.map((id) => persistScheduledEvent(id, previousEvents[id] || []))).then((results) => {
        if (results.some((saved) => !saved)) {
          scheduledEvents.value = previousEvents
        }
      }).catch((error) => {
        scheduledEvents.value = previousEvents
        ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const isOrderFullyScheduled = (order: WorkOrder) => {
    if (!order?.items?.length) return false
    return order.items.every((it) => getInstrumentEvents(it.id).length > 0)
  }

  const isInstrumentPending = (instrumentId: string) => {
    const instrument = getInstrumentById(instrumentId)
    return !instrument?.completed && !completedInstrumentIds.value[instrumentId]
  }

  const markInstrumentsRunning = (instrumentIds: string[]) => {
    const next = { ...runningInstrumentIds.value }
    instrumentIds.forEach((instrumentId) => {
      if (instrumentId && isInstrumentPending(instrumentId)) next[instrumentId] = true
    })
    runningInstrumentIds.value = next
    persistProgressState()
  }

  const clearRunningInstruments = (instrumentIds: string[]) => {
    const next = { ...runningInstrumentIds.value }
    instrumentIds.forEach((instrumentId) => {
      delete next[instrumentId]
    })
    runningInstrumentIds.value = next
    persistProgressState()
  }

  const isInstrumentRunning = (instrumentId: string) => {
    const instrument = getInstrumentById(instrumentId)
    const order = getOrderByInstrumentId(instrumentId)
    return isInstrumentPending(instrumentId) &&
      order?.statusCode === 2 &&
      (instrument?.status === 1 || !!runningInstrumentIds.value[instrumentId])
  }

  const markOrderStarted = (orderId: string) => {
    if (!orderId) return
    startedOrderIds.value = { ...startedOrderIds.value, [orderId]: true }
    persistProgressState()
  }

  const isOrderStarted = (orderId: string) => !!startedOrderIds.value[orderId]

  const markInstrumentCompleted = (instrumentId: string) => {
    if (!instrumentId) return
    const nextRunning = { ...runningInstrumentIds.value }
    delete nextRunning[instrumentId]
    runningInstrumentIds.value = nextRunning
    completedInstrumentIds.value = { ...completedInstrumentIds.value, [instrumentId]: true }
    removeScheduledInstrumentLocal(instrumentId)
    persistProgressState()
  }

  const getRemainingInstrumentCount = (orderId: string, excludingInstrumentIds?: string | string[]) => {
    const order = getOrderById(orderId)
    if (!order) return 0
    const excludingSet = new Set(
      Array.isArray(excludingInstrumentIds)
        ? excludingInstrumentIds
        : excludingInstrumentIds
          ? [excludingInstrumentIds]
          : []
    )
    return order.items.filter((item) =>
      !excludingSet.has(item.id) &&
      !item.completed &&
      !completedInstrumentIds.value[item.id]
    ).length
  }

  const hasRemainingInstrumentsAfterCompleting = (orderId: string, instrumentIds: string | string[]) =>
    getRemainingInstrumentCount(orderId, instrumentIds) > 0

  const clearOrderProgress = (orderId: string) => {
    if (!orderId) return
    const order = getOrderById(orderId)
    const nextCompleted = { ...completedInstrumentIds.value }
    order?.items.forEach((item) => {
      delete nextCompleted[item.id]
    })
    completedInstrumentIds.value = nextCompleted

    const nextStarted = { ...startedOrderIds.value }
    delete nextStarted[orderId]
    startedOrderIds.value = nextStarted
    persistProgressState()
  }

  return {
    searchKeyword,
    draggedOrder,
    workOrders,
    workOrdersLoading,
    workOrdersError,
    refreshWorkOrders,
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
    handleOrderDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    scheduleInstrument,
    handleSelectScheduledOrder,
    handleUnschedule,
    clearSelectedSchedule,
    cancelScheduledInstrument,
    resetScheduleState,
    getEvent,
    startResize,
    startResizeTop,
    isOrderFullyScheduled,
    getScheduleChangePayload,
    resizingEventId,
    isResizing,
    isInstrumentPending,
    markInstrumentsRunning,
    clearRunningInstruments,
    isInstrumentRunning,
    markOrderStarted,
    isOrderStarted,
    markInstrumentCompleted,
    getRemainingInstrumentCount,
    hasRemainingInstrumentsAfterCompleting,
    clearOrderProgress,
  }
}
