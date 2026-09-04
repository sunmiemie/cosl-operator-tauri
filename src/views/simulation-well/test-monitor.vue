<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import VChart from 'vue-echarts'
import '@/utils/echarts'
import { useConfig } from '@/composables/useConfig'
import {
  connectSimulatedWellMonitor,
  getSimulatedWellMonitorSnapshot,
  getSimulatedWellWsStatus,
  stopSimulatedWellMonitorSession,
  type MonitorMetricStatus,
  type SimulatedWellMonitorCsvFile,
  type SimulatedWellMonitorSnapshot,
  type SimulatedWellWsStatus,
} from '@/services/simulated-well-monitor'

const { config, initConfig } = useConfig()

const props = defineProps<{
  workNo: string
  sessionId: string
}>()

const emit = defineEmits<{
  finished: [file: SimulatedWellMonitorCsvFile]
}>()

const wsStatus = ref<SimulatedWellWsStatus>({
  status: 'disconnected',
  connected: false,
  targetUrl: null,
  machineId: null,
  lastMessageAt: null,
  sessionId: props.sessionId,
  workNo: props.workNo,
  error: null,
})
const snapshot = ref<SimulatedWellMonitorSnapshot | null>(null)
const pageError = ref('')
const protocolError = ref('')
const ending = ref(false)
const clock = ref(Date.now())
const depthChart = ref<InstanceType<typeof VChart> | null>(null)

const DEPTH_CHART_ZOOM_LEVELS = [
  { label: '5 分钟', durationMs: 5 * 60 * 1000 },
  { label: '10 分钟', durationMs: 10 * 60 * 1000 },
  { label: '15 分钟', durationMs: 15 * 60 * 1000 },
  { label: '30 分钟', durationMs: 30 * 60 * 1000 },
  { label: '1 小时', durationMs: 60 * 60 * 1000 },
  { label: '2 小时', durationMs: 2 * 60 * 60 * 1000 },
  { label: '5 小时', durationMs: 5 * 60 * 60 * 1000 },
] as const

type DepthChartViewMode = 'auto' | 'manual' | 'all'
type DepthChartRange = { start: number; end: number }
type DepthChartRestoreState = {
  mode: Exclude<DepthChartViewMode, 'all'>
  zoomLevelIndex: number
  range: DepthChartRange | null
}

const zoomLevelIndex = ref(0)
const chartViewMode = ref<DepthChartViewMode>('auto')
const manualChartRange = ref<DepthChartRange | null>(null)
const chartRestoreState = ref<DepthChartRestoreState | null>(null)
let clockTimer: ReturnType<typeof setInterval> | null = null
let statusUnlisten: UnlistenFn | null = null
let snapshotUnlisten: UnlistenFn | null = null
let errorUnlisten: UnlistenFn | null = null
let sessionStopped = false
let allowLeave = false

const latest = computed(() => snapshot.value?.latest || null)
const displayedDepth = computed(() => {
  const current = latest.value?.service.cdepth_m
  if (typeof current === 'number' && Number.isFinite(current)) return current
  const points = snapshot.value?.points || []
  const previous = points.length ? points[points.length - 1]?.value : null
  return typeof previous === 'number' && Number.isFinite(previous) ? previous : null
})
const depthUsesPrevious = computed(() => (
  latest.value?.service.cdepth_m == null && displayedDepth.value != null
))
const lastMessageAt = computed(() => snapshot.value?.lastMessageAt || wsStatus.value.lastMessageAt || null)
const silentSeconds = computed(() => {
  if (!lastMessageAt.value) return null
  return Math.max(0, Math.floor((clock.value - lastMessageAt.value) / 1000))
})

