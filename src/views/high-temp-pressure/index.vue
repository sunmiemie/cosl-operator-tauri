<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import * as echarts from 'echarts'

const currentPanel = ref('dashboard')
const activeModal = ref<string | null>(null)
const testRunning = ref(false)
const testStartTime = ref<number | null>(null)
const csvCount = ref(0)
const onlineSeconds = ref(54)
const onlineTimerStr = ref('0时0分54秒')
let timerInterval: any = null
let testInterval: any = null
const chartRef = ref<HTMLDivElement | null>(null)
let chartInst: any = null
function initChart() {
  if (!chartRef.value) return
  chartInst = echarts.init(chartRef.value)
  chartInst.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['上部水温', '下部水温', '容器压力×10'], orient: 'horizontal', top: 6, right: 8 },
    grid: { left: 40, right: 20, top: 40, bottom: 10 },
    xAxis: { type: 'category', data: [] },
    yAxis: { type: 'value' },
    series: [
      { name: '上部水温', type: 'line', showSymbol: false, smooth: true, data: [] },
      { name: '下部水温', type: 'line', showSymbol: false, smooth: true, data: [] },
      { name: '容器压力×10', type: 'line', showSymbol: false, smooth: true, data: [] },
    ],
  })
}
function updateChart() {
  if (!chartInst) return
  const len = Math.max(state.chartData.t1.length, state.chartData.p.length)
  const x = Array.from({ length: len }, (_, i) => i + 1)
  chartInst.setOption({
    legend: { orient: 'horizontal', top: 6, right: 8 },
    xAxis: { data: x },
    series: [
      { name: '上部水温', data: state.chartData.t1.map(v => +v.toFixed(1)) },
      { name: '下部水温', data: state.chartData.t2.map(v => +v.toFixed(1)) },
      { name: '容器压力×10', data: state.chartData.p.map(v => +(v * 10).toFixed(2)) },
    ],
  })
}

const searchKeyword = ref('')
const draggedOrder = ref<any>(null)
const scheduledOrders = ref<Record<string, string[]>>({})
const selectedScheduledOrderIds = ref<string[]>([])

const state = reactive({
  manualChecked: {} as Record<number, boolean>,
  chartData: {
    t1: [] as number[],
    t2: [] as number[],
    p: [] as number[]
  }
})

const manualCheckTexts = [
  '查阅前次设备运转记录确认设备处于正常状态',
  '确认设备外观无异常，包括各处固定联接螺栓、软管及接头无松动',
  '排空液压缸内存水',
  '确认高压泵水箱浮漂及冷却水泵水位正常',
  '确认并检查各压力表无异常',
  '仪器尺寸及重量检查：直径＜φ240mm，长度＜9m，重量＜4吨',
  '确认试验仪器更换专用试压护帽',
  '确认试压介质的液面高度正常',
  '检查上试压头密封面及O圈确认状态良好，并确保密封复置',
  '各控制台上电检查，确保工作正常'
]

const showStartupCheck = ref(false)
const checkItems = ref(manualCheckTexts.map((text, idx) => ({ id: idx + 1, text, checked: false })))
const allChecked = computed(() => checkItems.value.every(i => i.checked))

const toggleCheck = (id: number) => {
  const item = checkItems.value.find(i => i.id === id)
  if (item) item.checked = !item.checked
}

const openStartupCheck = () => {
  checkItems.value.forEach(i => (i.checked = false))
  showStartupCheck.value = true
}

const handleStartupCheckComplete = () => {
  showStartupCheck.value = false
  showModal('confirm-start')
}

const backToStartupCheck = () => {
  switchPanel('dashboard')
  openStartupCheck()
}

const manualProgress = computed(() => {
  const done = Object.values(state.manualChecked).filter(v => v === true).length
  return { done }
})
const workOrders = ref([
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
      { id: 'ins-A3', label: '仪器A', sn: 'SN号: 016' }
    ]
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
      { id: 'ins-B2', label: '仪器B', sn: 'SN号: 012' }
    ]
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
    items: [
      { id: 'ins-C1', label: '仪器C', sn: 'SN号: 030' }
    ]
  }
])
// // 当前选中的工单ID
// const currentWorkOrderId = ref<string | null>(null)
// // 当前选中的工单
// const currentWorkOrder = computed(() => {
//   if (!currentWorkOrderId.value) return null
//   return workOrders.value.find(w => w.id === currentWorkOrderId.value) || null
// })
//console.log(currentWorkOrder.value+"1111111111");
const calBase = ref(new Date())

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

calBase.value = getMonday(new Date())

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
      isPast: dObj < today
    })
  }
  return days
})

const weekLabel = computed(() => {
  const start = currentWeekDays.value[0]
  const end = currentWeekDays.value[6]
  //return `${start.month}月${start.dayNum}日 ～ ${end.month}月${end.dayNum}日`
})

const timeSlots = computed(() => {
  const slots = []
  for (let hour = 8; hour < 18; hour++) {
    slots.push({ key: `${String(hour).padStart(2, '0')}00`, label: `${String(hour).padStart(2, '0')}:00`, isHalf: false })
    slots.push({ key: `${String(hour).padStart(2, '0')}30`, label: `${String(hour).padStart(2, '0')}:30`, isHalf: true })
  }
  slots.push({ key: '1800', label: '18:00', isHalf: false })
  return slots
})

const getCellKey = (dateStr: string, timeKey: string) => `${dateStr}_${timeKey}`

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

// 获取未排程工单
const unscheduledOrders = computed(() => {
  const scheduledInstrumentIds = new Set(Object.values(scheduledOrders.value).flat())
  return workOrders.value.filter(order =>
    order.status === '待排程' &&
    order.items.some(item => !scheduledInstrumentIds.has(item.id)) &&
    (searchKeyword.value === '' ||
      order.no.includes(searchKeyword.value) ||
      order.type.includes(searchKeyword.value) ||
      order.applicant.includes(searchKeyword.value))
  )
})

// 查找工单
const getOrderById = (id: string) => workOrders.value.find(o => o.id === id)
const getInstrumentById = (id: string) => {
  for (const o of workOrders.value) {
    const found = o.items.find(i => i.id === id)
    if (found) return found
  }
  return null
}
const getOrderByInstrumentId = (id: string) => workOrders.value.find(o => o.items.some(i => i.id === id))

