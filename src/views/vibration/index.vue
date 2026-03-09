<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { writeTextFile, writeBinaryFile, exists, mkdir } from '@tauri-apps/plugin-fs'
//保存工作订单路径
// const SAVE_DIR = 'd:\\Users\\Desktop\\清华'

type Stage = 'dashboard' | 'devcheck' | 'start' | 'calibration' | 'testing' | 'report' | 'shutdown'

interface WorkOrder {
  id: string
  type: string
  applicant: string
  phone: string
  device: string
  level: string
  duration: number
  purpose: string
  priority: '普通' | '紧急'
}

interface DevCheckItem {
  id: number
  text: string
  answer: 'yes' | 'no' | null
  remark: string
}

const stage = ref<Stage>('dashboard')
const searchKeyword = ref('')
const draggedOrder = ref<WorkOrder | null>(null)

const workOrders = ref<WorkOrder[]>([
  { id: 'TMP-2026-001', type: '模拟实验', applicant: '张三', phone: '138****8888', device: '卫星姿控仪', level: '5G', duration: 30, purpose: '功能验证预实验', priority: '普通' },
  { id: 'FOR-2026-001', type: '正式测试', applicant: '李四', phone: '139****6666', device: '导航控制器', level: '8G', duration: 60, purpose: '环境适应性振动测试', priority: '紧急' },
  { id: 'FOR-2026-002', type: '正式测试', applicant: '王五', phone: '137****5555', device: '传感器模块', level: '10G', duration: 45, purpose: '结构完整性振动测试', priority: '普通' },
  { id: 'TMP-2026-002', type: '模拟实验', applicant: '陈六', phone: '136****4444', device: '惯性测量单元', level: '3G', duration: 20, purpose: '安装工装验证', priority: '普通' },
  { id: 'FOR-2026-003', type: '正式测试', applicant: '赵七', phone: '135****3333', device: '星敏感器', level: '6G', duration: 90, purpose: '正弦扫频耐久测试', priority: '紧急' },
  { id: 'FOR-2026-004', type: '模拟试验', applicant: '刘八', phone: '134****2222', device: '天线组件', level: '4G', duration: 120, purpose: '随机振动环境验证', priority: '普通' },
])

const preChecks = [
  '查阅前次设备运转记录确认设备处于正常状态',
  '确认设备外观无异常，包括各处固定联接螺栓、软管及接头无松动',
  '确认冷却水箱的水位',
  '确认冷却系统阀门开启位置',
  '确认试验件安装牢固，并及时清理工具及杂物，确保安全无飞溅',
  '确认振动传感器安装牢固',
  '试验台气压检查：5吨振动台气压0.6~0.9MPa；40吨振动台气压0.4~0.6MPa',
  '检查减震器基础充气状态，确认上下气囊的位置标识相匹配',
  '确认工作区域无人',
  '启动外循环冷却系统，确认工作正常',
]

const postChecks = [
  '确认各处电源，关闭电源总开关',
  '设备外观检查并整理试验现场',
]

const devCheckItems = ref<DevCheckItem[]>(
  preChecks.map((text, idx) => ({ id: idx + 1, text, answer: null, remark: '' }))
)

const shutdownChecks = ref(
  postChecks.map((text, idx) => ({ id: idx + 1, text, checked: false }))
)

const showSafetyWarning = ref(false)

const selectedScheduledOrderIds = ref<string[]>([])
const currentWorkOrderId = ref<string | null>(null)

const currentWorkOrder = computed(() => {
  if (!currentWorkOrderId.value) return null
  return workOrders.value.find(w => w.id === currentWorkOrderId.value) || null
})

const getOrderById = (id: string) => workOrders.value.find(w => w.id === id)

const testMode = computed<"formal" | "pre">(() =>
  currentWorkOrder.value?.type === '模拟实验' ? 'pre' : 'formal'
)

const calBase = ref(new Date())

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

// Initialize calBase to this week's Monday
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
  const start = currentWeekDays.value[0]
  const end = currentWeekDays.value[6]
  //return `${start.month}月${start.dayNum}日 ～ ${end.month}月${end.dayNum}日`
})

const timeSlots = computed(() => {
  const slots = []
  for (let hour = 8; hour < 18; hour++) {
    slots.push({ key: `${hour}00`, label: `${String(hour).padStart(2, '0')}:00`, isHalf: false })
    slots.push({ key: `${hour}30`, label: `${String(hour).padStart(2, '0')}:30`, isHalf: true })
  }
  slots.push({ key: '1800', label: '18:00', isHalf: false })
  return slots
})

const getCellKey = (dateStr: string, timeKey: string) => `${dateStr}_${timeKey}`

const scheduledOrders = ref<Record<string, string[]>>({})

// Load preset schedule (matching the HTML demo)
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
    { d: 0, t: '1000', id: 'FOR-2026-001' },
    { d: 1, t: '1400', id: 'FOR-2026-002' },
    { d: 2, t: '0900', id: 'TMP-2026-002' },
    { d: 3, t: '1000', id: 'FOR-2026-003' },
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

const unscheduledOrders = computed(() => {
  const scheduledList = Object.values(scheduledOrders.value).flat()
  const scheduled = new Set(scheduledList)
  const kw = searchKeyword.value.trim()
  return workOrders.value.filter(o => {
    if (scheduled.has(o.id)) return false
    if (!kw) return true
    return (
      o.id.includes(kw) ||
      o.applicant.includes(kw) ||
      o.device.includes(kw) ||
      o.type.includes(kw) ||
      o.level.includes(kw)
    )
  })
})

function handleDragStart(e: DragEvent, order: WorkOrder) {
  draggedOrder.value = order
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
  selectedScheduledOrderIds.value = arr.includes(orderId)
    ? arr.filter(id => id !== orderId)
    : [...arr, orderId]
}

const selectedScheduledOrders = computed(() => {
  return selectedScheduledOrderIds.value
    .map(id => getOrderById(id))
    .filter(Boolean) as WorkOrder[]
})

const stepList = computed(() => [
  { id: 'dashboard', label: '① 看板' },
  { id: 'devcheck', label: '② 设备检测' },
  { id: 'start', label: '③ 启动' },
  { id: 'calibration', label: '④ 振级校验' },
  { id: 'testing', label: '⑤ 测试' },
  { id: 'report', label: '⑥ 报告' },
  { id: 'shutdown', label: '⑦ 关机' },
] as const)

const showStartupCheck = ref(false)
const checkItems = ref(preChecks.map((text, idx) => ({ id: idx + 1, text, checked: false })))

const allChecked = computed(() => checkItems.value.every(item => item.checked))

function toggleCheck(id: number) {
  const item = checkItems.value.find(i => i.id === id)
  if (item) item.checked = !item.checked
}

function startExperiment() {
  if (!selectedScheduledOrders.value.length) return
  currentWorkOrderId.value = selectedScheduledOrders.value[0].id
  checkItems.value.forEach(item => (item.checked = false))
  showStartupCheck.value = true
}