const collectionState = computed(() => {
  if (wsStatus.value.status === 'error') {
    return { level: 'danger', title: '连接失败', detail: wsStatus.value.error || '请检查地址和服务状态' }
  }
  if (wsStatus.value.status === 'connecting') {
    return { level: 'waiting', title: '正在连接', detail: wsStatus.value.targetUrl || config.value.simulatedWellWindowAgentUrl }
  }
  if (!wsStatus.value.connected) {
    return { level: 'waiting', title: '未连接', detail: '请确认服务已启动，或点击连接重试' }
  }
  if (!lastMessageAt.value) {
    return { level: 'waiting', title: '已连接，等待首条采集数据', detail: '暂未收到有效数据' }
  }
  if ((silentSeconds.value || 0) > 15) {
    return { level: 'danger', title: '长时间未收到数据', detail: `最后数据在 ${silentSeconds.value} 秒前` }
  }
  if ((silentSeconds.value || 0) > 5) {
    return { level: 'warning', title: '数据暂时中断', detail: `最后数据在 ${silentSeconds.value} 秒前` }
  }
  return { level: 'success', title: '数据采集中', detail: `已接收 ${snapshot.value?.sampleCount || 0} 条数据` }
})

const connectionButtonDisabled = computed(() => ['connecting', 'connected'].includes(wsStatus.value.status))
const connectionButtonText = computed(() => {
  if (wsStatus.value.status === 'connecting') return '连接中…'
  if (wsStatus.value.status === 'connected') return '已连接'
  return '连接'
})

const currentZoomLevel = computed(() => DEPTH_CHART_ZOOM_LEVELS[zoomLevelIndex.value])
const isShowingAll = computed(() => chartViewMode.value === 'all')
const isFollowingLatest = computed(() => chartViewMode.value !== 'manual')
const returnToLatestDisabled = computed(() => isFollowingLatest.value)
const zoomInDisabled = computed(() => isShowingAll.value || zoomLevelIndex.value === 0)
const zoomOutDisabled = computed(() => (
  isShowingAll.value || zoomLevelIndex.value === DEPTH_CHART_ZOOM_LEVELS.length - 1
))

const depthChartBounds = computed(() => {
  const timestamps = (snapshot.value?.points || [])
    .map(point => point.timestampMs)
    .filter(timestamp => Number.isFinite(timestamp))
  if (!timestamps.length) return null
  return {
    start: Math.min(...timestamps),
    end: Math.max(...timestamps),
  }
})

function normalizeChartRange(range: DepthChartRange, spanMs: number, domain: DepthChartRange) {
  if (domain.end - domain.start <= spanMs) {
    return { start: domain.start, end: domain.start + spanMs }
  }
  const center = (range.start + range.end) / 2
  let start = center - spanMs / 2
  let end = center + spanMs / 2
  if (start < domain.start) {
    start = domain.start
    end = start + spanMs
  }
  if (end > domain.end) {
    end = domain.end
    start = end - spanMs
  }
  return { start, end }
}

const depthChartDomain = computed<DepthChartRange | null>(() => {
  const bounds = depthChartBounds.value
  if (!bounds) return null
  const requiredSpan = isShowingAll.value
    ? DEPTH_CHART_ZOOM_LEVELS[0].durationMs
    : currentZoomLevel.value.durationMs
  return {
    start: bounds.start,
    end: Math.max(bounds.end, bounds.start + requiredSpan),
  }
})

const visibleChartRange = computed<DepthChartRange | null>(() => {
  const bounds = depthChartBounds.value
  const domain = depthChartDomain.value
  if (!bounds || !domain) return null
  if (isShowingAll.value) return domain

  const spanMs = currentZoomLevel.value.durationMs
  if (chartViewMode.value === 'manual' && manualChartRange.value) {
    return normalizeChartRange(manualChartRange.value, spanMs, domain)
  }
  if (bounds.end - bounds.start <= spanMs) {
    return { start: bounds.start, end: bounds.start + spanMs }
  }
  return { start: bounds.end - spanMs, end: bounds.end }
})

function changeZoomLevel(direction: 'in' | 'out') {
  if (isShowingAll.value) return
  const nextIndex = zoomLevelIndex.value + (direction === 'in' ? -1 : 1)
  if (nextIndex < 0 || nextIndex >= DEPTH_CHART_ZOOM_LEVELS.length) return
  const currentRange = visibleChartRange.value
  const bounds = depthChartBounds.value
  if (!currentRange || !bounds) return

  const nextSpan = DEPTH_CHART_ZOOM_LEVELS[nextIndex].durationMs
  const nextDomain = {
    start: bounds.start,
    end: Math.max(bounds.end, bounds.start + nextSpan),
  }
  zoomLevelIndex.value = nextIndex
  if (chartViewMode.value === 'auto') {
    manualChartRange.value = null
    return
  }
  manualChartRange.value = normalizeChartRange(currentRange, nextSpan, nextDomain)
  chartViewMode.value = 'manual'
}