// Navigation
const switchPanel = (panel: string) => {
  currentPanel.value = panel
}

// Manual Check
const handleManualCheck = (idx: number, val: boolean) => {
  state.manualChecked[idx] = val
}

const submitCheck = () => {
  switchPanel('start')
}

// Modals & Test Control
const showModal = (name: string) => {
  activeModal.value = name
}

const closeModal = () => {
  activeModal.value = null
}

const confirmStart = () => {
  closeModal()
  testRunning.value = true
  testStartTime.value = Date.now()
  switchPanel('testing')
  nextTick(() => initChart())
  if (testInterval) clearInterval(testInterval)
  testInterval = setInterval(() => {
    const lastT = state.chartData.t1[state.chartData.t1.length - 1] || 25
    const lastT2 = state.chartData.t2[state.chartData.t2.length - 1] || 25
    const lastP = state.chartData.p[state.chartData.p.length - 1] || 0
    const targetT = 180
    const targetP = 15
    const nextT = lastT + (targetT - lastT) * 0.05 + (Math.random() - 0.5)
    const nextT2 = lastT2 + (targetT - lastT2) * 0.04 + (Math.random() - 0.5)
    const nextP = lastP + (targetP - lastP) * 0.05 + (Math.random() * 0.1 - 0.05)
    state.chartData.t1.push(nextT)
    state.chartData.t2.push(nextT2)
    state.chartData.p.push(nextP)
    if (state.chartData.t1.length > 100) state.chartData.t1.shift()
    if (state.chartData.t2.length > 100) state.chartData.t2.shift()
    if (state.chartData.p.length > 100) state.chartData.p.shift()
    csvCount.value++
    updateChart()
  }, 1000)
}

function pauseTest() {
  if (testInterval) clearInterval(testInterval)
  testInterval = null
  testRunning.value = false
}

function resumeTest() {
  if (testInterval) clearInterval(testInterval)
  if (!chartInst) nextTick(() => initChart())
  testRunning.value = true
  testInterval = setInterval(() => {
    const lastT = state.chartData.t1[state.chartData.t1.length - 1] || 25
    const lastT2 = state.chartData.t2[state.chartData.t2.length - 1] || 25
    const lastP = state.chartData.p[state.chartData.p.length - 1] || 0
    const targetT = 180
    const targetP = 15
    const nextT = lastT + (targetT - lastT) * 0.05 + (Math.random() - 0.5)
    const nextT2 = lastT2 + (targetT - lastT2) * 0.04 + (Math.random() - 0.5)
    const nextP = lastP + (targetP - lastP) * 0.05 + (Math.random() * 0.1 - 0.05)
    state.chartData.t1.push(nextT)
    state.chartData.t2.push(nextT2)
    state.chartData.p.push(nextP)
    if (state.chartData.t1.length > 100) state.chartData.t1.shift()
    if (state.chartData.t2.length > 100) state.chartData.t2.shift()
    if (state.chartData.p.length > 100) state.chartData.p.shift()
    csvCount.value++
    updateChart()
  }, 1000)
}

const stopTest = () => {
  if (testInterval) clearInterval(testInterval)
  testRunning.value = false
  closeModal()
  switchPanel('dashboard')
}

const endTest = () => {
  if (testInterval) clearInterval(testInterval)
  testRunning.value = false
  closeModal()
  switchPanel('report')
}

const selectedScheduledOrders = computed(() => {
  return selectedScheduledOrderIds.value
    .map(id => ({ instrument: getInstrumentById(id), order: getOrderByInstrumentId(id) }))
    .filter(obj => obj.instrument && obj.order) as any[]
})

const currentSelected = computed(() => {
  const id = selectedScheduledOrderIds.value[0]
  if (!id) return null
  const order = getOrderByInstrumentId(id)
  const instrument = getInstrumentById(id)
  return order && instrument ? { order, instrument } : null
})

// 事件处理
const handleDragStart = (e: DragEvent, order: any) => {
  draggedOrder.value = order
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', order.id)
  }
  ;(e.currentTarget as HTMLElement | null)?.classList.add('dragging')
}

const handleInstrumentDragStart = (e: DragEvent, instrument: any) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', instrument.id)
  }
  ;(e.currentTarget as HTMLElement | null)?.classList.add('dragging')
}

const handleDragEnd = (e: DragEvent) => {
  ;(e.currentTarget as HTMLElement | null)?.classList.remove('dragging')
  draggedOrder.value = null
}

const handleDragOver = (e: DragEvent, isPast: boolean) => {
  if (isPast) return
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  ;(e.currentTarget as HTMLElement | null)?.classList.add('drag-over')
}

