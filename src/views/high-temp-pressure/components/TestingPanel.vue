<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { ScheduledSelection } from '../types'
import type {
  HighTempPressureChartSummary,
  HighTempPressureChartSeriesKey,
  HighTempPressureChartSeriesVisibility,
  HighTempPressureOcrMeasurement,
} from '../composables/useHighTempPressureTesting'

const props = defineProps<{
  t1: number[]
  t2: number[]
  p: number[]
  testRunning: boolean
  testStartTime: number | null
  onlineTimerStr: string
  csvCount: number
  currentSelected: ScheduledSelection | null
  ocrDeviceName: string
  ocrReadyPct: number
  captureStatusText: string
  latestFrameUrl: string
  exportedCaptureDir: string
  ocrMeasurements: HighTempPressureOcrMeasurement[]
  chartWindowMinutes: number | null
  chartRangeLocked: boolean
  chartSummary: HighTempPressureChartSummary
  chartSeriesVisibility: HighTempPressureChartSeriesVisibility
}>()

const emit = defineEmits<{
  'connect-ocr': []
  pause: []
  resume: []
  'open-stop-modal': []
  'open-end-modal': []
  'set-chart-window': [value: number | null]
  'toggle-chart-series': [key: HighTempPressureChartSeriesKey]
  'show-all-chart-series': []
}>()

const detailModalVisible = ref(false)
const detailModuleCount = 6
const chartWindowOptions = [5, 30, 60, 240]
const chartSeriesOptions: Array<{
  key: HighTempPressureChartSeriesKey
  label: string
  className: string
}> = [
  { key: 'upperTemp', label: '上部水温', className: 'series-hot' },
  { key: 'lowerTemp', label: '下部水温', className: 'series-warm' },
  { key: 'pressure', label: '容器压力', className: 'series-pressure' },
]

const allChartSeriesVisible = computed(() => Object.values(props.chartSeriesVisibility).every(Boolean))

const currentOrder = computed(() => props.currentSelected?.order ?? null)
const currentInstrument = computed(() => props.currentSelected?.instrument ?? null)
const currentOrderBadge = computed(() => currentOrder.value?.no || currentOrder.value?.receivingNo || '未选择')
const ocrReadySafe = computed(() => {
  const value = Number(props.ocrReadyPct)
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
})

const formatChartValue = (value: number | null, digits: number, unit: string) => {
  if (value === null || !Number.isFinite(value)) return '--'
  return `${value.toFixed(digits)} ${unit}`
}

