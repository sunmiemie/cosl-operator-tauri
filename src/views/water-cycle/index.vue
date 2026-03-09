<script setup lang="ts">
import { computed, onMounted, ref, onUnmounted, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import * as echarts from 'echarts'

// ============ 常量定义 ============
const DATA_CHANNELS = [
  { id: 'pressure', name: '压力', unit: 'MPa' },
  { id: 'flow', name: '流量', unit: 'L/min' },
  { id: 'temp', name: '温度', unit: '℃' }
]

// ============ 状态定义 ============
const userName = ref('Operator') 
const currentView = ref('dashboard') // dashboard: 图一, testing: 图二
const selectedOrder = ref<any>(null)
const searchKeyword = ref('')
const draggedOrder = ref<any>(null)
const scheduledOrders = ref<Record<string, string[]>>({}) // Changed to string[] to support multiple orders
const loginTime = ref(Date.now())
const selectedScheduledOrderIds = ref<string[]>([]) // Changed to array for multiple selection

// 选中的通道
const selectedChannels = ref<Record<string, boolean>>(
  DATA_CHANNELS.reduce((acc, channel) => ({ ...acc, [channel.id]: true }), {})
)

// 工单数据 (Aligned with Vibration example)
const workOrders = ref([
  { id: 'WO001', taskNumber: '2025521', operator: userName.value, applicant: 'user1', deviceName: '导向短节', flowProcess: '小循环', status: 'pending', priority: '普通', type: '功能测试' },
  { id: 'WO002', taskNumber: '2025522', operator: userName.value, applicant: 'user2', deviceName: '传感器组件', flowProcess: '877米', status: 'pending', priority: '紧急', type: '耐压测试' },
  { id: 'WO003', taskNumber: '2025523', operator: userName.value, applicant: 'user3', deviceName: '压力控制阀', flowProcess: '水平钻机', status: 'pending', priority: '普通', type: '密封性测试' },
  { id: 'WO004', taskNumber: '2025524', operator: userName.value, applicant: 'user4', deviceName: '压力控制阀', flowProcess: '导向调节', status: 'pending', priority: '普通', type: '功能测试' },
  { id: 'WO005', taskNumber: '2025525', operator: userName.value, applicant: 'user5', deviceName: '导向短节', flowProcess: '小循环', status: 'pending', priority: '紧急', type: '耐温测试' },
])

const calBase = ref(new Date())

// 日历辅助函数
function getMonday(d: Date) {
  const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff); dt.setHours(0, 0, 0, 0); return dt
}
function addDays(d: Date, days: number) { const result = new Date(d); result.setDate(result.getDate() + days); return result }
function fmtDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

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
      isPast: dObj < today,
    })
  }
  return days
})
const weekLabel = computed(() => {
  const start = currentWeekDays.value[0]; const end = currentWeekDays.value[6]
  // return `${start.month}月${start.dayNum}日 ～ ${end.month}月${end.dayNum}日`
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

function prevWeek() { calBase.value = addDays(calBase.value, -7) }
function nextWeek() { calBase.value = addDays(calBase.value, 7) }
function gotoDate(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (val) calBase.value = getMonday(new Date(val))
}
function loadPresetSchedule() {
  // 模拟读取排程
  alert('已读取最新排程数据')
}

// 业务逻辑
const unscheduledOrders = computed(() => {
  const scheduledList = Object.values(scheduledOrders.value).flat()
  const scheduled = new Set(scheduledList)
  return workOrders.value.filter(order => !scheduled.has(order.id) && (searchKeyword.value === '' || order.taskNumber.includes(searchKeyword.value)))
})

const getOrderById = (id: string) => workOrders.value.find(o => o.id === id)

const selectedScheduledOrders = computed(() => {
  return selectedScheduledOrderIds.value
    .map(id => getOrderById(id))
    .filter(Boolean) as any[]
})

const handleDragStart = (e: DragEvent, order: any) => {
  draggedOrder.value = order
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', order.id)
  }
  const target = e.target as HTMLElement
  setTimeout(() => { target.style.opacity = '0.5' }, 0)
}

const handleDragEnd = (e: DragEvent) => {
  const target = e.target as HTMLElement
  target.style.opacity = '1'
  draggedOrder.value = null
}

const handleDragOver = (e: DragEvent, isPast: boolean) => {
  if (isPast) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  ;(e.currentTarget as HTMLElement | null)?.classList.add('drag-over')
}

const handleDragEnter = (e: DragEvent) => {
  ;(e.currentTarget as HTMLElement | null)?.classList.add('drag-over')
}

const handleDragLeave = (e: DragEvent) => {
  ;(e.currentTarget as HTMLElement | null)?.classList.remove('drag-over')
}

const handleDrop = (e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) => {
  if (isPast) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement | null)?.classList.remove('drag-over')

  const orderId = e.dataTransfer?.getData('text/plain')
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
  selectedScheduledOrderIds.value = arr.includes(orderId)
    ? arr.filter(id => id !== orderId)
    : [...arr, orderId]
}