const handleDragLeave = (e: DragEvent) => {
  ;(e.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
}

const handleDrop = (e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) => {
  if (isPast) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
  if (!e.dataTransfer) return

  const instrumentId = e.dataTransfer.getData('text/plain')
  if (!instrumentId) return

  const cellKey = getCellKey(dateStr, timeKey)
  const current = scheduledOrders.value[cellKey] || []
  if (!current.includes(instrumentId)) {
    scheduledOrders.value = {
      ...scheduledOrders.value,
      [cellKey]: [...current, instrumentId]
    }
  }
}

const handleSelectScheduledOrder = (orderId: string) => {
  const current = selectedScheduledOrderIds.value
  if (current.includes(orderId)) {
    selectedScheduledOrderIds.value = current.filter(id => id !== orderId)
  } else {
    selectedScheduledOrderIds.value = [...current, orderId]
  }
}

const handleStartScheduledTest = () => {
  if (selectedScheduledOrders.value.length === 0) return
  openStartupCheck()
}

const handleUnschedule = (cellKey: string, orderId: string) => {
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

onMounted(() => {
  scheduledOrders.value = {}
  selectedScheduledOrderIds.value = []

  timerInterval = setInterval(() => {
    onlineSeconds.value++
    const h = Math.floor(onlineSeconds.value / 3600)
    const m = Math.floor((onlineSeconds.value % 3600) / 60)
    const s = onlineSeconds.value % 60
    onlineTimerStr.value = `${h}时${m}分${s}秒`
  }, 1000)
})

onUnmounted(() => {
  clearInterval(timerInterval)
  clearInterval(testInterval)
  if (chartInst) { chartInst.dispose(); chartInst = null }
})
</script>

<template>
  <div class="high-temp-pressure-page">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon">
          <Icon icon="mdi:gas-burner" />
        </div>
        <div>
          <h1 class="header-title">高温高压井</h1>
          <p class="header-subtitle">高温高压井测试系统</p>
        </div>
      </div>
      <div class="header-right"></div>
    </div>

    <div v-if="showStartupCheck" class="startup-check-overlay">
      <div class="startup-check-modal">
        <h2 class="modal-title">开机检查</h2>

        <div class="check-list-container">
          <div class="check-list">
            <label
              v-for="item in checkItems"
              :key="item.id"
              class="check-item"
              :class="{ 'is-checked': item.checked }"
            >
              <div class="checkbox-wrapper">
                <input
                  type="checkbox"
                  :checked="item.checked"
                  @change="toggleCheck(item.id)"
                />
                <div class="custom-checkbox">
                  <Icon v-if="item.checked" icon="mdi:check" />
                </div>
              </div>
              <span class="check-text">{{ item.text }}</span>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="showStartupCheck = false">取消</button>
          <button class="next-btn" :disabled="!allChecked" @click="handleStartupCheckComplete">下一步</button>
        </div>
      </div>
    </div>

    <div class="content-area">
        <!-- DASHBOARD -->
        <div v-if="currentPanel === 'dashboard'" class="panel active">
          
          <div class="schedule-wrap">
            <div class="sidebar">
              <div class="panel-header">
                <div class="header-title">
                  <Icon icon="mdi:format-list-bulleted" class="header-icon" />
                  <span>待测试工单</span>
                </div>
                <span class="count-badge">{{ unscheduledOrders.length }}</span>
              </div>
              <div class="search-box">
                <Icon icon="mdi:magnify" class="search-icon" />
                <input
                  v-model="searchKeyword"
                  type="text"
                  placeholder="搜索工单号/设备/申请人"
                />
                <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''">
                  <Icon icon="mdi:close" />
                </button>
              </div>

              <div class="table-content">
                <div v-if="unscheduledOrders.length === 0" class="empty-state">
                  <p>无待排程工单</p>
                </div>
                <div v-else class="table-wrapper">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>工单号</th>
                        <th>器皿类型</th>
                        <th>申请人</th>
                        <th>状态</th>
                        <th>展开</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="order in unscheduledOrders" :key="order.id">
                        <tr @click="order.expanded = !order.expanded">
                          <td class="cell-id">{{ order.no }}</td>
                          <td class="cell-type" :title="order.type">{{ order.type }}</td>
                          <td class="cell-applicant">{{ order.applicant }}</td>
                          <td><span class="status-tag status-pending">待排程</span></td>
                          <td class="cell-expand">
                            <Icon :icon="order.expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
                          </td>
                        </tr>
                        <tr v-if="order.expanded" :key="order.id + '-expanded'">
                          <td class="expanded-cell" colspan="5">
                            <div class="instrument-list">
                              <div 
                                v-for="item in order.items" 
                                :key="item.id" 
                                class="instrument-item"
                                draggable="true"
                                @dragstart="handleInstrumentDragStart($event, item)"
                                @dragend="handleDragEnd"
                              >
                                <span>{{ item.label }}</span>
                                <span class="instrument-sn">{{ item.sn }}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- 日历设计 -->
            <div class="main-content">
              <div class="panel-header">
                <div class="week-cal-toolbar">
                  <button class="week-cal-nav" @click="prevWeek">‹ 上一周</button>
                  <input
                    type="date"
                    class="week-cal-date-input"
                    :value="fmtDate(calBase)"
                    @change="gotoDate"
                    title="跳转到指定日期所在周"
                  />
                  <span class="week-cal-label">{{ weekLabel }}</span>
                  <button class="week-cal-nav" @click="nextWeek">下一周 ›</button>
                  <button class="week-cal-nav" @click="loadPresetSchedule">读取本周排程</button>
                </div>
                <div class="legend">
                  <div class="legend-item"><span class="dot pending"></span>空闲</div>
                  <div class="legend-item"><span class="dot occupied"></span>已占用</div>
                </div>
              </div>

              <div class="calendar-grid">
                <div class="grid-header-row">
                  <div class="time-column-header">时间</div>
                  <div
                    v-for="day in currentWeekDays"
                    :key="day.dateStr"
                    class="day-header"
                    :class="{ 'is-today': day.isToday }"
                  >
                    <div class="day-num" :class="{ 'is-weekend': day.isWeekend }">{{ day.month }}/{{ day.dayNum }}</div>
                    <div class="day-name">{{ day.dayName }}</div>
                  </div>
                </div>

                <div class="grid-body">
                  <div v-for="slot in timeSlots" :key="slot.key" class="grid-row" :class="{ 'is-half': slot.isHalf }">
                    <div class="time-label" :class="{ 'is-half': slot.isHalf }">{{ slot.label }}</div>

                    <div
                      v-for="day in currentWeekDays"
                      :key="getCellKey(day.dateStr, slot.key)"
                      class="grid-cell"
                      :class="{
                        'is-weekend': day.isWeekend,
                        'is-half-cell': slot.isHalf,
                        'is-past': day.isPast
                      }"
                      @dragover.capture="handleDragOver($event, day.isPast)"
                      @dragleave="handleDragLeave"
                      @drop.capture="handleDrop($event, day.dateStr, slot.key, day.isPast)"
                    >
                      <div
                        v-if="scheduledOrders[getCellKey(day.dateStr, slot.key)]?.length"
                        style="display: flex; flex-direction: column; gap: 4px; width: 100%"
                      >
                        <div
                          v-for="oid in scheduledOrders[getCellKey(day.dateStr, slot.key)]"
                          :key="oid"
                          class="scheduled-item"
                          :class="{ 'is-selected': selectedScheduledOrderIds.includes(oid) }"
                          @click.stop="handleSelectScheduledOrder(oid)"
                        >
                          <div class="scheduled-content">
                            <span class="device-name">
                              {{ getInstrumentById(oid)?.label }}
                            </span>
                            <button
                              class="remove-btn"
                              @click.stop="handleUnschedule(getCellKey(day.dateStr, slot.key), oid)"
                            >
                              <Icon icon="mdi:close" />
                            </button>
                          </div>
                          <div class="scheduled-tag">
                            {{ getInstrumentById(oid)?.sn }} · {{ getOrderByInstrumentId(oid)?.no }}
                          </div>
                        </div>
                      </div>

                      <div v-else class="empty-slot-hint">+</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="control-center">
                <div class="control-center-left">
                  <template v-if="selectedScheduledOrders.length > 0">
                    <div class="selected-order">
                      <Icon icon="mdi:check" class="selected-icon" />
                      <span class="selected-label">已选中工单: {{ selectedScheduledOrders.length }} 个</span>
                    </div>
                    <span class="selected-divider">|</span>
                    <span class="selected-device" v-for="o in selectedScheduledOrders" :key="o.instrument.id">
                      {{ o.order.no }} · {{ o.instrument.label }}
                    </span>
                  </template>
                  <span v-else class="selected-placeholder">请在日历中选择已排程的工单</span>
                </div>

                <button
                  class="primary-btn"
                  :disabled="selectedScheduledOrders.length === 0"
                  @click="handleStartScheduledTest"
                >
                  <Icon icon="mdi:play" class="start-icon" />
                  开始实验
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="currentPanel === 'start'" class="panel">
           <div class="two-col">
             <div class="start-left">
               <div class="alert alert-warning" style="margin-top:12px">
                 <div style="display:flex;gap:8px;align-items:flex-start">
                   <Icon icon="mdi:alert" class="alert-icon" />
                   <div class="alert-text">
                     <div style="font-weight:600;margin-bottom:6px">启动前确认</div>
                     <ul style="padding-left:16px;font-size:12px;margin:4px 0">
                       <li>请确认测试台已完成运转前检查</li>
                       <li>确认仪器容器已正确安装</li>
                       <li>检查密封性确认无泄漏</li>
                       <li>确认分析仪器已正确连接</li>
                       <li>测试程序开始后，请勿随意停止</li>
                       <li>如遇紧急情况，立即按紧急停止按钮</li>
                     </ul>
                   </div>
                 </div>
               </div>
               <div class="alert" style="background: rgba(59,130,246,0.08); color: var(--color-accent-blue);">
                 <div style="display:flex;gap:8px;align-items:center">
                   <Icon icon="mdi:information" class="alert-icon" />
                   <div class="alert-text">请在主控计算机上按工单信息设定温度与压力参数，确认无误后点击“开始试验”。</div>
                 </div>
               </div>
               <div style="display:flex;gap:10px;margin-top:12px">
                 <button class="btn btn-outline" @click="backToStartupCheck" style="flex:1">上一步</button>
                 <button class="btn btn-primary btn-lg" @click="openStartupCheck" style="flex:2">开始试验</button>
               </div>
             </div>
             <div class="card">
               <div class="card-header"><div class="card-title">工单信息</div></div>
               <div class="card-body">
                 <div v-if="currentSelected" class="info-grid">
                   <div class="info-item"><div class="info-key">委托单号</div><div class="info-val">{{ currentSelected.order.entrustNo }}</div></div>
                   <div class="info-item"><div class="info-key">工单编号</div><div class="info-val">{{ currentSelected.order.no }}</div></div>
                   <div class="info-item"><div class="info-key">申请人</div><div class="info-val">{{ currentSelected.order.applicant }}</div></div>
                   <div class="info-item"><div class="info-key">申请单位</div><div class="info-val">{{ currentSelected.order.applicantUnit }}</div></div>
                   <div class="info-item"><div class="info-key">申请日期</div><div class="info-val">{{ currentSelected.order.applyDate }}</div></div>
                   <div class="info-item"><div class="info-key">到检编号</div><div class="info-val">{{ currentSelected.order.receivingNo }}</div></div>
                   <div class="info-item"><div class="info-key">器皿类型</div><div class="info-val">{{ currentSelected.order.vesselType }}</div></div>
                   <div class="info-item"><div class="info-key">目标温度</div><div class="info-val" style="color:var(--red-bright)">{{ currentSelected.order.targetTemp }}</div></div>
                   <div class="info-item"><div class="info-key">目标压力</div><div class="info-val" style="color:var(--cyan)">{{ currentSelected.order.targetPressure }}</div></div>
                   <div class="info-item"><div class="info-key">保温保压</div><div class="info-val">{{ currentSelected.order.keepCondition }}</div></div>
                 </div>
                 <div v-else class="text-muted">未选择排程仪器</div>
                 <div class="alert alert-warning" style="margin-top:12px">请核对参数设置是否与工单一致</div>
                 <div class="info-grid" style="margin-top:12px">
                   <div class="info-item" style="grid-column: 1 / -1">
                     <div class="info-key">待测仪器列表</div>
                     <div class="info-val">
                      <div v-for="i in (currentSelected?.order.items || []).slice(1)" :key="i.id"style="display:flex;justify-content:space-between;gap:8px;font-size:12px;">
                        <span>{{ i.label }}</span>
                        <span style="color:var(--text-secondary)">{{ i.sn }}</span>
                      </div>  
                     </div>
                   </div>
                 </div>
               </div>
             </div>
           </div>
        </div>

        <!-- TESTING -->
        <div v-if="currentPanel === 'testing'" class="panel">
          <div class="ocr-bar">
            <div class="ocr-mini on">
              <div class="ocr-mini-title">🔴 上罐 · 250L容器（当前识别）</div>
              <div class="ocr-mini-row"><span class="ocr-mini-label">上部水温</span><span class="ocr-val temp">{{ state.chartData.t1[state.chartData.t1.length-1]?.toFixed(1) || '--.-' }} °C</span></div>
              <div class="ocr-mini-row"><span class="ocr-mini-label">下部水温</span><span class="ocr-val temp">{{ state.chartData.t2[state.chartData.t2.length-1]?.toFixed(2) || '--.-' }} °C</span></div>
              <div class="ocr-mini-row"><span class="ocr-mini-label">容器压力</span><span class="ocr-val press">{{ state.chartData.p[state.chartData.p.length-1]?.toFixed(3) || '--.--' }} MPa</span></div>
            </div>
            <div class="ocr-mini">
              <div class="ocr-mini-title">⚡ 系统状态</div>
              <div class="ocr-mini-row"><span class="ocr-mini-label">测试状态</span><span class="badge" :class="testRunning ? 'badge-green' : ''">{{ testRunning ? '● 测试中' : '● 已暂停' }}</span></div>
              <div class="ocr-mini-row"><span class="ocr-mini-label">已采集</span><span style="font-family:'JetBrains Mono'">{{ csvCount }} 条</span></div>
            </div>
          </div>

          <div class="testing-grid">
            <div class="card chart-fill">
              <div class="card-header">
                <div class="card-title">📈 实时监控曲线</div>

              </div>
              <div class="card-body">
                <div class="chart-container" ref="chartRef"></div>
              </div>
            </div>
            <div class="right-col">
              <div class="card">
                <div class="card-header">
                  <div class="card-title">📊 实时参数</div>
                  <span style="font-size:11px;color:var(--color-text-secondary)">测试中</span>
                </div>
                <div class="card-body" style="padding:10px 14px">
                  <div class="realtime-stats">
                    <div class="rt-stat"><div class="rt-stat-label">上部水温</div><div class="rt-stat-val temp">{{ state.chartData.t1[state.chartData.t1.length-1]?.toFixed(1) || '--.-' }}°C</div></div>
                    <div class="rt-stat"><div class="rt-stat-label">下部水温</div><div class="rt-stat-val temp">{{ state.chartData.t2[state.chartData.t2.length-1]?.toFixed(1) || '--.-' }}°C</div></div>
                    <div class="rt-stat" style="grid-column:span 2"><div class="rt-stat-label">容器压力</div><div class="rt-stat-val press">{{ state.chartData.p[state.chartData.p.length-1]?.toFixed(2) || '--.--' }} MPa</div></div>
                  </div>
                  <div class="divider"></div>
                  <div style="display:flex;justify-content:space-between">
                    <div><div class="info-key">已采集数据</div><div class="info-val">{{ csvCount }} 条</div></div>
                    <div><div class="info-key">采集状态</div><div class="info-val" style="color:var(--green-bright)">正常</div></div>
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="card-header"><div class="card-title">📋 当前工单</div></div>
                <div class="card-body" style="padding:10px 14px">
                  <div class="info-grid" style="grid-template-columns:1fr 1fr;gap:8px" v-if="currentSelected">
                    <div class="info-item"><div class="info-key">工单编号</div><div class="info-val" style="font-size:12px">{{ currentSelected.order.no }}</div></div>
                    <div class="info-item"><div class="info-key">器皿类型</div><div class="info-val">{{ currentSelected.order.vesselType }}</div></div>
                    <div class="info-item"><div class="info-key">目标温度</div><div class="info-val" style="color:var(--red-bright)">{{ currentSelected.order.targetTemp }}</div></div>
                    <div class="info-item"><div class="info-key">目标压力</div><div class="info-val" style="color:var(--cyan)">{{ currentSelected.order.targetPressure }}</div></div>
                    <div class="info-item"><div class="info-key">保温保压</div><div class="info-val">{{ currentSelected.order.keepCondition }}</div></div>
                    <div class="info-item"><div class="info-key">仪器</div><div class="info-val">{{ (currentSelected.order.items || []).map(i=>i.sn).join(' / ') }}</div></div>
                  </div>
                  <div v-else class="text-muted">未选择排程仪器</div>
                </div>
              </div>
            </div>
          </div>

          <div class="test-controls">
          <button class="test-btn pause" v-if="testRunning" @click="pauseTest">⏸ 测试暂停</button>
          <button class="test-btn pause" v-else @click="resumeTest">▶ 继续测试</button>
         <button class="test-btn stop" @click="showModal('stop-test')">⏹ 测试中止</button> 


            <!-- <button class="test-btn pause" @click="testRunning ? pauseTest() : resumeTest()">
              <Icon :icon="testRunning ? 'mdi:pause' : 'mdi:play'" />
              {{ testRunning ? '测试暂停' : '测试继续' }}
            </button>
            <button class="test-btn stop" @click="showModal('stop-test')">⏹ 测试中止</button> -->
            <button class="test-btn end" @click="showModal('end-test')">✅ 测试结束</button>
          </div>
        </div>

        <!-- REPORT -->
        <div v-if="currentPanel === 'report'" class="panel">
          <div class="card">
            <div class="card-header"><div class="card-title">📁 测试文件生成</div></div>
            <div class="card-body">
              <div class="file-gen-item">
                <div class="file-gen-icon">📊</div>
                <div class="file-gen-info"><div>高温高压监控数据.csv</div><div style="font-size:11px;color:gray">已生成</div></div>
              </div>
              <div class="file-gen-item">
                <div class="file-gen-icon">📄</div>
                <div class="file-gen-info"><div>高温高压测试报告.doc</div><div style="font-size:11px;color:gray">待生成</div></div>
              </div>
            </div>
          </div>
        </div>

      </div>

    <!-- MODALS -->
    <div class="modal-overlay" v-if="activeModal" @click.self="closeModal">
      <div class="startup-check-modal" v-if="activeModal === 'confirm-start'">
        <h2 class="modal-title">启动前确认</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div class="alert alert-warning">
              <div style="display:flex;gap:8px;align-items:flex-start">
                <Icon icon="mdi:alert" class="alert-icon" />
                <div class="alert-text">
                  <div style="font-weight:800;margin-bottom:6px">重要安全提示</div>
                  <ul style="padding-left:16px;font-size:12px;margin:4px 0">
                    <li>请确认测试台已完成运转前检查</li>
                    <li>确认仪器容器已正确安装</li>
                    <li>检查密封性确认无泄漏</li>
                    <li>确认分析仪器已正确连接</li>
                    <li>测试程序开始后，请勿随意停止</li>
                    <li>如遇紧急情况，立即按紧急停止按钮</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><div class="card-title">工单信息</div></div>
            <div class="card-body">
              <div v-if="currentSelected" class="info-grid">
                <div class="info-item"><div class="info-key">委托单号</div><div class="info-val">{{ currentSelected.order.entrustNo }}</div></div>
                <div class="info-item"><div class="info-key">工单编号</div><div class="info-val">{{ currentSelected.order.no }}</div></div>
                <div class="info-item"><div class="info-key">申请人</div><div class="info-val">{{ currentSelected.order.applicant }}</div></div>
                <div class="info-item"><div class="info-key">申请单位</div><div class="info-val">{{ currentSelected.order.applicantUnit }}</div></div>
                <div class="info-item"><div class="info-key">申请日期</div><div class="info-val">{{ currentSelected.order.applyDate }}</div></div>
                <div class="info-item"><div class="info-key">到检编号</div><div class="info-val">{{ currentSelected.order.receivingNo }}</div></div>
                <div class="info-item"><div class="info-key">器皿类型</div><div class="info-val">{{ currentSelected.order.vesselType }}</div></div>
                <div class="info-item"><div class="info-key">目标温度</div><div class="info-val" style="color:var(--red-bright)">{{ currentSelected.order.targetTemp }}</div></div>
                <div class="info-item"><div class="info-key">目标压力</div><div class="info-val" style="color:var(--cyan)">{{ currentSelected.order.targetPressure }}</div></div>
                <div class="info-item"><div class="info-key">保温保压</div><div class="info-val">{{ currentSelected.order.keepCondition }}</div></div>
                <div class="info-item" style="grid-column: 1 / -1">
                  <div class="info-key">待测仪器列表</div>
                  <div class="info-val">
                    <div v-for="i in (currentSelected.order.items || [])" :key="i.id" style="display:flex;justify-content:space-between;gap:8px;font-size:12px;">
                      <span>{{ i.label }}</span>
                      <span style="color:var(--text-secondary)">{{ i.sn }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="text-muted">未选择排程仪器</div>
            </div>
          </div>
        </div>
        <div class="modal-actions" style="margin-top:16px">
          <button class="cancel-btn" @click="closeModal">取消</button>
          <button class="next-btn" @click="confirmStart">确认启动</button>
        </div>
      </div>
      
      <div class="modal" v-if="activeModal === 'end-test'">
        <div class="modal-header">确定测试已完成？</div>
        <div class="modal-body">
          <p>系统将会停止数据记录并生成报告。</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeModal">取消</button>
          <button class="btn btn-success" style="background:#409eff;border:none" @click="endTest">确认</button>
        </div>
      </div>
      
      <div class="modal" v-if="activeModal === 'stop-test'">
        <div class="modal-header">确定要中止测试吗？</div>
        <div class="modal-body"><p class="text-danger">此操作不可恢复！所有数据将会丢失。</p></div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeModal">取消</button>
          <button class="btn btn-danger" @click="stopTest">确认中止</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Base Colors & Variables */
.high-temp-pressure-page {
  --blue: #2196f3;
  --blue-light: #bbdefb;
  --green: #4caf50;
  --green-bright: #2e7d32;
  --red: #f44336;
  --red-bright: #d32f2f;
  --orange: #ff9800;
  --cyan: #00bcd4;
  --gray-100: #f5f7fa;
  --gray-200: #e4e7eb;
  --gray-500: #9e9e9e;
  --text-primary: #2c3e50;
  --text-secondary: #7f8c8d;
  --radius: 8px;
  --navy: #1a2332;
  
  color: var(--text-primary);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.page-header .header-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  font-size: 1.25rem;
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.2), rgba(255, 152, 0, 0.12));
  color: var(--orange);
}