function returnToLatest() {
  if (returnToLatestDisabled.value) return
  manualChartRange.value = null
  chartViewMode.value = 'auto'
}

function toggleFullChart() {
  if (!isShowingAll.value) {
    chartRestoreState.value = {
      mode: chartViewMode.value === 'manual' ? 'manual' : 'auto',
      zoomLevelIndex: zoomLevelIndex.value,
      range: chartViewMode.value === 'manual' && visibleChartRange.value
        ? { ...visibleChartRange.value }
        : null,
    }
    chartViewMode.value = 'all'
    manualChartRange.value = null
    return
  }

  const restoreState = chartRestoreState.value
  chartRestoreState.value = null
  if (!restoreState) {
    zoomLevelIndex.value = 0
    chartViewMode.value = 'auto'
    manualChartRange.value = null
    return
  }
  zoomLevelIndex.value = restoreState.zoomLevelIndex
  chartViewMode.value = restoreState.mode
  manualChartRange.value = restoreState.range ? { ...restoreState.range } : null
}

function handleChartDataZoom(params: any) {
  if (isShowingAll.value) return
  const payload = Array.isArray(params?.batch) ? params.batch[0] : params
  let start = Number(payload?.startValue)
  let end = Number(payload?.endValue)
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    const option = depthChart.value?.getOption() as any
    const zoom = Array.isArray(option?.dataZoom) ? option.dataZoom[0] : null
    start = Number(Array.isArray(zoom?.startValue) ? zoom.startValue[0] : zoom?.startValue)
    end = Number(Array.isArray(zoom?.endValue) ? zoom.endValue[0] : zoom?.endValue)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
  manualChartRange.value = { start, end }
  chartViewMode.value = 'manual'
}

async function connectWindowAgent() {
  if (connectionButtonDisabled.value) return
  pageError.value = ''
  try {
    wsStatus.value = await connectSimulatedWellMonitor(config.value.simulatedWellWindowAgentUrl)
  } catch (error) {
    pageError.value = String(error)
  }
}

const communicationSeriesConfig = [
  { connected: 0 as const, name: '通信异常', color: '#ef4444', offset: [-7, 0] },
  { connected: 1 as const, name: '通信恢复', color: '#22c55e', offset: [7, 0] },
  { connected: null, name: '无法识别', color: '#64748b', offset: [0, 0] },
]

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function communicationStateText(connected: 0 | 1 | null) {
  if (connected === 1) return '正常'
  if (connected === 0) return '异常'
  return '未知'
}

function groupedCommunicationEvents(connected: 0 | 1 | null) {
  const groups = new Map<string, {
    value: [number, number]
    devices: string[]
    connected: 0 | 1 | null
    depthCarried: boolean
    deviceStates: Array<{ device: string; connected: 0 | 1 | null }>
  }>()
  for (const event of snapshot.value?.communicationEvents || []) {
    if (event.connected !== connected) continue
    const key = `${event.timestampMs}|${event.depth}|${event.depthCarried}`
    const current = groups.get(key)
    if (current) {
      if (!current.devices.includes(event.device)) current.devices.push(event.device)
    } else {
      groups.set(key, {
        value: [event.timestampMs, event.depth],
        devices: [event.device],
        connected: event.connected,
        depthCarried: event.depthCarried,
        deviceStates: event.deviceStates,
      })
    }
  }
  return [...groups.values()]
}

function communicationSeries() {
  return communicationSeriesConfig.map(config => ({
    name: config.name,
    type: 'scatter',
    symbol: 'circle',
    symbolSize: 11,
    symbolOffset: config.offset,
    z: 10,
    data: groupedCommunicationEvents(config.connected),
    itemStyle: { color: config.color, borderColor: '#fff', borderWidth: 2 },
    tooltip: {
      trigger: 'item',
      formatter: communicationPointTooltip,
    },
  }))
}

