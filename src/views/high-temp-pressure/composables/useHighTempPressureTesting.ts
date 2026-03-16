import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import * as echarts from 'echarts'
import type { HighTempPressureModal, HighTempPressurePanel } from '../types'

export function useHighTempPressureTesting() {
  const currentPanel = ref<HighTempPressurePanel>('dashboard')
  const activeModal = ref<HighTempPressureModal>(null)
  const testRunning = ref(false)
  const testStartTime = ref<number | null>(null)
  const csvCount = ref(0)
  const onlineSeconds = ref(54)
  const onlineTimerStr = ref('0时0分54秒')

  const state = reactive({
    chartData: {
      t1: [] as number[],
      t2: [] as number[],
      p: [] as number[],
    },
  })

  let timerInterval: number | null = null
  let testInterval: number | null = null
  let chartInst: echarts.ECharts | null = null

  function initChart() {
    const el = document.getElementById('htp-chart')
    if (!el) return
    chartInst = echarts.init(el)
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

  function pushMockData() {
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
  }

  function switchPanel(panel: HighTempPressurePanel) {
    currentPanel.value = panel
  }

  function showModal(name: Exclude<HighTempPressureModal, null>) {
    activeModal.value = name
  }

  function closeModal() {
    activeModal.value = null
  }

  function confirmStart() {
    closeModal()
    testRunning.value = true
    testStartTime.value = Date.now()
    switchPanel('testing')
    nextTick(() => initChart())
    if (testInterval) clearInterval(testInterval)
    testInterval = window.setInterval(() => {
      pushMockData()
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
    testInterval = window.setInterval(() => {
      pushMockData()
    }, 1000)
  }

  function stopTest() {
    if (testInterval) clearInterval(testInterval)
    testInterval = null
    testRunning.value = false
    closeModal()
    switchPanel('dashboard')
  }

  function endTest() {
    if (testInterval) clearInterval(testInterval)
    testInterval = null
    testRunning.value = false
    closeModal()
    switchPanel('report')
  }

  onMounted(() => {
    timerInterval = window.setInterval(() => {
      onlineSeconds.value++
      const h = Math.floor(onlineSeconds.value / 3600)
      const m = Math.floor((onlineSeconds.value % 3600) / 60)
      const s = onlineSeconds.value % 60
      onlineTimerStr.value = `${h}时${m}分${s}秒`
    }, 1000)
  })

  onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval)
    if (testInterval) clearInterval(testInterval)
    if (chartInst) {
      chartInst.dispose()
      chartInst = null
    }
  })

  return {
    currentPanel,
    activeModal,
    testRunning,
    testStartTime,
    csvCount,
    onlineSeconds,
    onlineTimerStr,
    state,
    switchPanel,
    showModal,
    closeModal,
    confirmStart,
    pauseTest,
    resumeTest,
    stopTest,
    endTest,
  }
}
