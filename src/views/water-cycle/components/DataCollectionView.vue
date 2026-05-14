<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import * as echarts from 'echarts'

import {
  COLLECTION_CHANNELS,
  collectionTime,
  extractNumber,
  finishTestSession,
  formatDuration,
  getConfidenceLevel,
  isPaused,
  logs,
  measurementHistory,
  ocrConfidence,
  pushMeasurementRecord,
  realTimeData,
  roiRegions,
  selectedOrder,
  startTestSession,
  testEndedAt,
} from '../composables/useTestStore'

const props = defineProps<{ camera: any; ocr: any }>()
const emit = defineEmits<{
  finish: []
}>()

const activeCollectionChannels = ref<Record<string, boolean>>(
  COLLECTION_CHANNELS.reduce((acc, channel) => ({ ...acc, [channel.id]: true }), {})
)

const stepItems = [
  { key: 'schedule', label: '开始测试', status: 'done' },
  { key: 'startup', label: '运行前检查', status: 'done' },
  { key: 'monitor', label: '摄像头画面监控', status: 'done' },
  { key: 'collect', label: '生成曲线', status: 'active' },
  { key: 'report', label: '截取/保存', status: 'pending' },
] as const

const chartRef = ref<HTMLDivElement | null>(null)
let chartInst: echarts.ECharts | null = null
let dataTimer: ReturnType<typeof setInterval> | null = null
let ocrTimer: ReturnType<typeof setInterval> | null = null
let ocrBusy = false

const activeChannelList = computed(() =>
  COLLECTION_CHANNELS.filter((channel) => activeCollectionChannels.value[channel.id])
)
const dataStatusText = computed(() => (isPaused.value ? '已暂停' : '进行中'))
const dataStatusClass = computed(() => (isPaused.value ? 'paused' : 'running'))
const latestLogText = computed(() => logs.value[logs.value.length - 1]?.msg || '等待采集')
const sampleCount = computed(() => measurementHistory.value.length)

function appendLog(message: string) {
  logs.value.push({
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    msg: message,
  })
}

function initChart() {
  if (!chartRef.value) return
  chartInst = echarts.init(chartRef.value)
  updateChart()
}

function updateChart() {
  if (!chartInst) return

  const xAxisData = measurementHistory.value.map((item) => item.timeLabel)
  const series = activeChannelList.value.map((channel) => ({
    name: channel.name,
    type: 'line',
    smooth: true,
    symbol: 'none',
    lineStyle: {
      width: 2,
      color: channel.color,
    },
    itemStyle: {
      color: channel.color,
    },
    data: measurementHistory.value.map((item) => item.values[channel.id]),
  }))

  chartInst.setOption({
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.88)',
      borderWidth: 0,
      textStyle: { color: '#e2e8f0' },
    },
    legend: {
      top: 0,
      textStyle: { color: '#94a3b8' },
      data: activeChannelList.value.map((channel) => channel.name),
    },
    grid: {
      left: 36,
      right: 18,
      top: 42,
      bottom: 28,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData,
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    series,
  })
}

function stopTimers() {
  if (dataTimer) {
    clearInterval(dataTimer)
    dataTimer = null
  }
  if (ocrTimer) {
    clearInterval(ocrTimer)
    ocrTimer = null
  }
  ocrBusy = false
}

function tick() {
  collectionTime.value += 1
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  pushMeasurementRecord(timeLabel)
  if (collectionTime.value % 10 === 0) appendLog('采集心跳正常')
  updateChart()
}

function startDataLoop() {
  if (dataTimer || testEndedAt.value) return
  dataTimer = setInterval(tick, 1000)
}

