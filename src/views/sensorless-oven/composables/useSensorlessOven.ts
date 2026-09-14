import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useAuth } from '@/composables/useAuth'
import { useConfig } from '@/composables/useConfig'
import { echarts } from '@/utils/echarts'
import {
  isSensorlessOvenPortPresent,
  listSensorlessOvenPorts,
  listenSensorlessOvenMonitor,
  pauseSensorlessOvenMonitor,
  resumeSensorlessOvenMonitor,
  startSensorlessOvenMonitor,
  stopSensorlessOvenMonitor,
  type SensorlessOvenMonitorEvent,
} from '@/services/sensorless-oven-monitor-api'
import {
  changeSensorlessOvenOrderStatus,
  clearSensorlessOvenOrderSchedule,
  listSensorlessOvenOrders,
  mapSensorlessOvenOrder,
  saveSensorlessOvenOrderSchedule,
  type SensorlessOvenOrder,
} from '@/services/sensorless-oven-order-api'

export interface WorkOrder {
  id: string
  dbId: number
  taskNumber: string
  applicant: string
  deviceName: string
  deviceNumber: string
  targetTemp: number
  duration: number
  testPlatform: string
  testDate: string
  remark: string
  status: number
  statusText?: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  priority?: 'high' | 'normal' | 'low'
  instruments: SensorlessOvenInstrument[]
  selectedInstruments?: SensorlessOvenInstrument[]
}

export interface SensorlessOvenInstrument {
  id: string
  dbId?: number | string
  name: string
  sn: string
  quantity?: number
  status?: number
  completed?: boolean
}

export type SensorlessOvenView = 'dashboard' | 'pre-check' | 'monitoring'
export type SensorlessOvenTestPhase = 'idle' | 'running' | 'paused' | 'ended'

export interface SensorlessOvenTempPoint {
  time: string
  timestampMs: number
  left: number | null
  right: number | null
}

