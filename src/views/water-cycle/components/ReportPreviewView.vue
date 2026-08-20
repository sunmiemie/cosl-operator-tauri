<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { echarts } from '@/utils/echarts'

import {
  COLLECTION_CHANNELS,
  collectionTime,
  createReportNo,
  currentReportNo,
  formatDurationText,
  measurementHistory,
  selectedOrder,
} from '../composables/useTestStore'

const emit = defineEmits<{
  back: []
  save: []
}>()

const chartRef = ref<HTMLDivElement | null>(null)
let chartInst: echarts.ECharts | null = null

const reportTimeText = computed(() => new Date().toLocaleString('zh-CN'))
const resolvedReportNo = computed(() => currentReportNo.value || '--')

const reportChannels = computed(() =>
  COLLECTION_CHANNELS.filter((channel) =>
    measurementHistory.value.some((item) => item.values[channel.id] !== null && item.values[channel.id] !== undefined)
  )
)

const channelSummary = computed(() =>
  reportChannels.value.map((channel) => {
    const values = measurementHistory.value
      .map((item) => item.values[channel.id])
      .filter((value): value is number => typeof value === 'number')

    const latest = values[values.length - 1]
    const min = values.length ? Math.min(...values) : null
    const max = values.length ? Math.max(...values) : null

    return {
      ...channel,
      latest,
      min,
      max,
    }
  })
)

function initChart() {
  if (!chartRef.value) return
  chartInst = echarts.init(chartRef.value)
  updateChart()
}

function updateChart() {
  if (!chartInst) return
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
      data: reportChannels.value.map((channel) => channel.name),
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
      data: measurementHistory.value.map((item) => item.timeLabel),
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    series: reportChannels.value.map((channel) => ({
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
    })),
  })
}

function handleResize() {
  chartInst?.resize()
}

onMounted(() => {
  if (!currentReportNo.value) createReportNo()
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInst?.dispose()
  chartInst = null
})
</script>

<template>
  <div class="report-preview-container">
    <div class="report-header-card">
      <div>
        <div class="report-tag">测试报告预览</div>
        <h2 class="report-title">水循环测试报告</h2>
        <div class="report-meta">
          <span>报告编号：{{ resolvedReportNo }}</span>
          <span>生成时间：{{ reportTimeText }}</span>
        </div>
      </div>
      <div class="report-status">
        <Icon icon="mdi:file-document-check-outline" />
        <span>待保存</span>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-panel">
        <div class="panel-title">被测件信息</div>
        <div class="info-list">
          <div class="info-row"><span>仪器名称</span><strong>{{ selectedOrder?.deviceName || '--' }}</strong></div>
          <div class="info-row"><span>仪器编号</span><strong>{{ selectedOrder?.deviceNumber || '--' }}</strong></div>
          <div class="info-row"><span>任务单号</span><strong>{{ selectedOrder?.taskNumber || '--' }}</strong></div>
          <div class="info-row"><span>测试台</span><strong>{{ selectedOrder?.testPlatform || '--' }}</strong></div>
        </div>
      </div>

      <div class="info-panel">
        <div class="panel-title">测试信息</div>
        <div class="info-list">
          <div class="info-row"><span>测试日期</span><strong>{{ reportTimeText }}</strong></div>
          <div class="info-row"><span>测试时长</span><strong>{{ formatDurationText(collectionTime) }}</strong></div>
          <div class="info-row"><span>流程长度</span><strong>{{ selectedOrder?.flowProcess || '--' }}</strong></div>
          <div class="info-row"><span>指令下传</span><strong>{{ selectedOrder?.needCommandTransfer || '--' }}</strong></div>
        </div>
      </div>
    </div>

    <div class="chart-card">
      <div class="panel-title">测试数据曲线</div>
      <div ref="chartRef" class="chart-container"></div>
    </div>

    <div class="summary-card">
      <div class="panel-title">通道数据摘要</div>
      <div class="summary-grid">
        <div v-for="item in channelSummary" :key="item.id" class="summary-item">
          <div class="summary-name">
            <span class="summary-dot" :style="{ background: item.color }"></span>
            {{ item.name }}
          </div>
          <div class="summary-values">
            <span>最新值：{{ item.latest ?? '--' }} {{ item.unit }}</span>
            <span>最小值：{{ item.min ?? '--' }} {{ item.unit }}</span>
            <span>最大值：{{ item.max ?? '--' }} {{ item.unit }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="report-actions">
      <button class="back-btn" @click="emit('back')">返回采集页</button>
      <button class="save-btn" @click="emit('save')">
        <Icon icon="mdi:content-save-outline" />
        保存报告
      </button>
    </div>
  </div>
</template>

<style scoped>
.report-preview-container { display:flex; flex-direction:column; gap:16px; min-height:0; flex:1; overflow-y:auto; padding-right:6px; }
.report-header-card,
.info-panel,
.chart-card,
.summary-card { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:16px; }
.report-header-card { padding:24px; display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.report-tag { display:inline-flex; padding:6px 10px; border-radius:999px; background:rgba(59,130,246,.12); color:var(--color-accent-blue); font-size:12px; font-weight:700; margin-bottom:12px; }
.report-title { margin:0; font-size:28px; font-weight:800; color:var(--color-text-primary); }
.report-meta { margin-top:10px; display:flex; flex-wrap:wrap; gap:14px; font-size:13px; color:var(--color-text-secondary); }
.report-status { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:12px; background:rgba(34,197,94,.12); color:#16a34a; font-weight:700; }
.info-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px; }
.info-panel,
.chart-card,
.summary-card { padding:18px 20px; }
.panel-title { font-size:15px; font-weight:700; color:var(--color-text-primary); margin-bottom:14px; }
.info-list { display:flex; flex-direction:column; gap:12px; }
.info-row { display:flex; justify-content:space-between; gap:16px; padding-bottom:12px; border-bottom:1px dashed var(--color-border); font-size:14px; }
.info-row:last-child { padding-bottom:0; border-bottom:none; }
.info-row span { color:var(--color-text-secondary); }
.info-row strong { color:var(--color-text-primary); text-align:right; }
.chart-container { height:320px; }
.summary-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
.summary-item { padding:14px; border-radius:12px; background:var(--color-bg-tertiary); border:1px solid var(--color-border); }
.summary-name { display:flex; align-items:center; gap:8px; font-weight:700; color:var(--color-text-primary); margin-bottom:10px; }
.summary-dot { width:10px; height:10px; border-radius:999px; }
.summary-values { display:flex; flex-direction:column; gap:6px; font-size:13px; color:var(--color-text-secondary); }
.report-actions { display:flex; justify-content:center; gap:16px; }
.back-btn,
.save-btn { min-width:220px; min-height:48px; border-radius:12px; font-size:15px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:all .2s ease; }
.back-btn { border:1px solid var(--color-border); background:var(--color-bg-secondary); color:var(--color-text-secondary); }
.back-btn:hover { background:var(--color-bg-hover); }
.save-btn { border:none; background:var(--color-primary, #3b82f6); color:#fff; box-shadow:0 12px 24px rgba(59,130,246,.18); }
.save-btn:hover { transform:translateY(-1px); opacity:.95; }
@media (max-width: 1280px) {
  .info-grid { grid-template-columns:1fr; }
  .summary-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
}
.report-preview-container::-webkit-scrollbar { width: 10px; }
.report-preview-container::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.35); border-radius: 999px; }
.report-preview-container::-webkit-scrollbar-track { background: transparent; }
</style>
