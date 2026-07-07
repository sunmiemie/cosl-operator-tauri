import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import {
  clearWaterCycleOrderSchedule,
  listWaterCycleOrders,
  mapWaterCycleOrder,
  saveWaterCycleOrderSchedule,
  type WaterCycleOrder,
} from '@/services/water-cycle-api'
// 如果需要引用 store 中的变量：
// import { selectedOrder } from './useTestStore'

export type ScheduleChangePayload = {
  orderId: string
  dateStr: string
  startTimeKey: string
  endTimeKey: string
  span: number
  startAtHour: string
  endAtHour: string
  test_date: string
  start_time: string
  end_time: string
  scheduledStartAt: string
  scheduledEndAt: string
  scheduleSegments: Array<{
    scheduled_start_at: string
    scheduled_end_at: string
  }>
  segments: Array<{
    eventId: string
    orderId: string
    dateStr: string
    startTimeKey: string
    endTimeKey: string
    span: number
    startAtHour: string
    endAtHour: string
    test_date: string
    start_time: string
    end_time: string
    scheduledStartAt: string
    scheduledEndAt: string
  }>
}

export type UseScheduleOptions = {
  onScheduleChange?: (payload: ScheduleChangePayload, order?: WaterCycleOrder) => void | Promise<void>
}