const formatChartUpdatedAt = (timestamp: number | null) => {
  if (timestamp === null || !Number.isFinite(timestamp)) return '--:--:--'
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const formatDateTime = (timestamp: number | null) => {
  if (timestamp === null || !Number.isFinite(timestamp)) return '--'
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const scheduleEndTimestamp = computed(() => {
  const instrument = currentInstrument.value
  const segmentEnds = (instrument?.scheduleSegments || [])
    .map((segment) => Date.parse(segment.scheduledEndAt))
    .filter(Number.isFinite)
  const directEnd = Date.parse(String(instrument?.scheduledEndAt || ''))
  if (Number.isFinite(directEnd)) segmentEnds.push(directEnd)
  return segmentEnds.length ? Math.max(...segmentEnds) : null
})

const scheduleRemainingText = computed(() => {
  // onlineTimerStr 每秒更新，用作纯显示倒计时的响应式时钟，不触发任何结束动作。
  void props.onlineTimerStr
  if (scheduleEndTimestamp.value === null) return '--'
  return formatDuration((scheduleEndTimestamp.value - Date.now()) / 1000)
})

const scheduleEndText = computed(() => formatDateTime(scheduleEndTimestamp.value))

const handleTestStart = () => {
  if (props.testRunning) return
  if (props.ocrDeviceName) emit('resume')
  else emit('connect-ocr')
}

const displayValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

const splitTextItems = (value?: string) => {
  if (!value?.trim()) return []
  return value
    .split(/\r?\n|[；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const yesNoText = (value?: 'yes' | 'no' | null) => {
  if (value === 'yes') return '是'
  if (value === 'no') return '否'
  return '-'
}

const currentOrderMetrics = computed(() => {
  const order = currentOrder.value
  if (!order) return []

  return [
    { label: '温度 Temp', value: displayValue(order.targetTemp), tone: 'temp' },
    { label: '压力 Pressure', value: displayValue(order.targetPressure), tone: 'pressure' },
    { label: '保温保压时间', value: displayValue(order.keepCondition), tone: 'neutral' },
    { label: '容器类型/设备容量', value: displayValue(order.vesselType || order.type), tone: 'neutral' },
  ]
})

const reportInfoCards = computed(() => {
  const order = currentOrder.value
  if (!order) return []

  return [
    { label: '表格编号 Ref No.', value: displayValue(order.tableNo) },
    { label: '报告编号 Serial Number', value: displayValue(order.no || order.receivingNo) },
    { label: '联系电话 Tel', value: displayValue(order.applicantPhone) },
  ]
})

const testStepItems = computed(() => splitTextItems(currentOrder.value?.testSteps))
const safetyRiskItems = computed(() => splitTextItems(currentOrder.value?.safetyRisks))
const testPurposeText = computed(() => {
  const order = currentOrder.value
  if (!order) return '-'
  const explicitPurpose = [order.projectName, order.remark].find((item) => item && item.trim() && item.trim() !== '-')
  if (explicitPurpose) return explicitPurpose
  const targetText = [order.targetTemp, order.targetPressure, order.keepCondition].filter(Boolean).join('、')
  return targetText
    ? `验证试件在${targetText}条件下的耐温、耐压及密封稳定性。`
    : '验证试件在高温高压测试条件下的耐温、耐压及密封稳定性。'
})
</script>

<template>
  <div class="panel">
    <div class="testing-scroll-region">
      <div class="ocr-capture-card">
        <section class="overview-zone">
          <div class="overview-head">
            <div>
              <div class="capture-kicker">LIVE TEST OVERVIEW</div>
              <div class="overview-title">实时参数与采集状态</div>
            </div>
            <div class="overview-live" :class="{ active: testRunning }">
              <i></i>{{ testRunning ? '测试进行中' : '等待开始 / 已暂停' }}
            </div>
          </div>

          <div class="overview-metrics">
            <div class="overview-metric metric-upper">
              <span>上部温度</span>
              <strong>{{ formatChartValue(chartSummary.latestUpperTemp, 1, '°C') }}</strong>
            </div>
            <div class="overview-metric metric-lower">
              <span>下部温度</span>
              <strong>{{ formatChartValue(chartSummary.latestLowerTemp, 1, '°C') }}</strong>
            </div>
            <div class="overview-metric metric-pressure-live">
              <span>容器压力</span>
              <strong>{{ formatChartValue(chartSummary.latestPressure, 3, 'MPa') }}</strong>
            </div>
            <div class="overview-metric">
              <span>温度最高值</span>
              <strong>{{ formatChartValue(chartSummary.maxTemp, 1, '°C') }}</strong>
            </div>
            <div class="overview-metric">
              <span>温度最低值</span>
              <strong>{{ formatChartValue(chartSummary.minTemp, 1, '°C') }}</strong>
            </div>
            <div class="overview-metric">
              <span>压力最高值</span>
              <strong>{{ formatChartValue(chartSummary.maxPressure, 3, 'MPa') }}</strong>
            </div>
            <div class="overview-metric">
              <span>压力最低值</span>
              <strong>{{ formatChartValue(chartSummary.minPressure, 3, 'MPa') }}</strong>
            </div>
            <div class="overview-metric">
              <span>已采集条数</span>
              <strong>{{ csvCount }} 条</strong>
            </div>
            <div class="overview-metric overview-status-metric">
              <span>OCR 采集状态 · 就绪 {{ ocrReadySafe }}%</span>
              <strong :title="captureStatusText">{{ captureStatusText }}</strong>
            </div>
            <div class="overview-metric overview-time-metric">
              <span>开始时间</span>
              <strong>{{ formatDateTime(testStartTime) }}</strong>
            </div>
            <div class="overview-metric overview-time-metric remaining">
              <span>排期剩余时间 · 截止 {{ scheduleEndText }}</span>
              <strong>{{ scheduleRemainingText }}</strong>
            </div>
          </div>

          <div class="test-controls">
            <button class="control-action control-action-start" :disabled="testRunning" @click="handleTestStart">
              <span class="control-icon"><Icon icon="mdi:play" /></span>
              <span class="control-copy"><strong>测试开始</strong><small>启动或恢复 OCR 采集</small></span>
            </button>
            <button class="control-action control-action-pause" :disabled="!testRunning" @click="emit('pause')">
              <span class="control-icon"><Icon icon="mdi:pause" /></span>
              <span class="control-copy"><strong>测试暂停</strong><small>暂停当前采集进程</small></span>
            </button>
            <button class="control-action control-action-end" @click="emit('open-end-modal')">
              <span class="control-icon"><Icon icon="mdi:check" /></span>
              <span class="control-copy"><strong>测试结束</strong><small>保存本次识别结果</small></span>
            </button>
            <button class="control-action control-action-reconnect" @click="emit('connect-ocr')">
              <span class="control-icon"><Icon icon="mdi:camera-wireless-outline" /></span>
              <span class="control-copy"><strong>重新连接采集卡</strong><small>{{ ocrDeviceName || '尚未连接采集卡' }}</small></span>
            </button>
          </div>
        </section>

        <div class="monitoring-board">
          <div class="monitoring-chart-card">
            <div class="monitoring-card-head">
              <div class="monitoring-card-title">
                <Icon icon="mdi:chart-line" />
                <span>实时监控曲线</span>
              </div>
              <div class="monitoring-card-meta chart-head-meta">
                <span class="monitoring-updated">更新 {{ formatChartUpdatedAt(chartSummary.updatedAtMs) }}</span>
              </div>
            </div>

            <div class="monitoring-chart-subbar">
              <div class="chart-window-control" role="group" aria-label="曲线显示时间范围">
                <span class="chart-window-label">时间范围</span>
                <span v-if="chartRangeLocked" class="chart-window-custom">自定义</span>
                <button
                  type="button"
                  :class="{ active: chartWindowMinutes === null && !chartRangeLocked }"
                  @click="emit('set-chart-window', null)"
                >
                  自动
                </button>
                <button
                  type="button"
                  :class="{ active: chartWindowMinutes === 0 && !chartRangeLocked }"
                  @click="emit('set-chart-window', 0)"
                >
                  全程
                </button>
                <button
                  v-for="minutes in chartWindowOptions"
                  :key="minutes"
                  type="button"
                  :class="{ active: chartWindowMinutes === minutes }"
                  @click="emit('set-chart-window', minutes)"
                >
                  {{ minutes >= 60 ? `${minutes / 60} 小时` : `${minutes} 分钟` }}
                </button>
              </div>
              <div class="monitoring-card-meta chart-series-legend" role="group" aria-label="选择显示曲线">
                <span class="chart-series-label">显示曲线</span>
                <button
                  v-for="series in chartSeriesOptions"
                  :key="series.key"
                  type="button"
                  :class="[
                    'monitoring-series',
                    series.className,
                    { inactive: !chartSeriesVisibility[series.key] },
                  ]"
                  :aria-pressed="chartSeriesVisibility[series.key]"
                  :title="`${chartSeriesVisibility[series.key] ? '隐藏' : '显示'}${series.label}`"
                  @click="emit('toggle-chart-series', series.key)"
                >
                  {{ series.label }}
                  <Icon :icon="chartSeriesVisibility[series.key] ? 'mdi:eye-outline' : 'mdi:eye-off-outline'" />
                </button>
                <button
                  v-if="!allChartSeriesVisible"
                  type="button"
                  class="chart-series-reset"
                  @click="emit('show-all-chart-series')"
                >
                  全部显示
                </button>
              </div>
            </div>

            <div class="monitoring-chart-body">
              <div id="htp-chart" class="monitoring-chart"></div>
              <div v-if="!chartSummary.count" class="monitoring-chart-empty">
                {{ testRunning ? '正在等待第一个 OCR 数据点' : '连接采集卡并开始 OCR 后显示实时曲线' }}
              </div>
            </div>
          </div>

          <div class="monitoring-order-card compact-order-card">
            <div class="monitoring-card-head compact-order-head">
              <div class="monitoring-card-title">
                <Icon icon="mdi:file-document-outline" />
                <span>当前工单</span>
              </div>
              <span class="current-order-no">{{ currentOrderBadge }}</span>
            </div>

            <div v-if="currentSelected" class="compact-order-body">
              <div class="testing-item-block">
                <div class="testing-item-kicker">Testing Item</div>
                <div class="testing-item-name">{{ currentInstrument?.label || '-' }}</div>
                <div class="testing-item-sn">SN: {{ currentInstrument?.sn || '-' }}</div>
              </div>

              <div class="metric-card-grid">
                <div
                  v-for="metric in currentOrderMetrics"
                  :key="metric.label"
                  class="metric-card"
                  :class="`metric-${metric.tone}`"
                >
                  <div class="metric-label">{{ metric.label }}</div>
                  <div class="metric-value">{{ metric.value }}</div>
                </div>
              </div>

              <button class="full-order-btn" @click="detailModalVisible = true">
                <span>查看完整工单详情 · {{ detailModuleCount }} 模块</span>
                <Icon icon="mdi:arrow-right" />
              </button>
            </div>

            <div v-else class="monitoring-order-empty">
              <Icon icon="mdi:clipboard-remove-outline" />
              <span>未选择排程仪器</span>
            </div>
          </div>
        </div>
        <div v-if="exportedCaptureDir" class="export-path">已保存：{{ exportedCaptureDir }}</div>
      </div>
    </div>

    <div v-if="detailModalVisible && currentOrder" class="modal-overlay" @click.self="detailModalVisible = false">
      <div
        class="modal hthp-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hthp-report-title"
      >
        <div class="modal-header hthp-report-header">
          <div>
            <div class="report-kicker">COSL · QHSE 管理体系记录表单</div>
            <div id="hthp-report-title" class="modal-title">高温高压试验报告</div>
            <div class="report-subtitle">High Temperature &amp; High Pressure Testing Report</div>
          </div>
          <div class="report-header-actions">
            <span class="badge badge-green">{{ currentOrder.status || '当前工单' }}</span>
            <button class="modal-close-btn" type="button" aria-label="关闭完整工单详情" @click="detailModalVisible = false">
              <Icon icon="mdi:close" />
            </button>
          </div>
        </div>

        <div class="modal-body hthp-report-body">
          <section class="hthp-rpt-sec">
            <div class="hthp-rpt-sec-title">
              <span class="hthp-rpt-num">1</span>
              测试参数 Test Parameters
            </div>
            <div class="hthp-rpt-card">
              <div class="requirement-metrics">
                <div class="requirement-card is-pressure">
                  <div class="requirement-label">试验压力 Pressure</div>
                  <div class="requirement-value">{{ displayValue(currentOrder.targetPressure) }}</div>
                </div>
                <div class="requirement-card is-temp">
                  <div class="requirement-label">试验温度 Temperature</div>
                  <div class="requirement-value">{{ displayValue(currentOrder.targetTemp) }}</div>
                </div>
                <div class="requirement-card">
                  <div class="requirement-label">保持时间 Hold Time</div>
                  <div class="requirement-value">{{ displayValue(currentOrder.keepCondition) }}</div>
                </div>
              </div>
              <div class="report-grid two-cols">
                <div class="info-item"><div class="info-key">使用设备</div><div class="info-val">{{ displayValue(currentOrder.vesselType) }}</div></div>
                <div class="info-item"><div class="info-key">设备类型</div><div class="info-val">{{ displayValue(currentOrder.type) }}</div></div>
                <div class="info-item"><div class="info-key">在线测试</div><div class="info-val">{{ currentOrder.sanxinIsSanxin ? '是' : '否' }}</div></div>
                <div class="info-item"><div class="info-key">其它要求</div><div class="info-val">{{ displayValue(currentOrder.remark) }}</div></div>
              </div>
            </div>
          </section>

          <section class="hthp-rpt-sec">
            <div class="hthp-rpt-sec-title">
              <span class="hthp-rpt-num">2</span>
              测试步骤 Test Steps
            </div>
            <div class="hthp-rpt-card">
              <ol v-if="testStepItems.length" class="report-list report-list-plain">
                <li v-for="(item, idx) in testStepItems" :key="idx">{{ item }}</li>
              </ol>
              <div v-else class="text-muted">暂无测试步骤</div>
            </div>
          </section>

          <section class="hthp-rpt-sec">
            <div class="hthp-rpt-sec-title">
              <span class="hthp-rpt-num">3</span>
              测试目的 Test Purpose
            </div>
            <div class="hthp-rpt-card">
              <div class="purpose-copy purpose-copy-direct">{{ testPurposeText }}</div>
            </div>
          </section>

          <section class="hthp-rpt-sec">
            <div class="hthp-rpt-sec-title">
              <span class="hthp-rpt-num">4</span>
              安全风险 Safety Risks
            </div>
            <div class="hthp-rpt-card">
              <ol v-if="safetyRiskItems.length" class="report-list report-list-plain">
                <li v-for="(item, idx) in safetyRiskItems" :key="idx">{{ item }}</li>
              </ol>
              <div v-else class="text-muted">暂无安全风险说明</div>
            </div>
          </section>

          <section class="hthp-rpt-sec">
            <div class="hthp-rpt-sec-title">
              <span class="hthp-rpt-num">5</span>
              报告/表单信息 Report Info
            </div>
            <div class="report-info-strip">
              <div v-for="item in reportInfoCards" :key="item.label" class="report-info-card">
                <div class="report-info-label">{{ item.label }}</div>
                <div class="report-info-value">{{ item.value }}</div>
              </div>
            </div>
            <div class="report-org-card">
              <div class="report-info-label">测试机构 Accredited Testing Organization</div>
              <div class="report-info-value">制造中心测试中心</div>
            </div>
          </section>

          <section class="hthp-rpt-sec">
            <div class="hthp-rpt-sec-title">
              <span class="hthp-rpt-num">6</span>
              基本工单信息 Work Order Info
            </div>
            <div class="hthp-rpt-card">
              <div class="report-grid">
                <div class="info-item"><div class="info-key">任务编号</div><div class="info-val">{{ currentOrder.no }}</div></div>
                <div class="info-item"><div class="info-key">委托编号</div><div class="info-val">{{ displayValue(currentOrder.entrustNo) }}</div></div>
                <div class="info-item"><div class="info-key">接收编号</div><div class="info-val">{{ displayValue(currentOrder.receivingNo) }}</div></div>
                <div class="info-item"><div class="info-key">申请人</div><div class="info-val">{{ displayValue(currentOrder.applicant) }}</div></div>
                <div class="info-item"><div class="info-key">申请单位</div><div class="info-val">{{ displayValue(currentOrder.applicantUnit) }}</div></div>
                <div class="info-item"><div class="info-key">申请日期</div><div class="info-val">{{ displayValue(currentOrder.applyDate || currentOrder.applicationDate) }}</div></div>
                <div class="info-item"><div class="info-key">项目名称</div><div class="info-val">{{ displayValue(currentOrder.projectName) }}</div></div>
                <div class="info-item"><div class="info-key">计划时间</div><div class="info-val">{{ displayValue(currentOrder.plannedTime) }}</div></div>
                <div class="info-item"><div class="info-key">工单状态</div><div class="info-val">{{ displayValue(currentOrder.status) }}</div></div>
              </div>
            </div>
          </section>

          <section class="hthp-rpt-sec">
            <div class="hthp-rpt-sec-title">
              <span class="hthp-rpt-num">7</span>
              试件信息 Testing Item Information
            </div>
            <div class="hthp-rpt-card">
              <div class="report-grid">
                <div class="info-item"><div class="info-key">当前仪器 Name</div><div class="info-val">{{ currentInstrument?.label || '-' }}</div></div>
                <div class="info-item"><div class="info-key">SN 编号 NO.</div><div class="info-val">{{ currentInstrument?.sn || '-' }}</div></div>
                <div class="info-item"><div class="info-key">数量 Quantity</div><div class="info-val">{{ displayValue(currentInstrument?.quantity) }}</div></div>
                <div class="info-item"><div class="info-key">测试类型</div><div class="info-val">{{ displayValue(currentInstrument?.testType || currentOrder.testType) }}</div></div>
                <div class="info-item"><div class="info-key">仪器长度</div><div class="info-val">{{ displayValue(currentInstrument?.instrumentLength) }}</div></div>
                <div class="info-item"><div class="info-key">最大直径</div><div class="info-val">{{ displayValue(currentInstrument?.maxDiameter || currentOrder.maxDiameter) }}</div></div>
              </div>
              <div class="instrument-list-card">
                <div class="report-info-label">工单仪器清单</div>
                <div class="instrument-pill-row">
                  <span v-for="item in (currentOrder.items || [])" :key="item.id" class="instrument-pill">
                    {{ item.label }} / {{ item.sn }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section class="hthp-rpt-sec">
            <div class="hthp-rpt-sec-title">
              <span class="hthp-rpt-num">8</span>
              配件来源 / 附加说明 Fittings &amp; Notes
            </div>
            <div class="hthp-rpt-card stacked-card">
              <div class="report-grid two-cols">
                <div class="info-item"><div class="info-key">设备清单</div><div class="info-val">{{ displayValue(currentOrder.equipmentList) }}</div></div>
                <div class="info-item"><div class="info-key">仪器组合</div><div class="info-val">{{ displayValue(currentOrder.instrumentCombination) }}</div></div>
              </div>
              <div class="text-block">
                <div class="text-block-title">备注说明</div>
                <div class="purpose-copy">{{ displayValue(currentOrder.remark) }}</div>
              </div>
            </div>
          </section>

          <section class="hthp-rpt-sec">
            <div class="hthp-rpt-sec-title">
              <span class="hthp-rpt-num">9</span>
              签字附件 Attachments &amp; Signatures
            </div>
            <div class="hthp-rpt-card">
              <div class="report-grid two-cols">
                <div class="info-item"><div class="info-key">三新确认日期</div><div class="info-val">{{ displayValue(currentOrder.sanxinConfirmDate) }}</div></div>
                <div class="info-item"><div class="info-key">是否三新测试</div><div class="info-val">{{ currentOrder.sanxinIsSanxin ? '是' : '否' }}</div></div>
                <div class="info-item"><div class="info-key">测试方确认 1</div><div class="info-val">{{ yesNoText(currentOrder.sanxinTesterItem1) }}</div></div>
                <div class="info-item"><div class="info-key">测试方确认 2</div><div class="info-val">{{ yesNoText(currentOrder.sanxinTesterItem2) }}</div></div>
              </div>
              <div class="signature-grid">
                <div class="signature-card">
                  <div class="signature-label">申请方签字 Applicant</div>
                  <div class="signature-name">{{ displayValue(currentOrder.applicant) }}</div>
                </div>
                <div class="signature-card">
                  <div class="signature-label">测试方签字（管理员）Reviewer</div>
                  <img v-if="currentOrder.adminSignatureUrl" class="signature-img" :src="currentOrder.adminSignatureUrl" alt="管理员签名" />
                  <div v-else class="signature-empty">尚未上传签名</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="modal-footer hthp-report-footer">
          <div>报告编号：{{ currentOrder.no || '-' }} · {{ currentOrder.applyDate || '-' }}</div>
          <button class="btn btn-primary" @click="detailModalVisible = false">关闭</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
<style scoped>
.panel {
  --capture-ink: #1f2937;
  --capture-muted: #64748b;
  --capture-line: rgba(148, 163, 184, 0.32);
  --capture-amber: #2563eb;
  --capture-green: var(--color-accent-green, #10b981);
  --capture-red: #dc2626;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.testing-scroll-region {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 8px;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.ocr-capture-card {
  --capture-amber-soft: rgba(245, 158, 11, 0.12);
  border: 1px solid var(--capture-line);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(248, 250, 252, 0.94), rgba(241, 245, 249, 0.82)),
    radial-gradient(circle at 18% 0%, rgba(245, 158, 11, 0.13), transparent 34%);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
  padding: 18px;
  margin: 0 0 12px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.overview-zone {
  flex: 0 0 35%;
  min-height: 260px;
  padding: 15px;
  border: 1px solid #dce5f4;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 5px 18px rgba(23, 32, 51, 0.05);
}

.overview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 11px;
}

.overview-title {
  color: var(--capture-ink);
  font-size: 16px;
  font-weight: 800;
}

.overview-live {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid #e2e8f1;
  border-radius: 999px;
  background: #f8fafc;
  color: #667085;
  font-size: 12px;
  font-weight: 700;
}

.overview-live i {
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: #98a2b3;
}

.overview-live.active {
  border-color: #b7dfcb;
  background: #effaf4;
  color: #28715d;
}

.overview-live.active i {
  background: #2f855a;
  box-shadow: 0 0 0 3px rgba(47, 133, 90, 0.12);
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.overview-metric {
  min-width: 0;
  min-height: 70px;
  padding: 10px 11px;
  border: 1px solid #e3e9f2;
  border-radius: 9px;
  background: #f8fafc;
}

.overview-metric > span {
  display: block;
  overflow: hidden;
  color: #667085;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-metric > strong {
  display: block;
  margin-top: 8px;
  overflow: hidden;
  color: #172033;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-upper {
  border-color: rgba(225, 75, 85, 0.2);
  background: rgba(225, 75, 85, 0.06);
}

.metric-upper > strong { color: #c53d48; }

.metric-lower {
  border-color: rgba(245, 158, 11, 0.22);
  background: rgba(245, 158, 11, 0.07);
}

.metric-lower > strong { color: #c97508; }

.metric-pressure-live {
  border-color: rgba(63, 105, 201, 0.2);
  background: rgba(63, 105, 201, 0.07);
}

.metric-pressure-live > strong { color: #315bb8; }

.overview-status-metric,
.overview-time-metric {
  grid-column: span 2;
}

.overview-status-metric > strong {
  font-family: inherit;
  font-size: 13px;
}

.overview-time-metric > strong {
  font-size: 14px;
}

.overview-time-metric.remaining {
  border-color: rgba(37, 99, 235, 0.18);
  background: rgba(37, 99, 235, 0.05);
}

.overview-time-metric.remaining > strong {
  color: #2557a7;
  font-size: 18px;
}

.ocr-capture-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.capture-title-block {
  min-width: 0;
}

.capture-kicker {
  color: var(--capture-amber);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  margin-bottom: 4px;
}

.ocr-status {
  margin-top: 5px;
  color: var(--capture-muted);
  font-size: 13px;
  line-height: 1.4;
}

.connect-ocr-btn {
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-cyan, #06b6d4));
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 800;
  min-width: 180px;
  padding: 11px 18px;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.24);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}

.connect-ocr-btn:hover {
  filter: saturate(1.05);
  transform: translateY(-1px);
  box-shadow: 0 16px 30px rgba(37, 99, 235, 0.28);
}

.mono-value {
  font-family: 'JetBrains Mono', monospace;
}

.capture-progress-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  margin-bottom: 16px;
}

.capture-progress-fill {
  height: 100%;
  min-width: 8px;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-accent-blue), var(--color-accent-cyan, #06b6d4));
  transition: width 0.28s ease;
}

.export-path {
  margin-top: 10px;
  font-size: 12px;
  color: var(--color-accent-blue);
  word-break: break-all;
}

.monitoring-board {
  flex: 1 1 65%;
  display: grid;
  grid-template-columns: minmax(0, 2.45fr) minmax(310px, 1fr);
  gap: 14px;
  min-height: 500px;
  margin-top: 14px;
}

.monitoring-chart-card {
  border: 1px solid #dce5f4;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 5px 18px rgba(23, 32, 51, 0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.monitoring-order-card {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.monitoring-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.monitoring-chart-card .monitoring-card-head {
  min-height: 52px;
  padding: 11px 14px;
  border-bottom-color: #e6ebf3;
}

.monitoring-card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  color: var(--capture-ink);
}

.monitoring-card-title svg {
  color: var(--color-accent-blue);
  font-size: 18px;
}

.monitoring-card-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.monitoring-series,
.monitoring-count,
.monitoring-live-state,
.monitoring-updated {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.chart-head-meta {
  gap: 8px;
  color: #667085;
}

.monitoring-live-state,
.monitoring-count {
  border: 1px solid #e2e8f1;
  background: #f8fafc;
  color: #667085;
}

.monitoring-live-state i {
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: #98a2b3;
}

.monitoring-live-state.active {
  border-color: #b7dfcb;
  background: #effaf4;
  color: #28715d;
}

.monitoring-live-state.active i {
  background: #2f855a;
  box-shadow: 0 0 0 3px rgba(47, 133, 90, 0.12);
}

.monitoring-updated {
  height: auto;
  padding: 0;
  color: #7a8190;
  font-weight: 500;
}

.monitoring-chart-subbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px;
  border-bottom: 1px solid #edf1f7;
  background: #fbfcfe;
}

.chart-window-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.chart-window-label {
  margin-right: 2px;
  color: #667085;
  font-size: 12px;
  font-weight: 600;
}

.chart-window-custom {
  padding: 3px 7px;
  border-radius: 999px;
  background: #fff2d7;
  color: #a15c00;
  font-size: 11px;
  font-weight: 700;
}

.chart-window-control button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #d8e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #475467;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.chart-window-control button:hover {
  border-color: #a9bce4;
  color: #2557a7;
}

.chart-window-control button.active {
  border-color: #3f69c9;
  background: #3f69c9;
  color: #ffffff;
}

.chart-series-legend {
  gap: 7px;
}

.chart-series-label {
  color: #667085;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.monitoring-series::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-right: 6px;
}

.series-hot {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
}

.series-hot::before {
  background: #ef4444;
}

.series-warm {
  color: #ea580c;
  background: rgba(249, 115, 22, 0.08);
}

.series-warm::before {
  background: #f97316;
}

.series-pressure {
  color: #0284c7;
  background: rgba(14, 165, 233, 0.1);
}

.series-pressure::before {
  background: #0ea5e9;
}

.monitoring-stats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 14px 4px;
  background: #ffffff;
}

.monitoring-series {
  border: 1px solid transparent;
  cursor: pointer;
  gap: 5px;
  transition: opacity 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.monitoring-series:hover {
  border-color: currentColor;
}

.monitoring-series svg {
  flex: 0 0 auto;
  font-size: 14px;
}

.monitoring-series.inactive {
  border-color: #e1e6ee;
  background: #f5f7fa;
  color: #98a2b3;
  opacity: 0.78;
}

.monitoring-series.inactive::before {
  background: #b8c0cc;
}

.chart-series-reset {
  height: 24px;
  padding: 0 8px;
  border: 1px dashed #a9bce4;
  border-radius: 999px;
  background: #fff;
  color: #315bb8;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.monitoring-stat {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #e3e9f2;
  border-radius: 7px;
  background: #fbfcfe;
}

.monitoring-stat span {
  display: block;
  margin-bottom: 4px;
  overflow: hidden;
  color: #667085;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitoring-stat strong {
  display: block;
  overflow: hidden;
  color: #172033;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 15px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitoring-stat.stat-hot strong {
  color: #c53d48;
}

.monitoring-stat.stat-warm strong {
  color: #c97508;
}

.monitoring-stat.stat-pressure strong {
  color: #315bb8;
}

.monitoring-chart-body {
  flex: 1 1 auto;
  min-height: 400px;
  position: relative;
  padding: 0 10px 10px;
}

.monitoring-chart {
  width: 100%;
  height: 100%;
  min-height: 440px;
}

.monitoring-chart-empty {
  position: absolute;
  left: 50%;
  top: 43%;
  max-width: calc(100% - 40px);
  transform: translate(-50%, -50%);
  color: #7a8190;
  font-size: 14px;
  text-align: center;
  pointer-events: none;
}

.compact-order-card {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.92)),
    radial-gradient(circle at 88% 2%, rgba(16, 185, 129, 0.1), transparent 36%);
}

.compact-order-head {
  padding: 13px 14px;
}

.current-order-no {
  display: inline-flex;
  align-items: center;
  max-width: 160px;
  min-height: 24px;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--capture-green);
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.18);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-order-body {
  padding: 14px;
}

.testing-item-block {
  padding: 13px 14px;
  border-radius: 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.testing-item-kicker {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--capture-muted);
}

.testing-item-name {
  margin-top: 7px;
  color: var(--capture-ink);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.35;
}

.testing-item-sn {
  margin-top: 4px;
  color: var(--capture-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.metric-card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.metric-card {
  min-width: 0;
  min-height: 82px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.76);
}

.metric-label {
  color: var(--capture-muted);
  font-size: 11px;
  font-weight: 700;
}

.metric-value {
  margin-top: 9px;
  color: var(--capture-ink);
  font-size: 20px;
  font-weight: 900;
  line-height: 1.1;
  word-break: break-word;
}

.metric-temp {
  background: rgba(239, 68, 68, 0.07);
  border-color: rgba(239, 68, 68, 0.15);
}

.metric-temp .metric-value {
  color: #dc2626;
}

.metric-pressure {
  background: rgba(14, 165, 233, 0.08);
  border-color: rgba(14, 165, 233, 0.16);
}

.metric-pressure .metric-value {
  color: #0284c7;
}

.full-order-btn {
  width: 100%;
  margin-top: 13px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 14px;
  background: rgba(37, 99, 235, 0.08);
  color: var(--color-accent-blue);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 42px;
  font-size: 13px;
  font-weight: 800;
  transition: transform 0.16s ease, background 0.16s ease;
}

.full-order-btn:hover {
  background: rgba(37, 99, 235, 0.12);
  transform: translateY(-1px);
}

.monitoring-order-empty {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--capture-muted);
  font-size: 13px;
  padding: 18px;
}

.monitoring-order-empty svg {
  font-size: 28px;
  color: #94a3b8;
}

.hthp-report-modal {
  width: 780px;
  max-width: 94vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.hthp-report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 10px;
}

.hthp-report-header .modal-title {
  font-size: 16px;
  line-height: 1.25;
  font-weight: 800;
}

.hthp-report-header .badge {
  padding: 4px 10px;
  font-size: 11px;
}

.report-kicker,
.report-subtitle,
.report-info-label {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.report-kicker {
  margin-bottom: 2px;
  font-weight: 700;
}

.report-subtitle {
  margin-top: 1px;
  font-weight: 600;
}

.report-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.modal-close-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hthp-report-body {
  flex: 1;
  overflow: auto;
  padding: 14px 16px;
}

.hthp-report-body::-webkit-scrollbar {
  width: 8px;
}

.hthp-report-body::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.18);
  border-radius: 999px;
}

.hthp-rpt-sec {
  margin-bottom: 12px;
}

.hthp-rpt-sec:last-child {
  margin-bottom: 0;
}

.hthp-rpt-sec-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.hthp-rpt-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--color-accent-blue);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}