export function useSensorlessOven() {
  const { initAuth, getAuthHeaders } = useAuth()
  const { initConfig, getConfigItem } = useConfig()
  const currentView = ref<SensorlessOvenView>('dashboard')

  const searchKeyword = ref('')
  const activeFilter = ref<'all' | 'high' | 'pending' | 'paused'>('all')

  const calBase = ref(getMonday(new Date()))
  const selectedScheduledOrder = ref<string | null>(null)
  const activeHostDeviceName = ref('')
  const hostDeviceNames = ref<string[]>([])
  const draggedOrderId = ref<string | null>(null)
  const isDragging = ref(false)
  const slotHeightPx = 44

  type ScheduledEvent = {
    eventId: string
    orderId: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent>>({})
  const workOrders = ref<WorkOrder[]>([])
  const completedInstrumentIds = ref<Record<string, boolean>>({})
  const runningInstrumentIds = ref<Record<string, boolean>>({})
  const workOrdersLoading = ref(false)
  const workOrdersError = ref<string | null>(null)
  const visibleOrderStatus = 1
  const orderStatusMutating = ref(false)

  const mockWorkOrders: WorkOrder[] = [
    {
      id: 'SO-MOCK-001',
      dbId: -2001,
      taskNumber: 'SO-MOCK-001',
      applicant: '王工',
      deviceName: '无感烘箱 A01',
      deviceNumber: 'SO-A01',
      targetTemp: 125,
      duration: 180,
      testPlatform: '无感烘箱',
      testDate: fmtDate(new Date()),
      remark: '前端模拟工单',
      status: 1,
      statusText: '待测试',
      priority: 'normal',
      instruments: [
        { id: 'SO-MOCK-001-I1', name: '温度采集模块', sn: 'TEMP-24001', quantity: 1 },
        { id: 'SO-MOCK-001-I2', name: '控制板组件', sn: 'CTRL-24008', quantity: 1 },
        { id: 'SO-MOCK-001-I3', name: '传感器探头', sn: 'SEN-24019', quantity: 1 },
      ],
    },
    {
      id: 'SO-MOCK-002',
      dbId: -2002,
      taskNumber: 'SO-MOCK-002',
      applicant: '李工',
      deviceName: '无感烘箱 B02',
      deviceNumber: 'SO-B02',
      targetTemp: 150,
      duration: 240,
      testPlatform: '无感烘箱',
      testDate: fmtDate(new Date()),
      remark: '前端模拟工单',
      status: 1,
      statusText: '待测试',
      priority: 'high',
      instruments: [
        { id: 'SO-MOCK-002-I1', name: '电源管理单元', sn: 'PWR-25003', quantity: 1 },
        { id: 'SO-MOCK-002-I2', name: '通讯转接板', sn: 'COM-25011', quantity: 1 },
      ],
    },
  ]

  const buildFallbackInstrument = (order: SensorlessOvenOrder | WorkOrder): SensorlessOvenInstrument => ({
    id: `${order.id}-instrument-1`,
    name: order.deviceName || '无感烘箱测试仪器',
    sn: order.deviceNumber || order.taskNumber || order.id,
    quantity: 1,
  })

  const withInstrumentState = (order: WorkOrder): WorkOrder => ({
    ...order,
    instruments: (order.instruments.length ? order.instruments : [buildFallbackInstrument(order)]).map((instrument) => ({
      ...instrument,
      completed: instrument.completed === true || instrument.status === 2 || !!completedInstrumentIds.value[instrument.id],
    })),
  })

  const mapOrderWithInstruments = (order: SensorlessOvenOrder): WorkOrder => ({
    ...order,
    instruments: order.instruments.length ? order.instruments : [buildFallbackInstrument(order)],
  })

  async function refreshWorkOrders() {
    workOrdersLoading.value = true
    workOrdersError.value = null

    try {
      await refreshHostDeviceNames()
      const all: WorkOrder[] = []
      const pageSize = 100
      let page = 1
      let total = Infinity

      while (all.length < total) {
        const resp = await listSensorlessOvenOrders({ page, pageSize, status: visibleOrderStatus })
        if (!resp.success || !resp.data) {
          workOrdersError.value = resp.error || '获取无感烘箱工单失败'
          break
        }
        if (resp.data.code !== 0) {
          workOrdersError.value = resp.data.msg || '获取无感烘箱工单失败'
          break
        }

        const chunk = resp.data.data.list
          .map(mapSensorlessOvenOrder)
          .filter((o) => o.status === visibleOrderStatus)
          .map(mapOrderWithInstruments)
        all.push(...chunk)
        total = resp.data.data.total

        if (chunk.length === 0) break
        page += 1
        if (page > 50) break
      }

      if (workOrdersError.value && !all.length) {
        workOrders.value = mockWorkOrders.map(withInstrumentState)
      } else {
        workOrders.value = all.map(withInstrumentState)
      }
      restoreScheduledEvents(workOrders.value)
      syncActiveHostDeviceName()
    } catch (e) {
      workOrdersError.value = e instanceof Error ? e.message : '获取无感烘箱工单失败'
      workOrders.value = mockWorkOrders.map(withInstrumentState)
      restoreScheduledEvents(workOrders.value)
      syncActiveHostDeviceName()
    } finally {
      workOrdersLoading.value = false
    }
  }

  const currentWorkOrder = ref<WorkOrder | null>(null)
  const testPhase = ref<SensorlessOvenTestPhase>('idle')
  const leftTemp = ref<number | null>(null)
  const rightTemp = ref<number | null>(null)
  const runSeconds = ref(0)
  const testStartTime = ref<number | null>(null)
  const lastSampleAt = ref<number | null>(null)
  const chartSeriesVisibility = ref({ left: true, right: true })
  const tempHistory = ref<SensorlessOvenTempPoint[]>([])
  const chartRef = ref<HTMLElement | null>(null)
  const chartWindowMinutes = ref<number | null>(null)
  const chartRangeLocked = ref(false)
  const startingTest = ref(false)
  const captureOutputDir = ref('')
  const MAX_TEMP_HISTORY = 20000
  let chartInstance: echarts.ECharts | null = null
  let runTimer: ReturnType<typeof setInterval> | null = null
  let unlistenMonitor: UnlistenFn | null = null
  let manualChartRange: { start: number; end: number } | null = null
  let applyingChartOption = false
  const preCheckItems = ref([
    { id: 1, text: '电源电压、环境温度及相对湿度符合使用条件', checked: false },
    { id: 2, text: '温箱箱体、控制箱、冷却系统电源连接安全可靠', checked: false },
    { id: 3, text: '确保"急停"按键复位', checked: false },
    { id: 4, text: '箱体上开门液压系统工作正常', checked: false },
    { id: 5, text: '外壳接地线连接可靠', checked: false }
  ])

  const filteredOrders = computed(() => {
    return workOrders.value.filter(order => {
      if (!getActiveInstruments(order).length) return false

      if (searchKeyword.value) {
        const keyword = searchKeyword.value.toLowerCase()
        const matchTask = order.taskNumber.toLowerCase().includes(keyword)
        const matchApplicant = order.applicant.toLowerCase().includes(keyword)
        if (!matchTask && !matchApplicant) return false
      }

      if (activeFilter.value === 'high' && order.priority !== 'high') return false
      if (activeFilter.value === 'pending' && order.status !== 1) return false
      if (activeFilter.value === 'paused' && order.statusText !== '暂停') return false

      return true
    })
  })

  const currentWeekDays = computed(() => {
    const days = []
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
    return `${start.month}月${start.dayNum}日 ～ ${end.month}月${end.dayNum}日`
  })

  const timeSlots = computed(() => {
    const slots = []
    for (let hour = 6; hour <= 22; hour++) {
      slots.push({ key: `${String(hour).padStart(2, '0')}00`, label: `${String(hour).padStart(2, '0')}:00`, isHalf: false })
    }
    return slots
  })

  const selectedScheduledOrderInfo = computed(() => {
    if (!selectedScheduledOrder.value) return null
    if (!isScheduledEventVisibleInActiveHost(selectedScheduledOrder.value)) return null
    const ev = scheduledEvents.value[selectedScheduledOrder.value]
    return ev ? getOrderById(ev.orderId) : getOrderById(selectedScheduledOrder.value)
  })

  const isPreCheckComplete = computed(() => preCheckItems.value.every(i => i.checked))

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

  const getCellKey = (dateStr: string, timeKey: string) => `${dateStr}_${timeKey}`
  const getOrderById = (id: string) => workOrders.value.find(o => o.id === id)

  async function refreshHostDeviceNames() {
    hostDeviceNames.value = []
  }

  const hostDeviceTabs = computed(() => {
    return [...hostDeviceNames.value]
  })

  function syncActiveHostDeviceName() {
    if (!activeHostDeviceName.value || !hostDeviceTabs.value.includes(activeHostDeviceName.value)) {
      activeHostDeviceName.value = hostDeviceTabs.value[0] || ''
      pruneSelectedScheduledOrderForActiveHost()
    }
  }

  function assignHostDeviceToCurrentScope(hostName: string) {
    const nextHostName = hostName.trim()
    if (!nextHostName) return
    activeHostDeviceName.value = nextHostName
    pruneSelectedScheduledOrderForActiveHost()
  }
  const getActiveInstruments = (order: WorkOrder) => order.instruments.filter((instrument) =>
    instrument.completed !== true &&
    instrument.status !== 2 &&
    !completedInstrumentIds.value[instrument.id]
  )
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
  const timeKeyToIndex = computed(() => {
    const map: Record<string, number> = {}
    timeSlots.value.forEach((s, idx) => {
      map[s.key] = idx
    })
    return map
  })

  function parseBackendDateTime(value?: string | null) {
    if (!value) return null
    const text = value.includes('T') ? value : value.replace(' ', 'T')
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  function eventFromOrderSchedule(order: WorkOrder): ScheduledEvent | null {
    const start = parseBackendDateTime(order.scheduledStartAt)
    const end = parseBackendDateTime(order.scheduledEndAt)
    if (!start || !end || end <= start) return null

    const startTimeKey = `${String(start.getHours()).padStart(2, '0')}00`
    const startIdx = timeKeyToIndex.value[startTimeKey]
    if (startIdx === undefined || startIdx >= timeSlots.value.length - 1) return null

    const span = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (60 * 60 * 1000)))
    const maxSpan = Math.max(1, timeSlots.value.length - 1 - startIdx)
    const dateStr = fmtDate(start)
    return {
      eventId: `${order.id}-${dateStr}-${startTimeKey}-${end.getTime()}`,
      orderId: order.id,
      dateStr,
      startTimeKey,
      span: Math.min(span, maxSpan),
    }
  }

  function restoreScheduledEvents(orders: WorkOrder[]) {
    const orderIds = new Set(orders.map((order) => order.id))
    const next: Record<string, ScheduledEvent> = {}
    Object.values(scheduledEvents.value).forEach((event) => {
      if (orderIds.has(event.orderId)) next[event.eventId] = event
    })
    orders.forEach((order) => {
      if (Object.values(next).some((event) => event.orderId === order.id)) return
      const event = eventFromOrderSchedule(order)
      if (event) next[event.eventId] = event
    })
    scheduledEvents.value = next
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

  type ScheduleChangePayload = {
    orderId: string
    eventId: string
    dateStr: string
    startTimeKey: string
    endTimeKey: string
    span: number
    startAtHour: string
    endAtHour: string
    scheduledStartAt: string
    scheduledEndAt: string
  }

  const getEventSchedulePayload = (ev: ScheduledEvent): ScheduleChangePayload | null => {
    const endTimeKey = getEndTimeKey(ev.startTimeKey, ev.span)
    if (!endTimeKey) return null
    const startHh = timeKeyToHour(ev.startTimeKey)
    const endHh = timeKeyToHour(endTimeKey)
    if (!startHh || !endHh) return null
    return {
      orderId: ev.orderId,
      eventId: ev.eventId,
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

  const getScheduleChangePayload = (eventId: string) => {
    const ev = scheduledEvents.value[eventId]
    return ev ? getEventSchedulePayload(ev) : null
  }

  const cloneScheduledEventMap = () => ({ ...scheduledEvents.value })

  const getOrderEvents = (orderId: string) => Object.values(scheduledEvents.value)
    .filter((event) => event.orderId === orderId)
    .sort((a, b) => {
      const startA = `${a.dateStr} ${a.startTimeKey}`
      const startB = `${b.dateStr} ${b.startTimeKey}`
      if (startA !== startB) return startA.localeCompare(startB)
      return a.eventId.localeCompare(b.eventId)
    })

  const getOrderSchedulePayload = (orderId: string) => {
    const event = getOrderEvents(orderId)[0]
    return event ? getEventSchedulePayload(event) : null
  }

  const rollbackScheduledEvents = (fallback?: Record<string, ScheduledEvent>) => {
    if (fallback !== undefined) scheduledEvents.value = { ...fallback }
  }

  const showSchedulePersistError = (resp?: { status?: number; data?: { msg?: string }; error?: string }) => {
    if (resp?.status === 401) {
      ElMessage.error('登录状态失效，请重新登录后再保存排期')
      return
    }
    if (resp?.status === 403) {
      ElMessage.error('当前账号没有无感烘箱排程权限，请联系管理员开通权限')
      return
    }
    ElMessage.error(resp?.data?.msg || resp?.error || '排期保存失败')
  }

  async function persistOrderSchedule(orderId: string, fallback?: Record<string, ScheduledEvent>) {
    const order = getOrderById(orderId)
    if (!order || order.dbId <= 0) return true

    const schedule = getOrderSchedulePayload(orderId)

    const authOk = await initAuth()
    if (!authOk) {
      rollbackScheduledEvents(fallback)
      ElMessage.error('登录状态失效，请重新登录后再保存排期')
      return false
    }

    const resp = schedule
      ? await saveSensorlessOvenOrderSchedule(
          order.dbId,
          {
            scheduled_start_at: schedule.scheduledStartAt,
            scheduled_end_at: schedule.scheduledEndAt,
          },
          getAuthHeaders()
        )
      : await clearSensorlessOvenOrderSchedule(order.dbId, getAuthHeaders())

    if (!resp.success || !resp.data || resp.data.code !== 0) {
      rollbackScheduledEvents(fallback)
      showSchedulePersistError(resp)
      return false
    }

    if (schedule) {
      order.scheduledStartAt = resp.data.data?.scheduled_start_at || schedule.scheduledStartAt
      order.scheduledEndAt = resp.data.data?.scheduled_end_at || schedule.scheduledEndAt
    } else {
      order.scheduledStartAt = null
      order.scheduledEndAt = null
    }

    return true
  }

  async function persistScheduledEvent(eventId: string, fallback?: Record<string, ScheduledEvent>) {
    const event = scheduledEvents.value[eventId] || fallback?.[eventId]
    if (!event) return true
    return persistOrderSchedule(event.orderId, fallback)
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

  const scheduledTasks = computed<Record<string, ScheduledEvent>>(() => {
    const map: Record<string, ScheduledEvent> = {}
    Object.values(scheduledEvents.value).forEach((ev) => {
      map[getCellKey(ev.dateStr, ev.startTimeKey)] = ev
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

  function getOrderHostDeviceName(order?: WorkOrder | null) {
    const explicitHost = [order?.testPlatform, order?.deviceName]
      .map((name) => name?.trim() || '')
      .find((name) => hostDeviceNames.value.includes(name))
    if (explicitHost) return explicitHost
    if (hostDeviceNames.value.length === 1) return hostDeviceNames.value[0]
    return order?.testPlatform?.trim() || order?.deviceName?.trim() || '-'
  }

  function doesScheduledEventMatchActiveHostDevice(ev: ScheduledEvent, activeScheduleHostName: string) {
    if (!activeScheduleHostName) return true
    return getOrderHostDeviceName(getOrderById(ev.orderId)) === activeScheduleHostName
  }

  function isScheduledEventVisibleInActiveHost(eventId: string) {
    const activeScheduleHostName = activeHostDeviceName.value.trim()
    if (!activeScheduleHostName) return true
    const ev = scheduledEvents.value[eventId]
    return !!ev && doesScheduledEventMatchActiveHostDevice(ev, activeScheduleHostName)
  }

  function pruneSelectedScheduledOrderForActiveHost() {
    if (selectedScheduledOrder.value && !isScheduledEventVisibleInActiveHost(selectedScheduledOrder.value)) {
      selectedScheduledOrder.value = null
    }
  }

  const scheduledLayoutItems = computed<ScheduledLayoutItem[]>(() => {
    const activeScheduleHostName = activeHostDeviceName.value.trim()
    const dayMap: Record<string, ScheduledEvent[]> = {}
    Object.values(scheduledEvents.value).forEach((ev) => {
      if (!doesScheduledEventMatchActiveHostDevice(ev, activeScheduleHostName)) return
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
          hostDeviceName: getOrderHostDeviceName(getOrderById(x.ev.orderId)),
        })
      })
    })

    return out
  })

  const maxLaneCount = computed(() => {
    if (!scheduledLayoutItems.value.length) return 1
    return Math.max(1, ...scheduledLayoutItems.value.map((x) => x.laneCount || 1))
  })

  function prevWeek() { calBase.value = addDays(calBase.value, -7) }
  function nextWeek() { calBase.value = addDays(calBase.value, 7) }

  function gotoDate(e: Event) {
    const val = (e.target as HTMLInputElement).value
    if (val) calBase.value = getMonday(new Date(val))
  }

  async function loadPresetSchedule() {
    await refreshWorkOrders()
  }

  async function handleUnschedule(cellKey: string, orderId: string, eventId = orderId) {
    void cellKey
    void orderId
    const removed = scheduledEvents.value[eventId]
    if (!removed) return
    const previousEvents = cloneScheduledEventMap()
    const previousSelected = selectedScheduledOrder.value
    if (selectedScheduledOrder.value === eventId) selectedScheduledOrder.value = null
    const next = { ...scheduledEvents.value }
    delete next[eventId]
    scheduledEvents.value = next

    try {
      const saved = await persistOrderSchedule(removed.orderId, previousEvents)
      if (!saved) selectedScheduledOrder.value = previousSelected
    } catch (error) {
      rollbackScheduledEvents(previousEvents)
      selectedScheduledOrder.value = previousSelected
      ElMessage.error(error instanceof Error ? error.message : '取消排期失败')
    }
  }

  function removeSchedule(cellKey: string) {
    const ev = scheduledTasks.value[cellKey]
    if (!ev) return
    handleUnschedule(cellKey, ev.orderId, ev.eventId)
  }

  function selectScheduledTask(eventId: string) {
    selectedScheduledOrder.value = selectedScheduledOrder.value === eventId ? null : eventId
  }

  function handleDragStart(e: DragEvent, order: WorkOrder) {
    draggedOrderId.value = order.id
    isDragging.value = true
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', order.id)
    }
    const target = e.target as HTMLElement
    setTimeout(() => {
      target.style.opacity = '0.5'
    }, 0)
  }

  function handleDragEnd(e: DragEvent) {
    const target = e.target as HTMLElement
    target.style.opacity = '1'
    draggedOrderId.value = null
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

  async function scheduleOrder(orderId: string, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    if (!orderId) return
    const lastKey = timeSlots.value[timeSlots.value.length - 1]?.key
    if (timeKey === lastKey) return

    const order = getOrderById(orderId)
    const span = Math.max(1, Math.ceil(Number(order?.duration || 0) / 60) || 1)
    const startIdx = timeKeyToIndex.value[timeKey]
    const maxSpan = startIdx === undefined ? 1 : Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const eventId = `${orderId}-${dateStr}-${timeKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const previousEvents = cloneScheduledEventMap()
    const previousSelected = selectedScheduledOrder.value
    const next = { ...scheduledEvents.value }
    Object.entries(next).forEach(([key, event]) => {
      if (event.orderId === orderId) delete next[key]
    })
    next[eventId] = { eventId, orderId, dateStr, startTimeKey: timeKey, span: Math.min(span, maxSpan) }
    scheduledEvents.value = {
      ...next,
    }
    selectedScheduledOrder.value = eventId
    if (isDragging.value) {
      isDragging.value = false
      draggedOrderId.value = null
    }

    try {
      const saved = await persistScheduledEvent(eventId, previousEvents)
      if (!saved) selectedScheduledOrder.value = previousSelected
    } catch (error) {
      rollbackScheduledEvents(previousEvents)
      selectedScheduledOrder.value = previousSelected
      ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
    }
  }

  async function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
    const orderId = e.dataTransfer?.getData('text/plain')
    if (!orderId) return
    await scheduleOrder(orderId, dateStr, timeKey, isPast)
  }

  const getEvent = (eventId: string) => scheduledEvents.value[eventId]

  const setEventSpan = (eventId: string, span: number) => {
    const ev = scheduledEvents.value[eventId]
    if (!ev) return
    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    if (nextSpan === ev.span) return
    scheduledEvents.value = { ...scheduledEvents.value, [eventId]: { ...ev, span: nextSpan } }
  }

  const resizing = ref<{ eventId: string; startY: number; originSpan: number; isTop?: boolean; originStartIdx?: number } | null>(null)
  const resizingOrderId = computed(() => resizing.value?.eventId || null)
  const isResizing = computed(() => !!resizing.value)

  const startResize = (eventId: string, e: MouseEvent) => {
    const ev = scheduledEvents.value[eventId]
    if (!ev) return
    const previousEvents = cloneScheduledEventMap()
    resizing.value = { eventId, startY: e.clientY, originSpan: ev.span, isTop: false }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx || ctx.isTop) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      setEventSpan(ctx.eventId, ctx.originSpan + deltaSlots)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      void persistScheduledEvent(eventId, previousEvents).then((saved) => {
        if (!saved) rollbackScheduledEvents(previousEvents)
      }).catch((error) => {
        rollbackScheduledEvents(previousEvents)
        ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const setEventStartAndSpan = (eventId: string, newStartIdx: number, newSpan: number) => {
    const ev = scheduledEvents.value[eventId]
    if (!ev) return

    const maxStartIdx = Math.max(0, timeSlots.value.length - 2)
    const safeStartIdx = Math.max(0, Math.min(newStartIdx, maxStartIdx))
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - safeStartIdx)
    const safeSpan = Math.max(1, Math.min(newSpan, maxSpan))

    const newTimeKey = timeSlots.value[safeStartIdx]?.key
    if (!newTimeKey) return

    if (newTimeKey === ev.startTimeKey && safeSpan === ev.span) return

    scheduledEvents.value = {
      ...scheduledEvents.value,
      [eventId]: { ...ev, startTimeKey: newTimeKey, span: safeSpan }
    }
  }

  const startResizeTop = (eventId: string, e: MouseEvent) => {
    const ev = scheduledEvents.value[eventId]
    if (!ev) return
    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return
    const previousEvents = cloneScheduledEventMap()

    resizing.value = { eventId, startY: e.clientY, originSpan: ev.span, isTop: true, originStartIdx: startIdx }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx || !ctx.isTop || ctx.originStartIdx === undefined) return
      const delta = me.clientY - ctx.startY

      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)

      const newStartIdx = ctx.originStartIdx + deltaSlots
      const newSpan = ctx.originSpan - deltaSlots

      if (newSpan < 1) return

      setEventStartAndSpan(ctx.eventId, newStartIdx, newSpan)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
      void persistScheduledEvent(eventId, previousEvents).then((saved) => {
        if (!saved) rollbackScheduledEvents(previousEvents)
      }).catch((error) => {
        rollbackScheduledEvents(previousEvents)
        ElMessage.error(error instanceof Error ? error.message : '排期保存失败')
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  async function startExperiment(eventId?: string, instrumentIds?: string[]) {
    if (eventId) {
      selectedScheduledOrder.value = eventId
    }

    const selectedEvent = selectedScheduledOrder.value ? scheduledEvents.value[selectedScheduledOrder.value] : null
    const selected = selectedScheduledOrderInfo.value || (selectedEvent ? getOrderById(selectedEvent.orderId) : null)
    if (!selected) return
    const pendingInstruments = getActiveInstruments(selected)
    const selectedInstruments = instrumentIds?.length
      ? pendingInstruments.filter((instrument) => instrumentIds.includes(instrument.id))
      : pendingInstruments
    if (!selectedInstruments.length) {
      alert('请先选择本次实际开始测试的仪器')
      return
    }
    markInstrumentsRunning(selectedInstruments.map((instrument) => instrument.id))
    currentWorkOrder.value = { ...selected, selectedInstruments }
    preCheckItems.value.forEach(i => (i.checked = false))
    resetTestRuntime()
    currentView.value = 'pre-check'
  }

  async function cancelExperiment() {
    backToDashboard()
  }

  function backToDashboard() {
    const selectedInstrumentIds = (currentWorkOrder.value?.selectedInstruments || []).map((instrument) => instrument.id)
    if (selectedInstrumentIds.length) clearRunningInstruments(selectedInstrumentIds)
    stopMonitoring()
    currentView.value = 'dashboard'
    currentWorkOrder.value = null
  }

  function togglePreCheck(id: number) {
    const item = preCheckItems.value.find(i => i.id === id)
    if (item) item.checked = !item.checked
  }

  function completePreCheck() {
    if (!isPreCheckComplete.value) return
    resetTestRuntime()
    currentView.value = 'monitoring'
  }

  const isTestRunning = computed(() => testPhase.value === 'running')
  const isTestPaused = computed(() => testPhase.value === 'paused')
  const canStartTest = computed(() =>
    !startingTest.value && (testPhase.value === 'idle' || testPhase.value === 'paused')
  )
  const canPauseTest = computed(() => !startingTest.value && testPhase.value === 'running')
  const canEndTest = computed(() =>
    !startingTest.value && (testPhase.value === 'running' || testPhase.value === 'paused')
  )
  const displayLeftTemp = computed(() => (leftTemp.value === null ? '--' : leftTemp.value.toFixed(1)))
  const displayRightTemp = computed(() => (rightTemp.value === null ? '--' : rightTemp.value.toFixed(1)))
  const displayTargetTemp = computed(() => {
    const target = Number(currentWorkOrder.value?.targetTemp || 0)
    return target > 0 ? target.toFixed(1) : '--'
  })
  const displayRunTime = computed(() => formatRunTime(runSeconds.value))
  const chartSummary = computed(() => {
    const temps = tempHistory.value
      .flatMap((point) => [point.left, point.right])
      .filter((value): value is number => value !== null && Number.isFinite(value))
    return {
      latestLeft: leftTemp.value,
      latestRight: rightTemp.value,
      maxTemp: temps.length ? Math.max(...temps) : null,
      minTemp: temps.length ? Math.min(...temps) : null,
      count: tempHistory.value.length,
      updatedAtMs: lastSampleAt.value,
    }
  })
  const testStatusText = computed(() => {
    if (testPhase.value === 'running') return '测试进行中'
    if (testPhase.value === 'paused') return '已暂停'
    if (testPhase.value === 'ended') return '测试已结束'
    return '等待开始'
  })

  function formatRunTime(seconds: number) {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
    const s = String(seconds % 60).padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  function formatClock(date = new Date()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
  }

  function stopRunTimer() {
    if (runTimer) {
      clearInterval(runTimer)
      runTimer = null
    }
  }

  function startRunTimer() {
    if (runTimer) return
    runTimer = setInterval(() => {
      runSeconds.value += 1
    }, 1000)
  }

  function formatSessionId(date = new Date()) {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  }

  function cleanupMonitorListener() {
    if (unlistenMonitor) {
      unlistenMonitor()
      unlistenMonitor = null
    }
  }

  async function stopCaptureProcess() {
    const outputDir = captureOutputDir.value
    try {
      await stopSensorlessOvenMonitor(outputDir || null)
    } catch (error) {
      console.warn('[sensorless-oven] stop monitor failed:', error)
    } finally {
      captureOutputDir.value = ''
      cleanupMonitorListener()
    }
  }

  function appendTempPoint(side: 'left' | 'right', temperature: number, timestampMs?: number) {
    if (!Number.isFinite(temperature)) return
    const value = Number(temperature.toFixed(1))
    if (side === 'left') leftTemp.value = value
    else rightTemp.value = value
    const stamp = timestampMs || Date.now()
    lastSampleAt.value = stamp
    tempHistory.value.push({
      time: formatClock(new Date(stamp)),
      timestampMs: stamp,
      left: leftTemp.value,
      right: rightTemp.value,
    })
    if (tempHistory.value.length > MAX_TEMP_HISTORY) tempHistory.value.shift()
    updateChart()
  }

  function handleMonitorEvent(payload: SensorlessOvenMonitorEvent) {
    if (payload.event === 'point' && (payload.side === 'left' || payload.side === 'right') && payload.temperature != null) {
      appendTempPoint(payload.side, payload.temperature, payload.timestamp_ms)
      return
    }
    if (payload.event === 'status' && payload.phase === 'paused') {
      testPhase.value = 'paused'
      stopRunTimer()
      return
    }
    if (payload.event === 'status' && payload.phase === 'running') {
      testPhase.value = 'running'
      startRunTimer()
      return
    }
    if (payload.event === 'ready' && payload.warnings?.length) {
      ElMessage.warning(payload.warnings.join('；'))
      return
    }
    if (payload.event === 'error' && payload.message) {
      ElMessage.error(payload.message)
      if (testPhase.value === 'running') {
        testPhase.value = 'paused'
        stopRunTimer()
      }
      return
    }
    if (payload.event === 'ended' && testPhase.value !== 'ended') {
      testPhase.value = 'ended'
      stopRunTimer()
    }
  }

  async function ensureMonitorListener() {
    cleanupMonitorListener()
    unlistenMonitor = await listenSensorlessOvenMonitor(handleMonitorEvent)
  }

  function resetTestRuntime() {
    stopRunTimer()
    testPhase.value = 'idle'
    leftTemp.value = null
    rightTemp.value = null
    runSeconds.value = 0
    testStartTime.value = null
    lastSampleAt.value = null
    chartSeriesVisibility.value = { left: true, right: true }
    tempHistory.value = []
    chartWindowMinutes.value = null
    chartRangeLocked.value = false
    manualChartRange = null
    startingTest.value = false
    if (chartInstance) updateChart()
  }

  async function resolveConfiguredPorts() {
    await initConfig()
    const leftPort = String(getConfigItem('sensorlessOvenLeftPort') || '').trim()
    const rightPort = String(getConfigItem('sensorlessOvenRightPort') || '').trim()
    const ports = await listSensorlessOvenPorts()
    return {
      leftPort: isSensorlessOvenPortPresent(ports, leftPort) ? leftPort : '',
      rightPort: isSensorlessOvenPortPresent(ports, rightPort) ? rightPort : '',
      configuredLeft: leftPort,
      configuredRight: rightPort,
    }
  }

  async function startCaptureFromSettings() {
    startingTest.value = true
    try {
      const { leftPort, rightPort, configuredLeft, configuredRight } = await resolveConfiguredPorts()
      if (!configuredLeft && !configuredRight) {
        ElMessage.error('请先在设置中配置无感烘箱左侧或右侧设备')
        return
      }
      if (!leftPort && !rightPort) {
        ElMessage.error('已配置的无感烘箱设备当前未连接，请检查串口后重试')
        return
      }

      await ensureMonitorListener()
      tempHistory.value = []
      leftTemp.value = null
      rightTemp.value = null
      runSeconds.value = 0
      testStartTime.value = Date.now()
      lastSampleAt.value = null
      const result = await startSensorlessOvenMonitor({
        leftPort,
        rightPort,
        orderId: currentWorkOrder.value?.taskNumber || currentWorkOrder.value?.id || 'unknown',
        sessionId: formatSessionId(),
      })
      captureOutputDir.value = result.output_dir
      testPhase.value = 'running'
      startRunTimer()
      if (leftPort && rightPort) {
        ElMessage.success('已连接左右侧温度采集设备')
      } else {
        ElMessage.success(`已连接${leftPort ? '左侧' : '右侧'}温度采集设备，本次仅采集一条曲线`)
      }
    } catch (error) {
      cleanupMonitorListener()
      captureOutputDir.value = ''
      testPhase.value = 'idle'
      stopRunTimer()
      ElMessage.error(error instanceof Error ? error.message : String(error || '启动采集失败'))
    } finally {
      startingTest.value = false
    }
  }

  async function startTest() {
    if (!canStartTest.value) return
    if (testPhase.value === 'paused') {
      if (!captureOutputDir.value) {
        ElMessage.error('采集会话已丢失，请重新开始测试')
        return
      }
      try {
        await resumeSensorlessOvenMonitor(captureOutputDir.value)
        testPhase.value = 'running'
        startRunTimer()
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : String(error || '恢复采集失败'))
      }
      return
    }
    await startCaptureFromSettings()
  }

  async function pauseTest() {
    if (!canPauseTest.value) return
    if (!captureOutputDir.value) return
    try {
      await pauseSensorlessOvenMonitor(captureOutputDir.value)
      testPhase.value = 'paused'
      stopRunTimer()
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error || '暂停采集失败'))
    }
  }

  async function endTest() {
    if (!canEndTest.value) return
    if (!confirm('确认测试结束？将关闭串口并停止采集，随后进入报告填写。')) return
    testPhase.value = 'ended'
    stopRunTimer()
    await stopCaptureProcess()

    const dbId = currentWorkOrder.value?.dbId
    if (dbId) {
      orderStatusMutating.value = true
      try {
        const res = await changeSensorlessOvenOrderStatus(dbId, 3, getAuthHeaders())
        if (res.success && res.data?.code === 0) {
          if (currentWorkOrder.value) currentWorkOrder.value.status = 3
        } else {
          ElMessage.warning(res.data?.msg || res.error || '工单状态更新失败，可在提交报告后再确认')
        }
      } catch (error) {
        ElMessage.warning('工单状态更新失败：' + (error instanceof Error ? error.message : String(error)))
      } finally {
        orderStatusMutating.value = false
      }
    }
  }

  function adaptiveChartDuration(spanMs: number) {
    const steps = [
      30 * 1000,
      60 * 1000,
      2 * 60 * 1000,
      5 * 60 * 1000,
      10 * 60 * 1000,
      30 * 60 * 1000,
      60 * 60 * 1000,
      3 * 60 * 60 * 1000,
      6 * 60 * 60 * 1000,
      12 * 60 * 60 * 1000,
      24 * 60 * 60 * 1000,
    ]
    return steps.find((step) => spanMs <= step) ?? steps[steps.length - 1]
  }

  function getChartRange() {
    const now = Date.now()
    const first = tempHistory.value[0]?.timestampMs
    const last = tempHistory.value[tempHistory.value.length - 1]?.timestampMs
    if (!Number.isFinite(first) || !Number.isFinite(last)) {
      return {
        fullStart: now,
        fullEnd: now + 30 * 1000,
        displayStart: now,
        displayEnd: now + 30 * 1000,
      }
    }

    const selectedWindow = chartWindowMinutes.value && chartWindowMinutes.value > 0
      ? chartWindowMinutes.value * 60 * 1000
      : null
    const windowSize = selectedWindow ?? adaptiveChartDuration(Math.max(0, last! - first!))
    const padding = Math.max(5000, Math.min(windowSize / 20, 5 * 60 * 1000))
    const fullEnd = Math.max(first! + windowSize, last! + padding)
    if (chartRangeLocked.value && manualChartRange) {
      const displayStart = Math.max(first!, Math.min(manualChartRange.start, fullEnd))
      const displayEnd = Math.max(displayStart, Math.min(manualChartRange.end, fullEnd))
      return { fullStart: first!, fullEnd, displayStart, displayEnd }
    }
    if (chartWindowMinutes.value === 0) {
      return { fullStart: first!, fullEnd, displayStart: first!, displayEnd: fullEnd }
    }
    const displayEnd = fullEnd
    return {
      fullStart: first!,
      fullEnd,
      displayStart: Math.max(first!, displayEnd - windowSize),
      displayEnd,
    }
  }

  function formatChartAxisTime(value: number, spanMs: number) {
    const date = new Date(value)
    const includeSeconds = spanMs <= 10 * 60 * 1000
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' as const } : {}),
    })
  }

  function initChart() {
    if (!chartRef.value) return
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
    chartInstance = echarts.init(chartRef.value)
    chartInstance.on('datazoom', () => {
      if (applyingChartOption || !chartInstance) return
      const option = chartInstance.getOption() as any
      const zoom = Array.isArray(option?.dataZoom) ? option.dataZoom[0] : null
      const start = Number(zoom?.startValue)
      const end = Number(zoom?.endValue)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
      manualChartRange = { start, end }
      chartRangeLocked.value = true
    })
    updateChart()
  }

  function updateChart() {
    if (!chartInstance) return
    const targetTemp = Number(currentWorkOrder.value?.targetTemp || 0)
    const range = getChartRange()
    const span = range.displayEnd - range.displayStart
    const leftData = tempHistory.value.map((point) => [point.timestampMs, point.left] as [number, number | null])
    const rightData = tempHistory.value.map((point) => [point.timestampMs, point.right] as [number, number | null])
    const pointCount = tempHistory.value.length

    applyingChartOption = true
    chartInstance.setOption({
      animation: false,
      backgroundColor: '#ffffff',
      color: ['#e14b55', '#f59e0b'],
      grid: { left: 58, right: 24, top: 28, bottom: 72, containLabel: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#98a2b3', width: 1 } },
        formatter: (params: any) => {
          const items = Array.isArray(params) ? params : [params]
          const firstItem = items.find((item) => Array.isArray(item?.data))
          if (!firstItem) return ''
          const timestamp = Number(firstItem.data[0])
          const time = new Date(timestamp).toLocaleString('zh-CN', {
            hour12: false,
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
          const rows = items.map((item) => {
            const value = Number(Array.isArray(item?.data) ? item.data[1] : NaN)
            return `${item?.marker ?? ''}${item?.seriesName ?? ''}：${Number.isFinite(value) ? value.toFixed(1) : '--'} °C`
          })
          return `${time}<br/>${rows.join('<br/>')}`
        },
      },
      xAxis: {
        type: 'time',
        min: range.fullStart,
        max: range.fullEnd,
        splitNumber: span <= 10 * 60 * 1000 ? 8 : 12,
        axisLine: { lineStyle: { color: '#8c94a3' } },
        axisTick: { alignWithLabel: true },
        axisLabel: {
          color: '#7a8190',
          hideOverlap: true,
          formatter: (value: number) => formatChartAxisTime(value, span),
        },
        splitLine: { show: true, lineStyle: { color: '#edf1f7', width: 1 } },
      },
      yAxis: {
        type: 'value',
        name: '°C',
        min: 0,
        max: 300,
        interval: 50,
        scale: false,
        nameTextStyle: { color: '#7a8190', padding: [0, 0, 0, 6] },
        axisLine: { show: false },
        axisLabel: { color: '#7a8190', fontSize: 11, formatter: (value: number) => Number(value).toFixed(0) },
        splitLine: { lineStyle: { color: '#edf1f7' } },
      },
      dataZoom: [
        {
          type: 'inside',
          throttle: 50,
          startValue: range.displayStart,
          endValue: range.displayEnd,
        },
        {
          type: 'slider',
          height: 28,
          bottom: 22,
          startValue: range.displayStart,
          endValue: range.displayEnd,
          borderColor: '#d6e2f7',
          backgroundColor: '#f4f7fc',
          fillerColor: 'rgba(79, 116, 209, 0.18)',
          handleStyle: { color: '#ffffff', borderColor: '#a6b8dd' },
          moveHandleStyle: { color: '#c5d5f3' },
          dataBackground: {
            lineStyle: { color: '#9db7f2' },
            areaStyle: { color: '#d8e4ff' },
          },
          selectedDataBackground: {
            lineStyle: { color: '#4f74d1' },
            areaStyle: { color: '#bfd0ff' },
          },
        },
      ],
      series: [
        {
          name: '左侧温度',
          type: 'line',
          data: chartSeriesVisibility.value.left ? leftData : [],
          connectNulls: false,
          showSymbol: pointCount <= 60,
          symbolSize: 5,
          smooth: false,
          lineStyle: { color: '#e14b55', width: 2 },
          emphasis: { focus: 'series' },
        },
        {
          name: '右侧温度',
          type: 'line',
          data: chartSeriesVisibility.value.right ? rightData : [],
          connectNulls: false,
          showSymbol: pointCount <= 60,
          symbolSize: 5,
          smooth: false,
          lineStyle: { color: '#f59e0b', width: 2 },
          emphasis: { focus: 'series' },
          markLine: targetTemp
            ? {
                silent: true,
                symbol: 'none',
                data: [
                  {
                    yAxis: targetTemp,
                    lineStyle: { color: '#3f69c9', type: 'dashed', width: 1 },
                    label: { formatter: `设定 ${targetTemp}°C`, color: '#3f69c9', fontSize: 11 },
                  },
                ],
              }
            : undefined,
        },
      ],
    }, true)
    queueMicrotask(() => {
      applyingChartOption = false
    })
  }

  function setChartWindowMinutes(value: number | null) {
    chartWindowMinutes.value = value !== null && [0, 5, 30, 60, 240].includes(value) ? value : null
    manualChartRange = null
    chartRangeLocked.value = false
    updateChart()
  }

  function toggleChartSeries(key: 'left' | 'right') {
    if (chartSeriesVisibility.value[key]) {
      const visibleCount = Object.values(chartSeriesVisibility.value).filter(Boolean).length
      if (visibleCount <= 1) {
        ElMessage.warning('实时监控曲线至少保留一条')
        return
      }
    }
    chartSeriesVisibility.value = {
      ...chartSeriesVisibility.value,
      [key]: !chartSeriesVisibility.value[key],
    }
    updateChart()
  }

  function showAllChartSeries() {
    chartSeriesVisibility.value = { left: true, right: true }
    updateChart()
  }

  function handleChartResize() {
    chartInstance?.resize()
  }

  async function enterMonitoring() {
    await nextTick()
    initChart()
    window.addEventListener('resize', handleChartResize)
  }

  function stopMonitoring() {
    void stopCaptureProcess()
    resetTestRuntime()
    window.removeEventListener('resize', handleChartResize)
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
  }

  watch(currentView, (val, oldVal) => {
    if (val === 'monitoring') {
      void enterMonitoring()
    } else if (oldVal === 'monitoring') {
      stopMonitoring()
    }
  })

  onUnmounted(() => {
    stopMonitoring()
  })

  void refreshWorkOrders()

  return {
    currentView,
    searchKeyword,
    activeFilter,
    calBase,
    selectedScheduledOrder,
    activeHostDeviceName,
    hostDeviceTabs,
    draggedOrderId,
    isDragging,
    slotHeightPx,
    scheduledOrders,
    scheduledTasks,
    scheduledLayoutItems,
    maxLaneCount,
    workOrders,
    workOrdersLoading,
    workOrdersError,
    refreshWorkOrders,
    orderStatusMutating,
    currentWorkOrder,
    testPhase,
    leftTemp,
    rightTemp,
    tempHistory,
    chartRef,
    isTestRunning,
    isTestPaused,
    canStartTest,
    canPauseTest,
    canEndTest,
    displayLeftTemp,
    displayRightTemp,
    displayTargetTemp,
    displayRunTime,
    testStatusText,
    testStartTime,
    chartSummary,
    chartSeriesVisibility,
    chartWindowMinutes,
    chartRangeLocked,
    setChartWindowMinutes,
    toggleChartSeries,
    showAllChartSeries,
    preCheckItems,
    filteredOrders,
    currentWeekDays,
    weekLabel,
    timeSlots,
    selectedScheduledOrderInfo,
    assignHostDeviceToCurrentScope,
    isPreCheckComplete,
    prevWeek,
    nextWeek,
    gotoDate,
    fmtDate,
    getCellKey,
    getOrderById,
    getActiveInstruments,
    isInstrumentRunning,
    markInstrumentsRunning,
    clearRunningInstruments,
    loadPresetSchedule,
    handleUnschedule,
    removeSchedule,
    selectScheduledTask,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    scheduleOrder,
    getEvent,
    startResize,
    startResizeTop,
    resizingOrderId,
    isResizing,
    getScheduleChangePayload,
    startExperiment,
    cancelExperiment,
    backToDashboard,
    togglePreCheck,
    completePreCheck,
    startTest,
    pauseTest,
    endTest,
    startingTest,
  }
}

export type SensorlessOvenContext = ReturnType<typeof useSensorlessOven>