function handleStartupCheckComplete() {
  showStartupCheck.value = false
  stage.value = 'start'
}

const devCheckDoneCount = computed(() => devCheckItems.value.filter(i => i.answer !== null).length)
const devCheckAllAnswered = computed(() => devCheckDoneCount.value === devCheckItems.value.length)
const devCheckHasNo = computed(() => devCheckItems.value.some(i => i.answer === 'no'))
const devCheckInvalidNoRemark = computed(() => devCheckItems.value.some(i => i.answer === 'no' && i.remark.trim() === ''))

const devCheckProgressPct = computed(() => {
  if (!devCheckItems.value.length) return 0
  return Math.round((devCheckDoneCount.value / devCheckItems.value.length) * 100)
})

function setDevCheckAnswer(id: number, answer: 'yes' | 'no') {
  const item = devCheckItems.value.find(i => i.id === id)
  if (!item) return
  item.answer = item.answer === answer ? null : answer
  if (item.answer !== 'no') item.remark = ''
}

function resetDevCheck() {
  devCheckItems.value.forEach(i => {
    i.answer = null
    i.remark = ''
  })
}

function submitDevCheck() {
  if (!devCheckAllAnswered.value) return
  if (devCheckInvalidNoRemark.value) return
  if (devCheckHasNo.value) {
    showSafetyWarning.value = true
    return
  }
  stage.value = 'start'
}

function continueAfterSafetyWarning() {
  showSafetyWarning.value = false
  stage.value = 'start'
}

function backToDashboard() {
  stage.value = 'dashboard'
  currentWorkOrderId.value = null
}

function goPrevStage() {
  if (stage.value === 'start') backToDashboard()
  else if (stage.value === 'calibration') stage.value = 'start'
  else if (stage.value === 'testing') stage.value = 'calibration'
  else if (stage.value === 'report') stage.value = 'testing'
  else if (stage.value === 'shutdown') stage.value = 'report'
}

const showConfirmStartModal = ref(false)

function goNextStage() {
  if (stage.value === 'start') showConfirmStartModal.value = true
  else if (stage.value === 'calibration') {
    stage.value = 'testing'
    startVibTestMonitor()
  }
  else if (stage.value === 'testing') stage.value = 'report'
  else if (stage.value === 'report') stage.value = 'shutdown'
}

const vibTestSeconds = ref(0)
const vibDataCount = ref(0)
let vibTestInterval: number | undefined
const isRunning = ref(false)

// Reactive refs for live data display
const liveLevel = ref('-- G')
const liveFreq = ref('-- Hz')
const liveAx = ref('--.-g')
const liveAy = ref('--.-g')
const liveAz = ref('--.-g')
const liveFileName = ref('振动测试数据.csv')
const showAbortWarning = ref(false)

// Oscilloscope
let oscCanvas: HTMLCanvasElement | null = null
let oscCtx: CanvasRenderingContext2D | null = null
let oscAnimId: number | undefined
let simPhase = 0
let simPhase2 = 0