function depthAxisTooltip(params: any[]) {
  const items = Array.isArray(params) ? params : [params]
  const depthItem = items.find(item => item.seriesType === 'line')
  const timestamp = Number(depthItem?.value?.[0])
  const depth = depthItem?.value?.[1]
  return [
    Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '--',
    `深度：${typeof depth === 'number' && Number.isFinite(depth) ? `${depth.toFixed(2)} m` : '--'}`,
  ].join('<br/>')
}

function communicationPointTooltip(params: any) {
  const item = Array.isArray(params) ? params[0] : params
  const timestamp = Number(item?.value?.[0])
  const lines = [Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '--']
  const depth = item?.value?.[1]
  const event = item?.data as ReturnType<typeof groupedCommunicationEvents>[number] | undefined
  const carried = event?.depthCarried ? '（深度沿用最近值）' : ''
  lines.push(`深度：${typeof depth === 'number' && Number.isFinite(depth) ? `${depth.toFixed(2)} m` : '--'}${carried}`)
  if (event) {
    const states = event.deviceStates?.length
      ? event.deviceStates
      : event.devices.map(device => ({ device, connected: event.connected }))
    lines.push('通信状态：')
    for (const state of states) {
      lines.push(`${escapeHtml(state.device)}：${communicationStateText(state.connected)}`)
    }
  }
  return lines.join('<br/>')
}

const chartOption = computed(() => ({
  animation: false,
  grid: { left: 68, right: 28, top: 42, bottom: 58 },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'cross' },
    formatter: depthAxisTooltip,
  },
  xAxis: {
    type: 'time',
    min: depthChartDomain.value?.start,
    max: depthChartDomain.value?.end,
    boundaryGap: false,
    name: '时间',
    nameLocation: 'middle',
    nameGap: 36,
    axisLabel: { formatter: '{HH}:{mm}:{ss}' },
  },
  yAxis: {
    type: 'value',
    name: '深度 (m)',
    scale: true,
  },
  dataZoom: visibleChartRange.value ? [
    {
      id: 'depth-chart-roam',
      type: 'inside',
      startValue: visibleChartRange.value.start,
      endValue: visibleChartRange.value.end,
      zoomLock: true,
      zoomOnMouseWheel: false,
      moveOnMouseWheel: false,
      moveOnMouseMove: true,
      preventDefaultMouseMove: true,
    },
  ] : [],
  series: [
    {
      name: latest.value?.service.device || '深度',
      type: 'line',
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { width: 2, color: '#1677ff' },
      itemStyle: { color: '#1677ff' },
      areaStyle: { color: 'rgba(22, 119, 255, 0.08)' },
      data: (snapshot.value?.points || []).map((point) => [point.timestampMs, point.value]),
    },
    ...communicationSeries(),
  ],
}))

function statusText(status: MonitorMetricStatus | undefined) {
  if (status === 'fresh') return '实时'
  if (status === 'stale') return '沿用历史值'
  return '不可用'
}

function connectedText(value: 0 | 1 | null) {
  if (value === 1) return '已连接'
  if (value === 0) return '未连接'
  return '无法识别'
}

function formatMetric(value: number | null | undefined, digits: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'
}

