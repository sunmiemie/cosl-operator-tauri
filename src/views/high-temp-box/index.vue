<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { Icon } from '@iconify/vue'
import * as echarts from 'echarts'
import { useCamera } from '@/composables/useCamera'
import { useOcr } from '@/composables/useOcr'
import type { OcrRegion } from '@/types/ocr'

// ============ Type Definitions ============
interface WorkOrder {
  id: string
  applicant: string
  operator: string
  department: string
  deviceName: string
  deviceId: string
  targetTemp: number
  duration: number
  createDate: string
  status: 'pending' | 'paused' | 'completed' | 'testing'
  priority: 'high' | 'normal' | 'low'
}

interface ScheduledTask {
  orderId: string
  scheduledAt: string
}

// ============ Constants ============
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

// ============ State ============
// Navigation & View
const currentView = ref<'dashboard' | 'test'>('dashboard')
const currentStep = ref<'pre-check' | 'startup-guide' | 'monitoring' | 'shutdown'>('pre-check')

// Filter & Search
const searchKeyword = ref('')
const activeFilter = ref<'all' | 'high' | 'pending' | 'paused'>('all')

// Calendar State
const calBase = ref(getMonday(new Date()))
const selectedScheduledOrder = ref<string | null>(null)
const draggedOrderId = ref<string | null>(null)

// Data
const scheduledTasks = ref<Record<string, ScheduledTask>>({})
const workOrders = ref<WorkOrder[]>([
  {
    id: 'HT-2024-001',
    applicant: '张三',
    operator: '李四',
    department: '研发部',
    deviceName: '电子控制器',
    deviceId: 'ECU-2024-001',
    targetTemp: 85,
    duration: 120,
    createDate: '2024-01-05',
    status: 'pending',
    priority: 'high'
  },
  {
    id: 'HT-2024-002',
    applicant: '王五',
    operator: '赵六',
    department: '质量部',
    deviceName: '传感器模块',
    deviceId: 'SENSOR-2024-002',
    targetTemp: 125,
    duration: 180,
    createDate: '2024-01-06',
    status: 'pending',
    priority: 'normal'
  },
  {
    id: 'HT-2024-003',
    applicant: '陈七',
    operator: '李四',
    department: '研发部',
    deviceName: '电机驱动板',
    deviceId: 'MOTOR-2024-003',
    targetTemp: 105,
    duration: 90,
    createDate: '2024-01-07',
    status: 'pending',
    priority: 'normal'
  },
  {
    id: 'HT-2024-004',
    applicant: '刘八',
    operator: '赵六',
    department: '生产部',
    deviceName: '功率模块',
    deviceId: 'PWR-2024-004',
    targetTemp: 150,
    duration: 240,
    createDate: '2024-01-07',
    status: 'paused',
    priority: 'high'
  },
  {
    id: 'HT-2024-005',
    applicant: '周九',
    operator: '李四',
    department: '质量部',
    deviceName: '通信板卡',
    deviceId: 'COM-2024-005',
    targetTemp: 70,
    duration: 60,
    createDate: '2024-01-08',
    status: 'pending',
    priority: 'low'
  }
])

// Test Process State
const currentWorkOrder = ref<WorkOrder | null>(null)
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

// ============ Camera & OCR ============
const camera = useCamera()
const ocr = useOcr()

// OCR 读取的实时数值
const ocrSetTemp = ref<number | null>(null)
const ocrCurrentTemp = ref<number | null>(null)
const ocrRunTime = ref<string | null>(null)

// 温度历史数据
interface TempHistoryPoint {
  time: string
  temp: number
}
const tempHistory = ref<TempHistoryPoint[]>([])

// ROI 配置
const isOcrConfigMode = ref(false)
const roiRegions = ref<Record<string, OcrRegion>>({})
const activeRoiKey = ref<string | null>(null)

// ROI 拖拽状态
const roiDragStart = ref<{ x: number; y: number } | null>(null)
const roiDragCurrent = ref<{ x: number; y: number } | null>(null)

// 置信度
const ocrConfidence = ref<Record<string, number>>({})

// 定时器
let ocrTimer: ReturnType<typeof setInterval> | null = null
let ocrBusy = false
let runTimer: ReturnType<typeof setInterval> | null = null
const runSeconds = ref(0)

// ECharts
const chartRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null

// 摄像头选择
const selectedCameraIndex = ref<number>(0)
const showCameraSelect = ref(false)

// ROI canvas
const roiCanvasRef = ref<HTMLCanvasElement | null>(null)