.header-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.header-subtitle {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
  margin-bottom: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.htp-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  background: #fff;
  border-radius: var(--radius);
  border: 1px solid var(--gray-200);
}

/* 顶部工具栏 */
.topbar {
  padding: 12px 16px;
  border-bottom: 1px solid var(--gray-200);
  background: var(--gray-100);

  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 标题 */
.topbar-title {
  font-weight: 600;
  font-size: 16px;
}

/* 步骤区域 */
.topbar-steps {
  display: flex;
  gap: 8px;
}

/* 单个步骤 */
.ts {
  font-size: 12px;
  padding: 4px 12px;

  border-radius: 12px;
  background: var(--gray-200);
  color: var(--gray-500);

  cursor: pointer;
}

/* 当前步骤 */
.ts.active {
  background: var(--blue);
  color: #fff;
}

/* 已完成步骤 */
.ts.done {
  background: rgba(76, 175, 80, 0.2);
  color: var(--green);
}

/* 内容区域 */
.content-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* 面板 */
.panel {
  height: 100%;
  /* padding: 16px; */

  overflow-y: auto;

  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.panel-header .header-icon {
  font-size: 16px;
  color: var(--color-text-secondary);
  background: none;
  width: auto;
  height: auto;
  border-radius: 0;
  display: inline-flex;
}

.sidebar .panel-header .header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  font-weight: 500;
}

/* Dashboard */

.schedule-wrap {
  display: flex;
  flex-direction: row;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden; /* 防止子元素撑开导致页面滚动 */
}

/* Sidebar Styles */
.sidebar {
  width: 320px;
  min-width: 320px; /* 防止被压缩 */
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

/* Search Box */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.search-icon {
  font-size: 18px;
  color: var(--color-text-tertiary, #94a3b8);
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--color-text-primary, #1e293b);
  outline: none;
}

.search-box input::placeholder {
  color: var(--color-text-tertiary, #94a3b8);
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: var(--color-error, #ef4444);
  color: white;
}

/* 待测试工单表格样式（贴合视觉检验的 OrderTable 风格） */
.count-badge {
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

.table-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-secondary);
}

.table-wrapper { flex: 1; overflow: auto; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }

.data-table thead { position: sticky; top: 0; z-index: 1; }

.data-table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.data-table tbody tr { transition: background-color 0.15s; cursor: pointer; user-select: none; }
.data-table tbody tr:hover { background: rgba(255, 255, 255, 0.02); }

.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

.cell-id { font-weight: 600; color: var(--color-accent-blue); }
.cell-type { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-applicant { color: var(--color-text-secondary); }
.cell-expand { cursor: pointer; color: var(--color-text-secondary); width: 48px; }

.status-tag { display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.status-pending { background: rgba(255, 193, 7, 0.12); color: #ffc107; }

.expanded-cell { background: var(--color-bg-primary); }
.instrument-list { display: flex; flex-direction: column; gap: 6px; }
.instrument-item { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; cursor: grab; }
.instrument-item:active { cursor: grabbing; }
.instrument-sn { color: var(--text-secondary); }

.order-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-bg-secondary);
}

.order-list::-webkit-scrollbar {
  width: 4px;
}

.order-list::-webkit-scrollbar-track {
  background: transparent;
}

.order-list::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 2px;
}

.order-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  cursor: grab;
  transition: all 0.2s;
  position: relative;
}

.order-card:hover {
  border-color: var(--color-accent-blue);
  background: var(--color-bg-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.order-card:has(.instrument-item:hover) {
  border-color: var(--color-border);
  background: var(--color-bg-primary);
  transform: none;
  box-shadow: none;
}

.instrument-item {
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.2s ease;
}
.instrument-item:hover {
  background: var(--color-bg-hover);
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}
.instrument-item.dragging {
  opacity: 0.6;
  background: rgba(88,166,255,0.10);
  border: 1px dashed var(--color-accent-blue);
}

.order-card:active {
  cursor: grabbing;
}

.order-card.dragging {
  opacity: 0.5;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.order-id {
  font-weight: 600;
  color: var(--color-accent-blue);
  font-size: 14px;
}

.order-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 193, 7, 0.1);
  color: #ffc107;
  font-weight: 500;
}

.order-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row {
  display: flex;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.info-row .label {
  width: 50px;
  margin-right: 4px;
  color: var(--color-text-tertiary);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
  font-size: 13px;
}

/* Main Content Styles */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  height: 100%;
  min-width: 0; /* 允许 flex item 缩小 */
}

.legend {
  display: flex;
  gap: 16px;
  margin-left: auto;
}

.legend-item {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.dot.pending { background: var(--color-border); }
.dot.occupied { background: var(--color-accent-blue); }

.calendar-grid {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  overflow: hidden;
}

.week-cal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.week-cal-label {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.week-cal-nav {
  padding: 5px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-primary);
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-primary);
  transition: all 0.2s;
}

.week-cal-nav:hover {
  background: var(--color-bg-hover);
}

.week-cal-date-input {
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 12px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  width: 130px;
}

.grid-header-row {
  display: grid;
  grid-template-columns: 60px repeat(7, 1fr);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.time-column-header {
  padding: 12px;
  text-align: center;
  border-right: 1px solid var(--color-border);
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.day-header {
  padding: 8px;
  text-align: center;
  border-right: 1px solid var(--color-border);
}

.day-header:last-child { border-right: none; }

.day-header.is-today {
  background: rgba(88, 166, 255, 0.1);
}

.day-num {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-accent-blue);
}

.day-num.is-weekend {
  color: #ef4444;
}

.day-name {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.grid-body {
  flex: 1;
  overflow-y: auto;
}

.grid-body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.grid-body::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 3px;
}

.grid-row {
  display: grid;
  grid-template-columns: 60px repeat(7, 1fr);
  border-bottom: 1px solid var(--color-border);
  min-height: 44px;
}

.grid-row.is-half {
  border-bottom: 1px dashed var(--color-border);
}

.time-label {
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  font-family: monospace;
}

.time-label.is-half {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.grid-cell {
  border-right: 1px solid var(--color-border);
  position: relative;
  transition: background 0.2s;
  background: var(--color-bg-primary);
  padding: 3px;
}

.grid-cell.is-weekend {
  background: rgba(0, 0, 0, 0.012);
}

.grid-cell.is-half-cell {
  border-top: 1px dashed rgba(0, 0, 0, 0.05);
}

.grid-cell:last-child { border-right: none; }

.grid-cell:hover:not(.is-past) {
  background: var(--color-bg-hover);
}

.grid-cell.is-past {
  background: repeating-linear-gradient(
    45deg,
    var(--color-bg-tertiary),
    var(--color-bg-tertiary) 10px,
    var(--color-bg-secondary) 10px,
    var(--color-bg-secondary) 20px
  );
  opacity: 0.7;
  cursor: not-allowed;
}

.grid-cell.drag-over {
  background: rgba(88, 166, 255, 0.1) !important;
  outline: 2px dashed var(--color-accent-blue);
  outline-offset: -2px;
}
.primary-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--color-primary, #3b82f6);
  color: white;
}

.primary-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.empty-slot-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  color: var(--color-text-tertiary);
  pointer-events: none;
  font-size: 20px;
}

.grid-cell:hover .empty-slot-hint {
  opacity: 0.5;
}

.scheduled-item {
  height: 100%;
  padding: 4px 6px;
  background: linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-cyan, #06b6d4));
  border-radius: 4px;
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
}

.scheduled-item:hover {
  transform: scale(1.02);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}

.scheduled-item.is-selected {
  outline: 2px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35);
  transform: scale(1.04);
  z-index: 2;
  position: relative;
}

.scheduled-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.device-name {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.scheduled-tag {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
  margin-top: 2px;
}

.remove-btn {
  background: none;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  opacity: 0.6;
  transition: all 0.2s;
}

.remove-btn:hover {
  color: #fff;
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
}

.control-center {
  padding: 16px;
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--color-border);
}

.control-center-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
  font-size: 14px;
}

.selected-order {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-accent-blue);
  font-weight: 600;
}

.selected-divider,
.selected-device {
  color: var(--color-text-secondary);
}

.selected-process {
  color: var(--color-accent-purple);
  white-space: nowrap;
  background: rgba(168, 85, 247, 0.1);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
}

.selected-placeholder {
  color: #94a3b8;
  font-style: italic;
}

/* Cards */
.card { background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius); overflow: hidden; }
.card-header { padding: 12px 16px; background: var(--color-bg-tertiary); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
.card-title { font-weight: 600; font-size: 14px; }
.card-body { padding: 16px; }

/* Startup Check Modal (match water-cycle) */
.startup-check-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 16px;
  backdrop-filter: blur(4px);
}