// 弹窗与跳转逻辑
const showStartupCheck = ref(false)
const checkItems = ref([
  { id: 1, text: '电源电压、环境温度及相对湿度符合使用条件', checked: false },
  { id: 2, text: '温箱箱体、控制箱、冷却系统电源连接安全可靠', checked: false },
  { id: 3, text: '确保"急停"按键复位', checked: false },
  { id: 4, text: '箱体上开门液压系统工作正常', checked: false },
  { id: 5, text: '外壳接地线连接可靠', checked: false }
])
const allChecked = computed(() => checkItems.value.every(item => item.checked))

function toggleCheck(id: number) {
  const item = checkItems.value.find(i => i.id === id)
  if (item) item.checked = !item.checked
}

const handleStartScheduledTest = () => {
  if (selectedScheduledOrders.value.length > 0) {
    selectedOrder.value = selectedScheduledOrders.value[0]
    checkItems.value.forEach(item => (item.checked = false))
    showStartupCheck.value = true
  }
}

const handleStartupCheckComplete = () => {
  showStartupCheck.value = false
  currentView.value = 'testing' // 跳转到监控界面
}

const returnToDashboard = () => {
  showStartupCheck.value = false
  currentView.value = 'dashboard'
}

// 集成“模拟井测试端”：数据采集视图逻辑
const COLLECTION_CHANNELS = [
  { id: 'p1', name: '压力1', unit: 'MPa', color: '#ef4444' },
  { id: 'p2', name: '压力2', unit: 'MPa', color: '#f97316' },
  { id: 'p3', name: '压力3', unit: 'MPa', color: '#f59e0b' },
  { id: 'p4', name: '压力4', unit: 'MPa', color: '#84cc16' },
  { id: 'p5', name: '压力5', unit: 'MPa', color: '#10b981' },
  { id: 'p6', name: '压力6', unit: 'MPa', color: '#06b6d4' },
  { id: 'f1', name: '流量1', unit: 'L/min', color: '#3b82f6' },
  { id: 'f2', name: '流量2', unit: 'L/min', color: '#6366f1' },
  { id: 'f3', name: '流量3', unit: 'L/min', color: '#8b5cf6' },
  { id: 'freq', name: '变频器频率', unit: 'Hz', color: '#d946ef' },
]
const realTimeData = ref<Record<string, number>>({})
const collectionTime = ref(0)
const logs = ref<{ time: string; msg: string }[]>([])
let dataTimer: any = null
const activeCollectionChannels = ref<Record<string, boolean>>(
  COLLECTION_CHANNELS.reduce((acc, c) => ({ ...acc, [c.id]: true }), {})
)

const chartRef = ref<HTMLDivElement | null>(null)
let chartInst: any = null
const MAX_POINTS = 120
const chartBuffers: Record<string, number[]> = {}
const xLabels: string[] = []
const isPaused = ref(false)