// ============ Computed ============
const filteredOrders = computed(() => {
  return workOrders.value.filter(order => {
    // Exclude scheduled
    const isScheduled = Object.values(scheduledTasks.value).some(t => t.orderId === order.id)
    if (isScheduled) return false

    // Search
    if (searchKeyword.value) {
      const keyword = searchKeyword.value.toLowerCase()
      const matchId = order.id.toLowerCase().includes(keyword)
      const matchApplicant = order.applicant.toLowerCase().includes(keyword)
      const matchDevice = order.deviceName.toLowerCase().includes(keyword)
      if (!matchId && !matchApplicant && !matchDevice) return false
    }

    // Filter
    if (activeFilter.value === 'high') return order.priority === 'high'
    if (activeFilter.value === 'pending') return order.status === 'pending'
    if (activeFilter.value === 'paused') return order.status === 'paused'

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

const selectedScheduledOrderInfo = computed(() => {
  if (!selectedScheduledOrder.value) return null
  return getOrderById(selectedScheduledOrder.value)
})

const isPreCheckComplete = computed(() => preCheckItems.value.every(i => i.checked))

// ============ Methods ============
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

// --- Calendar Actions ---
function prevWeek() { calBase.value = addDays(calBase.value, -7) }
function nextWeek() { calBase.value = addDays(calBase.value, 7) }

function gotoDate(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (val) calBase.value = getMonday(new Date(val))
}

function loadPresetSchedule() {
  const base = calBase.value
  const presets = [
    { d: 0, t: '0800', id: 'HT-2024-001' },
    { d: 0, t: '1000', id: 'HT-2024-002' },
    { d: 1, t: '1400', id: 'HT-2024-003' },
  ]
  presets.forEach(p => {
    const d = addDays(base, p.d)
    const cellKey = getCellKey(fmtDate(d), p.t)
    if (!scheduledTasks.value[cellKey]) {
      scheduledTasks.value[cellKey] = { orderId: p.id, scheduledAt: new Date().toISOString() }
    }
  })
}

function removeSchedule(cellKey: string) {
  const task = scheduledTasks.value[cellKey]
  if (task && selectedScheduledOrder.value === task.orderId) {
    selectedScheduledOrder.value = null
  }
  delete scheduledTasks.value[cellKey]
}

function selectScheduledTask(orderId: string) {
  selectedScheduledOrder.value = selectedScheduledOrder.value === orderId ? null : orderId
}

// --- Drag & Drop ---
function handleDragStart(e: DragEvent, order: WorkOrder) {
  draggedOrderId.value = order.id
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

  const orderId = e.dataTransfer.getData('text/plain')
  if (!orderId) return

  const cellKey = getCellKey(dateStr, timeKey)
  if (!scheduledTasks.value[cellKey]) {
    scheduledTasks.value[cellKey] = { orderId, scheduledAt: new Date().toISOString() }
  }
  draggedOrderId.value = null
}

// --- Navigation & Test Process ---
function startExperiment() {
  if (!selectedScheduledOrderInfo.value) return
  currentWorkOrder.value = selectedScheduledOrderInfo.value
  preCheckItems.value.forEach(i => (i.checked = false))
  currentView.value = 'test'
  currentStep.value = 'pre-check'
}

function backToDashboard() {
  currentView.value = 'dashboard'
  currentWorkOrder.value = null
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

function stopTest() {
  if (confirm('测试将中止并清空数据，确认吗？')) {
    stopMonitoring()
    backToDashboard()
  }
}

// ============ Camera & OCR Methods ============

// 格式化运行时间
function formatRunTime(seconds: number): string {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// 运行时长计算属性
const displayRunTime = computed(() => {
  if (ocrRunTime.value) return ocrRunTime.value
  return formatRunTime(runSeconds.value)
})

// 设定温度显示
const displaySetTemp = computed(() => {
  if (ocrSetTemp.value !== null) return ocrSetTemp.value
  return currentWorkOrder.value?.targetTemp ?? '--'
})

// 当前温度显示
const displayCurrentTemp = computed(() => {
  if (ocrCurrentTemp.value !== null) return ocrCurrentTemp.value
  return '--'
})

// 置信度等级
function getConfidenceLevel(regionId: string): 'high' | 'medium' | 'low' | 'none' {
  const conf = ocrConfidence.value[regionId]
  if (conf === undefined) return 'none'
  if (conf >= 0.8) return 'high'
  if (conf >= 0.6) return 'medium'
  return 'low'
}

// 启动摄像头
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

// 选择摄像头并启动
async function selectAndStartCamera(index: number) {
  selectedCameraIndex.value = index
  showCameraSelect.value = false
  await camera.startCamera(index)
}

// 加载缓存的 ROI 配置
async function loadCachedRoi() {
  try {
    const data = await invoke<string>('read_cache', { cacheType: 'temp', id: 'ht-ocr-roi' })
    if (data) {
      const parsed = JSON.parse(data) as Record<string, OcrRegion>
      roiRegions.value = parsed
    }
  } catch {
    // 没有缓存，正常
  }
}

// 保存 ROI 配置到缓存
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

// 进入 ROI 配置模式
function enterRoiConfig() {
  isOcrConfigMode.value = true
  activeRoiKey.value = null
  stopOcrTimer()
}

// 选择要配置的 ROI 区域
function selectRoiTarget(key: string) {
  activeRoiKey.value = key
}

// ROI 拖拽开始
function onRoiMouseDown(e: MouseEvent) {
  if (!activeRoiKey.value || !roiCanvasRef.value) return
  const rect = roiCanvasRef.value.getBoundingClientRect()
  roiDragStart.value = {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height
  }
  roiDragCurrent.value = { ...roiDragStart.value }
}

// ROI 拖拽中
function onRoiMouseMove(e: MouseEvent) {
  if (!roiDragStart.value || !roiCanvasRef.value) return
  const rect = roiCanvasRef.value.getBoundingClientRect()
  roiDragCurrent.value = {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
  }
  drawRoiOverlay()
}

// ROI 拖拽结束
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

// 绘制 ROI 覆盖层
function drawRoiOverlay() {
  const canvas = roiCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  // 配置模式下画半透明遮罩
  if (isOcrConfigMode.value) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(0, 0, width, height)
  }

  const colors: Record<string, string> = {
    setTemp: '#f59e0b',
    currentTemp: '#3b82f6',
    runTime: '#10b981'
  }

  // 绘制已配置的区域
  for (const [key, region] of Object.entries(roiRegions.value)) {
    const color = colors[key] || '#888'
    const rx = region.x * width
    const ry = region.y * height
    const rw = region.width * width
    const rh = region.height * height

    // 配置模式下，切掉遮罩显示区域
    if (isOcrConfigMode.value) {
      ctx.clearRect(rx, ry, rw, rh)
    }

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(rx, ry, rw, rh)

    // 标签
    ctx.fillStyle = color
    ctx.font = '12px sans-serif'
    ctx.fillText(region.label || key, rx + 4, ry - 4 > 12 ? ry - 4 : ry + 14)
  }

  // 绘制当前拖拽中的矩形
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

// 保存 ROI 并退出配置模式
async function saveAndExitRoiConfig() {
  isOcrConfigMode.value = false
  activeRoiKey.value = null
  await saveRoiConfig()
  drawRoiOverlay()
  // 配置完成后自动启动 OCR
  await startOcrRecognition()
}

// 取消 ROI 配置
function cancelRoiConfig() {
  isOcrConfigMode.value = false
  activeRoiKey.value = null
  roiDragStart.value = null
  roiDragCurrent.value = null
  drawRoiOverlay()
}

// 从文本中提取数字
function extractNumber(text: string): number | null {
  const match = text.match(/-?\d+\.?\d*/)
  return match ? parseFloat(match[0]) : null
}

// 启动 OCR 定时识别
async function startOcrRecognition() {
  const regionList = Object.values(roiRegions.value)
  if (regionList.length === 0) return

  // 初始化 OCR
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
          // 追加到温度历史
          const now = new Date()
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
          tempHistory.value.push({ time: timeStr, temp: num })
          // 最多保留 300 个点
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

// 停止 OCR 定时器
function stopOcrTimer() {
  if (ocrTimer) {
    clearInterval(ocrTimer)
    ocrTimer = null
  }
}

// 启动运行计时器
function startRunTimer() {
  runSeconds.value = 0
  runTimer = setInterval(() => {
    if (isRunning.value) {
      runSeconds.value++
    }
  }, 1000)
}

// 停止运行计时器
function stopRunTimer() {
  if (runTimer) {
    clearInterval(runTimer)
    runTimer = null
  }
}

// ============ ECharts ============
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

// ============ Monitoring Lifecycle ============
function handleResize() {
  chartInstance?.resize()
  resizeRoiCanvas()
}

async function enterMonitoring() {
  await nextTick()
  await startMonitorCamera()
  await loadCachedRoi()
  startRunTimer()

  // 初始化图表
  await nextTick()
  initChart()

  // 如果有缓存的 ROI 配置，自动启动 OCR
  if (Object.keys(roiRegions.value).length > 0) {
    await startOcrRecognition()
  }

  // 初始化 ROI 绘制
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
  // 重置 OCR 状态
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

// 暂停/继续
function togglePause() {
  isRunning.value = !isRunning.value
}

// 监听进入监控步骤
watch(currentStep, (val, oldVal) => {
  if (val === 'monitoring') {
    enterMonitoring()
  } else if (oldVal === 'monitoring') {
    stopMonitoring()
  }
})

// 页面卸载时清理
onUnmounted(() => {
  stopMonitoring()
})
</script>

<template>
  <div class="high-temp-box-page">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon">
          <Icon icon="mdi:thermometer-high" />
        </div>
        <div>
          <h1 class="header-title">高温箱</h1>
          <p class="header-subtitle">高温测试箱系统</p>
        </div>
      </div>
      <div class="header-right"></div>
    </div>
    <!-- 主界面：Dashboard -->
    <template v-if="currentView === 'dashboard'">
      <div class="layout-container">
        <!-- 左侧：工单任务池 -->
        <div class="sidebar">
          <div class="panel-header">
            <div class="header-title">
              <Icon icon="mdi:format-list-bulleted" class="header-icon" />
              <span>待测试工单</span>
            </div>
            <span class="count-badge">{{ filteredOrders.length }}</span>
          </div>
          
          <div class="search-box">
            <Icon icon="mdi:magnify" class="search-icon" />
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="搜索工单号/申请人"
            />
            <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <div class="filter-bar">
            <button 
              v-for="f in ['all', 'high', 'pending', 'paused']" 
              :key="f"
              class="filter-tag"
              :class="{ active: activeFilter === f }"
              @click="activeFilter = f as any"
            >
              {{ f === 'all' ? '全部' : f === 'high' ? '高优先' : f === 'pending' ? '待测' : '暂停' }}
            </button>
          </div>

          <div class="table-content">
            <div v-if="filteredOrders.length === 0" class="empty-state">
              <p>无待排程工单</p>
            </div>
            <div v-else class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>工单号</th>
                    <th>设备</th>
                    <th>申请人</th>
                    <th>参数</th>
                    <th>优先级</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="order in filteredOrders"
                    :key="order.id"
                    draggable="true"
                    @dragstart="handleDragStart($event, order)"
                    @dragend="handleDragEnd"
                  >
                    <td class="cell-id">{{ order.id }}</td>
                    <td class="cell-device" :title="order.deviceName">{{ order.deviceName }}</td>
                    <td class="cell-applicant">{{ order.applicant }}</td>
                    <td class="cell-param">{{ order.targetTemp }}°C / {{ order.duration }}分</td>
                    <td>
                      <span class="priority-tag" :class="order.priority">
                        {{ order.priority === 'high' ? '高' : order.priority === 'normal' ? '中' : '低' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 右侧：排程日历 -->
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
            <!-- 表头：日期 -->
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
                  :class="{ 'is-weekend': day.isWeekend, 'is-half-cell': slot.isHalf, 'is-past': day.isPast }"
                  @dragover="handleDragOver($event, day.isPast)"
                  @dragleave="handleDragLeave"
                  @drop="handleDrop($event, day.dateStr, slot.key, day.isPast)"
                >
                  <template v-if="scheduledTasks[getCellKey(day.dateStr, slot.key)]">
                    <div
                      class="scheduled-item"
                      :class="{ 'is-selected': selectedScheduledOrder === scheduledTasks[getCellKey(day.dateStr, slot.key)].orderId }"
                      @click="selectScheduledTask(scheduledTasks[getCellKey(day.dateStr, slot.key)].orderId)"
                    >
                      <div class="scheduled-content">
                        <span class="device-name">
                          {{ scheduledTasks[getCellKey(day.dateStr, slot.key)].orderId }}
                        </span>
                        <button class="remove-btn" @click.stop="removeSchedule(getCellKey(day.dateStr, slot.key))">
                          <Icon icon="mdi:close" />
                        </button>
                      </div>
                      <div class="scheduled-tag">
                        {{ getOrderById(scheduledTasks[getCellKey(day.dateStr, slot.key)].orderId)?.deviceName }}
                      </div>
                    </div>
                  </template>
                  <div v-else class="empty-slot-hint"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="control-center">
            <div class="control-center-left">
              <template v-if="selectedScheduledOrderInfo">
                <div class="selected-order">
                  <Icon icon="mdi:check" class="selected-icon" />
                  <span class="selected-label">已选中工单: {{ selectedScheduledOrderInfo.id }}</span>
                </div>
                <span class="selected-divider">|</span>
                <span class="selected-device">{{ selectedScheduledOrderInfo.deviceName }}</span>
                <span class="selected-process">{{ selectedScheduledOrderInfo.targetTemp }}°C</span>
              </template>
              <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
            </div>

            <button
              class="primary-btn"
              :disabled="!selectedScheduledOrderInfo"
              @click="startExperiment"
            >
              <Icon icon="mdi:play" class="start-icon" />
              开始实验
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 测试流程视图 -->
    <template v-else>
      <div class="test-view">
        <div class="test-header">
          <div class="header-left">
            <h2>{{ currentStep === 'pre-check' ? '开机前安全检查' : currentStep === 'startup-guide' ? '高温箱启动指南' : '测试监控中' }}</h2>
            <div class="order-tag">工单: {{ currentWorkOrder?.id }}</div>
          </div>
          <button class="back-btn" @click="backToDashboard">
            <Icon icon="mdi:arrow-left" /> 返回主页
          </button>
        </div>

        <div class="test-content">
          <!-- 步骤1: 安全检查 -->
          <div v-if="currentStep === 'pre-check'" class="modal-overlay">
            <div class="startup-check-modal">
              <h2 class="modal-title">开机检查</h2>

              <div class="check-list-container">
                <div class="check-list">
                  <label
                    v-for="item in preCheckItems"
                    :key="item.id"
                    class="check-item"
                    :class="{ 'is-checked': item.checked }"
                  >
                    <div class="checkbox-wrapper">
                      <input
                        type="checkbox"
                        :checked="item.checked"
                        @change="togglePreCheck(item.id)"
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
                <button class="cancel-btn" @click="backToDashboard">取消</button>
                <button class="next-btn" :disabled="!isPreCheckComplete" @click="completePreCheck">
                  下一步
                </button>
              </div>
            </div>
          </div>

          <!-- 步骤2: 启动指南 -->
          <div v-else-if="currentStep === 'startup-guide'" class="modal-overlay">
            <div class="startup-check-modal">
              <button class="back-btn top-right" @click="backToDashboard">
            <Icon icon="mdi:arrow-left" /> 返回主页
            </button>
              <h2 class="modal-title">高温箱启动指南</h2>

              <div class="guide-progress">
                <div 
                  v-for="(step, idx) in STARTUP_GUIDE_STEPS" 
                  :key="idx"
                  class="progress-dot"
                  :class="{ active: idx === guideStepIndex, done: idx < guideStepIndex }"
                ></div>
              </div>
              
              <div class="guide-card">
                <div class="guide-badge">{{ STARTUP_GUIDE_STEPS[guideStepIndex].badge }}</div>
                <p class="guide-text">{{ STARTUP_GUIDE_STEPS[guideStepIndex].text }}</p>
                <div v-if="STARTUP_GUIDE_STEPS[guideStepIndex].images.length" class="guide-images">
                  <img v-for="(img, i) in STARTUP_GUIDE_STEPS[guideStepIndex].images" :key="i" :src="img" :alt="`${STARTUP_GUIDE_STEPS[guideStepIndex].badge} - ${i + 1}`" />
                </div>
                <div v-if="STARTUP_GUIDE_STEPS[guideStepIndex].warning" class="guide-warning">
                  <Icon icon="mdi:alert" />
                  {{ STARTUP_GUIDE_STEPS[guideStepIndex].warning }}
                </div>
              </div>

              <div class="modal-actions guide-actions">
                <button class="cancel-btn" :disabled="guideStepIndex === 0" @click="prevGuideStep">上一步</button>
                <button class="next-btn" @click="nextGuideStep">
                  {{ guideStepIndex === STARTUP_GUIDE_STEPS.length - 1 ? '完成启动，开始监控' : '下一步' }}
                </button>
              </div>
            </div>
          </div>

          <!-- 步骤3: 监控 -->
          <div v-else-if="currentStep === 'monitoring'" class="monitor-panel">
            <!-- 摄像头选择弹窗 -->
            <div v-if="showCameraSelect" class="camera-select-overlay">
              <div class="camera-select-modal">
                <h3>选择视频采集卡</h3>
                <div class="camera-list">
                  <button
                    v-for="dev in camera.devices.value"
                    :key="dev.deviceId"
                    class="camera-option"
                    @click="selectAndStartCamera(dev.index ?? 0)"
                  >
                    <Icon icon="mdi:camera" />
                    <span>{{ dev.label }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 状态卡片 -->
            <div class="monitor-grid">
              <div class="monitor-card">
                <div class="monitor-label">
                  设定温度
                  <span class="confidence-dot" :class="getConfidenceLevel('setTemp')"></span>
                </div>
                <div class="monitor-value">{{ displaySetTemp }}<small>°C</small></div>
              </div>
              <div class="monitor-card active">
                <div class="monitor-label">
                  当前温度
                  <span class="confidence-dot" :class="getConfidenceLevel('currentTemp')"></span>
                </div>
                <div class="monitor-value">{{ displayCurrentTemp }}<small v-if="ocrCurrentTemp !== null">°C</small></div>
              </div>
              <div class="monitor-card">
                <div class="monitor-label">
                  运行时长
                  <span class="confidence-dot" :class="getConfidenceLevel('runTime')"></span>
                </div>
                <div class="monitor-value time-value">{{ displayRunTime }}</div>
              </div>
            </div>

            <!-- 主内容区域：视频 + 图表 -->
            <div class="monitor-main">
              <!-- 左侧：视频画面 -->
              <div class="video-container">
                <img
                  v-if="camera.currentFrame.value"
                  :src="camera.currentFrame.value"
                  class="video-feed"
                  alt="采集卡画面"
                />
                <div v-else class="video-placeholder">
                  <Icon icon="mdi:video-off-outline" class="placeholder-icon" />
                  <p v-if="camera.isLoading.value">正在连接采集卡...</p>
                  <p v-else-if="camera.error.value">{{ camera.error.value }}</p>
                  <p v-else>等待视频信号</p>
                </div>

                <!-- ROI 叠加层 -->
                <canvas
                  ref="roiCanvasRef"
                  class="roi-overlay"
                  :class="{ 'config-active': isOcrConfigMode }"
                  @mousedown="onRoiMouseDown"
                  @mousemove="onRoiMouseMove"
                  @mouseup="onRoiMouseUp"
                  @mouseleave="onRoiMouseUp"
                />

                <!-- ROI 配置面板 -->
                <div v-if="isOcrConfigMode" class="roi-config-panel">
                  <div class="roi-config-title">选择要配置的识别区域，然后在画面上拖拽框选</div>
                  <div class="roi-buttons">
                    <button
                      class="roi-btn set-temp"
                      :class="{ active: activeRoiKey === 'setTemp', configured: !!roiRegions.setTemp }"
                      @click="selectRoiTarget('setTemp')"
                    >
                      <Icon icon="mdi:target" />
                      设定温度
                    </button>
                    <button
                      class="roi-btn current-temp"
                      :class="{ active: activeRoiKey === 'currentTemp', configured: !!roiRegions.currentTemp }"
                      @click="selectRoiTarget('currentTemp')"
                    >
                      <Icon icon="mdi:thermometer" />
                      当前温度
                    </button>
                    <button
                      class="roi-btn run-time"
                      :class="{ active: activeRoiKey === 'runTime', configured: !!roiRegions.runTime }"
                      @click="selectRoiTarget('runTime')"
                    >
                      <Icon icon="mdi:timer-outline" />
                      运行时间
                    </button>
                  </div>
                  <div class="roi-config-actions">
                    <button class="secondary-btn" @click="cancelRoiConfig">取消</button>
                    <button class="primary-btn small" @click="saveAndExitRoiConfig">
                      <Icon icon="mdi:check" />
                      保存配置
                    </button>
                  </div>
                </div>

                <!-- 摄像头状态指示 -->
                <div v-if="camera.isActive.value" class="camera-status">
                  <span class="live-dot"></span>
                  LIVE
                </div>
              </div>

              <!-- 右侧：温度曲线 -->
              <div class="chart-container">
                <div class="chart-header">
                  <Icon icon="mdi:chart-line" />
                  <span>温度曲线</span>
                </div>
                <div ref="chartRef" class="chart-area"></div>
                <div v-if="tempHistory.length === 0" class="chart-empty-hint">
                  <p>配置 OCR 识别区域后将自动采集温度数据</p>
                </div>
              </div>
            </div>

            <!-- 操作栏 -->
            <div class="action-bar">
              <button v-if="!isOcrConfigMode" class="secondary-btn" @click="enterRoiConfig">
                <Icon icon="mdi:crop" />
                配置识别区域
              </button>
              <div class="action-spacer"></div>
              <button class="secondary-btn warning" @click="togglePause">
                <Icon :icon="isRunning ? 'mdi:pause' : 'mdi:play'" />
                {{ isRunning ? '暂停测试' : '继续测试' }}
              </button>
              <button class="secondary-btn danger" @click="stopTest">
                <Icon icon="mdi:stop" />
                中止测试
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.high-temp-box-page {
  height: 100%;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  overflow: hidden;
  /* padding: 16px; */
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 页面头部 */
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
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.15));
  color:  var(--color-accent-red);
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

/* 布局容器 */
.layout-container {
  display: flex;
  flex: 1;
  gap: 16px;
  overflow: hidden;
}

/* 左侧 Sidebar */
.sidebar {
  width: 320px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
   color: #94a3b8; 
  }

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #94a3b8;
  outline: none;
}

.search-box input::placeholder { color: #94a3b8; }

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

.clear-btn:hover { background: var(--color-error); color: white; }

/* 待测试工单表格样式（对齐视觉检验的 OrderTable 风格） */
.count-badge {
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

.table-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--color-bg-secondary); }
.table-wrapper { flex: 1; overflow: auto; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table thead { position: sticky; top: 0; z-index: 1; }
.data-table th { padding: 12px 16px; text-align: left; font-weight: 600; color: var(--color-text-secondary); background: var(--color-bg-secondary); border-bottom: 1px solid var(--color-border); white-space: nowrap; }
.data-table tbody tr { transition: background-color 0.15s; }
.data-table tbody tr:hover { background: rgba(255, 255, 255, 0.02); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: middle; }

.cell-id { font-weight: 600; color: var(--color-accent-blue); }
.cell-device { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-applicant, .cell-param { color: var(--color-text-secondary); }

.priority-tag { display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.priority-tag.high { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.priority-tag.normal { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }
.priority-tag.low { background: rgba(34, 197, 94, 0.12); color: #22c55e; }


.filter-bar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.filter-tag {
  border: none;
  background: transparent;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.filter-tag.active {
  background: var(--color-accent-blue);
  color: white;
}

.order-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-bg-secondary);
}

.order-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  cursor: grab;
  transition: all 0.2s;
}

.order-card:hover {
  border-color: var(--color-accent-blue);
  background: var(--color-bg-hover);
  transform: translateY(-1px);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.order-id { font-weight: 600; color: var(--color-accent-blue); font-size: 14px; }

.order-priority {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}
.order-priority.high { background: rgba(239, 68, 68, 0.1); color: var(--color-error); }
.order-priority.normal { background: rgba(59, 130, 246, 0.1); color: var(--color-primary); }
.order-priority.low { background: rgba(107, 114, 128, 0.1); color: var(--color-text-secondary); }

.info-row {
  display: flex;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.info-row .label { width: 50px; color: var(--color-text-tertiary); }

/* Main Content */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
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

.week-cal-nav:hover { background: var(--color-bg-hover); }

.week-cal-date-input {
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 12px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  width: 130px;
}

.legend { display: flex; gap: 16px; margin-left: auto; }
.legend-item { display: flex; align-items: center; font-size: 13px; color: var(--color-text-secondary); }
.dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
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

.day-header.is-today { background: rgba(88, 166, 255, 0.1); }

.day-num { font-size: 16px; font-weight: 700; color: var(--color-accent-blue); }
.day-num.is-weekend { color: var(--color-error); }
.day-name { font-size: 11px; color: var(--color-text-secondary); margin-top: 2px; }

.grid-body { flex: 1; overflow-y: auto; }

.grid-row {
  display: grid;
  grid-template-columns: 60px repeat(7, 1fr);
  border-bottom: 1px solid var(--color-border);
  min-height: 44px;
}

.grid-row.is-half { border-bottom: 1px dashed var(--color-border); }

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

.scheduled-item:hover { transform: scale(1.02); box-shadow: 0 2px 6px rgba(0,0,0,0.12); }

.scheduled-item.is-selected {
  outline: 2px solid rgba(255,255,255,0.95);
  box-shadow: 0 0 0 3px rgba(37,99,235,0.35);
  transform: scale(1.04);
  z-index: 2;
  position: relative;
}

.scheduled-content { width: 100%; display: flex; justify-content: space-between; align-items: flex-start; }
.device-name { font-size: 11px; font-weight: 700; color: #fff; }
.scheduled-tag { font-size: 9px; color: rgba(255,255,255,0.9); margin-top: 2px; }
.remove-btn { background: none; border: none; color: rgba(255,255,255,0.8); cursor: pointer; font-size: 10px; }
.remove-btn:hover { color: #fff; }

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
.selected-order { display: flex; align-items: center; gap: 8px; color: var(--color-accent-blue); font-weight: 600; }
.selected-divider,
.selected-device { color: var(--color-text-secondary); }
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

/* Test View Styles */
.test-view {
  flex: 1;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.test-header {
  padding: 20px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left h2 { margin: 0; font-size: 20px; }
.order-tag { font-size: 13px; color: var(--color-text-secondary); margin-top: 4px; }

.back-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary);
}

.back-btn.top-right {
  position: absolute;
  top: 16px;
  right: 16px;
}

.test-content { flex: 1; padding: 24px; overflow-y: auto; display: flex; justify-content: center; }

/* Modal Styles */
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

.check-panel, .guide-panel {
  width: 100%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: 24px;
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
.guide-actions { margin-top: 24px; }

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

.guide-progress { display: flex; gap: 8px; justify-content: center; margin-bottom: 16px; }
.progress-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--color-border); }
.progress-dot.active { background: var(--color-accent-blue); transform: scale(1.2); }
.progress-dot.done { background: var(--color-success); }

.guide-card {
  background: var(--color-bg-tertiary);
  padding: 32px;
  border-radius: 12px;
  text-align: center;
}

.guide-badge {
  display: inline-block;
  padding: 4px 12px;
  background: var(--color-accent-blue);
  color: white;
  border-radius: 20px;
  font-size: 14px;
  margin-bottom: 16px;
}

.guide-text { font-size: 18px; line-height: 1.6; }
.guide-images { margin-top: 16px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.guide-images img { max-width: 100%; max-height: 300px; border-radius: 8px; object-fit: contain; }
.guide-warning { margin-top: 16px; color: var(--color-error); display: flex; align-items: center; justify-content: center; gap: 8px; }

.monitor-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}

.monitor-grid { display: flex; gap: 16px; }
.monitor-card {
  flex: 1;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  padding: 16px 20px;
  border-radius: 12px;
  text-align: center;
}
.monitor-card.active { border-color: var(--color-accent-blue); background: rgba(59, 130, 246, 0.05); }
.monitor-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.monitor-value { font-size: 28px; font-weight: 700; color: var(--color-text-primary); margin-top: 4px; }
.monitor-value.time-value { font-family: monospace; letter-spacing: 1px; }

/* 置信度圆点 */
.confidence-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-border);
}
.confidence-dot.high { background: #22c55e; }
.confidence-dot.medium { background: #f59e0b; }
.confidence-dot.low { background: #ef4444; }
.confidence-dot.none { background: var(--color-border); }

/* 主内容区：视频 + 图表并排 */
.monitor-main {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

/* 视频容器 */
.video-container {
  flex: 0 0 55%;
  position: relative;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.video-feed {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.video-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  min-height: 300px;
}

.video-placeholder .placeholder-icon { font-size: 48px; margin-bottom: 12px; }
.video-placeholder p { font-size: 14px; }

/* ROI 叠加层 */
.roi-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.roi-overlay.config-active {
  pointer-events: auto;
  cursor: crosshair;
}

/* ROI 配置面板 */
.roi-config-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(8px);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.roi-config-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
}

.roi-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.roi-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.roi-btn:hover { background: rgba(255, 255, 255, 0.1); }
.roi-btn.active { border-color: currentColor; background: rgba(255, 255, 255, 0.15); }
.roi-btn.configured { opacity: 1; }
.roi-btn.configured::after { content: ' ✓'; }

.roi-btn.set-temp { color: #f59e0b; }
.roi-btn.set-temp.active { border-color: #f59e0b; background: rgba(245, 158, 11, 0.15); }

.roi-btn.current-temp { color: #3b82f6; }
.roi-btn.current-temp.active { border-color: #3b82f6; background: rgba(59, 130, 246, 0.15); }

.roi-btn.run-time { color: #10b981; }
.roi-btn.run-time.active { border-color: #10b981; background: rgba(16, 185, 129, 0.15); }

.roi-config-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 摄像头状态指示 */
.camera-status {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #ef4444;
  letter-spacing: 1px;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  animation: livePulse 1.5s ease-in-out infinite;
}

@keyframes livePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* 图表容器 */
.chart-container {
  flex: 0 0 45%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.chart-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.chart-area {
  flex: 1;
  min-height: 250px;
}

.chart-empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  font-size: 13px;
  pointer-events: none;
}

/* 摄像头选择弹窗 */
.camera-select-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}

.camera-select-modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px;
  min-width: 300px;
}

.camera-select-modal h3 {
  margin: 0 0 16px;
  font-size: 16px;
  text-align: center;
}

.camera-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.camera-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.camera-option:hover {
  border-color: var(--color-accent-blue);
  background: rgba(59, 130, 246, 0.05);
}

/* 操作栏 */
.action-bar { display: flex; align-items: center; gap: 16px; }
.action-spacer { flex: 1; }

.secondary-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: 1px solid var(--color-border);
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}
.secondary-btn:hover { background: var(--color-bg-hover); }
.secondary-btn.warning { color: var(--color-warning); border-color: var(--color-warning); }
.secondary-btn.warning:hover { background: rgba(234, 179, 8, 0.08); }
.secondary-btn.danger { color: var(--color-error); border-color: var(--color-error); }
.secondary-btn.danger:hover { background: rgba(239, 68, 68, 0.08); }

.primary-btn.small {
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 8px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-tertiary);
  font-size: 13px;
}
</style>