const formattedDuration = computed(() => {
  const h = String(Math.floor(vibTestSeconds.value / 3600)).padStart(2, '0')
  const m = String(Math.floor((vibTestSeconds.value % 3600) / 60)).padStart(2, '0')
  const s = String(vibTestSeconds.value % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
})

function confirmStartVibration() {
  showConfirmStartModal.value = false
  if (testMode.value === 'formal') {
    stage.value = 'calibration'
    calStep.value = 'amp'
  } else {
    stage.value = 'testing'
    startVibTestMonitor()
  }
}

// Calibration Logic
const calStep = ref<'amp' | 'dur'>('amp')

function setCalStep(step: 'amp' | 'dur') {
  calStep.value = step
}

function startVibTestMonitor() {
  if (vibTestInterval) clearInterval(vibTestInterval)
  vibTestSeconds.value = 0
  vibDataCount.value = 0
  isRunning.value = true

  const wo = currentWorkOrder.value
  const level = wo ? parseFloat(wo.level) : 8
  liveFileName.value = wo ? `${wo.id}_${wo.device}_振动测试数据.csv` : '振动测试数据.csv'
  
  // Initial values
  liveLevel.value = (level * (0.95 + Math.random() * 0.1)).toFixed(1) + 'G'
  liveFreq.value = (20 + Math.random() * 0.5).toFixed(1) + ' Hz'
  liveAx.value = (level * 0.3 * (0.9 + Math.random() * 0.2)).toFixed(2) + 'g'
  liveAy.value = (level * 0.28 * (0.9 + Math.random() * 0.2)).toFixed(2) + 'g'
  liveAz.value = (level * (0.9 + Math.random() * 0.2)).toFixed(2) + 'g'

  vibTestInterval = window.setInterval(() => {
    vibTestSeconds.value++
    vibDataCount.value += Math.floor(Math.random() * 3) + 1
    simPhase += 0.25
    simPhase2 += 0.18
    const lvl = level
    const lvlOsc = lvl * (0.90 + 0.12 * Math.sin(simPhase))
    const freqOsc = 19.5 + 1.8 * Math.sin(simPhase2)
    liveLevel.value = lvlOsc.toFixed(1) + 'G'
    liveFreq.value = freqOsc.toFixed(1) + ' Hz'
    const noise = () => (Math.random() - 0.5) * 0.04
    liveAx.value = (lvl * 0.35 * (0.85 + 0.15 * Math.sin(simPhase * 1.1)) + noise()).toFixed(2) + 'g'
    liveAy.value = (lvl * 0.28 * (0.85 + 0.15 * Math.cos(simPhase * 0.9)) + noise()).toFixed(2) + 'g'
    liveAz.value = (lvl * (0.88 + 0.18 * Math.sin(simPhase * 0.7)) + noise()).toFixed(2) + 'g'
  }, 1000)

  nextTick(() => startOscilloscope())
}

function startOscilloscope() {
  oscCanvas = document.getElementById('test-osc-canvas') as HTMLCanvasElement | null
  if (!oscCanvas) return
  const dpr = window.devicePixelRatio || 1
  let w = oscCanvas.clientWidth
  let h = oscCanvas.clientHeight
  if (!w || !h) { w = 600; h = 220 }
  oscCanvas.width = Math.max(1, Math.floor(w * dpr))
  oscCanvas.height = Math.max(1, Math.floor(h * dpr))
  oscCtx = oscCanvas.getContext('2d')
  if (!oscCtx) return
  oscCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (oscAnimId) cancelAnimationFrame(oscAnimId)
  const start = performance.now()
  const draw = (now: number) => {
    if (!oscCtx || !oscCanvas) return
    const width = oscCanvas.clientWidth
    const height = oscCanvas.clientHeight
    oscCtx.clearRect(0, 0, width, height)
    // Background grid
    oscCtx.fillStyle = '#0b1220'
    oscCtx.fillRect(0, 0, width, height)
    oscCtx.strokeStyle = 'rgba(255,255,255,0.08)'
    oscCtx.lineWidth = 1
    for (let x = 0; x < width; x += 40) {
      oscCtx.beginPath()
      oscCtx.moveTo(x, 0)
      oscCtx.lineTo(x, height)
      oscCtx.stroke()
    }
    for (let y = 0; y < height; y += 30) {
      oscCtx.beginPath()
      oscCtx.moveTo(0, y)
      oscCtx.lineTo(width, y)
      oscCtx.stroke()
    }
    // Wave params
    const t = (now - start) / 1000
    const base = currentWorkOrder.value ? parseFloat(currentWorkOrder.value.level) : 8
    const freq = 19.5 + Math.sin(t * 0.6) * 1.5
    const kx = (x) => (x/width)*Math.PI*2*freq
    const amp1 = base * 4.2
    const amp2 = base * 3.3
    // CH1 (cyan)
    oscCtx.strokeStyle = '#06b6d4'
    oscCtx.lineWidth = 2
    oscCtx.beginPath()
    for (let x = 0; x < width; x++) {
      const y = height/2
        + Math.sin(kx(x) + t*2.1) * (amp1/10)
        + 0.3 * Math.sin(2*kx(x) + t*3.2) * (amp1/12)
        + (Math.random()-0.5) * 1.5
      if (x === 0) oscCtx.moveTo(x, y)
      else oscCtx.lineTo(x, y)
    }
    oscCtx.stroke()
    // CH2 (amber)
    oscCtx.strokeStyle = '#f59e0b'
    oscCtx.beginPath()
    for (let x = 0; x < width; x++) {
      const y = height/2
        + Math.cos(kx(x) + t*1.7 + 0.6) * (amp2/10)
        + 0.2 * Math.sin(3*kx(x) + t*2.4) * (amp2/13)
        + (Math.random()-0.5) * 1.5
      if (x === 0) oscCtx.moveTo(x, y)
      else oscCtx.lineTo(x, y)
    }
    oscCtx.stroke()
    oscAnimId = requestAnimationFrame(draw)
  }
  oscAnimId = requestAnimationFrame(draw)
}

function stopOscilloscope() {
  if (oscAnimId) cancelAnimationFrame(oscAnimId)
  oscAnimId = undefined
  oscCtx = null
  oscCanvas = null
}

function pauseVibTest() {
  if (vibTestInterval) {
    clearInterval(vibTestInterval)
    vibTestInterval = undefined
  }
  stopOscilloscope()
  isRunning.value = false
}

function resumeVibTest() {
  if (vibTestInterval) clearInterval(vibTestInterval)
  const wo = currentWorkOrder.value
  const level = wo ? parseFloat(wo.level) : 8
  isRunning.value = true
  vibTestInterval = window.setInterval(() => {
    vibTestSeconds.value++
    vibDataCount.value += Math.floor(Math.random() * 3) + 1
    simPhase += 0.25
    simPhase2 += 0.18
    const lvlOsc = level * (0.90 + 0.12 * Math.sin(simPhase))
    const freqOsc = 19.5 + 1.8 * Math.sin(simPhase2)
    liveLevel.value = lvlOsc.toFixed(1) + 'G'
    liveFreq.value = freqOsc.toFixed(1) + ' Hz'
    const noise = () => (Math.random() - 0.5) * 0.04
    liveAx.value = (level * 0.35 * (0.85 + 0.15 * Math.sin(simPhase * 1.1)) + noise()).toFixed(2) + 'g'
    liveAy.value = (level * 0.28 * (0.85 + 0.15 * Math.cos(simPhase * 0.9)) + noise()).toFixed(2) + 'g'
    liveAz.value = (level * (0.88 + 0.18 * Math.sin(simPhase * 0.7)) + noise()).toFixed(2) + 'g'
  }, 1000)
  nextTick(() => startOscilloscope())
}

function stopTesting() {
  if (vibTestInterval) clearInterval(vibTestInterval)
  vibTestInterval = undefined
  stopOscilloscope()
  isRunning.value = false
  stage.value = 'report'
  startFileGen()
}

function endVibTest() {
  if (vibTestInterval) {
    clearInterval(vibTestInterval)
    vibTestInterval = undefined
  }
  stopOscilloscope()
  isRunning.value = false
  if (testMode.value === 'pre') {
    backToDashboard()
  } else {
    stage.value = 'report'
    startFileGen()
  }
}

function confirmAbort() {
  showAbortWarning.value = false
  if (vibTestInterval) {
    clearInterval(vibTestInterval)
    vibTestInterval = undefined
  }
  stopOscilloscope()
  isRunning.value = false
  if (testMode.value === 'pre') {
    backToDashboard()
  } else {
    stage.value = 'report'
    startFileGen()
  }
}

type ReportFileId = 'csv' | 'png' | 'doc'
interface ReportFile { id: ReportFileId; name: string; status: string; done: boolean }

const reportFiles = ref<ReportFile[]>([
  { id: 'csv', name: '振动测试数据.csv', status: '待生成', done: false },
  { id: 'png', name: '实时波形.png', status: '待生成', done: false },
  { id: 'doc', name: '测试报告.docx', status: '待生成', done: false },
])

const reportProgress = computed(() => {
  const total = reportFiles.value.length
  const done = reportFiles.value.filter(f => f.done).length
  return Math.round((done / total) * 100)
})

const fileGenRunning = ref(false)
const allFilesDone = computed(() => reportFiles.value.every(f => f.done))

function startFileGen() {
  if (fileGenRunning.value) return
  fileGenRunning.value = true
  // CSV
  setTimeout(() => { updateFileStatus('csv', '生成中...') }, 200)
  setTimeout(async () => { await saveCsv(); markFileDone('csv') }, 900)
  // PNG
  setTimeout(() => { updateFileStatus('png', '生成中...') }, 300)
  setTimeout(async () => { await savePng(); markFileDone('png') }, 1400)
  // DOC
  setTimeout(() => { updateFileStatus('doc', '生成中...') }, 500)
  setTimeout(async () => { await saveDoc(); markFileDone('doc'); fileGenRunning.value = false }, 2200)
}

function updateFileStatus(id: ReportFileId, status: string) {
  const f = reportFiles.value.find(x => x.id === id)
  if (f) f.status = status
}
function markFileDone(id: ReportFileId) {
  const f = reportFiles.value.find(x => x.id === id)
  if (f) { f.status = '已生成 ✓'; f.done = true }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

async function saveCsv() {
  const header = 'timestamp,level,freq,ax,ay,az\n'
  const base = currentWorkOrder.value ? parseFloat(currentWorkOrder.value.level) : 8
  let rows = ''
  for (let i = 0; i < 30; i++) {
    const t = new Date(Date.now() - (30-i)*1000).toISOString()
    const phase = i / 5
    const lvl = (base * (0.9 + 0.12 * Math.sin(phase))).toFixed(2)
    const freq = (19.5 + 1.8 * Math.cos(phase)).toFixed(2)
    const ax = (base * 0.35 * (0.85 + 0.15 * Math.sin(phase*1.1))).toFixed(3)
    const ay = (base * 0.28 * (0.85 + 0.15 * Math.cos(phase*0.9))).toFixed(3)
    const az = (base * (0.88 + 0.18 * Math.sin(phase*0.7))).toFixed(3)
    rows += `${t},${lvl},${freq},${ax},${ay},${az}\n`
  }
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' })
  downloadBlob('振动测试数据.csv', blob)
}

async function savePng() {
  if (oscCanvas) {
    const blob = await new Promise<Blob | null>(res => oscCanvas!.toBlob(res))
    if (blob) { downloadBlob('实时波形.png', blob); return }
  }
  const empty = new Blob([], { type: 'image/png' })
  downloadBlob('实时波形.png', empty)
}

async function saveDoc() {
  const wo = currentWorkOrder.value
  const content = `测试报告\n工单: ${wo?.id || '-'}\n设备: ${wo?.device || '-'}\n量级: ${wo?.level || '-'}\n时长: ${wo?.duration || '-'} 分钟\n生成时间: ${new Date().toLocaleString()}`
  const blob = new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  downloadBlob('测试报告.docx', blob)
}

function finishShutdown() {
  shutdownChecks.value.forEach(i => (i.checked = false))
  backToDashboard()
}

onMounted(() => {
  // no-op
})

onUnmounted(() => {
  if (vibTestInterval) clearInterval(vibTestInterval)
  stopOscilloscope()
})
</script>

<template>
  <div class="vibration-page">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon">
          <Icon icon="mdi:vibrate" />
        </div>
        <div>
          <h1 class="header-title">振动台</h1>
          <p class="header-subtitle">振动测试系统</p>
        </div>
      </div>
      <div class="header-right"></div>
    </div>

    <div class="platform-root">
    <div v-if="stage !== 'dashboard'" class="stepbar">
      <span
        v-for="s in stepList"
        :key="s.id"
        class="step-chip"
        :class="{ active: stage === s.id }"
      >
        {{ s.label }}
      </span>
      <!-- <button class="btn btn-secondary btn-sm step-back" @click="backToDashboard">
        <Icon icon="mdi:arrow-left" /> 返回看板
      </button> -->
    </div>

    <div v-if="stage === 'dashboard'" class="layout-container">
      <div v-if="showStartupCheck" class="modal-overlay">
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
            <button class="next-btn" :disabled="!allChecked" @click="handleStartupCheckComplete">
              下一步
            </button>
          </div>
        </div>
      </div>

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
                  <th>设备</th>
                  <th>申请人</th>
                  <th>参数</th>
                  <th>类型</th>
                  <th>优先级</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="order in unscheduledOrders"
                  :key="order.id"
                  draggable="true"
                  @dragstart="handleDragStart($event, order)"
                  @dragend="handleDragEnd"
                >
                  <td class="cell-id">{{ order.id }}</td>
                  <td class="cell-device" :title="order.device">{{ order.device }}</td>
                  <td class="cell-applicant">{{ order.applicant }}</td>
                  <td class="cell-param">{{ order.level }} / {{ order.duration }}分</td>
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
            <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="gotoDate" title="跳转到指定日期所在周">
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
              <div class="day-name">周{{ day.dayName.replace('周', '') }}</div>
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
                @drop="handleDrop($event, day.dateStr, slot.key, day.isPast)"
              >
                <div v-if="scheduledOrders[getCellKey(day.dateStr, slot.key)]?.length">
                  <div
                    v-for="oid in scheduledOrders[getCellKey(day.dateStr, slot.key)]"
                    :key="oid"
                    class="scheduled-item"
                    :class="{ 'is-selected': selectedScheduledOrderIds.includes(oid) }"
                    @click="selectScheduledOrder(oid)"
                  >
                    <div class="scheduled-content">
                      <span class="device-name">{{ oid }}</span>
                      <button class="remove-btn" @click.stop="handleUnschedule(getCellKey(day.dateStr, slot.key), oid)">
                        <Icon icon="mdi:close" />
                      </button>
                    </div>
                    <div class="scheduled-tag">
                      <template v-if="getOrderById(oid)">
                        {{ getOrderById(oid)?.device }}
                      </template>
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
                <span class="selected-label">已选中工单: {{ selectedScheduledOrders.length }} 个</span>
              </div>
              <span class="selected-divider">|</span>
              <span class="selected-device" v-for="o in selectedScheduledOrders" :key="o.id">{{ o.id }} · {{ o.device }}</span>
            </template>
            <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
          </div>

          <button class="primary-btn" :disabled="!selectedScheduledOrders.length" @click="startExperiment">
            <Icon icon="mdi:play" class="start-icon" />
            开始实验
          </button>
        </div>
      </div>
    </div>

    <div v-else class="flow-container">
      <div v-if="stage === 'devcheck'" class="panel-card">
        <div class="panel-header">
          <span class="panel-title">设备运转前检查（{{ devCheckDoneCount }} / {{ devCheckItems.length }}）</span>
          <span class="badge">{{ devCheckProgressPct }}%</span>
        </div>

        <div class="progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${devCheckProgressPct}%` }"></div>
          </div>
          <div class="progress-tip">检查完成进度: {{ devCheckDoneCount }}/{{ devCheckItems.length }}</div>
        </div>

        <div class="check-list">
          <div
            v-for="item in devCheckItems"
            :key="item.id"
            class="check-item"
            :class="{ ok: item.answer === 'yes', bad: item.answer === 'no' }"
          >
            <div class="check-row">
              <div class="check-num">{{ item.id }}</div>
              <div class="check-text">{{ item.text }}</div>
              <div class="check-actions">
                <button class="mini-btn" :class="{ active: item.answer === 'yes' }" @click="setDevCheckAnswer(item.id, 'yes')">
                  是
                </button>
                <button class="mini-btn danger" :class="{ active: item.answer === 'no' }" @click="setDevCheckAnswer(item.id, 'no')">
                  否
                </button>
              </div>
            </div>

            <div v-if="item.answer === 'no'" class="remark">
              <input v-model="item.remark" class="remark-input" type="text" placeholder="请填写备注（必填）" />
            </div>
          </div>
        </div>

        <div class="panel-footer">
          <button class="btn btn-secondary" @click="resetDevCheck">重置</button>
          <button class="btn btn-primary" :disabled="!devCheckAllAnswered || devCheckInvalidNoRemark" @click="submitDevCheck">
            确认完成检查，进入下一步
          </button>
        </div>
      </div>

      <div v-else-if="stage === 'start'" class="modal-overlay">
        <div class="startup-check-modal">
          <h2 class="modal-title">重要安全提示</h2>
          <div class="content-pad two-col-modal">
            <div class="left-col">
              <div class="alert warning">
                <Icon icon="mdi:alert" class="alert-icon" />
                <div class="alert-text">
                  <div class="alert-title">启动前确认</div>
                  <ul class="alert-list">
                    <li>请确认已完成设备运转前检查</li>
                    <li>确认试件安装牢固，工具已清理</li>
                    <li>确认工作区域无人员</li>
                    <li>确认振动传感器安装牢固</li>
                    <li>启动后请勿随意中断测试程序</li>
                  </ul>
                </div>
              </div>
            </div>

            <div class="right-col">
              <div class="card-block">
                <div class="block-title">当前工单详情</div>
                <div class="kv">
                  <div class="k">工单号</div><div class="v">{{ currentWorkOrder?.id }}</div>
                  <div class="k">设备名称</div><div class="v">{{ currentWorkOrder?.device }}</div>
                  <div class="k">振动量级</div><div class="v">{{ currentWorkOrder?.level }}</div>
                  <div class="k">测试时长</div><div class="v">{{ currentWorkOrder?.duration }} 分钟</div>
                  <div class="k">测试类型</div><div class="v">{{ currentWorkOrder?.type }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="cancel-btn" @click="goPrevStage">返回</button>
            <button class="next-btn" @click="goNextStage">确认启动振动台</button>
          </div>
        </div>
      </div>

      <div v-else-if="stage === 'calibration'" class="panel-card test-panel-full">
        <div class="cal-tabs">
          <button
            class="cal-tab"
            :class="{ active: calStep === 'amp' }"
            @click="setCalStep('amp')"
          >
            ① 振级校验
          </button>
          <button
            class="cal-tab"
            :class="{ active: calStep === 'dur' }"
            @click="setCalStep('dur')"
          >
            ② 时长校验
          </button>
        </div>

        <div v-if="calStep === 'amp'" class="cal-layout">
          <div class="cal-main">
            <div class="cal-title">振级校验</div>
            <div class="camera-feed-box">
              <div class="scan-line-anim"></div>
              <div class="cam-label">LIVE · 振动台主控界面采集</div>
            </div>
            <div class="alert info mt-4">
              <Icon icon="mdi:information" class="alert-icon blue" />
              <div class="alert-text">
                请在振动台主控计算机上切换到振级输入界面，参照右侧工单信息正确设定振动量级参数，确认无误后点击下一步。
              </div>
            </div>
            <div class="alert warning mt-2">
              <Icon icon="mdi:alert" class="alert-icon" />
              <div class="alert-text">
                <strong>重要：</strong>振级设置必须与工单信息完全一致，设置错误可能导致试件损坏或测试结果不准确。
              </div>
            </div>
            <button class="btn btn-primary btn-lg mt-4 full-width" @click="setCalStep('dur')">
              下一步：时长校验
            </button>
          </div>
          
          <div class="cal-side">
             <div class="card">
              <div class="card-header"><h3 class="card-title">工单详细信息</h3></div>
              <div class="info-body">
                <div class="info-sec-title">基本信息</div>
                <div class="kv-row"><span class="k">工单编号</span><span class="v">{{ currentWorkOrder?.id }}</span></div>
                <div class="kv-row"><span class="k">申请人</span><span class="v">{{ currentWorkOrder?.applicant }}</span></div>
                <div class="kv-row"><span class="k">联系电话</span><span class="v">{{ currentWorkOrder?.phone }}</span></div>
                
                <div class="info-sec-title mt-4">测试参数</div>
                <div class="kv-row"><span class="k">振动量级</span><span class="v highlight">{{ currentWorkOrder?.level }}</span></div>
                <div class="kv-row"><span class="k">振动时长</span><span class="v highlight">{{ currentWorkOrder?.duration }} 分钟</span></div>
                <div class="kv-row"><span class="k">测试类型</span><span class="v">{{ currentWorkOrder?.type }}</span></div>
                <div class="kv-row"><span class="k">振动方向</span><span class="v">Z轴</span></div>
                <div class="kv-row"><span class="k">频率范围</span><span class="v">5~2000Hz</span></div>

                <div class="info-sec-title mt-4">设备信息</div>
                <div class="kv-row"><span class="k">设备名称</span><span class="v">{{ currentWorkOrder?.device }}</span></div>
                <div class="kv-row"><span class="k">数量</span><span class="v">1 台</span></div>
                
                <div class="alert warning small mt-4">
                   <Icon icon="mdi:alert" class="alert-icon small" />
                   <span>请核对振级参数设置</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="calStep === 'dur'" class="cal-layout">
          <div class="cal-main">
            <div class="cal-title">振动时长校验</div>
            <div class="camera-feed-box">
              <div class="scan-line-anim"></div>
              <div class="cam-label">LIVE · 振动时长设置界面采集</div>
            </div>
            <div class="alert info mt-4">
              <Icon icon="mdi:information" class="alert-icon blue" />
              <div class="alert-text">
                请在振动台主控计算机上切换到时长设置界面，参照工单信息正确设定振动时长，确认后点击完成校验。
              </div>
            </div>
            <div class="alert warning mt-2">
              <Icon icon="mdi:alert" class="alert-icon" />
              <div class="alert-text">
                时长设置不正确将导致测试时间不准确，影响测试结果的有效性。
              </div>
            </div>
            <div class="btn-row mt-4">
              <button class="btn btn-secondary flex-1" @click="setCalStep('amp')">上一步</button>
              <button class="btn btn-primary flex-2" @click="goNextStage">
               完成校验，进入振动测试
              </button>
            </div>
          </div>
          <div class="cal-side">
            <div class="card">
              <div class="card-header"><h3 class="card-title">时长校验</h3></div>
              <div class="info-body">
                <div class="dur-box">
                  <div class="dur-label">工单要求时长</div>
                  <div class="dur-val">{{ currentWorkOrder?.duration }}</div>
                  <div class="dur-unit">分钟</div>
                </div>
                
                <div class="alert warning small">
                   <Icon icon="mdi:alert" class="alert-icon small" />
                   <span>请核对时长设置</span>
                </div>

                <div class="info-sec-title mt-4">其他参数参考</div>
                <div class="kv-row"><span class="k">振动量级</span><span class="v">{{ currentWorkOrder?.level }}</span></div>
                <div class="kv-row"><span class="k">振动方向</span><span class="v">Z轴</span></div>
                <div class="kv-row"><span class="k">设备名称</span><span class="v">{{ currentWorkOrder?.device }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="stage === 'testing'" class="panel-card test-panel-full">
        <!-- Status bar -->
        <div class="status-grid">
          <div class="status-box">
            <div class="status-header">⚡ 振动状态</div>
            <div class="status-row"><span class="label">振动量级</span><span class="value orange">{{ liveLevel }}</span></div>
            <div class="status-row mt-1"><span class="label">频率</span><span class="value cyan">{{ liveFreq }}</span></div>
          </div>
          <div class="status-box">
            <div class="status-header">📡 采集状态</div>
            <div class="status-row"><span class="label">已采集</span><span class="value green">{{ vibDataCount }} 条</span></div>
            <div class="status-row mt-1"><span class="label">测试时长</span><span class="value white">{{ formattedDuration }}</span></div>
          </div>
          <div class="status-box">
            <div class="status-header">⏱ 系统状态</div>
            <div class="status-row"><span class="label">测试状态</span><span class="badge badge-green">{{ isRunning ? '● 运行中' : '● 已停止' }}</span></div>
            <div class="file-info">📁 {{ liveFileName }}</div>
          </div>
        </div>
        
        <!-- Chart + info -->
        <div class="test-layout">
          <div class="card chart-card">
            <div class="card-header">
              <h3 class="card-title">📈 实时振动波形</h3>
              <div class="chart-legend">
                <span class="cyan">■ CH1 响应</span>
                <span class="amber">■ CH2 驱动</span>
              </div>
            </div>
            <div class="chart-body">
              <canvas id="test-osc-canvas" style="width:100%;height:100%;display:block"></canvas>
              <div class="camera-label">实时波形显示区域</div>
            </div>
          </div>
          
          <div class="side-info">
            <div class="card">
              <div class="card-header"><h3 class="card-title">📋 当前工单</h3></div>
              <div class="info-body">
                <div v-if="currentWorkOrder" class="wo-info">
                  <div>{{ currentWorkOrder.id }}</div>
                  <div class="sub">{{ currentWorkOrder.device }}</div>
                </div>
                <div v-else class="text-muted">未选择工单</div>
              </div>
            </div>
            
            <div class="card">
              <div class="card-header"><h3 class="card-title">📊 实时参数</h3></div>
              <div class="info-body">
                <div class="param-grid">
                  <div class="param-box"><div class="label">X轴加速度</div><div class="val red">{{ liveAx }}</div></div>
                  <div class="param-box"><div class="label">Y轴加速度</div><div class="val cyan">{{ liveAy }}</div></div>
                  <div class="param-box full"><div class="label">Z轴加速度</div><div class="val amber">{{ liveAz }}</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="test-controls">
          <button class="test-btn pause" v-if="isRunning" @click="pauseVibTest">⏸ 测试暂停</button>
          <button class="test-btn pause" v-else @click="resumeVibTest">▶ 继续测试</button>
          <button class="test-btn stop" @click="showAbortWarning = true">⏹ 测试中止</button>
          <button class="test-btn end" @click="endVibTest">{{ testMode === 'pre' ? '🔬 预试验结束' : '✅ 测试结束' }}</button>
        </div>
      </div>

      <div v-else-if="stage === 'report'" class="modal-overlay">
        <div class="startup-check-modal" style="max-width: 700px; width: 95vw;">
          <div class="modal-header-simple">
            <h3>报告处理（{{ reportProgress }}%）</h3>
            <button class="modal-close-simple" @click="stage = 'testing'">×</button>
          </div>
          <div class="content-pad">
            <div class="alert info" style="margin-bottom:12px">
              <Icon icon="mdi:information" class="alert-icon blue" />
              <div class="alert-text">点击“生成文件”后将依次生成 CSV/PNG/DOC，占位文件会自动下载以便保存。</div>
            </div>
            <div class="kv" style="margin-top:8px">
              <div class="k">{{ reportFiles[0].name }}</div><div class="v">{{ reportFiles[0].status }}</div>
              <div class="k">{{ reportFiles[1].name }}</div><div class="v">{{ reportFiles[1].status }}</div>
              <div class="k">{{ reportFiles[2].name }}</div><div class="v">{{ reportFiles[2].status }}</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="stage = 'testing'">返回测试</button>
            <button class="next-btn" :disabled="fileGenRunning" @click="startFileGen">生成文件</button>
            <button class="next-btn" :disabled="!allFilesDone" @click="stage = 'shutdown'">下一步：关机检查</button>
          </div>
        </div>
      </div>

      <div v-else class="modal-overlay">
        <div class="startup-check-modal" style="max-width: 700px; width: 95vw;">
          <h2 class="modal-title">关机检查</h2>
          <div class="check-list-container">
            <div class="check-list">
              <label
                v-for="item in shutdownChecks"
                :key="item.id"
                class="check-item"
                :class="{ 'is-checked': item.checked }"
              >
                <div class="checkbox-wrapper">
                  <input type="checkbox" :checked="item.checked" @change="item.checked = !item.checked" />
                  <div class="custom-checkbox">
                    <Icon v-if="item.checked" icon="mdi:check" />
                  </div>
                </div>
                <span class="check-text">{{ item.text }}</span>
              </label>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="goPrevStage">上一步</button>
            <button class="next-btn" :disabled="!shutdownChecks.every(i => i.checked)" @click="finishShutdown">完成并返回看板</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showSafetyWarning" class="modal-overlay">
      <div class="startup-check-modal">
        <h2 class="modal-title">安全警告</h2>
        <div class="hint" style="margin-bottom: 12px;">存在未通过检查项，确认继续可能存在安全风险。</div>
        <div class="modal-actions">
          <button class="cancel-btn" @click="showSafetyWarning = false">取消</button>
          <button class="next-btn" @click="continueAfterSafetyWarning">确认继续</button>
        </div>
      </div>
    </div>
    <div v-if="showConfirmStartModal" class="modal-overlay">
      <div class="startup-check-modal" style="width: 460px;">
        <div class="modal-header-simple">
          <h3>⚠️ 确认启动振动台</h3>
          <button class="modal-close-simple" @click="showConfirmStartModal = false">×</button>
        </div>
        <div class="content-pad">
          <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:14px">请确认以下准备工作已全部完成：</div>
          <ul style="list-style:none;padding:0;margin-bottom:16px">
            <li style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:var(--color-text-secondary)">
              <span style="color:var(--color-accent-green);font-weight:700">✓</span>振动台运转前10项检查已完成
            </li>
            <li style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:var(--color-text-secondary)">
              <span style="color:var(--color-accent-green);font-weight:700">✓</span>试件已安装牢固，工具已清理
            </li>
            <li style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:var(--color-text-secondary)">
              <span style="color:var(--color-accent-green);font-weight:700">✓</span>工作区域已确认无人员
            </li>
            <li style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:var(--color-text-secondary)">
              <span style="color:var(--color-accent-green);font-weight:700">✓</span>操作员已在安全位置就位
            </li>
          </ul>
          <div class="alert warning" style="margin-bottom: 0;">
            <Icon icon="mdi:alert" class="alert-icon" />
            <div class="alert-text">
              <strong>注意：</strong>启动后振动台开始工作，请确保所有准备工作已完成。
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="cancel-btn" @click="showConfirmStartModal = false">取消</button>
          <button class="next-btn" @click="confirmStartVibration">确认启动</button>
        </div>
      </div>
    </div>

    <div v-if="showAbortWarning" class="modal-overlay">
      <div class="startup-check-modal" style="width: 420px;">
        <div class="modal-header-simple">
          <h3>⚠️ 测试中止确认</h3>
          <button class="modal-close-simple" @click="showAbortWarning = false">×</button>
        </div>
        <div class="content-pad">
          <div class="alert warning">
            <span class="alert-icon">⛔</span>
            <div class="alert-text"><strong>警告：</strong>测试中止将删除工单文件夹中的所有测试数据，操作不可恢复。</div>
          </div>
          <p style="font-size:13px;color:var(--color-text-secondary);line-height:1.7">
            确认中止后：<br>• 工单文件夹中的所有数据将被清空<br>• 工单状态恢复为"待测试"<br>• 页面跳转至数据看板
          </p>
        </div>
        <div class="modal-actions">
          <button class="cancel-btn" @click="showAbortWarning = false">取消</button>
          <button class="next-btn" @click="confirmAbort">确认中止</button>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
.vibration-page {
  height: 100%;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  overflow: hidden;
  /* padding: 16px; */
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.modal-header-simple {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 12px;
}


.test-panel-full {
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: var(--color-bg-primary); /* Ensure it matches panel background */
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.status-box {
  background: #1a2d42;
  border-radius: 6px;
  padding: 10px 14px;
  border: 1px solid rgba(255,255,255,0.07);
}

.status-header {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
  margin-bottom: 6px;
  font-weight: 600;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.status-row.mt-1 { margin-top: 3px; }

.status-row .label { font-size: 10px; color: rgba(255,255,255,0.45); }
.status-row .value { font-family: monospace; font-size: 16px; font-weight: 700; }
.status-row .value.orange { color: #f97316; }
.status-row .value.cyan { color: #22d3ee; font-size: 15px; }
.status-row .value.green { color: #34d399; font-size: 13px; }
.status-row .value.white { color: rgba(255,255,255,0.7); font-size: 13px; }

.file-info {
  font-size: 9px;
  color: rgba(255,255,255,0.25);
  margin-top: 5px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-layout {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.chart-card {
  display: flex;
  flex-direction: column;
}

.card-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text-primary);
}

.chart-legend {
  font-size: 11px;
  display: flex;
  gap: 10px;
}
.cyan { color: var(--color-accent-cyan, #06b6d4); }
.amber { color: var(--color-accent-amber, #f59e0b); }
.red { color: #ef4444; }

.chart-body {
  flex: 1;
  padding: 6px;
  min-height: 0;
  position: relative;
}

.camera-placeholder {
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.side-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.info-body { padding: 10px 14px; }
.text-muted { font-size: 12px; color: var(--color-text-secondary); }

.wo-info { font-size: 13px; font-weight: 600; }
.wo-info .sub { font-size: 11px; color: var(--color-text-secondary); margin-top: 2px; font-weight: 400; }

.param-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.param-box {
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  padding: 9px;
  border: 1px solid var(--color-border);
}
.param-box.full { grid-column: span 2; }

.param-box .label { font-size: 10px; color: var(--color-text-secondary); }
.param-box .val { font-size: 16px; font-weight: 700; font-family: monospace; }

.test-controls {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

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
.test-btn.end:hover { background: #059669; 
  margin: 0;
  color: var(--color-text-primary);
}

.modal-close-simple {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0 4px;
}

.modal-close-simple:hover { color: var(--color-text-primary); }

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

.platform-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
.header-title{
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
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
  color: #fff;
}

/* 待测试工单表格样式（统一视觉目检风格） */
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
.cell-applicant, .cell-param, .cell-type { color: var(--color-text-secondary); }

.priority-tag { display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.priority-tag.normal { background: rgba(59, 130, 246, 0.12); color: var(--color-accent-blue); }
.priority-tag.urgent { background: rgba(239, 68, 68, 0.12); color: #ef4444; }

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
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.order-card:active {
  cursor: grabbing;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.drag-icon {
  color: var(--color-accent-blue);
  border: 1px solid var(--color-accent-blue);
  background: rgba(59, 130, 246, 0.1);
  border-radius: 4px;
  padding: 2px;
  font-size: 16px;
  cursor: grab;
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
  font-weight: 600;
}

.order-status.normal {
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-accent-blue);
}

.order-status.urgent {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
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

.order-tags {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.pill {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
}

.pill-blue { background: rgba(59, 130, 246, 0.1); color: var(--color-accent-blue); }
.pill-purple { background: rgba(168, 85, 247, 0.1); color: var(--color-accent-purple); }

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
  font-size: 13px;
}

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
  display: flex;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.time-column-header {
  width: 80px;
  padding: 12px;
  text-align: center;
  border-right: 1px solid var(--color-border);
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.day-header {
  flex: 1;
  padding: 12px;
  text-align: center;
  border-right: 1px solid var(--color-border);
}

.day-header:last-child { border-right: none; }

.day-header.is-today {
  background: rgba(88, 166, 255, 0.1);
}

.day-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.day-date {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
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
  background: rgba(0,0,0,0.012);
}

.grid-cell.is-half-cell {
  border-top: 1px dashed rgba(0,0,0,0.05);
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

.empty-slot-hint {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.grid-cell.drag-over {
  background: rgba(88, 166, 255, 0.1) !important;
  outline: 2px dashed var(--color-accent-blue);
  outline-offset: -2px;
}

.scheduled-item {
  height: 100%;
  padding: 4px 6px;
  background: linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-cyan, #06b6d4));
  border-radius: 4px;
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  border-left: none;
  font-size: 10px;
}

.scheduled-item:hover {
  transform: scale(1.02);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.scheduled-item.is-selected {
  outline: 2px solid rgba(255,255,255,0.95);
  box-shadow: 0 0 0 3px rgba(37,99,235,0.35);
  transform: scale(1.04);
  z-index: 2;
  position: relative;
  background: linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-cyan, #06b6d4));
}

.scheduled-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.device-name {
  font-size: 11px;
  font-weight: 600;
  color: white;
  line-height: 1.2;
}

.scheduled-tag {
  font-size: 9px;
  color: rgba(255,255,255,0.9);
  font-weight: 500;
  margin-top: 2px;
}

.remove-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  padding: 0;
  font-size: 10px;
  transition: all 0.2s;
}

.remove-btn:hover {
  color: white;
  background: none;
  opacity: 1;
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

.selected-label { white-space: nowrap; }

.selected-divider { color: var(--color-border); }

.selected-device {
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
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

.flow-container {
  flex: 1;
  min-height: 0;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: auto;
}

.flow-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.flow-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.flow-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.flow-wo {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.flow-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--color-accent-blue);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border-color: var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.stepbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.step-chip {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.step-chip.active {
  background: rgba(168, 85, 247, 0.12);
  color: var(--color-accent-purple);
  border-color: rgba(168, 85, 247, 0.25);
}

.step-back {
  margin-left: auto;
}

.panel-card {
  background: var(--color-bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.panel-title {
  font-size: 15px;
  font-weight: 700;
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  margin-left: auto;
}

.progress-wrap {
  padding: 12px 16px 6px;
}

.progress-bar {
  height: 6px;
  background: var(--color-bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-accent-blue);
}

.progress-tip {
  margin-top: 8px;
  text-align: right;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.check-list {
  max-height: 360px;
  overflow: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.check-item {
  /* border: 1px solid var(--color-border); */
  border-radius: 10px;
  padding: 12px;
}

.check-item.ok {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.04);
}

.check-item.bad {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.03);
}

.check-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.check-num {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.check-text {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-primary);
  line-height: 1.5;
}

.check-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.mini-btn {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  font-weight: 600;
}

.mini-btn.active {
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.12);
  color: rgb(34, 197, 94);
}

.mini-btn.danger.active {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.12);
  color: rgb(239, 68, 68);
}

.remark {
  margin-top: 10px;
}

.remark-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  outline: none;
}

.remark-input:focus {
  border-color: var(--color-accent-blue);
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  background: var(--color-bg-secondary);
}

.panel-footer .btn-primary {
  min-width: 240px;
}

.content-pad {
  padding: 16px;
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.card-block {
  border: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  border-radius: 12px;
  padding: 16px;
}

.block-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 10px;
}

.kv {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
}

.k { font-size: 12px; color: var(--color-text-secondary); }
.v { font-size: 13px; font-weight: 600; color: var(--color-text-primary); }

.hint {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.btn-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.alert {
  display: flex;
  gap: 12px;
  border-radius: 12px;
  padding: 14px 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  margin-bottom: 12px;
}

.alert.warning {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.06);
}

.alert-icon {
  font-size: 18px;
  color: #f59e0b;
  margin-top: 2px;
}

.alert-title {
  font-weight: 700;
  margin-bottom: 6px;
}

.alert-list {
  padding-left: 16px;
  line-height: 1.8;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.camera {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #0b1220;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  position: relative;
  overflow: hidden;
}

.camera-label {
  position: absolute;
  bottom: 8px;
  left: 8px;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(255,255,255,0.08);
  padding: 2px 8px;
  border-radius: 8px;
  font-family: monospace;
}

.shutdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-primary);
}

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

.two-col-modal {
  display: flex;
  gap: 24px;
}

.left-col {
  flex: 1;
}

.right-col {
  width: 300px;
}

.startup-check-modal {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border-radius: 16px;
  padding: 24px;
  max-width: 900px;
  width: 95vw;
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
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

.check-item:hover {
  background: var(--color-bg-primary);
}

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

.check-text {
  font-size: 15px;
  line-height: 1.5;
  color: var(--color-text-primary);
}

.modal-actions {
  display: flex;
  gap: 16px;
}

.cancel-btn,
.next-btn {
  flex: 1;
  padding: 12px;
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

.cancel-btn:hover {
  background: var(--color-bg-tertiary);
}

.next-btn {
  border: none;
  background: var(--color-accent-blue);
  color: white;
}

.next-btn:hover:not(:disabled) {
 background: #3b82f6;
  transform: scale(1.02); /* 这里设置了放大 1.02 倍 */
}

.next-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Calibration Styles */
.cal-tabs {
  display: flex;
  gap: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 14px;
  width: fit-content;
}

.cal-tab {
  padding: 8px 24px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.cal-tab.active {
  background: var(--color-accent-blue);
  color: white;
}

.cal-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 20px;
  height: 100%;
}

.cal-main {
  display: flex;
  flex-direction: column;
}

.cal-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 14px;
}

.camera-feed-box {
  width: 100%;
  max-width: 520px;
  height: 220px;
  background: #000;
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}

.scan-line-anim {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: rgba(0, 255, 0, 0.5);
  box-shadow: 0 0 4px rgba(0, 255, 0, 0.8);
  animation: scan 2s linear infinite;
}

@keyframes scan {
  0% { top: 0; }
  100% { top: 100%; }
}

.cam-label {
  position: absolute;
  bottom: 8px;
  left: 8px;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  background: rgba(0,0,0,0.25);
  padding: 2px 8px;
  border-radius: 4px;
}

.mt-4 { margin-top: 16px; }
.mt-2 { margin-top: 8px; }
.full-width { width: 100%; max-width: 520px; }
.flex-1 { flex: 1; }
.flex-2 { flex: 2; }

.alert.info {
  border-color: rgba(6, 182, 212, 0.3);
  background: rgba(6, 182, 212, 0.06);
}
.alert-icon.blue { color: var(--color-accent-cyan); }

.info-sec-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
  border-left: 3px solid var(--color-accent-blue);
  padding-left: 6px;
}

.kv-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
}
.kv-row .v.highlight {
  color: var(--color-accent-blue);
  font-weight: 700;
}

.alert.small {
  padding: 8px;
  font-size: 11px;
  align-items: center;
}
.alert-icon.small { font-size: 14px; }

.dur-box {
  background: rgba(6, 182, 212, 0.1);
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  margin-bottom: 16px;
}

.dur-label { font-size: 11px; color: var(--color-text-secondary); margin-bottom: 6px; }
.dur-val { font-size: 36px; font-weight: 700; color: var(--color-accent-cyan); font-family: monospace; }
.dur-unit { font-size: 14px; color: var(--color-text-secondary); }

.test-panel-full {
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: var(--color-bg-primary); 
  height: 100%;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.status-box {
  background: #1a2d42;
  border-radius: 6px;
  padding: 10px 14px;
  border: 1px solid rgba(255,255,255,0.07);
}

.status-header {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
  margin-bottom: 6px;
  font-weight: 600;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.status-row.mt-1 { margin-top: 3px; }

.status-row .label { font-size: 10px; color: rgba(255,255,255,0.45); }
.status-row .value { font-family: monospace; font-size: 16px; font-weight: 700; }
.status-row .value.orange { color: #f97316; }
.status-row .value.cyan { color: #22d3ee; font-size: 15px; }
.status-row .value.green { color: #34d399; font-size: 13px; }
.status-row .value.white { color: rgba(255,255,255,0.7); font-size: 13px; }

.file-info {
  font-size: 9px;
  color: rgba(255,255,255,0.25);
  margin-top: 5px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-layout {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.chart-card {
  display: flex;
  flex-direction: column;
}

.card-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text-primary);
}

.chart-legend {
  font-size: 11px;
  display: flex;
  gap: 10px;
}
.cyan { color: var(--color-accent-cyan, #06b6d4); }
.amber { color: var(--color-accent-amber, #f59e0b); }
.red { color: #ef4444; }

.chart-body {
  flex: 1;
  padding: 6px;
  min-height: 0;
  position: relative;
}

.camera-placeholder {
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.side-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.info-body { padding: 10px 14px; }
.text-muted { font-size: 12px; color: var(--color-text-secondary); }

.wo-info { font-size: 13px; font-weight: 600; }
.wo-info .sub { font-size: 11px; color: var(--color-text-secondary); margin-top: 2px; font-weight: 400; }

.param-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.param-box {
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  padding: 9px;
  border: 1px solid var(--color-border);
}
.param-box.full { grid-column: span 2; }

.param-box .label { font-size: 10px; color: var(--color-text-secondary); }
.param-box .val { font-size: 16px; font-weight: 700; font-family: monospace; }

.test-controls {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-shrink: 0;
}

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
</style>