function initChart() {
  if (!chartRef.value) return
  chartInst = echarts.init(chartRef.value)
  const series = COLLECTION_CHANNELS.map(c => ({
    name: c.name,
    type: 'line',
    showSymbol: false,
    smooth: true,
    lineStyle: { width: 2, color: c.color },
    data: [],
  }))
  chartInst.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: COLLECTION_CHANNELS.map(c => c.name) },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: [] },
    yAxis: { type: 'value' },
    series,
  })
}

function updateChart() {
  if (!chartInst) return
  const series = COLLECTION_CHANNELS.filter(c => activeCollectionChannels.value[c.id]).map(c => ({
    name: c.name,
    type: 'line',
    showSymbol: false,
    smooth: true,
    lineStyle: { width: 2, color: c.color },
    data: chartBuffers[c.id] || [],
  }))
  chartInst.setOption({ xAxis: { data: xLabels }, series })
}

function tick() {
  collectionTime.value += 1
  const label = new Date().toLocaleTimeString()
  xLabels.push(label)
  if (xLabels.length > MAX_POINTS) xLabels.shift()
  COLLECTION_CHANNELS.forEach(c => {
    const base = c.id.startsWith('p') ? 5 : c.id.startsWith('f') ? 10 : 30
    const val = +(base + Math.random() * 5).toFixed(2)
    realTimeData.value[c.id] = val
    chartBuffers[c.id] = chartBuffers[c.id] || []
    chartBuffers[c.id].push(val)
    if (chartBuffers[c.id].length > MAX_POINTS) chartBuffers[c.id].shift()
  })
  if (collectionTime.value % 10 === 0) logs.value.push({ time: new Date().toLocaleTimeString(), msg: '采集心跳' })
  updateChart()
}

function startDataSimulation() {
  logs.value = [
    { time: new Date().toLocaleTimeString(), msg: '系统运行稳定' },
    { time: new Date().toLocaleTimeString(), msg: '开始数据采集' },
  ]
  collectionTime.value = 0
  xLabels.length = 0
  Object.keys(chartBuffers).forEach(k => (chartBuffers[k] = []))
  dataTimer = setInterval(tick, 1000)
  isPaused.value = false
}

function stopDataSimulation() {
  if (dataTimer) { clearInterval(dataTimer); dataTimer = null }
}

function pauseDataSimulation() {
  if (dataTimer) { clearInterval(dataTimer); dataTimer = null }
  isPaused.value = true
  logs.value.push({ time: new Date().toLocaleTimeString(), msg: '暂停采集' })
}

function resumeDataSimulation() {
  if (!isPaused.value) return
  dataTimer = setInterval(tick, 1000)
  isPaused.value = false
  logs.value.push({ time: new Date().toLocaleTimeString(), msg: '继续采集' })
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  const rs = s % 60
  return `${String(m).padStart(2, '0')}:${String(rs).padStart(2, '0')}`
}

function handleConfirmSync() {
  currentView.value = 'data_collection'
  nextTick(() => { initChart(); startDataSimulation() })
}

function handleFinishTest() {
  stopDataSimulation()
  currentView.value = 'dashboard'
}

onUnmounted(() => {
  stopDataSimulation()
  if (chartInst) { chartInst.dispose(); chartInst = null }
})
</script>

