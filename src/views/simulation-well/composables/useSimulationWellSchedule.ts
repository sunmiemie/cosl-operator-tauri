import { computed, ref } from 'vue'
import type { CalendarDay, TimeSlot, WorkOrder } from '../types'
import extractedData from '../extracted_fields.json'

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

  const workOrders = ref<WorkOrder[]>(extractedData.map(item => ({
    id: item.tableRefNo,
    customer: item.fileName.split(' ')[0] || "未知客户",
    devices: item.testProducts.length,
    status: "approved",
    createTime: "2026-03-01",
    planTime: "2026-03-17", // 默认设为今天以便测试显示
    taskDesc: item.fileName,
    deviceList: item.testProducts.map(p => ({
      id: p.code,
      name: p.zh,
      code: p.code,
      template: p.code
    })),
    supportingTools: item.supportingTools.map(s => ({
      id: s.code,
      name: s.zh,
      code: s.code,
      template: s.code
    }))
  })))

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
    const firstThreeIds = workOrders.value.slice(0, 3).map(o => o.id)
    if (firstThreeIds.length < 3) return

    const presets = [
      { d: 0, t: '0800', id: firstThreeIds[0] },
      { d: 0, t: '1000', id: firstThreeIds[1] },
      { d: 1, t: '1400', id: firstThreeIds[2] },
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