async function startOcrRecognition() {
  if (ocrTimer || testEndedAt.value) return
  const regions = Object.values(roiRegions.value)
  if (!regions.length) {
    if (!logs.value.some((item) => item.msg.includes('未配置 ROI'))) {
      appendLog('未配置 ROI，无 OCR 数据接入')
    }
    return
  }

  await props.ocr.initialize()
  await props.ocr.setRegions(regions)

  ocrTimer = setInterval(async () => {
    if (ocrBusy || !props.camera.currentFrame.value || isPaused.value || testEndedAt.value) return
    ocrBusy = true
    try {
      const result = await props.ocr.recognizeRegions(props.camera.currentFrame.value)
      if (!result) return
      result.regions.forEach((region: any) => {
        ocrConfidence.value[region.id] = region.confidence
        const numericValue = extractNumber(region.text)
        if (numericValue !== null) realTimeData.value[region.id] = numericValue
      })
    } finally {
      ocrBusy = false
    }
  }, 2000)
}

function startCollection() {
  startTestSession()

  if (!measurementHistory.value.length && collectionTime.value === 0) {
    logs.value = []
    appendLog('开始数据采集')
  }

  isPaused.value = false
  startDataLoop()
  void startOcrRecognition()
  updateChart()
}

function togglePause() {
  if (testEndedAt.value) return
  if (isPaused.value) {
    isPaused.value = false
    appendLog('继续采集')
    startDataLoop()
    void startOcrRecognition()
  } else {
    isPaused.value = true
    appendLog('暂停采集')
    stopTimers()
  }
}

function handleFinish() {
  if (testEndedAt.value) return
  stopTimers()
  isPaused.value = true
  finishTestSession()
  appendLog('测试结束，等待生成报告')
  updateChart()
  emit('finish')
}

function toggleChannel(channelId: string) {
  activeCollectionChannels.value[channelId] = !activeCollectionChannels.value[channelId]
  updateChart()
}

function handleResize() {
  chartInst?.resize()
}

onMounted(() => {
  nextTick(() => {
    initChart()
    handleResize()
  })
  if (!testEndedAt.value) startCollection()
  else updateChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  stopTimers()
  window.removeEventListener('resize', handleResize)
  chartInst?.dispose()
  chartInst = null
})
</script>

