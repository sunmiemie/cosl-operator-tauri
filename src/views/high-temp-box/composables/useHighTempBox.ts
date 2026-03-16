import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import * as echarts from 'echarts'
import { useCamera } from '@/composables/useCamera'
import { useOcr } from '@/composables/useOcr'
import type { OcrRegion } from '@/types/ocr'

export interface WorkOrder {
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

interface TempHistoryPoint {
  time: string
  temp: number
}

export function useHighTempBox() {
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

  const currentView = ref<'dashboard' | 'test'>('dashboard')
  const currentStep = ref<'pre-check' | 'startup-guide' | 'monitoring' | 'shutdown'>('pre-check')

  const searchKeyword = ref('')
  const activeFilter = ref<'all' | 'high' | 'pending' | 'paused'>('all')

  const calBase = ref(getMonday(new Date()))
  const selectedScheduledOrder = ref<string | null>(null)
  const draggedOrderId = ref<string | null>(null)

  const scheduledTasks = ref<Record<string, ScheduledTask>>({})
  const workOrders = ref<WorkOrder[]>([
    { id: 'HT-2024-001', applicant: '张三', operator: '李四', department: '研发部', deviceName: '电子控制器', deviceId: 'ECU-2024-001', targetTemp: 85, duration: 120, createDate: '2024-01-05', status: 'pending', priority: 'high' },
    { id: 'HT-2024-002', applicant: '王五', operator: '赵六', department: '质量部', deviceName: '传感器模块', deviceId: 'SENSOR-2024-002', targetTemp: 125, duration: 180, createDate: '2024-01-06', status: 'pending', priority: 'normal' },
    { id: 'HT-2024-003', applicant: '陈七', operator: '李四', department: '研发部', deviceName: '电机驱动板', deviceId: 'MOTOR-2024-003', targetTemp: 105, duration: 90, createDate: '2024-01-07', status: 'pending', priority: 'normal' },
    { id: 'HT-2024-004', applicant: '刘八', operator: '赵六', department: '生产部', deviceName: '功率模块', deviceId: 'PWR-2024-004', targetTemp: 150, duration: 240, createDate: '2024-01-07', status: 'paused', priority: 'high' },
    { id: 'HT-2024-005', applicant: '周九', operator: '李四', department: '质量部', deviceName: '通信板卡', deviceId: 'COM-2024-005', targetTemp: 70, duration: 60, createDate: '2024-01-08', status: 'pending', priority: 'low' }
  ])

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

  const camera = useCamera()
  const ocr = useOcr()

  const ocrSetTemp = ref<number | null>(null)
  const ocrCurrentTemp = ref<number | null>(null)
  const ocrRunTime = ref<string | null>(null)

  const tempHistory = ref<TempHistoryPoint[]>([])

  const isOcrConfigMode = ref(false)
  const roiRegions = ref<Record<string, OcrRegion>>({})
  const activeRoiKey = ref<string | null>(null)

  const roiDragStart = ref<{ x: number; y: number } | null>(null)
  const roiDragCurrent = ref<{ x: number; y: number } | null>(null)

  const ocrConfidence = ref<Record<string, number>>({})

  let ocrTimer: ReturnType<typeof setInterval> | null = null
  let ocrBusy = false
  let runTimer: ReturnType<typeof setInterval> | null = null
  const runSeconds = ref(0)

  const chartRef = ref<HTMLElement | null>(null)
  let chartInstance: echarts.ECharts | null = null

  const selectedCameraIndex = ref<number>(0)
  const showCameraSelect = ref(false)

  const roiCanvasRef = ref<HTMLCanvasElement | null>(null)

  const filteredOrders = computed(() => {
    return workOrders.value.filter(order => {
      const isScheduled = Object.values(scheduledTasks.value).some(t => t.orderId === order.id)
      if (isScheduled) return false

      if (searchKeyword.value) {
        const keyword = searchKeyword.value.toLowerCase()
        const matchId = order.id.toLowerCase().includes(keyword)
        const matchApplicant = order.applicant.toLowerCase().includes(keyword)
        const matchDevice = order.deviceName.toLowerCase().includes(keyword)
        if (!matchId && !matchApplicant && !matchDevice) return false
      }

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

  function startExperiment(orderId?: string) {
    if (orderId) {
      selectedScheduledOrder.value = orderId
    }

    const selected = selectedScheduledOrderInfo.value || (selectedScheduledOrder.value ? getOrderById(selectedScheduledOrder.value) : null)
    if (!selected) return
    currentWorkOrder.value = selected
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

  function formatRunTime(seconds: number): string {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
    const s = String(seconds % 60).padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  const displayRunTime = computed(() => {
    if (ocrRunTime.value) return ocrRunTime.value
    return formatRunTime(runSeconds.value)
  })

  const displaySetTemp = computed(() => {
    if (ocrSetTemp.value !== null) return ocrSetTemp.value
    return currentWorkOrder.value?.targetTemp ?? '--'
  })

  const displayCurrentTemp = computed(() => {
    if (ocrCurrentTemp.value !== null) return ocrCurrentTemp.value
    return '--'
  })

  function getConfidenceLevel(regionId: string): 'high' | 'medium' | 'low' | 'none' {
    const conf = ocrConfidence.value[regionId]
    if (conf === undefined) return 'none'
    if (conf >= 0.8) return 'high'
    if (conf >= 0.6) return 'medium'
    return 'low'
  }

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

  async function selectAndStartCamera(index: number) {
    selectedCameraIndex.value = index
    showCameraSelect.value = false
    await camera.startCamera(index)
  }

  async function loadCachedRoi() {
    try {
      const data = await invoke<string>('read_cache', { cacheType: 'temp', id: 'ht-ocr-roi' })
      if (data) {
        const parsed = JSON.parse(data) as Record<string, OcrRegion>
        roiRegions.value = parsed
      }
    } catch {
      // ignore
    }
  }

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

  function enterRoiConfig() {
    isOcrConfigMode.value = true
    activeRoiKey.value = null
    stopOcrTimer()
  }

  function selectRoiTarget(key: string) {
    activeRoiKey.value = key
  }

  function onRoiMouseDown(e: MouseEvent) {
    if (!activeRoiKey.value || !roiCanvasRef.value) return
    const rect = roiCanvasRef.value.getBoundingClientRect()
    roiDragStart.value = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    }
    roiDragCurrent.value = { ...roiDragStart.value }
  }

  function onRoiMouseMove(e: MouseEvent) {
    if (!roiDragStart.value || !roiCanvasRef.value) return
    const rect = roiCanvasRef.value.getBoundingClientRect()
    roiDragCurrent.value = {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    }
    drawRoiOverlay()
  }

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

  function drawRoiOverlay() {
    const canvas = roiCanvasRef.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    if (isOcrConfigMode.value) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.fillRect(0, 0, width, height)
    }

    const colors: Record<string, string> = {
      setTemp: '#f59e0b',
      currentTemp: '#3b82f6',
      runTime: '#10b981'
    }

    for (const [key, region] of Object.entries(roiRegions.value)) {
      const color = colors[key] || '#888'
      const rx = region.x * width
      const ry = region.y * height
      const rw = region.width * width
      const rh = region.height * height

      if (isOcrConfigMode.value) {
        ctx.clearRect(rx, ry, rw, rh)
      }

      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(rx, ry, rw, rh)

      ctx.fillStyle = color
      ctx.font = '12px sans-serif'
      ctx.fillText(region.label || key, rx + 4, ry - 4 > 12 ? ry - 4 : ry + 14)
    }

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

  async function saveAndExitRoiConfig() {
    isOcrConfigMode.value = false
    activeRoiKey.value = null
    await saveRoiConfig()
    drawRoiOverlay()
    await startOcrRecognition()
  }

  function cancelRoiConfig() {
    isOcrConfigMode.value = false
    activeRoiKey.value = null
    roiDragStart.value = null
    roiDragCurrent.value = null
    drawRoiOverlay()
  }

  function extractNumber(text: string): number | null {
    const match = text.match(/-?\d+\.?\d*/)
    return match ? parseFloat(match[0]) : null
  }

  async function startOcrRecognition() {
    const regionList = Object.values(roiRegions.value)
    if (regionList.length === 0) return

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
            const now = new Date()
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
            tempHistory.value.push({ time: timeStr, temp: num })
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

  function stopOcrTimer() {
    if (ocrTimer) {
      clearInterval(ocrTimer)
      ocrTimer = null
    }
  }

  function startRunTimer() {
    runSeconds.value = 0
    runTimer = setInterval(() => {
      if (isRunning.value) {
        runSeconds.value++
      }
    }, 1000)
  }

  function stopRunTimer() {
    if (runTimer) {
      clearInterval(runTimer)
      runTimer = null
    }
  }

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

  function handleResize() {
    chartInstance?.resize()
    resizeRoiCanvas()
  }

  async function enterMonitoring() {
    await nextTick()
    await startMonitorCamera()
    await loadCachedRoi()
    startRunTimer()

    await nextTick()
    initChart()

    if (Object.keys(roiRegions.value).length > 0) {
      await startOcrRecognition()
    }

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

  function togglePause() {
    isRunning.value = !isRunning.value
  }

  watch(currentStep, (val, oldVal) => {
    if (val === 'monitoring') {
      enterMonitoring()
    } else if (oldVal === 'monitoring') {
      stopMonitoring()
    }
  })

  onUnmounted(() => {
    stopMonitoring()
  })

  return {
    STARTUP_GUIDE_STEPS,
    currentView,
    currentStep,
    searchKeyword,
    activeFilter,
    calBase,
    selectedScheduledOrder,
    draggedOrderId,
    scheduledTasks,
    workOrders,
    currentWorkOrder,
    preCheckItems,
    guideStepIndex,
    currentTemp,
    isRunning,
    camera,
    ocrSetTemp,
    ocrCurrentTemp,
    ocrRunTime,
    tempHistory,
    isOcrConfigMode,
    roiRegions,
    activeRoiKey,
    ocrConfidence,
    chartRef,
    selectedCameraIndex,
    showCameraSelect,
    roiCanvasRef,
    filteredOrders,
    currentWeekDays,
    weekLabel,
    timeSlots,
    selectedScheduledOrderInfo,
    isPreCheckComplete,
    prevWeek,
    nextWeek,
    gotoDate,
    fmtDate,
    getCellKey,
    getOrderById,
    loadPresetSchedule,
    removeSchedule,
    selectScheduledTask,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    startExperiment,
    backToDashboard,
    togglePreCheck,
    completePreCheck,
    nextGuideStep,
    prevGuideStep,
    stopTest,
    displayRunTime,
    displaySetTemp,
    displayCurrentTemp,
    getConfidenceLevel,
    selectAndStartCamera,
    enterRoiConfig,
    selectRoiTarget,
    onRoiMouseDown,
    onRoiMouseMove,
    onRoiMouseUp,
    saveAndExitRoiConfig,
    cancelRoiConfig,
    togglePause,
  }
}

export type HighTempBoxContext = ReturnType<typeof useHighTempBox>