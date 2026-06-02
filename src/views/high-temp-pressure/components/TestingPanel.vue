<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { ScheduledSelection } from '../types'
import type { HighTempPressureVideoMeasurement } from '../composables/useHighTempPressureTesting'

const props = defineProps<{
  t1: number[]
  t2: number[]
  p: number[]
  testRunning: boolean
  csvCount: number
  currentSelected: ScheduledSelection | null
  selectedScheduledOrders: ScheduledSelection[]
  videoFileName: string
  videoUrl: string
  captureProgressPct: number
  captureStatusText: string
  latestFrameUrl: string
  exportedCaptureDir: string
  videoMeasurements: HighTempPressureVideoMeasurement[]
}>()

const emit = defineEmits<{
  'select-video': []
  pause: []
  resume: []
  'open-stop-modal': []
  'open-end-modal': []
}>()

const detailModalVisible = ref(false)
const activeSelectionIndex = ref(0)
const detailModuleCount = 6

const displaySelections = computed(() => {
  if (props.selectedScheduledOrders.length) return props.selectedScheduledOrders
  return props.currentSelected ? [props.currentSelected] : []
})

const activeSelection = computed(() => displaySelections.value[activeSelectionIndex.value] || null)
const currentOrder = computed(() => activeSelection.value?.order ?? null)
const currentInstrument = computed(() => activeSelection.value?.instrument ?? null)
const currentOrderBadge = computed(() => currentOrder.value?.no || currentOrder.value?.receivingNo || '未选择')
const captureProgressSafe = computed(() => {
  const value = Number(props.captureProgressPct)
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
})

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

watch(
  () => displaySelections.value.map((selection) => selection.instrument.id).join('|'),
  () => {
    activeSelectionIndex.value = 0
  }
)
</script>

<template>
  <div class="panel">
    <div class="ocr-bar">
      <div class="ocr-mini on">
        <div class="ocr-mini-title">视频 OCR · 当前识别</div>
        <div class="ocr-mini-row">
          <span class="ocr-mini-label">上部水温</span>
          <span class="ocr-val temp">{{ t1[t1.length - 1]?.toFixed(1) || '--.-' }} °C</span>
        </div>
        <div class="ocr-mini-row">
          <span class="ocr-mini-label">下部水温</span>
          <span class="ocr-val temp">{{ t2[t2.length - 1]?.toFixed(2) || '--.-' }} °C</span>
        </div>
        <div class="ocr-mini-row">
          <span class="ocr-mini-label">容器压力</span>
          <span class="ocr-val press">{{ p[p.length - 1]?.toFixed(3) || '--.--' }} MPa</span>
        </div>
      </div>
      <div class="ocr-mini">
        <div class="ocr-mini-title">系统状态</div>
        <div class="ocr-mini-row">
          <span class="ocr-mini-label">测试状态</span>
          <span class="badge" :class="testRunning ? 'badge-green' : ''">{{ testRunning ? '测试中' : '已暂停' }}</span>
        </div>
        <div class="ocr-mini-row">
          <span class="ocr-mini-label">已采集</span>
          <span class="mono-value">{{ csvCount }} 条</span>
        </div>
        <div class="ocr-mini-row">
          <span class="ocr-mini-label">视频进度</span>
          <span class="mono-value">{{ captureProgressSafe }}%</span>
        </div>
      </div>
    </div>

    <div class="video-capture-card">
      <div class="video-capture-head">
        <div class="capture-title-block">
          <div class="capture-kicker">VIDEO OCR</div>
          <div class="card-title">视频识别采集</div>
          <div class="video-status">{{ captureStatusText }}</div>
        </div>
        <button class="select-video-btn" @click="emit('select-video')">
          <Icon icon="mdi:video-switch-outline" />
          {{ videoFileName ? '重新选择视频' : '选择视频并开始采集' }}
        </button>
      </div>

      <div
        class="capture-progress-track"
        role="progressbar"
        aria-label="视频识别采集进度"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="captureProgressSafe"
      >
        <div class="capture-progress-fill" :style="{ width: `${captureProgressSafe}%` }"></div>
      </div>

      <div class="monitoring-board">
        <div class="monitoring-chart-card">
          <div class="monitoring-card-head">
            <div class="monitoring-card-title">
              <Icon icon="mdi:chart-line" />
              <span>实时监控曲线</span>
            </div>
            <div class="monitoring-card-meta">
              <span class="monitoring-series series-hot">上部水温</span>
              <span class="monitoring-series series-warm">下部水温</span>
              <span class="monitoring-series series-pressure">容器压力 x10</span>
              <span class="monitoring-status">{{ captureStatusText }}</span>
              <span class="monitoring-count">{{ csvCount }} 条</span>
            </div>
          </div>
          <div class="monitoring-chart-body">
            <div id="htp-chart" class="monitoring-chart"></div>
          </div>
        </div>

        <div class="monitoring-order-card compact-order-card">
          <div class="monitoring-card-head compact-order-head">
            <div class="monitoring-card-title">
              <Icon icon="mdi:file-document-outline" />
              <span>当前工单</span>
            </div>
            <div class="compact-order-head-actions">
              <div v-if="displaySelections.length > 1" class="current-order-tabs" aria-label="切换工单">
                <button
                  v-for="(_, index) in displaySelections"
                  :key="displaySelections[index].instrument.id"
                  class="current-order-tab"
                  :class="{ 'is-active': activeSelectionIndex === index }"
                  type="button"
                  :aria-pressed="activeSelectionIndex === index"
                  @click="activeSelectionIndex = index"
                >
                  {{ ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'][index] || index + 1 }}
                </button>
              </div>
              <span class="current-order-no">{{ currentOrderBadge }}</span>
            </div>
          </div>

          <div v-if="activeSelection" class="compact-order-body">
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

    <div class="test-controls">
      <button v-if="testRunning" class="control-action control-action-pause" @click="emit('pause')">
        <span class="control-icon"><Icon icon="mdi:pause" /></span>
        <span class="control-copy">
          <strong>测试暂停</strong>
          <small>暂停采集进程</small>
        </span>
      </button>
      <button v-else class="control-action control-action-pause" @click="emit('resume')">
        <span class="control-icon"><Icon icon="mdi:play" /></span>
        <span class="control-copy">
          <strong>继续测试</strong>
          <small>恢复视频识别</small>
        </span>
      </button>
      <button class="control-action control-action-stop" @click="emit('open-stop-modal')">
        <span class="control-icon"><Icon icon="mdi:stop" /></span>
        <span class="control-copy">
          <strong>测试中止</strong>
          <small>放弃本次采集</small>
        </span>
      </button>
      <button class="control-action control-action-end" @click="emit('open-end-modal')">
        <span class="control-icon"><Icon icon="mdi:check" /></span>
        <span class="control-copy">
          <strong>测试结束</strong>
          <small>保存识别结果</small>
        </span>
      </button>
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
}

.video-capture-card {
  --capture-amber-soft: rgba(245, 158, 11, 0.12);
  border: 1px solid var(--capture-line);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(248, 250, 252, 0.94), rgba(241, 245, 249, 0.82)),
    radial-gradient(circle at 18% 0%, rgba(245, 158, 11, 0.13), transparent 34%);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
  padding: 18px;
  margin: 14px 0;
}