.hthp-rpt-card,
.report-org-card,
.report-info-card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 9px;
}

.hthp-rpt-card {
  padding: 10px 12px;
}

.report-info-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
  margin-bottom: 8px;
}

.report-info-card,
.report-org-card {
  padding: 9px 12px;
  background: var(--color-bg-tertiary);
}

.report-info-value {
  margin-top: 3px;
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 700;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.report-grid.two-cols {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.report-grid .info-item {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
}

.hthp-report-body .info-key {
  font-size: 10px;
}

.hthp-report-body .info-val {
  margin-top: 3px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}

.instrument-list-card,
.text-block {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
}

.instrument-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 8px;
}

.instrument-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  color: var(--color-accent-blue);
  font-size: 11px;
  font-weight: 700;
}

.requirement-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}

.requirement-card {
  min-height: 58px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.requirement-card.is-pressure {
  background: rgba(14, 165, 233, 0.07);
  border: 1px solid rgba(14, 165, 233, 0.16);
}

.requirement-card.is-temp {
  background: rgba(239, 68, 68, 0.07);
  border: 1px solid rgba(239, 68, 68, 0.16);
}

.requirement-label,
.text-block-title,
.signature-label {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 700;
}

.requirement-value {
  margin-top: 4px;
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.2;
}

.requirement-card.is-pressure .requirement-value {
  color: #0284c7;
}

.requirement-card.is-temp .requirement-value {
  color: #dc2626;
}

.stacked-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.text-block {
  margin-top: 0;
}

.report-list {
  margin: 7px 0 0;
  padding-left: 18px;
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.7;
}

.report-list-plain {
  margin-top: 0;
}

.purpose-copy {
  margin-top: 6px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.7;
}

.purpose-copy-direct {
  margin-top: 0;
}

.signature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.signature-card {
  min-height: 84px;
  padding: 12px;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  text-align: center;
}

.signature-name {
  margin-top: 14px;
  color: var(--color-text-primary);
  font-size: 15px;
  font-weight: 800;
}

.signature-img {
  max-height: 54px;
  max-width: 160px;
  object-fit: contain;
  display: block;
  margin: 8px auto 0;
}

.signature-empty {
  width: 104px;
  height: 38px;
  margin: 9px auto 0;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

.hthp-report-footer {
  align-items: center;
  justify-content: space-between;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.hthp-report-footer .btn {
  min-height: 34px;
  padding: 0 18px;
  border-radius: 8px;
  font-size: 13px;
}

.test-controls {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin-top: 10px;
}

.control-action {
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 14px;
  background: #fff;
  color: var(--capture-ink);
  cursor: pointer;
  min-height: 58px;
  padding: 8px 11px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.control-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  transform: none;
  box-shadow: none;
}

.control-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.11);
}

.control-icon {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 11px;
  font-size: 17px;
}

.control-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-copy strong {
  font-size: 14px;
  line-height: 1.15;
}

.control-copy small {
  color: var(--capture-muted);
  font-size: 11px;
}

.control-action-pause .control-icon {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}

.control-action-start .control-icon {
  color: #047857;
  background: rgba(16, 185, 129, 0.14);
}

.control-action-reconnect .control-icon {
  color: #0369a1;
  background: rgba(14, 165, 233, 0.13);
}

.control-action-stop .control-icon {
  color: var(--capture-red);
  background: rgba(239, 68, 68, 0.12);
}

.control-action-end {
  border-color: rgba(37, 99, 235, 0.28);
}

.control-action-end .control-icon {
  color: var(--capture-green);
  background: rgba(37, 99, 235, 0.13);
}

@media (max-width: 1100px) {
  .monitoring-board {
    grid-template-columns: 1fr;
  }

  .test-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .overview-status-metric,
  .overview-time-metric {
    grid-column: span 2;
  }

  .monitoring-chart {
    height: 320px;
    min-height: 320px;
  }
}

@media (max-width: 768px) {
  .ocr-capture-head,
  .monitoring-card-head,
  .monitoring-chart-subbar,
  .hthp-report-header,
  .hthp-report-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .monitoring-card-meta {
    justify-content: flex-start;
  }

  .overview-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .overview-metrics,
  .test-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-status-metric,
  .overview-time-metric {
    grid-column: span 2;
  }

  .metric-card-grid,
  .report-info-strip,
  .report-grid,
  .report-grid.two-cols,
  .requirement-metrics,
  .signature-grid {
    grid-template-columns: 1fr;
  }

  .connect-ocr-btn {
    width: 100%;
  }
}
</style>