<template>
  <div class="collection-container">
    <div class="step-card">
      <div class="step-title">测试执行流程</div>
      <div class="step-list">
        <div v-for="(step, index) in stepItems" :key="step.key" class="step-item">
          <div class="step-node" :class="`is-${step.status}`">
            <Icon v-if="step.status === 'done'" icon="mdi:check" />
            <span v-else>{{ index + 1 }}</span>
          </div>
          <span class="step-label" :class="`is-${step.status}`">{{ step.label }}</span>
          <div v-if="index < stepItems.length - 1" class="step-line" :class="{ done: step.status !== 'pending' }"></div>
        </div>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">任务单号</span>
        <span class="summary-value highlight">{{ selectedOrder?.taskNumber || '--' }}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">测试设备</span>
        <span class="summary-value">{{ selectedOrder?.deviceName || '--' }}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">流程长度</span>
        <span class="summary-value accent">{{ selectedOrder?.flowProcess || '--' }}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">已用时长</span>
        <span class="summary-value cyan">{{ formatDuration(collectionTime) }}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">数据采集</span>
        <span class="status-pill" :class="dataStatusClass">
          <span class="status-dot"></span>
          {{ dataStatusText }}
        </span>
      </div>
    </div>

    <div class="channel-card">
      <div class="channel-card-head">
        <div class="channel-title">采集通道选择</div>
        <div class="channel-meta">
          <span>样本数 {{ sampleCount }}</span>
          <span>最近日志：{{ latestLogText }}</span>
        </div>
      </div>
      <div class="channel-chip-list">
        <button
          v-for="channel in COLLECTION_CHANNELS"
          :key="channel.id"
          class="channel-chip"
          :class="{ active: activeCollectionChannels[channel.id] }"
          :style="activeCollectionChannels[channel.id] ? { '--chip-color': channel.color } : {}"
          @click="toggleChannel(channel.id)"
        >
          <span class="chip-dot" :style="{ background: channel.color }"></span>
          {{ channel.name }}
        </button>
      </div>
    </div>

    <div class="collection-main">
      <div class="chart-card">
        <div class="panel-header">
          <div class="panel-title">实时数据曲线</div>
          <div class="panel-extra">当前显示 {{ activeChannelList.length }} 个通道</div>
        </div>
        <div ref="chartRef" class="chart-container"></div>
      </div>

      <div class="log-card">
        <div class="panel-header">
          <div class="panel-title">操作日志</div>
          <div class="panel-extra">{{ logs.length }} 条</div>
        </div>
        <div class="log-list">
          <div v-if="!logs.length" class="log-empty">暂无日志记录</div>
          <div v-for="(log, index) in logs" :key="`${log.time}-${index}`" class="log-item">
            <span class="log-time">{{ log.time }}</span>
            <span class="log-msg">{{ log.msg }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="data-grid">
      <div v-for="channel in activeChannelList" :key="channel.id" class="data-card">
        <div class="data-card-head">
          <span>{{ channel.name }}</span>
          <span class="confidence-dot" :class="getConfidenceLevel(channel.id)"></span>
        </div>
        <div class="data-value" :style="{ color: channel.color }">
          {{ realTimeData[channel.id] ?? '--' }}
          <small>{{ channel.unit }}</small>
        </div>
      </div>
    </div>

    <div class="collection-footer">
      <button class="btn-pause" @click="togglePause">
        <Icon :icon="isPaused ? 'mdi:play' : 'mdi:pause'" />
        {{ isPaused ? '继续采集' : '暂停采集' }}
      </button>
      <button class="btn-stop" @click="handleFinish">
        <Icon icon="mdi:stop-circle-outline" />
        结束测试
      </button>
    </div>
  </div>
</template>

<style scoped>
.collection-container { display:flex; flex-direction:column; gap:16px; min-height:0; flex:1; overflow-y:auto; padding-right:6px; }
.step-card,
.summary-card,
.channel-card,
.chart-card,
.log-card,
.data-card { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:16px; }
.step-card { padding:18px 22px; }
.step-title { font-size:14px; font-weight:700; color:var(--color-text-primary); margin-bottom:16px; }
.step-list { display:flex; align-items:center; justify-content:space-between; gap:10px; overflow:auto; }
.step-item { display:flex; align-items:center; gap:10px; min-width:max-content; }
.step-node { width:34px; height:34px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; border:1px solid var(--color-border); color:var(--color-text-secondary); background:var(--color-bg-primary); }
.step-node.is-done { background:#22c55e; border-color:#22c55e; color:#fff; }
.step-node.is-active { background:var(--color-accent-blue); border-color:var(--color-accent-blue); color:#fff; }
.step-label { font-size:13px; color:var(--color-text-secondary); }
.step-label.is-done { color:#22c55e; font-weight:600; }
.step-label.is-active { color:var(--color-accent-blue); font-weight:700; }
.step-line { width:42px; height:2px; background:var(--color-border); border-radius:999px; }
.step-line.done { background:linear-gradient(90deg, #22c55e, var(--color-accent-blue)); }
.summary-grid { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:16px; }
.summary-card { padding:16px 18px; display:flex; flex-direction:column; gap:8px; }
.summary-label { font-size:12px; color:var(--color-text-secondary); }
.summary-value { font-size:18px; font-weight:700; color:var(--color-text-primary); }
.summary-value.highlight { color:var(--color-accent-blue); }
.summary-value.accent { color:#8b5cf6; }
.summary-value.cyan { color:#06b6d4; }
.status-pill { display:inline-flex; align-items:center; gap:8px; padding:6px 12px; width:max-content; border-radius:999px; font-size:13px; font-weight:600; }
.status-pill.running { background:rgba(34,197,94,.14); color:#16a34a; }
.status-pill.paused { background:rgba(249,115,22,.14); color:#ea580c; }
.status-dot { width:8px; height:8px; border-radius:999px; background:currentColor; }
.channel-card { padding:16px 18px; }
.channel-card-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:14px; }
.channel-title { font-size:14px; font-weight:700; color:var(--color-text-primary); }
.channel-meta { display:flex; gap:16px; font-size:12px; color:var(--color-text-secondary); }
.channel-chip-list { display:flex; flex-wrap:wrap; gap:10px; }
.channel-chip { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid var(--color-border); border-radius:999px; background:var(--color-bg-primary); color:var(--color-text-secondary); cursor:pointer; transition:all .2s ease; }
.channel-chip.active { color:var(--chip-color); border-color:var(--chip-color); background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 1px rgba(255,255,255,.04); }
.chip-dot { width:8px; height:8px; border-radius:999px; }
.collection-main { display:flex; gap:16px; min-height:0; align-items:stretch; flex:0 0 auto; position:relative; z-index:2; isolation:isolate; }
.chart-card,
.log-card { overflow:hidden; display:flex; flex-direction:column; min-height:392px; position:relative; z-index:2; }
.chart-card { flex:2 1 0; min-width:0; }
.log-card { flex:1 1 360px; min-width:320px; }
.panel-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px; border-bottom:1px solid var(--color-border); background:var(--color-bg-tertiary); }
.panel-title { font-size:14px; font-weight:700; color:var(--color-text-primary); }
.panel-extra { font-size:12px; color:var(--color-text-secondary); }
.chart-container { height:340px; min-height:340px; width:100%; padding:8px; background:var(--color-bg-primary); box-sizing:border-box; }
.log-list { height:340px; min-height:340px; overflow:auto; padding:16px; display:flex; flex-direction:column; gap:10px; background:var(--color-bg-primary); box-sizing:border-box; }
.log-empty { flex:1; display:flex; align-items:center; justify-content:center; color:var(--color-text-tertiary); font-size:13px; }
.log-item { display:flex; gap:12px; padding:10px 12px; border-radius:10px; background:var(--color-bg-tertiary); font-size:12px; }
.log-time { color:var(--color-text-tertiary); font-family:monospace; white-space:nowrap; }
.log-msg { color:var(--color-text-primary); }
.data-grid { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:12px; position:relative; z-index:1; flex:0 0 auto; }
.data-card { padding:14px 16px; }
.data-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; color:var(--color-text-secondary); margin-bottom:10px; }
.data-value { font-size:24px; font-weight:700; display:flex; align-items:flex-end; gap:6px; }
.data-value small { font-size:12px; color:var(--color-text-tertiary); font-weight:500; }
.confidence-dot { display:inline-block; width:10px; height:10px; border-radius:999px; background:var(--color-border); }
.confidence-dot.high { background:#22c55e; }
.confidence-dot.medium { background:#f59e0b; }
.confidence-dot.low { background:#ef4444; }
.confidence-dot.none { background:var(--color-border); }
.collection-footer { display:flex; justify-content:center; gap:16px; }
.btn-pause,
.btn-stop { min-width:220px; padding:13px 24px; border:none; border-radius:12px; font-size:15px; font-weight:700; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:all .2s ease; }
.btn-pause { background:#f97316; box-shadow:0 12px 24px rgba(249,115,22,.18); }
.btn-stop { background:var(--color-primary, #0ea5e9); box-shadow:0 12px 24px rgba(14,165,233,.18); }
.btn-pause:hover,
.btn-stop:hover { transform:translateY(-1px); opacity:.94; }
@media (max-width: 1280px) {
  .summary-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  .collection-main { flex-direction:column; }
  .log-card { min-width:0; }
  .data-grid { grid-template-columns:repeat(3, minmax(0, 1fr)); }
}
.collection-container::-webkit-scrollbar { width: 10px; }
.collection-container::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.35); border-radius: 999px; }
.collection-container::-webkit-scrollbar-track { background: transparent; }
</style>
