import { ref, computed } from 'vue'
// 如果需要引用 store 中的变量：
// import { selectedOrder } from './useTestStore'

export function useSchedule() {
  // ============ 基础状态 ============
  const userName = ref('Operator')
  const searchKeyword = ref('') // 待排程工单的搜索关键字
  
  // 已排程的字典: Key为"日期_时间" (如 2023-10-01_0800), Value为工单ID数组
  const scheduledOrders = ref<Record<string, string[]>>({})
  
  // 当前在日历中被选中的工单 ID 列表
  const selectedScheduledOrderIds = ref<string[]>([])
  const draggedOrder = ref<any>(null) // 记录当前正在拖拽的工单对象
  const calBase = ref(new Date()) // 日历基准日期（当前周）

  // 固定的模拟工单数据
  const workOrders = ref([
    { id: 'WO001', taskNumber: '2025521', operator: userName.value, applicant: 'user1', deviceName: '导向短节', flowProcess: '小循环', status: 'pending', priority: '普通', type: '功能测试' },
    { id: 'WO002', taskNumber: '2025522', operator: userName.value, applicant: 'user2', deviceName: '传感器组件', flowProcess: '877米', status: 'pending', priority: '紧急', type: '耐压测试' },
    { id: 'WO003', taskNumber: '2025523', operator: userName.value, applicant: 'user3', deviceName: '压力控制阀', flowProcess: '水平钻机', status: 'pending', priority: '普通', type: '密封性测试' },
    { id: 'WO004', taskNumber: '2025524', operator: userName.value, applicant: 'user4', deviceName: '压力控制阀', flowProcess: '导向调节', status: 'pending', priority: '普通', type: '功能测试' },
    { id: 'WO005', taskNumber: '2025525', operator: userName.value, applicant: 'user5', deviceName: '导向短节', flowProcess: '小循环', status: 'pending', priority: '紧急', type: '耐温测试' },
  ])

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

  // 生成日历左侧的时间轴 (8:00 - 18:00，每半小时一格)
  const timeSlots = computed(() => {
    const slots = []
    for (let hour = 8; hour < 18; hour++) {
      slots.push({ key: `${String(hour).padStart(2, '0')}00`, label: `${String(hour).padStart(2, '0')}:00`, isHalf: false })
      slots.push({ key: `${String(hour).padStart(2, '0')}30`, label: `${String(hour).padStart(2, '0')}:30`, isHalf: true })
    }
    slots.push({ key: '1800', label: '18:00', isHalf: false })
    return slots
  })

  // 获取单元格唯一标识符
  const getCellKey = (dateStr: string, timeKey: string) => `${dateStr}_${timeKey}`
  
  // 过滤出未排程且符合搜索条件的工单
  const unscheduledOrders = computed(() => {
    const scheduled = new Set(Object.values(scheduledOrders.value).flat())
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
        String(o.type).toLowerCase().includes(keyword)
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

    const globalScheduled = new Set(Object.values(scheduledOrders.value).flat())

    presets.forEach(p => {
      if (globalScheduled.has(p.id)) return
      const d = addDays(base, p.d)
      const cellKey = getCellKey(fmtDate(d), p.t)
      const arr = scheduledOrders.value[cellKey] || []
      if (!arr.includes(p.id)) {
        scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...arr, p.id] }
      }
    })
  }

  // ============ 拖拽核心交互逻辑 ============

  const handleDragStart = (e: DragEvent, order: any) => {
    draggedOrder.value = order
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
  }
  
  const handleDragOver = (e: DragEvent, isPast: boolean) => {
    if (isPast) return // 过去的时间不允许排程
    e.preventDefault() // 必须阻止默认行为才能触发 drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('drag-over')
  }
  
  const handleDragEnter = (e: DragEvent) => { (e.currentTarget as HTMLElement).classList.add('drag-over') }
  const handleDragLeave = (e: DragEvent) => { (e.currentTarget as HTMLElement).classList.remove('drag-over') }
  
  const handleDrop = (e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) => {
    if (isPast) return
    e.preventDefault(); 
    (e.currentTarget as HTMLElement).classList.remove('drag-over')
    
    // 获取拖拽传递的工单ID
    const orderId = e.dataTransfer?.getData('text/plain')
    if (!orderId) return
    
    const cellKey = getCellKey(dateStr, timeKey)
    const arr = scheduledOrders.value[cellKey] || []
    
    // 避免重复在同一个格子放入相同的工单
    if (!arr.includes(orderId)) {
      scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...arr, orderId] }
    }
  }

  // 从日历中移除已排程的工单
  function handleUnschedule(cellKey: string, orderId: string) {
    const arr = scheduledOrders.value[cellKey] || []
    const nextArr = arr.filter(id => id !== orderId)
    const next = { ...scheduledOrders.value }
    if (nextArr.length > 0) next[cellKey] = nextArr; else delete next[cellKey]
    scheduledOrders.value = next
    
    // 如果移除的刚好是选中的工单，则清空选中状态
    selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(id => id !== orderId)
  }
  
  // 在日历上点击选中工单
  function selectScheduledOrder(orderId: string) {
    const arr = selectedScheduledOrderIds.value
    // Toggle 逻辑：已选中则取消，未选中则加入
    selectedScheduledOrderIds.value = arr.includes(orderId) ? arr.filter(id => id !== orderId) : [...arr, orderId]
  }

  return {
    searchKeyword, scheduledOrders, selectedScheduledOrderIds, calBase, currentWeekDays, weekLabel, timeSlots,
    unscheduledOrders, getOrderById, selectedScheduledOrders,
    getMonday, addDays, fmtDate,
    prevWeek: () => { calBase.value = addDays(calBase.value, -7) },
    nextWeek: () => { calBase.value = addDays(calBase.value, 7) },
    loadPresetSchedule,
    getCellKey, handleDragStart, handleDragEnd, handleDragOver, handleDragEnter, handleDragLeave, handleDrop,
    handleUnschedule, selectScheduledOrder
  }
}