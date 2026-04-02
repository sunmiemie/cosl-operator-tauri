import { ref, computed } from 'vue'
import { listWaterCycleOrders, mapWaterCycleOrder, type WaterCycleOrder } from '@/services/water-cycle-api'
// 如果需要引用 store 中的变量：
// import { selectedOrder } from './useTestStore'

export function useSchedule() {
  // ============ 基础状态 ============
  const userName = ref('Operator')
  const searchKeyword = ref('') // 待排程工单的搜索关键字
  
  const slotHeightPx = 44
  const isDragging = ref(false)

  type ScheduledEvent = {
    orderId: string
    dateStr: string
    startTimeKey: string
    span: number
  }

  const scheduledEvents = ref<Record<string, ScheduledEvent>>({})
  
  // 当前在日历中被选中的工单 ID 列表
  const selectedScheduledOrderIds = ref<string[]>([])
  const draggedOrder = ref<any>(null) // 记录当前正在拖拽的工单对象
  const calBase = ref(new Date()) // 日历基准日期（当前周）

  const workOrders = ref<WaterCycleOrder[]>([])
  const workOrdersLoading = ref(false)
  const workOrdersError = ref<string | null>(null)

  async function refreshWorkOrders() {
    workOrdersLoading.value = true
    workOrdersError.value = null

    try {
      const all: WaterCycleOrder[] = []
      const pageSize = 100
      let page = 1
      let total = Infinity

      while (all.length < total) {
        const resp = await listWaterCycleOrders({ page, pageSize })
        if (!resp.success || !resp.data) {
          workOrdersError.value = resp.error || '获取水循环工单失败'
          break
        }
        if (resp.data.code !== 0) {
          workOrdersError.value = resp.data.msg || '获取水循环工单失败'
          break
        }

        const chunk = resp.data.data.list.map(mapWaterCycleOrder)
        all.push(...chunk)
        total = resp.data.data.total

        if (chunk.length === 0) break
        page += 1
        if (page > 50) break
      }

      workOrders.value = all
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
    //return `${start.month}月${start.dayNum}日 ～ ${end.month}月${end.dayNum}日`
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

  const scheduledOrders = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    Object.values(scheduledEvents.value).forEach((ev) => {
      const cellKey = getCellKey(ev.dateStr, ev.startTimeKey)
      if (!map[cellKey]) map[cellKey] = []
      map[cellKey].push(ev.orderId)
    })
    return map
  })

  type ScheduledLayoutItem = {
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
    Object.values(scheduledEvents.value).forEach((ev) => {
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
        .sort((a, b) => a.startIdx - b.startIdx || a.ev.orderId.localeCompare(b.ev.orderId))

      const counts = new Array(timeSlots.value.length + 1).fill(0)
      mapped.forEach((x) => {
        counts[x.startIdx] += 1
        counts[x.endIdx] -= 1
      })
      for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1]

      const laneEnds: number[] = []
      const laneByOrderId: Record<string, number> = {}
      mapped.forEach((x) => {
        let lane = laneEnds.findIndex((le) => le <= x.startIdx)
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(x.endIdx)
        } else {
          laneEnds[lane] = x.endIdx
        }
        laneByOrderId[x.ev.orderId] = lane
      })

      mapped.forEach((x) => {
        const cellKey = getCellKey(dateStr, x.ev.startTimeKey)
        let laneCount = 1
        for (let i = x.startIdx; i < x.endIdx; i++) {
          laneCount = Math.max(laneCount, counts[i] || 0)
        }
        out.push({
          orderId: x.ev.orderId,
          dateStr,
          startTimeKey: x.ev.startTimeKey,
          startIdx: x.startIdx,
          span: x.span,
          lane: laneByOrderId[x.ev.orderId] ?? 0,
          laneCount: Math.max(1, laneCount),
          cellKey
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
    const scheduled = new Set(Object.keys(scheduledEvents.value))
    const kw = searchKeyword.value.trim()

    return workOrders.value.filter(o => {
      if (scheduled.has(o.id)) return false
      if (!kw) return true

      const keyword = kw.toLowerCase()
      return (
        String(o.id).toLowerCase().includes(keyword) ||
        String(o.taskNumber).toLowerCase().includes(keyword) ||
        String(o.deviceName).toLowerCase().includes(keyword) ||
        String(o.applicant).toLowerCase().includes(keyword) ||
        String(o.flowProcess).toLowerCase().includes(keyword) ||
        String(o.testPlatform).toLowerCase().includes(keyword)
      )
    })
  })
  
  const getOrderById = (id: string) => workOrders.value.find(o => o.id === id)
  
  // 获取当前在日历上被选中的排程对象集合
  const selectedScheduledOrders = computed(() => selectedScheduledOrderIds.value.map(id => getOrderById(id)).filter(Boolean) as any[])

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
      scheduledEvents.value = {
        ...scheduledEvents.value,
        [p.id]: { orderId: p.id, dateStr, startTimeKey: p.t, span: 2 }
      }
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
  
  const scheduleOrder = (orderId: string, dateStr: string, timeKey: string, isPast: boolean) => {
    if (isPast) return
    if (timeKey === timeSlots.value[timeSlots.value.length - 1]?.key) return
    if (scheduledEvents.value[orderId]) return
    scheduledEvents.value = {
      ...scheduledEvents.value,
      [orderId]: { orderId, dateStr, startTimeKey: timeKey, span: 1 }
    }
    if (isDragging.value) {
      isDragging.value = false
      draggedOrder.value = null
    }
  }

  const handleDrop = (e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) => {
    if (isPast) return
    e.preventDefault(); 
    (e.currentTarget as HTMLElement).classList.remove('drag-over')
    
    // 获取拖拽传递的工单ID
    const orderId = e.dataTransfer?.getData('text/plain')
    if (!orderId) return
    scheduleOrder(orderId, dateStr, timeKey, isPast)
  }

  // 从日历中移除已排程的工单
  function handleUnschedule(cellKey: string, orderId: string) {
    const next = { ...scheduledEvents.value }
    delete next[orderId]
    scheduledEvents.value = next
    
    // 如果移除的刚好是选中的工单，则清空选中状态
    selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
  }
  
  // 在日历上点击选中工单
  function selectScheduledOrder(orderId: string) {
    const arr = selectedScheduledOrderIds.value
    // Toggle 逻辑：已选中则取消，未选中则加入
    selectedScheduledOrderIds.value = arr.includes(orderId) ? arr.filter(id => id !== orderId) : [...arr, orderId]
  }

  const resizing = ref<{ orderId: string; startY: number; originSpan: number; originStartIdx: number; mode: 'bottom' | 'top' } | null>(null)
  const resizingOrderId = computed(() => resizing.value?.orderId || null)
  const isResizing = computed(() => !!resizing.value)

  const getEvent = (orderId: string) => scheduledEvents.value[orderId]

  const setEventSpan = (orderId: string, span: number) => {
    const ev = scheduledEvents.value[orderId]
    if (!ev) return
    const startIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (startIdx === undefined) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - startIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    if (nextSpan === ev.span) return
    scheduledEvents.value = { ...scheduledEvents.value, [orderId]: { ...ev, span: nextSpan } }
  }

  const setEventStartAndSpan = (orderId: string, startIdx: number, span: number) => {
    const ev = scheduledEvents.value[orderId]
    if (!ev) return
    const maxStartIdx = Math.max(0, timeSlots.value.length - 2)
    const nextStartIdx = Math.max(0, Math.min(maxStartIdx, startIdx))
    const nextStartKey = timeSlots.value[nextStartIdx]?.key
    if (!nextStartKey) return
    const maxSpan = Math.max(1, (timeSlots.value.length - 1) - nextStartIdx)
    const nextSpan = Math.min(maxSpan, Math.max(1, span))
    scheduledEvents.value = { ...scheduledEvents.value, [orderId]: { ...ev, startTimeKey: nextStartKey, span: nextSpan } }
  }

  const startResize = (orderId: string, e: MouseEvent) => {
    const ev = scheduledEvents.value[orderId]
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { orderId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'bottom' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      if (ctx.mode === 'bottom') {
        setEventSpan(ctx.orderId, ctx.originSpan + deltaSlots)
        return
      }
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.orderId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeTop = (orderId: string, e: MouseEvent) => {
    const ev = scheduledEvents.value[orderId]
    if (!ev) return
    const originStartIdx = timeKeyToIndex.value[ev.startTimeKey]
    if (originStartIdx === undefined) return
    resizing.value = { orderId, startY: e.clientY, originSpan: ev.span, originStartIdx, mode: 'top' }

    const onMove = (me: MouseEvent) => {
      const ctx = resizing.value
      if (!ctx) return
      const delta = me.clientY - ctx.startY
      const deltaSlots = delta >= 0 ? Math.floor(delta / slotHeightPx) : Math.ceil(delta / slotHeightPx)
      const endIdx = ctx.originStartIdx + Math.max(1, ctx.originSpan)
      const nextStartIdx = Math.max(0, Math.min(endIdx - 1, ctx.originStartIdx + deltaSlots))
      setEventStartAndSpan(ctx.orderId, nextStartIdx, endIdx - nextStartIdx)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizing.value = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return {
    searchKeyword, scheduledOrders, scheduledEvents, slotHeightPx, isDragging, selectedScheduledOrderIds, calBase, currentWeekDays, weekLabel, timeSlots,
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
    handleUnschedule, selectScheduledOrder, getEvent, startResize, startResizeTop, scheduledLayoutItems, maxLaneCount, scheduleOrder, resizingOrderId, isResizing
  }
}