export function useSchedule(options: UseScheduleOptions = {}) {
  const { initAuth, validateToken, getAuthHeaders } = useAuth()
  // ============ 基础状态 ============
  const searchKeyword = ref('') // 待排程工单的搜索关键字
  
  const slotHeightPx = 44
  const isDragging = ref(false)

  type ScheduledEvent = {
    eventId: string
    orderId: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent[]>>({})
  const pendingScheduleEvents = ref<Record<string, ScheduledEvent[] | null>>({})
  const runningInstrumentIds = ref<Record<string, true>>({})
  
  // 当前在日历中被选中的工单 ID 列表
  const selectedScheduledOrderIds = ref<string[]>([])
  const activeHostDeviceName = ref('')
  const draggedOrder = ref<any>(null) // 记录当前正在拖拽的工单对象
  const calBase = ref(new Date()) // 日历基准日期（当前周）

  const workOrders = ref<WaterCycleOrder[]>([])
  const workOrdersLoading = ref(false)
  const workOrdersError = ref<string | null>(null)
  const visibleOrderStatuses = [1, 2]

  function createScheduleEventId(orderId: string) {
    return `${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function normalizeScheduledEventList(events?: ScheduledEvent[] | ScheduledEvent | null) {
    if (!events) return []
    return Array.isArray(events) ? events : [events]
  }

  function cloneScheduledEventList(events?: ScheduledEvent[] | ScheduledEvent | null) {
    return normalizeScheduledEventList(events).map((event) => ({ ...event }))
  }

  function cloneScheduledEventMap(source: Record<string, ScheduledEvent[] | ScheduledEvent> = scheduledEvents.value) {
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
    return normalizeScheduledEventList(scheduledEvents.value[orderId])
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
      if (index !== -1) return { orderId, index, event: events[index] }
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

  function eventsFromOrder(order: WaterCycleOrder): ScheduledEvent[] {
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

  function restoreScheduledEvents(orders: WaterCycleOrder[]) {
    const next: Record<string, ScheduledEvent[]> = {}
    orders.forEach((order) => {
      const events = eventsFromOrder(order)
      if (events.length) next[order.id] = events
    })
    Object.entries(pendingScheduleEvents.value).forEach(([orderId, events]) => {
      const normalized = cloneScheduledEventList(events)
      if (normalized.length) next[orderId] = normalized
      else delete next[orderId]
    })
    scheduledEvents.value = next
  }

  async function refreshWorkOrders() {
    workOrdersLoading.value = true
    workOrdersError.value = null

    try {
      const all: WaterCycleOrder[] = []
      const pageSize = 100
      for (const status of visibleOrderStatuses) {
        let page = 1
        let loaded = 0
        let total = Infinity

        while (loaded < total) {
          const resp = await listWaterCycleOrders({ page, pageSize, status })
          if (!resp.success || !resp.data) {
            workOrdersError.value = resp.error || '获取水循环工单失败'
            break
          }
          if (resp.data.code !== 0) {
            workOrdersError.value = resp.data.msg || '获取水循环工单失败'
            break
          }

          const chunk = resp.data.data.list.map(mapWaterCycleOrder).filter((o) => o.status === status)
          all.push(...chunk)
          loaded += resp.data.data.list.length
          total = resp.data.data.total

          if (resp.data.data.list.length === 0) break
          page += 1
          if (page > 50) break
        }
      }

      workOrders.value = all
      restoreScheduledEvents(all)
      syncActiveHostDeviceName()
      selectedScheduledOrderIds.value = selectedScheduledOrderIds.value
        .filter((id) => all.some((order) => order.id === id))
        .filter((id) => isScheduledOrderVisibleInActiveHost(id))
    } catch (e) {
      workOrdersError.value = e instanceof Error ? e.message : '获取水循环工单失败'
    } finally {
      workOrdersLoading.value = false
    }
  }

  // ============ 日历时间计算辅助函数 ============
  
  // 获取指定日期所在周的周一
  function getMonday(d: Date) {
    const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
    dt.setDate(diff); dt.setHours(0, 0, 0, 0); return dt
  }
  
  // 日期加减
  function addDays(d: Date, days: number) { 
    const result = new Date(d); result.setDate(result.getDate() + days); return result 
  }
  
  // 格式化日期为 YYYY-MM-DD
  function fmtDate(d: Date) { 
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` 
  }

  // 初始化为本周一
  calBase.value = getMonday(new Date())

  // ============ 计算属性 ============

  // 计算当前周的 7 天数据，用于渲染日历表头
  const currentWeekDays = computed(() => {
    const days = []
    const todayStr = fmtDate(new Date())
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    for (let i = 0; i < 7; i++) {
      const d = addDays(calBase.value, i)
      const dateStr = fmtDate(d)
      days.push({
        dateStr, 
        dayName: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()],
        dayNum: d.getDate(), 
        month: d.getMonth() + 1, 
        isToday: dateStr === todayStr,
        isWeekend: d.getDay() === 0 || d.getDay() === 6, 
        isPast: new Date(d).setHours(0,0,0,0) < today.getTime() // 判断是否是过去的时间
      })
    }
    return days
  })

  // 日历顶部的周范围显示 (例: 10月1日 ～ 10月7日)
  const weekLabel = computed(() => {
    if (!currentWeekDays.value.length) return ''
    const start = currentWeekDays.value[0]; const end = currentWeekDays.value[6]
    return `${start.month}月${start.dayNum}日 ～ ${end.month}月${end.dayNum}日`
  })

  // 生成日历左侧的时间轴 (06:00 - 22:00，每小时一格)
  const timeSlots = computed(() => {
    const slots = []
    for (let hour = 6; hour <= 22; hour++) {
      slots.push({ key: `${String(hour).padStart(2, '0')}00`, label: `${String(hour).padStart(2, '0')}:00`, isHalf: false })
    }
    return slots
  })

  // 获取单元格唯一标识符
  const getCellKey = (dateStr: string, timeKey: string) => `${dateStr}_${timeKey}`

  const timeKeyToIndex = computed(() => {
    const map: Record<string, number> = {}
    timeSlots.value.forEach((s, idx) => {
      map[s.key] = idx
    })
    return map
  })

  const timeKeyToTimeString = (timeKey: string) => {
    const hh = timeKey.slice(0, 2)
    const mm = timeKey.slice(2, 4)
    if (!/^\d{2}$/.test(hh) || !/^\d{2}$/.test(mm)) return '00:00:00'
    return `${hh}:${mm}:00`
  }

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

  const getScheduleChangePayload = (orderId: string): ScheduleChangePayload | null => {
    const events = getOrderEvents(orderId)
    const ev = events[0]
    if (!ev) return null
    const endTimeKey = getEndTimeKey(ev.startTimeKey, ev.span)
    if (!endTimeKey) return null
    const startHh = timeKeyToHour(ev.startTimeKey)
    const endHh = timeKeyToHour(endTimeKey)
    return {
      orderId: ev.orderId,
      dateStr: ev.dateStr,
      startTimeKey: ev.startTimeKey,
      endTimeKey,
      span: ev.span,
      startAtHour: `${ev.dateStr} ${startHh}`,
      endAtHour: `${ev.dateStr} ${endHh}`,
      test_date: ev.dateStr,
      start_time: timeKeyToTimeString(ev.startTimeKey),
      end_time: timeKeyToTimeString(endTimeKey),
      scheduledStartAt: `${ev.dateStr} ${startHh}:00:00`,
      scheduledEndAt: `${ev.dateStr} ${endHh}:00:00`,
      scheduleSegments: events.map((event) => {
        const eventEndTimeKey = getEndTimeKey(event.startTimeKey, event.span)
        const eventStartHh = timeKeyToHour(event.startTimeKey)
        const eventEndHh = timeKeyToHour(eventEndTimeKey)
        return {
          scheduled_start_at: `${event.dateStr} ${eventStartHh}:00:00`,
          scheduled_end_at: `${event.dateStr} ${eventEndHh}:00:00`,
        }
      }).filter((segment) => segment.scheduled_start_at && segment.scheduled_end_at),
      segments: events.map((event) => {
        const eventEndTimeKey = getEndTimeKey(event.startTimeKey, event.span)
        const eventStartHh = timeKeyToHour(event.startTimeKey)
        const eventEndHh = timeKeyToHour(eventEndTimeKey)
        return {
          eventId: event.eventId,
          orderId: event.orderId,
          dateStr: event.dateStr,
          startTimeKey: event.startTimeKey,
          endTimeKey: eventEndTimeKey,
          span: event.span,
          startAtHour: `${event.dateStr} ${eventStartHh}`,
          endAtHour: `${event.dateStr} ${eventEndHh}`,
          test_date: event.dateStr,
          start_time: timeKeyToTimeString(event.startTimeKey),
          end_time: timeKeyToTimeString(eventEndTimeKey),
          scheduledStartAt: `${event.dateStr} ${eventStartHh}:00:00`,
          scheduledEndAt: `${event.dateStr} ${eventEndHh}:00:00`,
        }
      })
    }
  }

  async function persistScheduledEvent(orderId: string, fallback?: ScheduledEvent[]) {
    const order = getOrderById(orderId)
    const schedule = getScheduleChangePayload(orderId)
    if (!order?.dbId) return true

    markPendingSchedule(orderId, getOrderEvents(orderId))
    try {
      const authOk = await initAuth()
      const tokenOk = authOk && await validateToken()
      if (!tokenOk) {
        if (fallback !== undefined) setOrderEvents(orderId, fallback)
        ElMessage.error('登录状态失效，请重新登录后再保存排期')
        return false
      }
      const resp = schedule
        ? await saveWaterCycleOrderSchedule(
            order.dbId,
            {
              scheduled_start_at: schedule.scheduledStartAt,
              scheduled_end_at: schedule.scheduledEndAt,
              schedule_segments: schedule.scheduleSegments,
            },
            getAuthHeaders()
          )
        : await clearWaterCycleOrderSchedule(order.dbId, getAuthHeaders())
      if (!resp.success || !resp.data || resp.data.code !== 0) {
        if (fallback !== undefined) setOrderEvents(orderId, fallback)
        ElMessage.error(resp.data?.msg || resp.error || '排期保存失败')
        return false
      }
      const saved = resp.data.data
      if (saved) {
        const updated = mapWaterCycleOrder(saved)
        workOrders.value = workOrders.value.map(item => item.id === updated.id ? updated : item)
        setOrderEvents(updated.id, eventsFromOrder(updated))
      }
      if (schedule) await options.onScheduleChange?.(schedule, order)
      return true
    } finally {
      clearPendingSchedule(orderId)
    }
  }

  const getScheduleText = (orderId: string) => {
    const p = getScheduleChangePayload(orderId)
    if (!p) return ''
    return p.startAtHour
  }

  const scheduledOrders = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEvents.value).forEach((events) => {
      normalizeScheduledEventList(events).forEach((ev) => {
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
    hostDeviceName: string
  }

  function getOrderHostDeviceName(order?: WaterCycleOrder) {
    return order?.testPlatform?.trim() || order?.deviceName?.trim() || '-'
  }

  function doesScheduledEventMatchActiveHostDevice(ev: ScheduledEvent, activeScheduleHostName: string) {
    if (!activeScheduleHostName) return true
    return getOrderHostDeviceName(getOrderById(ev.orderId)) === activeScheduleHostName
  }

  function isScheduledOrderVisibleInActiveHost(orderId: string) {
    const activeScheduleHostName = activeHostDeviceName.value.trim()
    if (!activeScheduleHostName) return true
    return getOrderEvents(orderId).some((ev) => doesScheduledEventMatchActiveHostDevice(ev, activeScheduleHostName))
  }

  function pruneSelectedScheduledOrderIdsForActiveHost() {
    selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter((id) => isScheduledOrderVisibleInActiveHost(id))
  }

  const scheduledLayoutItems = computed<ScheduledLayoutItem[]>(() => {
    const activeScheduleHostName = activeHostDeviceName.value.trim()
    const dayMap: Record<string, ScheduledEvent[]> = {}
    Object.values(scheduledEvents.value).forEach((events) => {
      normalizeScheduledEventList(events).forEach((ev) => {
        if (!doesScheduledEventMatchActiveHostDevice(ev, activeScheduleHostName)) return
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
          hostDeviceName: getOrderHostDeviceName(getOrderById(x.ev.orderId))
        })
      })
    })

    return out
  })

  const maxLaneCount = computed(() => {
    if (!scheduledLayoutItems.value.length) return 1
    return Math.max(1, ...scheduledLayoutItems.value.map((x) => x.laneCount || 1))
  })
  
  // 过滤出未排程且符合搜索条件的工单
  const unscheduledOrders = computed(() => {
    const kw = searchKeyword.value.trim()

    return workOrders.value.filter(o => {
      const hasPendingInstrument = o.instruments.length === 0 || o.instruments.some((item) => !item.completed)
      if (!hasPendingInstrument) return false
      if (!kw) return true

      const keyword = kw.toLowerCase()
      return (
        String(o.id).toLowerCase().includes(keyword) ||
        String(o.taskNumber).toLowerCase().includes(keyword) ||
        String(o.deviceName).toLowerCase().includes(keyword) ||
        String(o.applicant).toLowerCase().includes(keyword) ||
        String(o.flowProcess).toLowerCase().includes(keyword) ||
        String(o.testPlatform).toLowerCase().includes(keyword) ||
        o.instruments.some((item) =>
          String(item.name).toLowerCase().includes(keyword) ||
          String(item.sn).toLowerCase().includes(keyword)
        )
      )
    })
  })
  
  const getOrderById = (id: string) => workOrders.value.find(o => o.id === id)

  const hostDeviceTabs = computed(() => {
    return Array.from(new Set(workOrders.value.map((order) => getOrderHostDeviceName(order)).filter((name) => name && name !== '-')))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  })

  function syncActiveHostDeviceName() {
    if (!activeHostDeviceName.value || !hostDeviceTabs.value.includes(activeHostDeviceName.value)) {
      activeHostDeviceName.value = hostDeviceTabs.value[0] || ''
      pruneSelectedScheduledOrderIdsForActiveHost()
    }
  }

  function assignHostDeviceToCurrentScope(hostName: string) {
    const nextHostName = hostName.trim()
    if (!nextHostName) return
    activeHostDeviceName.value = nextHostName
    pruneSelectedScheduledOrderIdsForActiveHost()
  }

  const getActiveInstruments = (order: WaterCycleOrder) => order.instruments.filter((item) => !item.completed)
  const isInstrumentRunning = (instrumentId: string) => {
    const instrument = workOrders.value.flatMap((order) => order.instruments).find((item) => item.id === instrumentId)
    return instrument?.status === 1 || !!runningInstrumentIds.value[instrumentId]
  }
  const markInstrumentsRunning = (instrumentIds: string[]) => {
    const next = { ...runningInstrumentIds.value }
    instrumentIds.forEach((id) => {
      if (id) next[id] = true
    })
    runningInstrumentIds.value = next
  }
  const clearRunningInstruments = (instrumentIds?: string[]) => {
    if (!instrumentIds) {
      runningInstrumentIds.value = {}
      return
    }
    const next = { ...runningInstrumentIds.value }
    instrumentIds.forEach((id) => delete next[id])
    runningInstrumentIds.value = next
  }
  
  // 获取当前在日历上被选中的排程对象集合
  const selectedScheduledOrders = computed(() => selectedScheduledOrderIds.value
    .filter((id) => isScheduledOrderVisibleInActiveHost(id))
    .map(id => getOrderById(id))
    .filter(Boolean) as any[])

  function loadPresetSchedule() {
    const base = calBase.value
    const presets = [
      { d: 0, t: '0800', id: 'WO001' },
      { d: 1, t: '1000', id: 'WO002' },
      { d: 2, t: '1400', id: 'WO003' },
      { d: 3, t: '0900', id: 'WO004' },
      { d: 4, t: '1000', id: 'WO005' },
    ]
    const globalScheduled = new Set(Object.keys(scheduledEvents.value))

    presets.forEach(p => {
      if (globalScheduled.has(p.id)) return
      const d = addDays(base, p.d)
      const dateStr = fmtDate(d)
      if (p.t === timeSlots.value[timeSlots.value.length - 1]?.key) return
      void scheduleOrder(p.id, dateStr, p.t, false)
    })
  }

  void refreshWorkOrders()

  // ============ 拖拽核心交互逻辑 ============

  const handleDragStart = (e: DragEvent, order: any) => {
    draggedOrder.value = order
    isDragging.value = true
    if (e.dataTransfer) { 
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', order.id) // 存入工单ID供释放时读取
    }
    // 异步修改透明度，避免拖拽时的残影变透明
    setTimeout(() => { (e.target as HTMLElement).style.opacity = '0.5' }, 0)
  }
  
  const handleDragEnd = (e: DragEvent) => { 
    (e.target as HTMLElement).style.opacity = '1'
    draggedOrder.value = null 
    isDragging.value = false
  }
  
  const handleDragOver = (e: DragEvent, isPast: boolean) => {
    if (isPast) return // 过去的时间不允许排程
    e.preventDefault() // 必须阻止默认行为才能触发 drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('drag-over')
  }
  
  const handleDragEnter = (e: DragEvent) => { (e.currentTarget as HTMLElement).classList.add('drag-over') }
  const handleDragLeave = (e: DragEvent) => { (e.currentTarget as HTMLElement).classList.remove('drag-over') }
  
  const scheduleOrder = async (orderId: string, dateStr: string, timeKey: string, isPast: boolean) => {
    if (isPast) return
    if (timeKey === timeSlots.value[timeSlots.value.length - 1]?.key) return
    const currentEvents = getOrderEvents(orderId)
    if (currentEvents.some((event) => event.dateStr === dateStr && event.startTimeKey === timeKey)) return
    const previousEvents = cloneScheduledEventMap()
    const previousSelected = [...selectedScheduledOrderIds.value]
    setOrderEvents(orderId, [
      ...currentEvents,
      { eventId: createScheduleEventId(orderId), orderId, dateStr, startTimeKey: timeKey, span: 1 }
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

  const handleDrop = async (e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) => {
    if (isPast) return
    e.preventDefault(); 
    (e.currentTarget as HTMLElement).classList.remove('drag-over')
    
    // 获取拖拽传递的工单ID
    const orderId = e.dataTransfer?.getData('text/plain')
    if (!orderId) return
    await scheduleOrder(orderId, dateStr, timeKey, isPast)
  }

  // 从日历中移除已排程的工单
  async function handleUnschedule(_cellKey: string, orderId: string, eventId?: string) {
    const previousEvents = cloneScheduledEventMap()
    const previousSelected = [...selectedScheduledOrderIds.value]
    const targetEventId = eventId || getOrderEvents(orderId)[0]?.eventId
    if (!targetEventId) return
    const nextEvents = getOrderEvents(orderId).filter((event) => event.eventId !== targetEventId)
    setOrderEvents(orderId, nextEvents)
    
    // 如果移除的刚好是选中的工单，则清空选中状态
    if (!nextEvents.length) selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
    const order = getOrderById(orderId)
    if (!order?.dbId) return

    const rollback = () => {
      scheduledEvents.value = previousEvents
      selectedScheduledOrderIds.value = previousSelected
    }

    try {
      const authOk = await initAuth()
      const tokenOk = authOk && await validateToken()
      if (!tokenOk) {
        rollback()
        ElMessage.error('登录状态失效，请重新登录后再取消排期')
        return
      }
      const saved = await persistScheduledEvent(orderId, previousEvents[orderId] || [])
      if (!saved) {
        rollback()
        return
      }
    } catch (error) {
      rollback()
      ElMessage.error(error instanceof Error ? error.message : '取消排期失败')
    } finally {
      clearPendingSchedule(orderId)
    }
  }
  
  // 在日历上点击选中工单
  function selectScheduledOrder(orderId: string) {
    const arr = selectedScheduledOrderIds.value
    // Toggle 逻辑：已选中则取消，未选中则加入
    selectedScheduledOrderIds.value = arr.includes(orderId) ? arr.filter(id => id !== orderId) : [...arr, orderId]
  }

  const resizing = ref<{ eventId: string; orderId: string; startY: number; originSpan: number; originStartIdx: number; mode: 'bottom' | 'top' } | null>(null)
  const resizingOrderId = computed(() => resizing.value?.eventId || null)
  const isResizing = computed(() => !!resizing.value)

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
    setOrderEvents(located.orderId, getOrderEvents(located.orderId).map((event) =>
      event.eventId === eventId ? { ...event, span: nextSpan } : event
    ))
  }

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
    setOrderEvents(located.orderId, getOrderEvents(located.orderId).map((event) =>
      event.eventId === eventId ? { ...event, startTimeKey: nextStartKey, span: nextSpan } : event
    ))
  }

  const startResize = (eventId: string, e: MouseEvent) => {
    const ev = getEvent(eventId)
    if (!ev) return
    const previous = { ...ev }
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
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      const previousOrderEvents = getOrderEvents(previous.orderId).map((event) =>
        event.eventId === eventId ? previous : event
      )
      void persistScheduledEvent(previous.orderId, previousOrderEvents).catch((error) => {
        setOrderEvents(previous.orderId, previousOrderEvents)
        ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (eventId: string, e: MouseEvent) => {
    const ev = getEvent(eventId)
    if (!ev) return
    const previous = { ...ev }
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
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      const previousOrderEvents = getOrderEvents(previous.orderId).map((event) =>
        event.eventId === eventId ? previous : event
      )
      void persistScheduledEvent(previous.orderId, previousOrderEvents).catch((error) => {
        setOrderEvents(previous.orderId, previousOrderEvents)
        ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return {
    searchKeyword, scheduledOrders, scheduledEvents, slotHeightPx, isDragging, selectedScheduledOrderIds, activeHostDeviceName, hostDeviceTabs, calBase, currentWeekDays, weekLabel, timeSlots,
    unscheduledOrders, getOrderById, selectedScheduledOrders,
    getMonday, addDays, fmtDate,
    workOrders,
    workOrdersLoading,
    workOrdersError,
    refreshWorkOrders,
    prevWeek: () => { calBase.value = addDays(calBase.value, -7) },
    nextWeek: () => { calBase.value = addDays(calBase.value, 7) },
    loadPresetSchedule,
    getCellKey, handleDragStart, handleDragEnd, handleDragOver, handleDragEnter, handleDragLeave, handleDrop,
    handleUnschedule, selectScheduledOrder, getEvent, startResize, startResizeTop, scheduledLayoutItems, maxLaneCount, scheduleOrder, resizingOrderId, isResizing,
    getScheduleChangePayload, getScheduleText,
    getActiveInstruments, isInstrumentRunning, markInstrumentsRunning, clearRunningInstruments, assignHostDeviceToCurrentScope
  }
}