<template>
  <div class="water-cycle-page">
    <template v-if="currentView === 'dashboard'">
      <div class="page-header">
        <div class="header-left">
          <div class="header-icon"><Icon icon="mdi:water-sync" /></div>
          <div>
            <h1 class="header-title">水循环</h1>
            <p class="header-subtitle">水循环测试系统</p>
          </div>
        </div>
        <div class="header-right"></div>
      </div>

      <div class="layout-container">
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
            <input v-model="searchKeyword" type="text" placeholder="搜索工单号/申请人/设备/类型" />
            <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''"><Icon icon="mdi:close" /></button>
          </div>
          <div class="table-content">
            <div v-if="unscheduledOrders.length === 0" class="empty-state"><p>无待排程工单</p></div>
            <div v-else class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>工单号</th>
                    <th>设备</th>
                    <th>申请人</th>
                    <th>类型</th>
                    <th>优先级</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="order in unscheduledOrders" :key="order.id" draggable="true" @dragstart="handleDragStart($event, order)" @dragend="handleDragEnd">
                    <td class="cell-id">{{ order.taskNumber }}</td>
                    <td class="cell-device" :title="order.deviceName">{{ order.deviceName }}</td>
                    <td class="cell-applicant">{{ order.applicant }}</td>
                    <td class="cell-type">{{ order.type }}</td>
                    <td>
                      <span class="priority-tag" :class="order.priority === '紧急' ? 'urgent' : 'normal'">{{ order.priority }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="main-content">
          <div class="panel-header">
            <div class="week-cal-toolbar">
              <button class="week-cal-nav" @click="prevWeek">‹ 上一周</button>
              <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="gotoDate" title="跳转到指定日期所在周" />
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
              <div v-for="day in currentWeekDays" :key="day.dateStr" class="day-header" :class="{ 'is-today': day.isToday }">
                <div class="day-num" :class="{ 'is-weekend': day.isWeekend }">{{ day.month }}/{{ day.dayNum }}</div>
                <div class="day-name">周{{ day.dayName.replace('周', '') }}</div>
              </div>
            </div>
            <div class="grid-body">
              <div v-for="slot in timeSlots" :key="slot.key" class="grid-row" :class="{ 'is-half': slot.isHalf }">
                <div class="time-label" :class="{ 'is-half': slot.isHalf }">{{ slot.label }}</div>
                <div v-for="day in currentWeekDays" :key="getCellKey(day.dateStr, slot.key)" class="grid-cell" :class="{ 'is-weekend': day.isWeekend, 'is-half-cell': slot.isHalf, 'is-past': day.isPast }" @dragover="handleDragOver($event, day.isPast)" @dragenter="handleDragEnter" @dragleave="handleDragLeave" @drop="handleDrop($event, day.dateStr, slot.key, day.isPast)">
                  <div v-if="scheduledOrders[getCellKey(day.dateStr, slot.key)]?.length" style="display:flex;flex-direction:column;gap:4px;width:100%">
                    <div v-for="oid in scheduledOrders[getCellKey(day.dateStr, slot.key)]" 
                         :key="oid"
                         class="scheduled-item" 
                         :class="{ 'is-selected': selectedScheduledOrderIds.includes(oid) }"
                         @click="selectScheduledOrder(oid)">
                      <div class="scheduled-content">
                        <span class="device-name">{{ getOrderById(oid)?.taskNumber }}</span>
                        <button class="remove-btn" @click.stop="handleUnschedule(getCellKey(day.dateStr, slot.key), oid)"><Icon icon="mdi:close" /></button>
                      </div>
                      <div class="scheduled-tag">
                        {{ getOrderById(oid)?.deviceName }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="empty-slot-hint"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="control-center">
            <div class="control-center-left">
              <template v-if="selectedScheduledOrders.length">
                <div class="selected-order">
                  <Icon icon="mdi:check" class="selected-icon" />
                  <span class="selected-label">已选: {{ selectedScheduledOrders[0].taskNumber }} <span v-if="selectedScheduledOrders.length > 1">等 {{ selectedScheduledOrders.length }} 个</span></span>
                </div>
                <span class="selected-divider">|</span>
                <span class="selected-device">{{ selectedScheduledOrders[0].deviceName }}</span>
              </template>
              <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
            </div>
            <button class="primary-btn" :disabled="selectedScheduledOrders.length === 0" @click="handleStartScheduledTest">
              <Icon icon="mdi:play" class="start-icon" /> 开始实验
            </button>
          </div>
        </div>
      </div>

      <div v-if="showStartupCheck" class="modal-overlay">
        <div class="startup-check-modal">
          <h2 class="modal-title">开机检查</h2>
          <div class="check-list-container">
            <div class="check-list">
              <label v-for="item in checkItems" :key="item.id" class="check-item" :class="{ 'is-checked': item.checked }">
                <div class="checkbox-wrapper">
                  <input type="checkbox" :checked="item.checked" @change="toggleCheck(item.id)" />
                  <div class="custom-checkbox">
                    <Icon v-if="item.checked" icon="mdi:check" />
                  </div>
                </div>
                <span class="check-text">{{ item.text }}</span>
              </label>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="returnToDashboard">取消</button>
            <button class="next-btn" :disabled="!allChecked" @click="handleStartupCheckComplete">下一步</button>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="currentView === 'testing'">
      <div class="monitor-container">
        <div class="monitor-header-params">
          <div class="param-group">
            <span class="p-label">任务单号</span>
            <span class="p-value highlight">{{ selectedOrder?.taskNumber }}</span>
          </div>
          <div class="param-group">
            <span class="p-label">测试设备</span>
            <span class="p-value">{{ selectedOrder?.deviceName }}</span>
          </div>
          <div class="param-group">
            <span class="p-label">流程长度</span>
            <span class="p-value purple-text">{{ selectedOrder?.flowProcess }}</span>
          </div>
          <div class="param-group status-info">
            <span class="p-label">当前状态</span>
            <div class="status-badge"><span class="pulse-dot"></span> 监控中</div>
          </div>
        </div>

        <div class="monitor-main">
          <div class="video-main-section">
            <div class="video-card">
              <div class="video-card-header">
                <Icon icon="mdi:camera-outline" /> <span>主监控画面采集</span>
                <div class="rec-indicator">● REC</div>
              </div>
              <div class="video-viewport">
                <Icon icon="mdi:video-vintage" class="watermark-icon" />
                <div class="viewport-overlay">Camera_Channel_01 - Live</div>
              </div>
              <div class="video-footer-info">
                提示：当前正在进行实时图像采集，请确保测试区域无无关人员走动。
              </div>
            </div>
          </div>

          <div class="monitor-sidebar">
            <div class="video-card mini">
              <div class="video-card-header">辅助预览</div>
              <div class="video-viewport small">
                <Icon icon="mdi:camera-iris" />
              </div>
            </div>

            <div class="status-panel">
              <h3 class="panel-sub-title">采集参数</h3>
              <div class="status-row"><span>分辨率</span><span>1920×1080</span></div>
              <div class="status-row"><span>帧率</span><span>30 FPS</span></div>
              <div class="status-row"><span>存储剩余</span><span>420 GB</span></div>
            </div>

            <div class="action-panel">
              <button class="icon-action-btn"><Icon icon="mdi:camera" /> 抓拍</button>
              <button class="icon-action-btn"><Icon icon="mdi:record-circle-outline" /> 录制</button>
              <button class="icon-action-btn"><Icon icon="mdi:cog" /> 配置</button>
            </div>
          </div>
        </div>

        <div class="monitor-footer">
          <button class="btn-outline" @click="returnToDashboard">返回排程</button>
          <button class="btn-solid-primary" @click="handleConfirmSync">
            <Icon icon="mdi:database-export" /> 确认并同步采集数据
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="currentView === 'data_collection'">
      <div class="collection-container">
        <div class="collection-header-row">
          <div class="stat-item">任务单号：<span class="val">{{ selectedOrder?.taskNumber }}</span></div>
          <div class="stat-item">测试设备：<span class="val">{{ selectedOrder?.deviceName }}</span></div>
          <div class="stat-item">流程长度：<span class="val purple">{{ selectedOrder?.flowProcess }}</span></div>
          <div class="stat-item">已用时长：<span class="val cyan">{{ formatDuration(collectionTime) }}</span></div>
          <div class="stat-item">数据采集：<span class="val green"><span class="pulse-dot"></span> {{ isPaused ? '已暂停' : '进行中' }}</span></div>
        </div>

        <div class="channel-selector-card">
          <div class="card-label">通道选择</div>
          <div class="channel-grid">
            <label v-for="c in COLLECTION_CHANNELS" :key="c.id" class="channel-checkbox">
              <input type="checkbox" v-model="activeCollectionChannels[c.id]" />
              <span class="box" :style="{ borderColor: c.color, backgroundColor: activeCollectionChannels[c.id] ? c.color : 'transparent' }">
                <Icon icon="mdi:check" v-if="activeCollectionChannels[c.id]" />
              </span>
              <span class="name">{{ c.name }}</span>
            </label>
          </div>
        </div>

        <div class="collection-main">
          <div class="chart-section">
            <div class="card-label">实时数据曲线</div>
            <div class="chart-container" ref="chartRef"></div>
          </div>
          <div class="log-section">
            <div class="card-label">操作日志 ({{ logs.length }})</div>
            <div class="log-list">
              <div v-for="(log, i) in logs" :key="i" class="log-item">
                <span class="time">{{ log.time }}</span>
                <span class="msg">{{ log.msg }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="data-grid">
          <div v-for="c in COLLECTION_CHANNELS" :key="c.id" v-show="activeCollectionChannels[c.id]" class="data-card">
            <div class="d-name">{{ c.name }}</div>
            <div class="d-value" :style="{ color: c.color }">
              {{ realTimeData[c.id] || '0.00' }} <span class="unit">{{ c.unit }}</span>
            </div>
          </div>
        </div>

        <div class="collection-footer">
          <button class="btn-pause" @click="isPaused ? resumeDataSimulation() : pauseDataSimulation()">
            <Icon :icon="isPaused ? 'mdi:play' : 'mdi:pause'" /> {{ isPaused ? '继续采集' : '暂停采集' }}
          </button>
          <button class="btn-stop" @click="handleFinishTest">结束测试</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.water-cycle-page {
  height: 100%;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  overflow: hidden;
  /* padding: 16px; */
  display: flex;
  flex-direction: column;
  gap: 16px;
  
  /* --color-bg-primary: #f8fafc;
  --color-bg-secondary: #ffffff;
  --color-bg-tertiary: #f1f5f9;
  --color-border: #e2e8f0;
  --color-text-primary: #1e293b;
  --color-text-secondary: #64748b;
  --color-text-tertiary: #94a3b8;
  --color-accent-blue: #3b82f6;
  --color-accent-cyan: #06b6d4;
  --color-accent-amber: #f59e0b;
  --color-bg-hover: #f1f5f9;
  --color-error: #ef4444; */
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
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(147, 51, 234, 0.15));
  color: rgba(168, 85, 247, 1);
}

.header-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.header-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
  margin-bottom: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.layout-container {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 16px;
  overflow: hidden;
}

.sidebar {
  width: 320px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
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
}

.sidebar .panel-header .header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  font-weight: 500;
}

.count-badge {
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

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
  background: var(--color-error);
  color: #fff;
}

.table-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-secondary);
}

