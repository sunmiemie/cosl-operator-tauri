import { computed, ref } from 'vue'
import type { CalendarDay, TimeSlot, WorkOrder } from '../types'

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

export function useSimulationWellSchedule() {
  const searchKeyword = ref('')
  const draggedOrder = ref<WorkOrder | null>(null)
  const scheduledOrders = ref<Record<string, string[]>>({})
  const scheduledOrdersTentative = ref<Record<string, string[]>>({})
  const selectedScheduledOrderIds = ref<string[]>([])

  const workOrders = ref<WorkOrder[]>([
    {
      id: 'WO-2024-001',
      customer: '中海油渤海分公司',
      devices: 3,
      status: 'approved',
      createTime: '2026-03-01',
      planTime: '2026-03-13',
      taskDesc: '15℃×EFDL道氧压陀螺机规代',
      deviceList: [
        { id: 'DST-2024-001', name: 'CBMT61XA井底磁定位测井仪' },
        { id: 'DST-2024-002', name: 'ERTT71XA遥传短节' },
        { id: 'DST-2024-003', name: 'HCAL61XA井径测井仪' },
      ],
    },
    {
      id: 'WO-2024-002',
      customer: '中石化华北石油局',
      devices: 5,
      status: 'inprogress',
      createTime: '2026-03-01',
      planTime: '2026-03-09',
      taskDesc: '科能井常规测试',
      deviceList: [
        { id: 'DST-2024-004', name: 'EZDT71XA岩性密度测井仪' },
        { id: 'DST-2024-005', name: 'ECNT73XA补偿中子测井仪' },
      ],
    },
    {
      id: 'WO-2024-003',
      customer: '中石油西部钻探',
      devices: 2,
      status: 'pending',
      createTime: '2026-03-01',
      planTime: '2026-03-09',
      taskDesc: '燕郊1井测试',
      deviceList: [
        { id: 'DST-2024-009', name: 'EDAT72XA方位密度测井仪' },
        { id: 'DST-2024-010', name: 'EAIL61XA阵列感应测井仪' },
      ],
    },
    {
      id: 'WO-2024-004',
      customer: '中海油南海东部公司',
      devices: 4,
      status: 'inprogress',
      createTime: '2026-03-01',
      planTime: '2026-03-10',
      taskDesc: '深水测井作业',
      deviceList: [{ id: 'DST-2024-011', name: 'EMSF71XA多臂井径测井仪' }],
    },
    {
      id: 'WO-2024-005',
      customer: '中石化胜利油田',
      devices: 6,
      status: 'approved',
      createTime: '2026-03-01',
      planTime: '2026-03-15',
      taskDesc: '油装井中心综合测试',
      deviceList: [{ id: 'DST-2024-015', name: 'ECCL61XA磁定位测井仪' }],
    },
    {
      id: 'WO-2024-006',
      customer: '中石油大庆油田',
      devices: 3,
      status: 'completed',
      createTime: '2023-12-28',
      planTime: '2026-03-16',
      taskDesc: '科索1井作业',
      deviceList: [{ id: 'DST-2023-098', name: 'ERMI61XA微电阻率扫描成像测井仪' }],
    },
    {
      id: 'WO-2024-007',
      customer: '中海油深圳分公司',
      devices: 8,
      status: 'approved',
      createTime: '2024-01-12',
      planTime: '2026-03-12',
      taskDesc: 'EFDT地层测试仪钻井中途油气层测试',
      deviceList: [
        { id: 'EFDT-001', name: 'EFDT PA电源短节', sn: 'EFDT-PA-001', template: 'EFDT_REPORT' },
        { id: 'EFDT-002', name: 'EFDT EA电子线路短节', sn: 'EFDT-EA-001', template: 'EFDT_REPORT' },
        { id: 'EFDT-003', name: 'EFDT DA液压短节', sn: 'EFDT-DA-001', template: 'EFDT_REPORT' },
        { id: 'EFDT-004', name: 'EFDT MA Packer短节', sn: 'EFDT-MA-001', template: 'EFDT_REPORT' },
        { id: 'EFDT-005', name: 'EFDT AA流体分析短节', sn: 'EFDT-AA-001', template: 'EFDT_REPORT' },
        { id: 'EFDT-006', name: 'EFDT SA泵抽短节', sn: 'EFDT-SA-001', template: 'EFDT_REPORT' },
        { id: 'EFDT-007', name: 'EFDT VA PVT短节', sn: 'EFDT-VA-001', template: 'EFDT_REPORT' },
        { id: 'EFDT-008', name: 'EFDT LA大样桶短节', sn: 'EFDT-LA-001', template: 'EFDT_REPORT' },
      ],
    },
  ])

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
        isPast: dObj < today,
      })
    }
    return days
  })

  const weekLabel = computed(() => {
    const s = currentWeekDays.value[0]
    const e = currentWeekDays.value[6]
    void s
    void e
    return ''
  })

  const timeSlots = computed<TimeSlot[]>(() => {
    const slots: TimeSlot[] = []
    for (let h = 8; h < 18; h++) {
      slots.push({ key: `${String(h).padStart(2, '0')}00`, label: `${String(h).padStart(2, '0')}:00`, isHalf: false })
      slots.push({ key: `${String(h).padStart(2, '0')}30`, label: `${String(h).padStart(2, '0')}:30`, isHalf: true })
    }
    slots.push({ key: '1800', label: '18:00', isHalf: false })
    return slots
  })

  function getCellKey(dateStr: string, timeKey: string) {
    return `${dateStr}_${timeKey}`
  }

  const todayDateStr = computed(() => fmtDate(new Date()))
  const todayScheduledOrderIds = computed(() => {
    const ids = new Set<string>()
    Object.entries(scheduledOrders.value).forEach(([cellKey, orderIds]) => {
      const dateStr = cellKey.split('_')[0]
      if (dateStr === todayDateStr.value) orderIds.forEach(id => ids.add(id))
    })
    return Array.from(ids)
  })

  const todayScheduledOrders = computed(() => {
    return todayScheduledOrderIds.value
      .map(id => workOrders.value.find(o => o.id === id))
      .filter(Boolean) as WorkOrder[]
  })

  const unscheduledOrders = computed(() => {
    const scheduledIds = new Set(Object.values(scheduledOrders.value).flat())
    const kw = searchKeyword.value.trim()
    return workOrders.value.filter(o => {
      if (scheduledIds.has(o.id)) return false
      if (o.status === 'completed') return false
      if (!kw) return true
      const deviceNames = (o.deviceList || []).map(d => d.name).join(' ')
      return o.id.includes(kw) || o.customer.includes(kw) || deviceNames.includes(kw) || (o.taskDesc || '').includes(kw)
    })
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
      { d: 0, t: '0800', id: 'WO-2024-001' },
      { d: 0, t: '1000', id: 'WO-2024-002' },
      { d: 1, t: '1400', id: 'WO-2024-003' },
    ]
    const globalScheduled = new Set(Object.values(scheduledOrders.value).flat())
    presets.forEach(p => {
      if (globalScheduled.has(p.id)) return
      const d = addDays(base, p.d)
      const cellKey = getCellKey(fmtDate(d), p.t)
      const cur = scheduledOrders.value[cellKey] || []
      scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...cur, p.id] }
    })
  }

  function initializeScheduleFromPlanTime() {
    const timeKeys = ['0800', '0900', '1000', '1100', '1300', '1400', '1500', '1600']
    let idx = 0
    workOrders.value.forEach(order => {
      if (order.status === 'completed' || !order.planTime) return
      const dateStr = order.planTime.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
      const alreadyScheduled = Object.values(scheduledOrders.value).some(ids => ids.includes(order.id))
      if (alreadyScheduled) return
      const preferred = timeKeys[idx % timeKeys.length]
      idx += 1
      const candidateKeys = [preferred, ...timeKeys.filter(t => t !== preferred)]
      const targetTime = candidateKeys.find(t => (scheduledOrders.value[getCellKey(dateStr, t)] || []).length === 0)
      if (!targetTime) return
      const cellKey = getCellKey(dateStr, targetTime)
      const cur = scheduledOrders.value[cellKey] || []
      scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...cur, order.id] }
    })
  }

  initializeScheduleFromPlanTime()

  function handleDragStart(e: DragEvent, order: WorkOrder) {
    draggedOrder.value = order
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    draggedOrder.value = null
  }

  function handleDragOver(e: DragEvent, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
  }

  function handleDragLeave() {}

  function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    const order = draggedOrder.value
    if (!order) return
    const isTentative = !!(e && (e.shiftKey || (e as DragEvent & { altKey?: boolean }).altKey))
    const cellKey = getCellKey(dateStr, timeKey)
    const scheduledIds = new Set(Object.values(scheduledOrders.value).flat())
    if (scheduledIds.has(order.id)) return
    if (isTentative) {
      const curT = scheduledOrdersTentative.value[cellKey] || []
      if (curT.includes(order.id)) return
      scheduledOrdersTentative.value = { ...scheduledOrdersTentative.value, [cellKey]: [...curT, order.id] }
    } else {
      const cur = scheduledOrders.value[cellKey] || []
      if (cur.includes(order.id)) return
      scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...cur, order.id] }
    }
  }

  function handleUnschedule(cellKey: string, oid: string) {
    const cur = (scheduledOrders.value[cellKey] || []).filter(x => x !== oid)
    scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: cur }
    selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(x => x !== oid)
  }

  function handleUnscheduleTentative(cellKey: string, oid: string) {
    const cur = (scheduledOrdersTentative.value[cellKey] || []).filter(x => x !== oid)
    scheduledOrdersTentative.value = { ...scheduledOrdersTentative.value, [cellKey]: cur }
  }

  function handleSelectScheduledOrder(oid: string) {
    const set = new Set(selectedScheduledOrderIds.value)
    if (set.has(oid)) set.delete(oid)
    else set.add(oid)
    selectedScheduledOrderIds.value = Array.from(set)
  }

  function getWorkOrderById(id: string) {
    return workOrders.value.find(o => o.id === id)
  }

  return {
    searchKeyword,
    workOrders,
    calBase,
    currentWeekDays,
    weekLabel,
    timeSlots,
    scheduledOrders,
    scheduledOrdersTentative,
    selectedScheduledOrderIds,
    todayScheduledOrderIds,
    todayScheduledOrders,
    unscheduledOrders,
    fmtDate,
    getCellKey,
    prevWeek,
    nextWeek,
    gotoDate,
    loadPresetSchedule,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleUnschedule,
    handleUnscheduleTentative,
    handleSelectScheduledOrder,
    getWorkOrderById,
  }
}
