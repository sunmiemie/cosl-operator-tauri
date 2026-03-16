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
  const scheduledOrders = ref<Record<string, string[]>>({})
  const selectedScheduledOrderIds = ref<string[]>([])

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
    for (let hour = 8; hour < 18; hour++) {
      slots.push({ key: `${String(hour).padStart(2, '0')}00`, label: `${String(hour).padStart(2, '0')}:00`, isHalf: false })
      slots.push({ key: `${String(hour).padStart(2, '0')}30`, label: `${String(hour).padStart(2, '0')}:30`, isHalf: true })
    }
    slots.push({ key: '1800', label: '18:00', isHalf: false })
    return slots
  })

  const getCellKey = (dateStr: string, timeKey: string) => `${dateStr}_${timeKey}`

  const unscheduledOrders = computed(() => {
    const scheduledInstrumentIds = new Set(Object.values(scheduledOrders.value).flat())
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
      { d: 0, t: '0800', id: 'wo-A' },
      { d: 0, t: '1000', id: 'wo-B' },
      { d: 1, t: '1400', id: 'wo-C' },
    ]
    presets.forEach(p => {
      const d = addDays(base, p.d)
      const cellKey = getCellKey(fmtDate(d), p.t)
      const current = scheduledOrders.value[cellKey] || []
      if (!current.includes(p.id)) {
        scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...current, p.id] }
      }
    })
  }

  function handleDragStart(e: DragEvent, order: WorkOrder) {
    draggedOrder.value = order
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', order.id)
    }
    ;(e.currentTarget as HTMLElement | null)?.classList.add('dragging')
  }

  function handleInstrumentDragStart(e: DragEvent, instrument: InstrumentItem) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', instrument.id)
    }
    ;(e.currentTarget as HTMLElement | null)?.classList.add('dragging')
  }

  function handleDragEnd(e: DragEvent) {
    ;(e.currentTarget as HTMLElement | null)?.classList.remove('dragging')
    draggedOrder.value = null
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

  function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
    if (!e.dataTransfer) return
    const instrumentId = e.dataTransfer.getData('text/plain')
    if (!instrumentId) return
    const cellKey = getCellKey(dateStr, timeKey)
    const current = scheduledOrders.value[cellKey] || []
    if (!current.includes(instrumentId)) {
      scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...current, instrumentId] }
    }
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
    const current = scheduledOrders.value[cellKey] || []
    const next = current.filter(id => id !== orderId)
    if (next.length > 0) {
      scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: next }
    } else {
      const newObj = { ...scheduledOrders.value }
      delete newObj[cellKey]
      scheduledOrders.value = newObj
    }
    if (selectedScheduledOrderIds.value.includes(orderId)) {
      selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
    }
  }

  function resetScheduleState() {
    scheduledOrders.value = {}
    selectedScheduledOrderIds.value = []
  }

  return {
    searchKeyword,
    draggedOrder,
    workOrders,
    calBase,
    scheduledOrders,
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
    handleSelectScheduledOrder,
    handleUnschedule,
    resetScheduleState,
  }
}