.table-wrapper {
  flex: 1;
  overflow: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.data-table tbody tr {
  transition: background-color 0.15s;
}

.data-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

.cell-id {
  font-weight: 600;
  color: var(--color-accent-blue);
}

.cell-device {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.cell-applicant, .cell-type {
  color: var(--color-text-secondary);
}

.priority-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.priority-tag.normal {
  background: rgba(59, 130, 246, 0.12);
  color: var(--color-accent-blue);
}

.priority-tag.urgent {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
  font-size: 13px;
}

.week-cal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.week-cal-label {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  text-align: center;
  white-space: nowrap;
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

.grid-row {
  display: grid;
  grid-template-columns: 60px repeat(7, 1fr);
  border-bottom: 1px solid var(--color-border);
  min-height: 44px;
}

.grid-row.is-half {
   min-height: 44px;
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

.time-label.is-half { font-size: 11px; color: var(--color-text-secondary); }

.grid-cell {
  border-right: 1px solid var(--color-border);
  position: relative;
  transition: background 0.2s;
  background: var(--color-bg-primary);
  padding: 3px;
}

.grid-cell.is-weekend { background: rgba(0, 0, 0, 0.012); }
.grid-cell.is-half-cell { border-top: 1px dashed rgba(0,0,0,0.05); }
.grid-cell:hover:not(.is-past) { background: var(--color-bg-hover); }
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
.grid-cell.drag-over { background: rgba(88, 166, 255, 0.1) !important; outline: 2px dashed var(--color-accent-blue); outline-offset: -2px; }

.scheduled-item {
  height: 100%;
  padding: 4px 6px;
  background: linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-cyan));
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
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  padding: 0;
  border-radius: 4px;
  opacity: 0.8;
  transition: all 0.2s;
  display: flex;
}

.remove-btn:hover {
  color: #fff;
  opacity: 1;
}

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

.control-center {
  padding: 16px;
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
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

.selected-icon { font-size: 18px; }

.selected-divider { color: var(--color-border); }

.selected-device {
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.selected-placeholder {
  color: #94a3b8;
  font-style: italic;
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
  background: var(--color-primary);
  color: white;
}

.primary-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.start-icon { font-size: 20px; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
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
  animation: slideIn 0.3s ease-out;
  position: relative;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.modal-title {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 24px;
  color: var(--color-text-primary);
}

.check-list-container {
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid var(--color-border);
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.check-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  cursor: pointer;
  padding: 10px;
  border-radius: 8px;
  transition: background 0.2s;
}

.check-item:hover { background: var(--color-bg-primary); }

.checkbox-wrapper {
  position: relative;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.checkbox-wrapper input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.custom-checkbox {
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

.check-item.is-checked .custom-checkbox {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
  color: white;
}

.check-text { font-size: 15px; line-height: 1.5; color: var(--color-text-primary); }

.modal-actions { display: flex; gap: 16px; }

.cancel-btn,
.next-btn {
  flex: 1;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.2s;
  cursor: pointer;
}

.cancel-btn {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.cancel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cancel-btn:hover:not(:disabled) {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  transform: scale(1.02);
}

.next-btn {
  background: var(--color-accent-blue);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.2);
}

.next-btn:hover:not(:disabled) {
  background: var(--color-accent-blue-hover, #409eff);
  transform: scale(1.02);
}

.next-btn:disabled {
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
  cursor: not-allowed;
  box-shadow: none;
}

/* Monitor/Testing View Styles */
.monitor-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
}

.monitor-header-params {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  padding: 20px 30px;
  border-radius: 12px;
  display: flex;
  gap: 50px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.param-group { display: flex; flex-direction: column; gap: 6px; }
.p-label { font-size: 12px; color: var(--color-text-secondary); }
.p-value { font-size: 18px; font-weight: 700; color: var(--color-text-primary); }
.p-value.highlight { color: var(--color-accent-blue); }
.purple-text { color: #8b5cf6; }

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f0fdf4;
  color: #16a34a;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid #dcfce7;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }

.monitor-main {
  flex: 1;
  display: flex;
  gap: 20px;
  min-height: 0;
}

.video-main-section { flex: 3; }
.monitor-sidebar { flex: 1; display: flex; flex-direction: column; gap: 20px; }

.video-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.video-card-header {
  padding: 12px 18px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-primary);
}

.rec-indicator { margin-left: auto; color: #ef4444; font-size: 12px; font-weight: bold; }

.video-viewport {
  flex: 1;
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  color: #334155;
}

.video-viewport.small { height: 180px; flex: none; background: #1e293b; }

.watermark-icon { font-size: 80px; opacity: 0.2; }
.viewport-overlay { position: absolute; bottom: 10px; left: 15px; color: white; font-size: 12px; background: rgba(0,0,0,0.5); padding: 2px 8px; border-radius: 4px; }

.video-footer-info { padding: 12px; font-size: 13px; color: var(--color-text-secondary); background: var(--color-bg-tertiary); }

.status-panel {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 15px;
}

.panel-sub-title { font-size: 14px; margin-bottom: 15px; color: var(--color-text-secondary); }

.status-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--color-border);
  color: var(--color-text-primary);
}

.action-panel {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.icon-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  color: var(--color-text-primary);
}

.icon-action-btn:hover { background: var(--color-bg-hover); border-color: var(--color-primary); color: var(--color-primary); }

.monitor-footer {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 10px 0;
}

.btn-outline { border: 1px solid var(--color-border); background: var(--color-bg-secondary); padding: 12px 30px; border-radius: 8px; cursor: pointer; color: var(--color-text-primary); }
.btn-outline:hover { background: var(--color-bg-hover); }

.btn-solid-primary { 
  background: var(--color-primary); 
  color: white; 
  border: none; 
  padding: 12px 40px; 
  border-radius: 8px; 
  font-weight: 600; 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}
.btn-solid-primary:hover { opacity: 0.9; }

/* 集成：数据采集视图样式 */
.collection-container { display:flex; flex-direction:column; gap:16px; height:100%; }
.collection-header-row { display:flex; gap:20px; background: var(--color-bg-secondary); padding: 16px 24px; border-radius: 12px; border:1px solid var(--color-border); }
.stat-item { font-size: 14px; color: var(--color-text-secondary); font-weight: 500; }
.stat-item .val { color: var(--color-text-primary); font-weight: 700; margin-left: 6px; }
.val.purple { color: #8b5cf6; } .val.cyan { color: #06b6d4; } .val.green { color: #10b981; }
.channel-selector-card { background: var(--color-bg-secondary); border-radius: 12px; border:1px solid var(--color-border); padding:16px; }
.card-label { font-size: 14px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 12px; }
.channel-grid { display:flex; flex-wrap:wrap; gap:16px; }
.channel-checkbox { display:flex; align-items:center; gap:8px; cursor:pointer; }
.channel-checkbox input { display:none; }
.channel-checkbox .box { width:16px; height:16px; border:2px solid var(--color-border); border-radius:4px; display:flex; align-items:center; justify-content:center; color:white; font-size:12px; }
.channel-checkbox .name { font-size: 13px; color: var(--color-text-primary); }
.collection-main { display:flex; gap:16px; }
.chart-section { flex:2; background: var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; padding:16px; }
.chart-container { height: 240px; background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: 8px; }
.log-section { flex:1; background: var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; padding:16px; }
.log-list { height: 240px; overflow-y: auto; display:flex; flex-direction:column; gap:8px; }
.log-item { display:flex; gap:12px; font-size:12px; padding:6px; border-radius:4px; background: var(--color-bg-tertiary); }
.log-item .time { color: var(--color-text-tertiary); }
.log-item .msg { color: var(--color-text-primary); }
.data-grid { display:grid; grid-template-columns: repeat(5, 1fr); gap:12px; }
.data-card { background: var(--color-bg-secondary); border:1px solid var(--color-border); padding:12px 16px; border-radius:10px; }
.d-name { font-size:12px; color: var(--color-text-secondary); margin-bottom:4px; }
.d-value { font-size:18px; font-weight:700; }
.d-value .unit { font-size:12px; color: var(--color-text-tertiary); margin-left:2px; }
.collection-footer { display:flex; justify-content:center; gap:20px; margin-top:10px; }
.btn-pause { background:#f97316; color:white; border:none; padding:12px 60px; border-radius:8px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px; }
.btn-stop { background:#0ea5e9; color:white; border:none; padding:12px 60px; border-radius:8px; font-weight:600; cursor:pointer; }
.pulse-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; display: inline-block; animation: pulse 1.5s infinite; }
</style>
