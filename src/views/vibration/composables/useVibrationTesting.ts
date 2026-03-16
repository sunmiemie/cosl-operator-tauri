import { computed, nextTick, onUnmounted, ref } from 'vue'
import type { WorkOrder } from '../types'

interface UseVibrationTestingOptions {
  getCurrentWorkOrder: () => WorkOrder | null
  getTestMode: () => 'formal' | 'pre'
  onFinishToReport: () => void
  onFinishToDashboard: () => void
}

export function useVibrationTesting(options: UseVibrationTestingOptions) {
  const vibTestSeconds = ref(0)
  const vibDataCount = ref(0)
  let vibTestInterval: number | undefined
  const isRunning = ref(false)

  const liveLevel = ref('-- G')
  const liveFreq = ref('-- Hz')
  const liveAx = ref('--.-g')
  const liveAy = ref('--.-g')
  const liveAz = ref('--.-g')
  const liveFileName = ref('振动测试数据.csv')
  const showAbortWarning = ref(false)

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
      const t = (now - start) / 1000
      const base = options.getCurrentWorkOrder() ? parseFloat(options.getCurrentWorkOrder()!.level) : 8
      const freq = 19.5 + Math.sin(t * 0.6) * 1.5
      const kx = (x: number) => (x / width) * Math.PI * 2 * freq
      const amp1 = base * 4.2
      const amp2 = base * 3.3
      oscCtx.strokeStyle = '#06b6d4'
      oscCtx.lineWidth = 2
      oscCtx.beginPath()
      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(kx(x) + t * 2.1) * (amp1 / 10) + 0.3 * Math.sin(2 * kx(x) + t * 3.2) * (amp1 / 12) + (Math.random() - 0.5) * 1.5
        if (x === 0) oscCtx.moveTo(x, y)
        else oscCtx.lineTo(x, y)
      }
      oscCtx.stroke()
      oscCtx.strokeStyle = '#f59e0b'
      oscCtx.beginPath()
      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.cos(kx(x) + t * 1.7 + 0.6) * (amp2 / 10) + 0.2 * Math.sin(3 * kx(x) + t * 2.4) * (amp2 / 13) + (Math.random() - 0.5) * 1.5
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

  function startVibTestMonitor() {
    if (vibTestInterval) clearInterval(vibTestInterval)
    vibTestSeconds.value = 0
    vibDataCount.value = 0
    isRunning.value = true

    const wo = options.getCurrentWorkOrder()
    const level = wo ? parseFloat(wo.level) : 8
    liveFileName.value = wo ? `${wo.id}_${wo.device}_振动测试数据.csv` : '振动测试数据.csv'

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
    const wo = options.getCurrentWorkOrder()
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
    options.onFinishToReport()
  }

  function endVibTest() {
    if (vibTestInterval) {
      clearInterval(vibTestInterval)
      vibTestInterval = undefined
    }
    stopOscilloscope()
    isRunning.value = false
    if (options.getTestMode() === 'pre') options.onFinishToDashboard()
    else options.onFinishToReport()
  }

  function confirmAbort() {
    showAbortWarning.value = false
    if (vibTestInterval) {
      clearInterval(vibTestInterval)
      vibTestInterval = undefined
    }
    stopOscilloscope()
    isRunning.value = false
    if (options.getTestMode() === 'pre') options.onFinishToDashboard()
    else options.onFinishToReport()
  }

  function getOscCanvas() {
    return oscCanvas
  }

  onUnmounted(() => {
    if (vibTestInterval) clearInterval(vibTestInterval)
    stopOscilloscope()
  })

  return {
    vibTestSeconds,
    vibDataCount,
    isRunning,
    liveLevel,
    liveFreq,
    liveAx,
    liveAy,
    liveAz,
    liveFileName,
    showAbortWarning,
    formattedDuration,
    startVibTestMonitor,
    pauseVibTest,
    resumeVibTest,
    stopTesting,
    endVibTest,
    confirmAbort,
    getOscCanvas,
  }
}
