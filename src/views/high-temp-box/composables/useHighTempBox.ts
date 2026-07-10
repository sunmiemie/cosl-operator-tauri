import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { useCamera } from '@/composables/useCamera'
import { useOcr } from '@/composables/useOcr'
import { useAuth } from '@/composables/useAuth'
import { pushEngineerAssistantSchedules, resolveEngineerAssistantTestTypeId } from '@/services'
import type { OcrRegion } from '@/types/ocr'
import {
  changeHighTempBoxOrderStatus,
  clearHighTempBoxOrderSchedule,
  listHighTempBoxOrders,
  mapHighTempBoxOrder,
  saveHighTempBoxOrderSchedule,
  type HighTempBoxOrder,
} from '@/services/high-temp-box-order-api'
import { fetchScheduleHostDeviceNames } from '@/services/schedule-host-device-api'

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
  instruments: HighTempBoxInstrument[]
  selectedInstruments?: HighTempBoxInstrument[]
}

export interface HighTempBoxInstrument {
  id: string
  dbId?: number | string
  name: string
  sn: string
  quantity?: number
  status?: number
  completed?: boolean
}

interface TempHistoryPoint {
  time: string
  temp: number
}

export function useHighTempBox() {
  const { initAuth, getAuthHeaders, userInfo } = useAuth()
  const STARTUP_GUIDE_STEPS = [
    { badge: '第一步', text: '接通冷水机电源，旋转"启动开关"至启动位置，确认指示灯亮起。', warning: null, images: ['/guide/step1.jpg'] },
    { badge: '第二步', text: '打开液压控制箱，检查并按下绿色的"ON"启动按钮。', warning: null, images: ['/guide/step2.jpg'] },
    { badge: '第三步', text: '找到高温烤箱盖的操纵杆，按其提示竖直向下拉动，打开箱盖。', warning: null, images: ['/guide/step3.jpg', '/guide/step3-2.jpg'] },
    { badge: '第四步', text: '待高温烤箱盖完全打开后，再将仪器平稳放入，并将测试线从箱体侧面的预留孔洞引出。', warning: null, images: ['/guide/step4.jpg'] },
    { badge: '第五步', text: '测试线引出后，必须用高温胶带对孔洞进行密封。', warning: '严禁不作密封！否则将造成热量散失，导致实际温度低于设定值。', images: ['/guide/step5.jpg'] },
    { badge: '第六步', text: '握住操纵杆，依提示向上拉动，关闭高温烤箱盖。关闭后，请确认盖口已完全密封。', warning: null, images: ['/guide/step6.jpg'] },
    { badge: '第七步', text: '将高温烤箱控制箱的电源开关从"OFF"拨至"ON"位置，等待系统界面启动。', warning: null, images: ['/guide/step7.jpg'] },
    { badge: '第八步', text: '在系统界面上，点击对应的功能按钮进入操作界面。', warning: null, images: ['/guide/step8.jpg'] },
    { badge: '第九步', text: '点击"定值控制"，随后进入"设置"界面。', warning: null, images: ['/guide/step9.jpg'] },
    { badge: '第十步', text: '手动点击"温度设置"按钮，输入设定的温度数值，检查无误后点击"OK"进行确认。', warning: null, images: ['/guide/step10.jpg', '/guide/step10-2.jpg'] },
    { badge: '第十一步', text: '观察界面的温度是否设置成功，确认设定温度值（SV）是否与输入值一致。', warning: null, images: ['/guide/step11.jpg'] },
    { badge: '第十二步', text: '点击界面上的"运行"按钮。此时按钮状态将切换为"停止"，设备正式开始工作。', warning: null, images: ['/guide/step12.jpg'] }
  ]

  const SHUTDOWN_CHECK_ITEMS = [
    '打开液压开关（液压按钮 OFF）',
    '关闭控制箱电源（控制箱开关 OFF）',
    '关闭外循环冷水机（反向扭动启动开关）',
  ] as const

  type HighTempBoxStep = 'pre-check' | 'startup-guide' | 'monitoring' | 'shutdown' | 'report'

  type HighTempBoxReportSnapshot = {
    reportNo: string
    taskNumber: string
    tester: string
    testDate: string
    completedAt: string
    targetTemp: number
    finalTemp: number | null
    durationText: string
    history: TempHistoryPoint[]
    summary: {
      minTemp: number | null
      maxTemp: number | null
      avgTemp: number | null
      sampleCount: number
      stabilityText: string
    }
  }

  const currentView = ref<'dashboard' | 'test'>('dashboard')
  const currentStep = ref<HighTempBoxStep>('pre-check')

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
      id: 'HTB-MOCK-001',
      dbId: -1001,
      taskNumber: 'HTB-MOCK-001',
      applicant: '王工',
      deviceName: '高温箱 A01',
      deviceNumber: 'HTB-A01',
      targetTemp: 125,
      duration: 180,
      testPlatform: '高温箱',
      testDate: fmtDate(new Date()),
      remark: '前端模拟工单',
      status: 1,
      statusText: '待测试',
      priority: 'normal',
      instruments: [
        { id: 'HTB-MOCK-001-I1', name: '温度采集模块', sn: 'TEMP-24001', quantity: 1 },
        { id: 'HTB-MOCK-001-I2', name: '控制板组件', sn: 'CTRL-24008', quantity: 1 },
        { id: 'HTB-MOCK-001-I3', name: '传感器探头', sn: 'SEN-24019', quantity: 1 },
      ],
    },
    {
      id: 'HTB-MOCK-002',
      dbId: -1002,
      taskNumber: 'HTB-MOCK-002',
      applicant: '李工',
      deviceName: '高温箱 B02',
      deviceNumber: 'HTB-B02',
      targetTemp: 150,
      duration: 240,
      testPlatform: '高温箱',
      testDate: fmtDate(new Date()),
      remark: '前端模拟工单',
      status: 1,
      statusText: '待测试',
      priority: 'high',
      instruments: [
        { id: 'HTB-MOCK-002-I1', name: '电源管理单元', sn: 'PWR-25003', quantity: 1 },
        { id: 'HTB-MOCK-002-I2', name: '通讯转接板', sn: 'COM-25011', quantity: 1 },
      ],
    },
  ]

  const buildFallbackInstrument = (order: HighTempBoxOrder | WorkOrder): HighTempBoxInstrument => ({
    id: `${order.id}-instrument-1`,
    name: order.deviceName || '高温箱测试仪器',
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

  const mapOrderWithInstruments = (order: HighTempBoxOrder): WorkOrder => ({
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
        const resp = await listHighTempBoxOrders({ page, pageSize, status: visibleOrderStatus })
        if (!resp.success || !resp.data) {
          workOrdersError.value = resp.error || '获取高温箱工单失败'
          break
        }
        if (resp.data.code !== 0) {
          workOrdersError.value = resp.data.msg || '获取高温箱工单失败'
          break
        }

        const chunk = resp.data.data.list
          .map(mapHighTempBoxOrder)
          .filter((o) => o.status === visibleOrderStatus)
          .map(mapOrderWithInstruments)
        all.push(...chunk)
        total = resp.data.data.total

        if (chunk.length === 0) break
        page += 1
        if (page > 50) break
      }

      const mockOnlyNew = mockWorkOrders.filter((mock) => !all.some((order) => order.id === mock.id))
      const scheduledOrders = (all.length ? [...all, ...mockOnlyNew] : mockWorkOrders).map(withInstrumentState)
      workOrders.value = scheduledOrders
      restoreScheduledEvents(scheduledOrders)
      syncActiveHostDeviceName()
    } catch (e) {
      workOrdersError.value = e instanceof Error ? e.message : '获取高温箱工单失败'
      workOrders.value = mockWorkOrders.map(withInstrumentState)
      restoreScheduledEvents(workOrders.value)
      syncActiveHostDeviceName()
    } finally {
      workOrdersLoading.value = false
    }
  }

  const currentWorkOrder = ref<WorkOrder | null>(null)
  const shutdownCheckData = ref<Record<number, boolean>>({})
  const reportSnapshot = ref<HighTempBoxReportSnapshot | null>(null)
  const preCheckItems = ref([
    { id: 1, text: '电源电压、环境温度及相对湿度符合使用条件', checked: false },
    { id: 2, text: '温箱箱体、控制箱、冷却系统电源连接安全可靠', checked: false },
    { id: 3, text: '确保"急停"按键复位', checked: false },
    { id: 4, text: '箱体上开门液压系统工作正常', checked: false },
    { id: 5, text: '外壳接地线连接可靠', checked: false }
  ])
  const guideStepIndex = ref(0)
  const currentTemp = ref(25)
  const isRunning = ref(true)

  const camera = useCamera()
  const ocr = useOcr()

  const ocrSetTemp = ref<number | null>(null)
  const ocrCurrentTemp = ref<number | null>(null)
  const ocrRunTime = ref<string | null>(null)

  const tempHistory = ref<TempHistoryPoint[]>([])

  const isOcrConfigMode = ref(false)
  const roiRegions = ref<Record<string, OcrRegion>>({})
  const activeRoiKey = ref<string | null>(null)

  const roiDragStart = ref<{ x: number; y: number } | null>(null)
  const roiDragCurrent = ref<{ x: number; y: number } | null>(null)

  const ocrConfidence = ref<Record<string, number>>({})

  let ocrTimer: ReturnType<typeof setInterval> | null = null
  let ocrBusy = false
  let runTimer: ReturnType<typeof setInterval> | null = null
  const runSeconds = ref(0)

  const chartRef = ref<HTMLElement | null>(null)
  let chartInstance: echarts.ECharts | null = null

  const selectedCameraIndex = ref<number>(0)
  const showCameraSelect = ref(false)

  const roiCanvasRef = ref<HTMLCanvasElement | null>(null)

  const filteredOrders = computed(() => {
    return workOrders.value.filter(order => {
      if (!getActiveInstruments(order).length) return false

      if (searchKeyword.value) {
        const keyword = searchKeyword.value.toLowerCase()
        const matchId = order.id.toLowerCase().includes(keyword)
        const matchTask = order.taskNumber.toLowerCase().includes(keyword)
        const matchApplicant = order.applicant.toLowerCase().includes(keyword)
        const matchDevice = order.deviceName.toLowerCase().includes(keyword)
        const matchInstrument = order.instruments.some((instrument) =>
          instrument.name.toLowerCase().includes(keyword) ||
          instrument.sn.toLowerCase().includes(keyword)
        )
        if (!matchId && !matchTask && !matchApplicant && !matchDevice && !matchInstrument) return false
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
  const shutdownCompletedCount = computed(() =>
    SHUTDOWN_CHECK_ITEMS.filter((_, index) => shutdownCheckData.value[index]).length
  )
  const isShutdownComplete = computed(() => shutdownCompletedCount.value === SHUTDOWN_CHECK_ITEMS.length)
  const shutdownProgress = computed(() =>
    SHUTDOWN_CHECK_ITEMS.length ? (shutdownCompletedCount.value / SHUTDOWN_CHECK_ITEMS.length) * 100 : 0
  )
  const testerName = computed(() => userInfo.value?.nickName || userInfo.value?.username || currentWorkOrder.value?.applicant || '系统操作员')
  const shutdownStatusCards = computed(() => [
    {
      label: '系统状态',
      value: isShutdownComplete.value ? '已关机' : '关机中',
      tone: isShutdownComplete.value ? 'success' : 'running',
    },
    {
      label: '数据采集',
      value: reportSnapshot.value ? '已完成' : '进行中',
      tone: reportSnapshot.value ? 'success' : 'running',
    },
    {
      label: '测试报告',
      value: isShutdownComplete.value ? '已生成' : '待生成',
      tone: isShutdownComplete.value ? 'success' : 'idle',
    },
  ])

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
    const authOk = await initAuth()
    if (!authOk) return

    const result = await fetchScheduleHostDeviceNames('high-temp-box', getAuthHeaders())
    if (!result.success) {
      console.warn('加载高温箱主机列表失败', result.error)
      return
    }

    hostDeviceNames.value = result.names
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
  const markInstrumentsCompleted = (instrumentIds: string[]) => {
    const next = { ...completedInstrumentIds.value }
    instrumentIds.forEach((id) => {
      if (id) next[id] = true
    })
    completedInstrumentIds.value = next
    workOrders.value = workOrders.value.map(withInstrumentState)
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
    const next: Record<string, ScheduledEvent> = {}
    orders.forEach((order) => {
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
      ElMessage.error('当前账号没有高温箱排程权限，请联系管理员开通权限')
      return
    }
    ElMessage.error(resp?.data?.msg || resp?.error || '排期保存失败')
  }

  async function getRequiredAuthHeaders() {
    const authOk = await initAuth()
    if (!authOk) {
      alert('登录状态失效，请重新登录后再操作')
      return null
    }
    return getAuthHeaders()
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
      ? await saveHighTempBoxOrderSchedule(
          order.dbId,
          {
            scheduled_start_at: schedule.scheduledStartAt,
            scheduled_end_at: schedule.scheduledEndAt,
          },
          getAuthHeaders()
        )
      : await clearHighTempBoxOrderSchedule(order.dbId, getAuthHeaders())

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
    const scheduleInfo = selectedScheduledOrder.value ? getScheduleChangePayload(selectedScheduledOrder.value) : null
    console.log('[high-temp-box schedule]', scheduleInfo ? `${scheduleInfo.startAtHour} ~ ${scheduleInfo.endAtHour}` : '', scheduleInfo)
    if (scheduleInfo) {
      const ok = await initAuth()
      if (!ok) {
        const cont = confirm('未登录，无法推送第三方排期，是否仍继续开始实验？')
        if (!cont) return
      } else {
        const headers = getAuthHeaders()
        const testType = (await resolveEngineerAssistantTestTypeId('高温箱', headers)) || ''
        if (testType) {
          const equipmentId = String((selected as any).testPlatform || (selected as any).deviceNumber || (selected as any).deviceName || (selected as any).taskNumber || selected.id)
          const testId = String((selected as any).dbId ?? selected.id)
          const resp = await pushEngineerAssistantSchedules(
            {
              schedulesInfo: [
                { testId, testType, equipmentId, startTime: scheduleInfo.startAtHour, endTime: scheduleInfo.endAtHour },
              ],
            },
            headers
          )
          if (!resp.success || !resp.data || resp.data.code !== 0) {
            const cont = confirm('推送第三方排期失败，是否仍继续开始实验？')
            if (!cont) return
          }
        } else {
          const cont = confirm('未匹配到第三方测试类型（高温箱），是否仍继续开始实验？')
          if (!cont) return
        }
      }
    }

    orderStatusMutating.value = true
    try {
      if (selected.dbId > 0) {
        const headers = await getRequiredAuthHeaders()
        if (!headers) return
        const runningInstrumentIds = selectedInstruments
          .map((instrument) => instrument.dbId)
          .filter((id): id is number | string => id !== undefined)
        const resp = await changeHighTempBoxOrderStatus(
          selected.dbId,
          2,
          headers,
          { runningInstrumentIds }
        )
        if (!resp.success || !resp.data || resp.data.code !== 0) {
          alert(resp.data?.msg || resp.error || '工单状态更新失败')
          return
        } else {
          void refreshWorkOrders()
        }
      }
    } finally {
      orderStatusMutating.value = false
    }

    markInstrumentsRunning(selectedInstruments.map((instrument) => instrument.id))
    currentWorkOrder.value = { ...selected, selectedInstruments }
    preCheckItems.value.forEach(i => (i.checked = false))
    shutdownCheckData.value = {}
    reportSnapshot.value = null
    isRunning.value = true
    currentView.value = 'test'
    currentStep.value = 'pre-check'
  }

  async function cancelExperiment() {
    const order = currentWorkOrder.value
    const orderId = typeof order?.dbId === 'number' && order.dbId > 0 ? order.dbId : undefined
    if (orderId !== undefined) {
      orderStatusMutating.value = true
      try {
        const headers = await getRequiredAuthHeaders()
        if (!headers) return
        const resp = await changeHighTempBoxOrderStatus(orderId, 1, headers)
        if (!resp.success || !resp.data || resp.data.code !== 0) {
          alert(resp.data?.msg || resp.error || '工单状态更新失败')
          return
        } else {
          void refreshWorkOrders()
        }
      } finally {
        orderStatusMutating.value = false
      }
    }
    backToDashboard()
  }

  function backToDashboard() {
    const selectedInstrumentIds = (currentWorkOrder.value?.selectedInstruments || []).map((instrument) => instrument.id)
    if (selectedInstrumentIds.length) clearRunningInstruments(selectedInstrumentIds)
    currentStep.value = 'pre-check'
    currentView.value = 'dashboard'
    currentWorkOrder.value = null
    guideStepIndex.value = 0
    shutdownCheckData.value = {}
    reportSnapshot.value = null
    isRunning.value = true
  }

  function togglePreCheck(id: number) {
    const item = preCheckItems.value.find(i => i.id === id)
    if (item) item.checked = !item.checked
  }

  function completePreCheck() {
    guideStepIndex.value = 0
    currentStep.value = 'startup-guide'
  }

  function nextGuideStep() {
    if (guideStepIndex.value < STARTUP_GUIDE_STEPS.length - 1) {
      guideStepIndex.value++
    } else {
      currentStep.value = 'monitoring'
    }
  }

  function prevGuideStep() {
    if (guideStepIndex.value > 0) {
      guideStepIndex.value--
    }
  }

  function formatRunTime(seconds: number): string {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
    const s = String(seconds % 60).padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  function formatDateTime(date = new Date()) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
  }

  function buildReportNo(taskNumber?: string) {
    const now = new Date()
    const dateCode = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const taskSuffix = (taskNumber || currentWorkOrder.value?.taskNumber || '000').replace(/\W/g, '').slice(-4) || '0000'
    return `HTB-${dateCode}-${taskSuffix}`
  }

  function toFixedOrNull(value: number | null, digits = 1) {
    return value === null || Number.isNaN(value) ? null : Number(value.toFixed(digits))
  }

  function buildReportSnapshot(): HighTempBoxReportSnapshot | null {
    const order = currentWorkOrder.value
    if (!order) return null
    const history = tempHistory.value.map((item) => ({ ...item }))
    const temps = history.map((item) => item.temp).filter((item) => Number.isFinite(item))
    const minTemp = temps.length ? Math.min(...temps) : null
    const maxTemp = temps.length ? Math.max(...temps) : null
    const avgTemp = temps.length ? temps.reduce((sum, item) => sum + item, 0) / temps.length : null
    const finalTemp = ocrCurrentTemp.value ?? (temps.length ? temps[temps.length - 1] : null)
    const targetTemp = Number(displaySetTemp.value || order.targetTemp || 0)
    const diff = finalTemp === null ? null : Math.abs(finalTemp - targetTemp)
    const stabilityText =
      diff === null ? '未采集到有效温度数据' : diff <= 3 ? '温控稳定' : diff <= 8 ? '温度接近目标值' : '温度偏差较大'

    return {
      reportNo: buildReportNo(order.taskNumber),
      taskNumber: order.taskNumber,
      tester: testerName.value,
      testDate: order.testDate,
      completedAt: formatDateTime(),
      targetTemp,
      finalTemp: toFixedOrNull(finalTemp),
      durationText: displayRunTime.value,
      history,
      summary: {
        minTemp: toFixedOrNull(minTemp),
        maxTemp: toFixedOrNull(maxTemp),
        avgTemp: toFixedOrNull(avgTemp),
        sampleCount: history.length,
        stabilityText,
      },
    }
  }

  function completeTest() {
    if (!confirm('确认测试结束？将进入关机检查并生成测试报告。')) return
    reportSnapshot.value = buildReportSnapshot()
    shutdownCheckData.value = {}
    currentStep.value = 'shutdown'
  }

  async function stopTest() {
    if (!confirm('测试将中止并清空数据，确认吗？')) return
    await cancelExperiment()
  }

  function setShutdownCheck(index: number) {
    if (shutdownCheckData.value[index]) return
    const prevIndex = index - 1
    if (prevIndex >= 0 && !shutdownCheckData.value[prevIndex]) return
    shutdownCheckData.value = {
      ...shutdownCheckData.value,
      [index]: true,
    }
  }

  function viewReport() {
    if (!isShutdownComplete.value || !reportSnapshot.value) return
    currentStep.value = 'report'
  }

  function backToShutdown() {
    currentStep.value = 'shutdown'
  }

  async function finishCompletedFlow() {
    const order = currentWorkOrder.value
    const selectedInstrumentIds = (order?.selectedInstruments || []).map((instrument) => instrument.id)
    const completedInstrumentDbIds = (order?.selectedInstruments || [])
      .map((instrument) => instrument.dbId)
      .filter((id): id is number | string => id !== undefined)
    const freshOrder = order ? getOrderById(order.id) : null
    const selectedSet = new Set(selectedInstrumentIds)
    const willCompleteOrder = !!freshOrder && getActiveInstruments(freshOrder).every((instrument) => selectedSet.has(instrument.id))
    const orderId = typeof order?.dbId === 'number' && order.dbId > 0 ? order.dbId : undefined
    if (orderId !== undefined) {
      orderStatusMutating.value = true
      try {
        const headers = await getRequiredAuthHeaders()
        if (!headers) return
        const resp = await changeHighTempBoxOrderStatus(
          orderId,
          willCompleteOrder ? 3 : 1,
          headers,
          { completedInstrumentIds: completedInstrumentDbIds }
        )
        if (!resp.success || !resp.data || resp.data.code !== 0) {
          alert(resp.data?.msg || resp.error || '工单状态更新失败')
          return
        } else {
          void refreshWorkOrders()
        }
      } finally {
        orderStatusMutating.value = false
      }
    }
    if (selectedInstrumentIds.length) {
      markInstrumentsCompleted(selectedInstrumentIds)
      clearRunningInstruments(selectedInstrumentIds)
    }
    backToDashboard()
  }

  const displayRunTime = computed(() => {
    if (ocrRunTime.value) return ocrRunTime.value
    return formatRunTime(runSeconds.value)
  })

  const displaySetTemp = computed(() => {
    if (ocrSetTemp.value !== null) return ocrSetTemp.value
    return currentWorkOrder.value?.targetTemp ?? '--'
  })

  const displayCurrentTemp = computed(() => {
    if (ocrCurrentTemp.value !== null) return ocrCurrentTemp.value
    return '--'
  })

  function getConfidenceLevel(regionId: string): 'high' | 'medium' | 'low' | 'none' {
    const conf = ocrConfidence.value[regionId]
    if (conf === undefined) return 'none'
    if (conf >= 0.8) return 'high'
    if (conf >= 0.6) return 'medium'
    return 'low'
  }

  async function startMonitorCamera() {
    const devices = await camera.getDeviceList()
    if (devices.length === 0) {
      console.warn('未检测到摄像头/采集卡')
      return
    }
    if (devices.length > 1) {
      showCameraSelect.value = true
    } else {
      await camera.startCamera(0)
      showCameraSelect.value = false
    }
  }

  async function selectAndStartCamera(index: number) {
    selectedCameraIndex.value = index
    showCameraSelect.value = false
    await camera.startCamera(index)
  }

  async function loadCachedRoi() {
    try {
      const data = await invoke<string>('read_cache', { cacheType: 'temp', id: 'ht-ocr-roi' })
      if (data) {
        const parsed = JSON.parse(data) as Record<string, OcrRegion>
        roiRegions.value = parsed
      }
    } catch {
      // ignore
    }
  }

  async function saveRoiConfig() {
    try {
      await invoke('write_cache', {
        cacheType: 'temp',
        id: 'ht-ocr-roi',
        data: JSON.stringify(roiRegions.value)
      })
    } catch (err) {
      console.error('保存 ROI 配置失败:', err)
    }
  }

  function enterRoiConfig() {
    isOcrConfigMode.value = true
    activeRoiKey.value = null
    stopOcrTimer()
  }

  function selectRoiTarget(key: string) {
    activeRoiKey.value = key
  }

  function onRoiMouseDown(e: MouseEvent) {
    if (!activeRoiKey.value || !roiCanvasRef.value) return
    const rect = roiCanvasRef.value.getBoundingClientRect()
    roiDragStart.value = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    }
    roiDragCurrent.value = { ...roiDragStart.value }
  }

  function onRoiMouseMove(e: MouseEvent) {
    if (!roiDragStart.value || !roiCanvasRef.value) return
    const rect = roiCanvasRef.value.getBoundingClientRect()
    roiDragCurrent.value = {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    }
    drawRoiOverlay()
  }

  function onRoiMouseUp() {
    if (!roiDragStart.value || !roiDragCurrent.value || !activeRoiKey.value) return

    const x = Math.min(roiDragStart.value.x, roiDragCurrent.value.x)
    const y = Math.min(roiDragStart.value.y, roiDragCurrent.value.y)
    const w = Math.abs(roiDragCurrent.value.x - roiDragStart.value.x)
    const h = Math.abs(roiDragCurrent.value.y - roiDragStart.value.y)

    if (w > 0.01 && h > 0.01) {
      const labels: Record<string, string> = {
        setTemp: '设定温度',
        currentTemp: '当前温度',
        runTime: '运行时间'
      }
      roiRegions.value[activeRoiKey.value] = {
        id: activeRoiKey.value,
        x: Math.round(x * 10000) / 10000,
        y: Math.round(y * 10000) / 10000,
        width: Math.round(w * 10000) / 10000,
        height: Math.round(h * 10000) / 10000,
        label: labels[activeRoiKey.value] || activeRoiKey.value
      }
    }

    roiDragStart.value = null
    roiDragCurrent.value = null
    drawRoiOverlay()
  }

  function drawRoiOverlay() {
    const canvas = roiCanvasRef.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    if (isOcrConfigMode.value) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.fillRect(0, 0, width, height)
    }

    const colors: Record<string, string> = {
      setTemp: '#f59e0b',
      currentTemp: '#3b82f6',
      runTime: '#10b981'
    }

    for (const [key, region] of Object.entries(roiRegions.value)) {
      const color = colors[key] || '#888'
      const rx = region.x * width
      const ry = region.y * height
      const rw = region.width * width
      const rh = region.height * height

      if (isOcrConfigMode.value) {
        ctx.clearRect(rx, ry, rw, rh)
      }

      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(rx, ry, rw, rh)

      ctx.fillStyle = color
      ctx.font = '12px sans-serif'
      ctx.fillText(region.label || key, rx + 4, ry - 4 > 12 ? ry - 4 : ry + 14)
    }

    if (roiDragStart.value && roiDragCurrent.value && activeRoiKey.value) {
      const color = colors[activeRoiKey.value] || '#fff'
      const sx = roiDragStart.value.x * width
      const sy = roiDragStart.value.y * height
      const sw = (roiDragCurrent.value.x - roiDragStart.value.x) * width
      const sh = (roiDragCurrent.value.y - roiDragStart.value.y) * height

      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(sx, sy, sw, sh)
      ctx.setLineDash([])
    }
  }

  async function saveAndExitRoiConfig() {
    isOcrConfigMode.value = false
    activeRoiKey.value = null
    await saveRoiConfig()
    drawRoiOverlay()
    await startOcrRecognition()
  }

  function cancelRoiConfig() {
    isOcrConfigMode.value = false
    activeRoiKey.value = null
    roiDragStart.value = null
    roiDragCurrent.value = null
    drawRoiOverlay()
  }

  function extractNumber(text: string): number | null {
    const match = text.match(/-?\d+\.?\d*/)
    return match ? parseFloat(match[0]) : null
  }

  async function startOcrRecognition() {
    const regionList = Object.values(roiRegions.value)
    if (regionList.length === 0) return

    const ok = await ocr.initialize()
    if (!ok) {
      console.error('OCR 初始化失败')
      return
    }

    await ocr.setRegions(regionList)
    stopOcrTimer()

    ocrTimer = setInterval(async () => {
      if (ocrBusy || !camera.currentFrame.value || !isRunning.value) return
      ocrBusy = true

      try {
        const result = await ocr.recognizeRegions(camera.currentFrame.value)
        if (!result) return

        for (const region of result.regions) {
          ocrConfidence.value[region.id] = region.confidence
          const num = extractNumber(region.text)

          if (region.id === 'setTemp' && num !== null) {
            ocrSetTemp.value = num
          } else if (region.id === 'currentTemp' && num !== null) {
            ocrCurrentTemp.value = num
            currentTemp.value = num
            const now = new Date()
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
            tempHistory.value.push({ time: timeStr, temp: num })
            if (tempHistory.value.length > 300) {
              tempHistory.value.shift()
            }
            updateChart()
          } else if (region.id === 'runTime') {
            ocrRunTime.value = region.text.trim()
          }
        }
      } finally {
        ocrBusy = false
      }
    }, 2000)
  }

  function stopOcrTimer() {
    if (ocrTimer) {
      clearInterval(ocrTimer)
      ocrTimer = null
    }
  }

  function startRunTimer() {
    runSeconds.value = 0
    runTimer = setInterval(() => {
      if (isRunning.value) {
        runSeconds.value++
      }
    }, 1000)
  }

  function stopRunTimer() {
    if (runTimer) {
      clearInterval(runTimer)
      runTimer = null
    }
  }

  function initChart() {
    if (!chartRef.value) return
    chartInstance = echarts.init(chartRef.value)

    const targetTemp = currentWorkOrder.value?.targetTemp ?? 0

    chartInstance.setOption({
      grid: { top: 40, right: 20, bottom: 30, left: 50 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(30, 30, 46, 0.9)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#e2e8f0', fontSize: 12 }
      },
      xAxis: {
        type: 'category',
        data: [],
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        name: '°C',
        nameTextStyle: { color: 'rgba(255,255,255,0.5)' },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
      },
      series: [
        {
          name: '当前温度',
          type: 'line',
          data: [],
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#3b82f6', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.02)' }
            ])
          },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                yAxis: targetTemp,
                lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 },
                label: { formatter: `设定 ${targetTemp}°C`, color: '#f59e0b', fontSize: 11 }
              }
            ]
          }
        }
      ]
    })
  }

  function updateChart() {
    if (!chartInstance) return
    const times = tempHistory.value.map(p => p.time)
    const temps = tempHistory.value.map(p => p.temp)

    chartInstance.setOption({
      xAxis: { data: times },
      series: [{ data: temps }]
    })
  }

  function handleResize() {
    chartInstance?.resize()
    resizeRoiCanvas()
  }

  async function enterMonitoring() {
    await nextTick()
    await startMonitorCamera()
    await loadCachedRoi()
    startRunTimer()

    await nextTick()
    initChart()

    if (Object.keys(roiRegions.value).length > 0) {
      await startOcrRecognition()
    }

    await nextTick()
    resizeRoiCanvas()
    drawRoiOverlay()

    window.addEventListener('resize', handleResize)
  }

  function stopMonitoring() {
    stopOcrTimer()
    stopRunTimer()
    camera.stopCamera()
    ocr.release()
    window.removeEventListener('resize', handleResize)
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
    ocrSetTemp.value = null
    ocrCurrentTemp.value = null
    ocrRunTime.value = null
    tempHistory.value = []
    ocrConfidence.value = {}
    runSeconds.value = 0
  }

  function resizeRoiCanvas() {
    const canvas = roiCanvasRef.value
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    canvas.width = parent.clientWidth
    canvas.height = parent.clientHeight
    drawRoiOverlay()
  }

  function togglePause() {
    isRunning.value = !isRunning.value
  }

  watch(currentStep, (val, oldVal) => {
    if (val === 'monitoring') {
      enterMonitoring()
    } else if (oldVal === 'monitoring') {
      stopMonitoring()
    }
  })

  onUnmounted(() => {
    stopMonitoring()
  })

  void refreshWorkOrders()

  return {
    STARTUP_GUIDE_STEPS,
    currentView,
    currentStep,
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
    SHUTDOWN_CHECK_ITEMS,
    shutdownCheckData,
    shutdownCompletedCount,
    shutdownProgress,
    isShutdownComplete,
    shutdownStatusCards,
    reportSnapshot,
    preCheckItems,
    guideStepIndex,
    currentTemp,
    isRunning,
    camera,
    ocrSetTemp,
    ocrCurrentTemp,
    ocrRunTime,
    tempHistory,
    isOcrConfigMode,
    roiRegions,
    activeRoiKey,
    ocrConfidence,
    chartRef,
    selectedCameraIndex,
    showCameraSelect,
    roiCanvasRef,
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
    nextGuideStep,
    prevGuideStep,
    completeTest,
    stopTest,
    setShutdownCheck,
    viewReport,
    backToShutdown,
    finishCompletedFlow,
    displayRunTime,
    displaySetTemp,
    displayCurrentTemp,
    getConfidenceLevel,
    selectAndStartCamera,
    enterRoiConfig,
    selectRoiTarget,
    onRoiMouseDown,
    onRoiMouseMove,
    onRoiMouseUp,
    saveAndExitRoiConfig,
    cancelRoiConfig,
    togglePause,
  }
}

export type HighTempBoxContext = ReturnType<typeof useHighTempBox>