.video-capture-head {
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

.video-status {
  margin-top: 5px;
  color: var(--capture-muted);
  font-size: 13px;
  line-height: 1.4;
}

.select-video-btn {
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

.select-video-btn:hover {
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 14px;
  margin-top: 16px;
}

.monitoring-chart-card,
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
.monitoring-status,
.monitoring-count {
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

.monitoring-status,
.monitoring-count {
  color: var(--capture-muted);
  background: rgba(148, 163, 184, 0.12);
}

.monitoring-chart-body {
  padding: 8px 14px 14px;
}

.monitoring-chart {
  width: 100%;
  height: 420px;
  min-height: 420px;
}

.compact-order-card {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.92)),
    radial-gradient(circle at 88% 2%, rgba(16, 185, 129, 0.1), transparent 36%);
}

.compact-order-head {
  padding: 13px 14px;
}

.compact-order-head-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.current-order-tabs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.current-order-tab {
  width: 26px;
  height: 26px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--capture-muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.current-order-tab:hover,
.current-order-tab.is-active {
  border-color: rgba(37, 99, 235, 0.42);
  background: rgba(37, 99, 235, 0.1);
  color: var(--color-accent-blue);
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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  padding: 4px 0 2px;
}

.control-action {
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 18px;
  background: #fff;
  color: var(--capture-ink);
  cursor: pointer;
  min-height: 74px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  text-align: left;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.07);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.control-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.11);
}

.control-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 14px;
  font-size: 20px;
}

.control-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-copy strong {
  font-size: 15px;
  line-height: 1.15;
}

.control-copy small {
  color: var(--capture-muted);
  font-size: 12px;
}

.control-action-pause .control-icon {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
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
  .test-controls,
  .monitoring-board {
    grid-template-columns: 1fr;
  }

  .monitoring-chart {
    height: 320px;
    min-height: 320px;
  }
}

@media (max-width: 768px) {
  .video-capture-head,
  .monitoring-card-head,
  .hthp-report-header,
  .hthp-report-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .monitoring-card-meta {
    justify-content: flex-start;
  }

  .ocr-bar,
  .metric-card-grid,
  .report-info-strip,
  .report-grid,
  .report-grid.two-cols,
  .requirement-metrics,
  .signature-grid {
    grid-template-columns: 1fr;
  }

  .select-video-btn {
    width: 100%;
  }
}
</style>
