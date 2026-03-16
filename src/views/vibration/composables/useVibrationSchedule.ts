import { computed, onMounted, ref } from 'vue'
import type { TimeSlot, WeekDay, WorkOrder } from '../types'

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

export function useVibrationSchedule() {
  const searchKeyword = ref('')
  const draggedOrder = ref<WorkOrder | null>(null)
  const selectedScheduledOrderIds = ref<string[]>([])

  const workOrders = ref<WorkOrder[]>([
    { id: 'TMP-2026-001', type: '模拟实验', applicant: '张三', phone: '138****8888', device: '卫星姿控仪', level: '5G', duration: 30, purpose: '功能验证预实验' },
    { id: 'FOR-2026-001', type: '模拟实验', applicant: '李四', phone: '139****6666', device: '导航控制器', level: '8G', duration: 60, purpose: '环境适应性振动测试' },
    { id: 'FOR-2026-002', type: '正式测试', applicant: '王五', phone: '137****5555', device: '传感器模块', level: '10G', duration: 45, purpose: '结构完整性振动测试' },
    { id: 'TMP-2026-002', type: '模拟实验', applicant: '陈六', phone: '136****4444', device: '惯性测量单元', level: '3G', duration: 20, purpose: '安装工装验证' },
    { id: 'FOR-2026-003', type: '正式测试', applicant: '赵七', phone: '135****3333', device: '星敏感器', level: '6G', duration: 90, purpose: '正弦扫频耐久测试' },
    { id: 'FOR-2026-004', type: '模拟实验', applicant: '刘八', phone: '134****2222', device: '天线组件', level: '4G', duration: 120, purpose: '随机振动环境验证' },
  ])

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
    for (let hour = 8; hour < 18; hour++) {
      slots.push({ key: `${hour}00`, label: `${String(hour).padStart(2, '0')}:00`, isHalf: false })
      slots.push({ key: `${hour}30`, label: `${String(hour).padStart(2, '0')}:30`, isHalf: true })
    }
    slots.push({ key: '1800', label: '18:00', isHalf: false })
    return slots
  })

  const getCellKey = (dateStr: string, timeKey: string) => `${dateStr}_${timeKey}`
  const scheduledOrders = ref<Record<string, string[]>>({})

  onMounted(() => {
    const base = getMonday(new Date())
    const presets = [
      { d: 0, t: '800', id: 'TMP-2026-001' },
      { d: 0, t: '1000', id: 'FOR-2026-001' },
      { d: 1, t: '1400', id: 'FOR-2026-002' },
      { d: 2, t: '900', id: 'TMP-2026-002' },
      { d: 3, t: '1000', id: 'FOR-2026-003' },
    ]
    const newSchedule: Record<string, string[]> = {}
    presets.forEach(p => {
      const d = addDays(base, p.d)
      const timeKey = p.t.padStart(4, '0')
      const cellKey = getCellKey(fmtDate(d), timeKey)
      if (!newSchedule[cellKey]) newSchedule[cellKey] = []
      newSchedule[cellKey].push(p.id)
    })
    scheduledOrders.value = newSchedule
  })

  const getOrderById = (id: string) => workOrders.value.find(w => w.id === id)

  const unscheduledOrders = computed(() => {
    const scheduledList = Object.values(scheduledOrders.value).flat()
    const scheduled = new Set(scheduledList)
    const kw = searchKeyword.value.trim()
    return workOrders.value.filter(o => {
      if (scheduled.has(o.id)) return false
      if (!kw) return true
      return o.id.includes(kw) || o.applicant.includes(kw) || o.device.includes(kw) || o.type.includes(kw) || o.level.includes(kw)
    })
  })

  const selectedScheduledOrders = computed(() => {
    return selectedScheduledOrderIds.value.map(id => getOrderById(id)).filter(Boolean) as WorkOrder[]
  })

  function prevWeek() { calBase.value = addDays(calBase.value, -7) }
  function nextWeek() { calBase.value = addDays(calBase.value, 7) }
  function gotoDate(e: Event) {
    const val = (e.target as HTMLInputElement).value
    if (val) calBase.value = getMonday(new Date(val))
  }

  function loadPresetSchedule() {
    const base = calBase.value
    const presets = [
      { d: 0, t: '0800', id: 'TMP-2026-001' },
      { d: 1, t: '1000', id: 'FOR-2026-001' },
      { d: 2, t: '1400', id: 'FOR-2026-002' },
      { d: 3, t: '0900', id: 'TMP-2026-002' },
      { d: 4, t: '1000', id: 'FOR-2026-003' },
    ]
    presets.forEach(p => {
      const d = addDays(base, p.d)
      const cellKey = getCellKey(fmtDate(d), p.t)
      const arr = scheduledOrders.value[cellKey] || []
      if (!arr.includes(p.id)) {
        scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...arr, p.id] }
      }
    })
  }

  function handleDragStart(e: DragEvent, order: WorkOrder) {
    draggedOrder.value = order
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
  }

  function handleDragOver(e: DragEvent, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
    if (isPast) return
    e.preventDefault()
    if (!e.dataTransfer) return
    const orderId = e.dataTransfer.getData('text/plain')
    if (!orderId) return
    const cellKey = getCellKey(dateStr, timeKey)
    const arr = scheduledOrders.value[cellKey] || []
    if (!arr.includes(orderId)) {
      scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...arr, orderId] }
    }
  }

  function handleUnschedule(cellKey: string, orderId: string) {
    const arr = scheduledOrders.value[cellKey] || []
    const nextArr = arr.filter(id => id !== orderId)
    const next = { ...scheduledOrders.value }
    if (nextArr.length > 0) next[cellKey] = nextArr
    else delete next[cellKey]
    scheduledOrders.value = next
    if (selectedScheduledOrderIds.value.includes(orderId)) {
      selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
    }
  }

  function selectScheduledOrder(orderId: string) {
    const arr = selectedScheduledOrderIds.value
    selectedScheduledOrderIds.value = arr.includes(orderId) ? arr.filter(id => id !== orderId) : [...arr, orderId]
  }

  return {
    workOrders,
    searchKeyword,
    selectedScheduledOrderIds,
    selectedScheduledOrders,
    calBase,
    currentWeekDays,
    weekLabel,
    timeSlots,
    scheduledOrders,
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
    handleUnschedule,
    selectScheduledOrder,
  }
}