.startup-check-modal {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border-radius: 16px;
  padding: 32px;
  max-width: 700px;
  width: 100%;
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
  animation: startupCheckIn 0.3s ease-out;
}

@keyframes startupCheckIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.startup-check-modal .modal-title {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 24px;
  color: var(--color-text-primary);
}

.startup-check-modal .check-list-container {
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid var(--color-border);
}

.startup-check-modal .check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.startup-check-modal .check-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  cursor: pointer;
  padding: 10px;
  border-radius: 8px;
  transition: background 0.2s;
}

.startup-check-modal .check-item:hover {
  background: var(--color-bg-primary);
}

.startup-check-modal .checkbox-wrapper {
  position: relative;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.startup-check-modal .checkbox-wrapper input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.startup-check-modal .custom-checkbox {
  width: 100%;
  height: 100%;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  background: var(--color-bg-primary);
}

.startup-check-modal .check-item.is-checked .custom-checkbox {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
  color: white;
}

.startup-check-modal .check-text {
  font-size: 15px;
  line-height: 1.5;
  color: var(--color-text-primary);
}

.startup-check-modal .modal-actions {
  display: flex;
  gap: 16px;
}

.startup-check-modal .cancel-btn,
.startup-check-modal .next-btn {
  flex: 1;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.2s;
  cursor: pointer;
}

.startup-check-modal .cancel-btn {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.startup-check-modal .cancel-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.startup-check-modal .next-btn {
  background: var(--color-accent-blue);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.2);
}

.startup-check-modal .next-btn:hover:not(:disabled) {
  background: var(--color-accent-blue-hover, #409eff);
  transform: translateY(-1px);
}

.startup-check-modal .next-btn:disabled {
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
  cursor: not-allowed;
  box-shadow: none;
}
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.wo-detail-box { background: var(--navy); color: #fff; padding: 20px; border-radius: var(--radius); }
.ocr-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.ocr-mini { background: var(--navy); color: #fff; padding: 12px; border-radius: var(--radius); }
.ocr-mini.on { border: 1px solid rgba(244,67,54,0.5); }
.ocr-mini-title { font-size: 11px; opacity: 0.5; margin-bottom: 8px; }
.ocr-mini-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
.ocr-val { font-family: monospace; font-weight: 700; font-size: 16px; }
.ocr-val.temp { color: var(--red); }
.ocr-val.press { color: var(--cyan); }
.testing-grid { display: grid; grid-template-columns: 1fr 260px; gap: 12px; flex: 1; min-height: 0; }
.chart-fill { display: flex; flex-direction: column; }
.chart-fill .card-body { flex: 1; padding: 6px; min-height: 0; display: flex; position: relative; }
.chart-container { width: 100%; flex: 1; min-height: 260px; }

/* Align testing UI styles with Vibration page */
.card { background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.card-header { padding: 12px 16px; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; }
.card-title { font-size: 13px; font-weight: 600; margin: 0; color: var(--color-text-primary); }
.chart-legend { font-size: 11px; display: flex; gap: 10px; }
.cyan { color: var(--color-accent-cyan, #06b6d4); }
.amber { color: var(--color-accent-amber, #f59e0b); }
.red { color: #ef4444; }
.chart-body { flex: 1; padding: 6px; min-height: 0; position: relative; }
.right-col { display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.card-body { padding: 10px 14px; }
.text-muted { font-size: 12px; color: var(--color-text-secondary); }
.badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:500; background: var(--color-bg-tertiary); color: var(--color-text-secondary); }
.badge-green { background: rgba(46,125,50,0.15); color: #34d399; }

/* Status bar styling to match vibration */
.ocr-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.ocr-mini { background: #1a2d42; border-radius: 6px; padding: 10px 14px; border: 1px solid rgba(255,255,255,0.07); }
.ocr-mini-title { font-size: 10px; color: rgba(255,255,255,0.4); margin-bottom: 6px; font-weight: 600; }
.ocr-mini-row { display: flex; justify-content: space-between; align-items: baseline; }
.ocr-mini-label { font-size: 10px; color: rgba(255,255,255,0.45); }
.ocr-val { font-family: monospace; font-weight: 700; }
.ocr-val.temp { color: var(--red); font-size: 16px; }
.ocr-val.press { color: var(--cyan); font-size: 16px; }.chart-container { width: 100%; height: 100%; min-height: 200px; }
.test-controls { display: flex; gap: 10px; padding: 10px 0; margin-top: auto; }
.test-btn {
  flex: 1;
  border: none;
  border-radius: 6px;
  padding: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  color: white;
}
.test-btn.pause { background: #f59e0b; }
.test-btn.pause:hover { background: #d97706; }
.test-btn.stop { background: #ef4444; }
.test-btn.stop:hover { background: #dc2626; }
.test-btn.end { background: #10b981; }
.test-btn.end:hover { background: #059669; }

/* Common Buttons */
.btn { padding: 6px 12px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-size: 13px; transition: all 0.2s; }
.btn-primary { background: var(--color-accent-blue); color: #fff; }
.btn-outline { border-color: var(--gray-500); background: transparent; color: var(--color-text-primary); }
.btn-success { background: var(--green); color: #fff; }
.btn-danger { background: var(--red); color: #fff; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-lg { padding: 10px 20px; font-size: 15px; }
.btn-sm { padding: 4px 8px; font-size: 12px; }

/* Modals */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 12px; width: 400px; max-width: 90vw; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
.modal-header { padding: 16px; background: var(--color-bg-tertiary); font-weight: 600; border-bottom: 1px solid var(--color-border); }
.modal-body { padding: 20px; }
.modal-footer { padding: 12px 16px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; }
.alert { padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; }
.alert-warning { background: rgba(255,152,0,0.1); color: var(--orange); }
.alert-icon { font-size: 16px; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.info-key { font-size: 11px; color: var(--color-text-secondary); }
.info-val { font-weight: 500; }
.text-danger { color: var(--red); }
/* Vibration-page typography alignment for testing panel */
.realtime-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rt-stat { background: var(--color-bg-tertiary); border-radius: 6px; padding: 9px; border: 1px solid var(--color-border); }
.rt-stat .rt-stat-label { font-size: 10px; color: var(--color-text-secondary); }
.rt-stat .rt-stat-val { font-size: 16px; font-weight: 700; font-family: monospace; }
.rt-stat .rt-stat-val.temp { color: var(--red); }
.rt-stat .rt-stat-val.press { color: var(--cyan); }

.info-key { font-size: 11px; color: var(--color-text-secondary); }
.info-val { font-weight: 500; }
</style>