function formatMessageTime(timestamp: number | null | undefined) {
  if (!timestamp) return '--'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

async function refreshState() {
  try {
    wsStatus.value = await getSimulatedWellWsStatus()
    snapshot.value = await getSimulatedWellMonitorSnapshot(props.sessionId)
  } catch (error) {
    pageError.value = String(error)
  }
}

async function stopSession() {
  if (sessionStopped) throw new Error('采集会话已经结束')
  const file = await stopSimulatedWellMonitorSession(props.sessionId)
  sessionStopped = true
  return file
}

async function finishTest() {
  if (ending.value) return
  if (!snapshot.value?.sampleCount) {
    const confirmed = await ElMessageBox.confirm(
      '当前测试尚未收到有效监控数据，是否仍要结束测试并进入报告填写？',
      '结束测试确认',
      { confirmButtonText: '仍要结束', cancelButtonText: '继续等待', type: 'warning' },
    ).then(() => true).catch(() => false)
    if (!confirmed) return
  }
  ending.value = true
  try {
    const file = await stopSession()
    allowLeave = true
    emit('finished', file)
  } catch (error) {
    ElMessage.error(`结束采集失败：${String(error)}`)
  } finally {
    ending.value = false
  }
}

onBeforeRouteLeave(async () => {
  if (allowLeave || sessionStopped) return true
  const confirmed = await ElMessageBox.confirm(
    '离开监控页将结束当前采集会话，是否继续？',
    '离开确认',
    { confirmButtonText: '结束并离开', cancelButtonText: '取消', type: 'warning' },
  ).catch(() => false)
  if (!confirmed) return false
  try {
    await stopSession()
    allowLeave = true
    return true
  } catch (error) {
    ElMessage.error(`结束采集失败：${String(error)}`)
    return false
  }
})

onMounted(async () => {
  statusUnlisten = await listen<SimulatedWellWsStatus>('simulated-well-ws-status', (event) => {
    wsStatus.value = event.payload
  })
  snapshotUnlisten = await listen<SimulatedWellMonitorSnapshot>('simulated-well-monitor-snapshot', (event) => {
    if (event.payload.sessionId !== props.sessionId) return
    snapshot.value = event.payload
    protocolError.value = ''
  })
  errorUnlisten = await listen<{ message: string }>('simulated-well-monitor-error', (event) => {
    protocolError.value = event.payload.message
  })
  clockTimer = setInterval(() => { clock.value = Date.now() }, 1000)
  await initConfig()
  await refreshState()
  await connectWindowAgent()
})

onBeforeUnmount(() => {
  statusUnlisten?.()
  snapshotUnlisten?.()
  errorUnlisten?.()
  if (clockTimer) clearInterval(clockTimer)
  if (!sessionStopped && !allowLeave) void stopSimulatedWellMonitorSession(props.sessionId)
})
</script>

<template>
  <div class="monitor-view">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:chart-timeline-variant" /></div>
        <div>
          <h1 class="header-title">测试监控 Test Monitoring</h1>
          <p class="header-subtitle">下井作业：{{ workNo }}</p>
        </div>
      </div>
      <button class="finish-btn" :disabled="ending" @click="finishTest">
        <Icon icon="mdi:stop-circle-outline" />
        {{ ending ? '正在结束…' : '结束测试' }}
      </button>
    </div>

    <div :class="['collection-banner', collectionState.level]">
      <span class="pulse-dot" />
      <div>
        <strong>{{ collectionState.title }}</strong>
        <p>{{ collectionState.detail }}</p>
      </div>
      <div class="banner-meta">
        <span>{{ wsStatus.targetUrl || config.simulatedWellWindowAgentUrl }}</span>
        <span>最后消息：{{ formatMessageTime(lastMessageAt) }}</span>
        <button class="connection-btn" :disabled="connectionButtonDisabled" @click="connectWindowAgent">
          {{ connectionButtonText }}
        </button>
      </div>
    </div>

    <div v-if="pageError || protocolError || snapshot?.schemaWarning" class="monitor-alert">
      <Icon icon="mdi:alert-circle-outline" />
      {{ pageError || protocolError || snapshot?.schemaWarning }}
    </div>

    <div class="monitor-grid">
      <section class="monitor-card chart-card">
        <div class="card-heading">
          <div>
            <h2>深度实时曲线</h2>
          </div>
          <div class="chart-controls">
            <span v-if="!isShowingAll" class="zoom-level">{{ currentZoomLevel.label }}</span>
            <button class="chart-control-btn" :disabled="zoomInDisabled" title="放大曲线" @click="changeZoomLevel('in')">
              <Icon icon="mdi:magnify-plus-outline" />
              放大
            </button>
            <button class="chart-control-btn" :disabled="zoomOutDisabled" title="缩小曲线" @click="changeZoomLevel('out')">
              <Icon icon="mdi:magnify-minus-outline" />
              缩小
            </button>
            <button class="chart-control-btn" :disabled="returnToLatestDisabled" title="回到最新数据" @click="returnToLatest">
              <Icon icon="mdi:skip-forward-outline" />
              回到最新
            </button>
            <button class="chart-control-btn full" :class="{ active: isShowingAll }" @click="toggleFullChart">
              <Icon :icon="isShowingAll ? 'mdi:restore' : 'mdi:arrow-expand-horizontal'" />
              {{ isShowingAll ? '还原' : '全部' }}
            </button>
          </div>
        </div>
        <VChart
          v-if="snapshot?.points.length"
          ref="depthChart"
          :option="chartOption"
          autoresize
          class="depth-chart"
          @datazoom="handleChartDataZoom"
        />
        <div v-else class="empty-monitor chart-empty">
          <Icon icon="mdi:chart-line" />
          <span>等待深度数据</span>
        </div>
      </section>

      <aside class="monitor-sidebar">
        <div class="metric-grid">
          <section class="metric-card emphasis">
            <div class="metric-label">当前深度</div>
            <div class="metric-value">{{ formatMetric(displayedDepth, 2) }} <small>m</small></div>
            <span v-if="!depthUsesPrevious" :class="['metric-status', latest?.service.cdepth_status || 'unavailable']">
              {{ statusText(latest?.service.cdepth_status) }}
            </span>
          </section>
          <section class="metric-card">
            <div class="metric-label">当前速度</div>
            <div class="metric-value">{{ formatMetric(latest?.service.speed_m_per_min, 2) }} <small>m/min</small></div>
            <span :class="['metric-status', latest?.service.speed_status || 'unavailable']">
              {{ statusText(latest?.service.speed_status) }}
            </span>
          </section>
        </div>

        <section class="monitor-card edib-card">
          <div class="card-heading">
            <div>
              <h2>EDIB 通信状态</h2>
            </div>
            <span :class="['summary-status', latest?.edib.status || 'unavailable']">
              {{ statusText(latest?.edib.status) }}
            </span>
          </div>
          <div v-if="!latest?.edib.devices.length" class="empty-monitor">
            <Icon icon="mdi:lan-disconnect" />
            <span>{{ latest ? 'EDIB 窗口不可用或未发现设备' : '暂无通信状态' }}</span>
          </div>
          <div v-else class="device-list">
            <div v-for="device in latest.edib.devices" :key="device.device" class="device-row">
              <span :class="['device-indicator', device.connected === 1 ? 'online' : device.connected === 0 ? 'offline' : 'unknown']" />
              <span class="device-name">{{ device.device }}</span>
              <span :class="['device-state', device.connected === 1 ? 'online' : device.connected === 0 ? 'offline' : 'unknown']">
                {{ connectedText(device.connected) }}
              </span>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped src="./components/simulation-well.shared.css"></style>
<style scoped>
.monitor-view { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; gap: 16px; overflow-x: hidden; overflow-y: auto; }
.finish-btn { display: inline-flex; align-items: center; gap: 7px; border: 0; border-radius: 8px; padding: 10px 18px; color: #fff; background: #dc2626; cursor: pointer; font-weight: 600; }
.finish-btn:disabled { cursor: not-allowed; opacity: .6; }
.collection-banner { display: flex; align-items: center; gap: 12px; border: 1px solid; border-radius: 10px; padding: 13px 16px; }
.collection-banner p { margin: 3px 0 0; color: #64748b; font-size: 13px; }
.collection-banner.success { border-color: #86efac; background: #f0fdf4; }
.collection-banner.waiting { border-color: #bfdbfe; background: #eff6ff; }
.collection-banner.warning { border-color: #fde68a; background: #fffbeb; }
.collection-banner.danger { border-color: #fecaca; background: #fef2f2; }
.pulse-dot { width: 10px; height: 10px; flex: none; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 0 5px rgba(59,130,246,.12); }
.success .pulse-dot { background: #16a34a; box-shadow: 0 0 0 5px rgba(22,163,74,.12); }
.warning .pulse-dot { background: #d97706; box-shadow: 0 0 0 5px rgba(217,119,6,.12); }
.danger .pulse-dot { background: #dc2626; box-shadow: 0 0 0 5px rgba(220,38,38,.12); }
.banner-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 14px; margin-left: auto; color: #475569; font-size: 12px; }
.connection-btn { border: 1px solid #2563eb; border-radius: 7px; padding: 6px 13px; color: #fff; background: #2563eb; cursor: pointer; font-weight: 600; }
.connection-btn:disabled { border-color: #94a3b8; background: #94a3b8; cursor: not-allowed; }
.monitor-alert { display: flex; align-items: center; gap: 8px; border-radius: 8px; padding: 10px 14px; color: #b45309; background: #fff7ed; }
.metric-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
.metric-card { position: relative; min-height: 112px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #fff; box-shadow: 0 3px 12px rgba(15,23,42,.04); }
.metric-card.emphasis { border-color: #bfdbfe; background: linear-gradient(145deg, #fff, #eff6ff); }
.metric-label { color: #64748b; font-size: 13px; }
.metric-value { margin-top: 12px; color: #0f172a; font-size: 29px; font-weight: 700; }
.metric-value.text { overflow: hidden; font-size: 23px; text-overflow: ellipsis; white-space: nowrap; }
.metric-value small { color: #64748b; font-size: 13px; font-weight: 500; }
.metric-status { position: absolute; top: 14px; right: 14px; border-radius: 999px; padding: 3px 8px; font-size: 11px; }
.metric-status.fresh, .summary-status.fresh { color: #15803d; background: #dcfce7; }
.metric-status.stale, .summary-status.stale { color: #b45309; background: #fef3c7; }
.metric-status.unavailable, .summary-status.unavailable { color: #64748b; background: #f1f5f9; }
.metric-status.neutral { color: #475569; background: #f1f5f9; }
.monitor-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, .72fr); gap: 16px; min-height: 360px; flex: 1; }
.monitor-sidebar { display: flex; min-height: 0; flex-direction: column; gap: 16px; }
.monitor-card { display: flex; min-height: 0; flex-direction: column; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #fff; box-shadow: 0 3px 12px rgba(15,23,42,.04); }
.chart-card { min-height: 420px; }
.edib-card { min-height: 0; flex: 1; }
.edib-card .empty-monitor { min-height: 180px; }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.card-heading h2 { margin: 0; color: #0f172a; font-size: 16px; }
.card-heading p { margin: 4px 0 0; color: #94a3b8; font-size: 12px; }
.chart-controls { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.zoom-level { min-width: 52px; color: #64748b; font-size: 12px; text-align: right; }
.chart-control-btn { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 10px; color: #334155; background: #fff; cursor: pointer; font-size: 12px; font-weight: 600; }
.chart-control-btn:hover:not(:disabled) { border-color: #1677ff; color: #1677ff; background: #eff6ff; }
.chart-control-btn:disabled { cursor: not-allowed; opacity: .45; }
.chart-control-btn.full.active { border-color: #1677ff; color: #1677ff; background: #eff6ff; }
.summary-status { border-radius: 999px; padding: 4px 9px; font-size: 11px; }
.device-list { display: flex; overflow: auto; flex-direction: column; gap: 8px; }
.device-row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; align-items: center; gap: 10px; border: 1px solid #edf2f7; border-radius: 8px; padding: 12px; }
.device-indicator { width: 9px; height: 9px; border-radius: 50%; }
.device-indicator.online { background: #22c55e; box-shadow: 0 0 0 4px #dcfce7; }
.device-indicator.offline { background: #ef4444; box-shadow: 0 0 0 4px #fee2e2; }
.device-indicator.unknown { background: #64748b; box-shadow: 0 0 0 4px #e2e8f0; }
.device-name { overflow: hidden; color: #334155; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.device-state { font-size: 12px; }
.device-state.online { color: #15803d; }
.device-state.offline { color: #dc2626; }
.device-state.unknown { color: #64748b; }
.depth-chart { width: 100%; min-height: 290px; flex: 1; cursor: grab; }
.depth-chart:active, .depth-chart :deep(canvas:active) { cursor: grabbing; }
.depth-chart :deep(canvas) { cursor: inherit; }
.empty-metric { display: flex; min-height: 180px; flex: 1; align-items: center; justify-content: center; flex-direction: column; gap: 10px; color: #94a3b8; }
.empty-monitor { display: flex; min-height: 405px; flex: 1; align-items: center; justify-content: center; flex-direction: column; gap: 10px; color: #94a3b8; }
.empty-monitor :deep(svg) { font-size: 36px; }
@media (max-width: 1100px) { .monitor-grid { grid-template-columns: 1fr; flex: none; } .monitor-sidebar { min-height: auto; } .edib-card { min-height: 360px; } .banner-meta span { display: none; } }
@media (max-width: 680px) { .card-heading { align-items: stretch; flex-direction: column; } .chart-controls { justify-content: flex-start; } .zoom-level { text-align: left; } }
</style>
