<script setup lang="ts">
import { computed } from 'vue'
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

const orderDetailFields = computed(() => {
  const selected = props.currentSelected
  if (!selected) return []

  const { order, instrument } = selected
  return [
    { label: '工单ID', value: order.dbId ?? '-' },
    { label: '任务编号', value: order.no, code: true },
    { label: '委托编号', value: order.entrustNo },
    { label: '申请人', value: order.applicant },
    { label: '申请单位', value: order.applicantUnit },
    { label: '申请日期', value: order.applyDate },
    { label: '接收编号', value: order.receivingNo },
    { label: '使用设备', value: order.vesselType },
    { label: '设备类型', value: order.type },
    { label: '目标温度', value: order.targetTemp, hot: true },
    { label: '目标压力', value: order.targetPressure, pressure: true },
    { label: '保温保压时间', value: order.keepCondition },
    { label: '最大直径', value: order.maxDiameter || '-' },
    { label: '当前状态', value: order.status },
    { label: '当前仪器', value: instrument.label },
    { label: '当前仪器SN', value: instrument.sn },
    { label: '仪器数量', value: `${order.items.length} 台` },
    { label: '三新确认日期', value: order.sanxinConfirmDate || '-' },
    { label: '测试方确认1', value: order.sanxinTesterItem1 || '-' },
    { label: '测试方确认2', value: order.sanxinTesterItem2 || '-' },
    { label: '是否三新测试', value: order.sanxinIsSanxin ? '是' : '否' },
    { label: '管理员签名', value: order.adminSignatureUrl ? '已上传' : '未上传' },
    { label: '创建时间', value: order.createdAt || '-' },
    { label: '更新时间', value: order.updatedAt || '-' },
    { label: '备注', value: order.remark || '-', wide: true },
    {
      label: '仪器明细',
      value: order.items.map((item) => `${item.label} / ${item.sn}`).join('；') || '-',
      wide: true,
    },
  ]
})
</script>

<template>
  <div class="panel">
    <div class="ocr-bar">
      <div class="ocr-mini on">
        <div class="ocr-mini-title">🔴 上罐 · 250L容器（当前识别）</div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">上部水温</span><span class="ocr-val temp">{{ t1[t1.length - 1]?.toFixed(1) || '--.-' }} °C</span></div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">下部水温</span><span class="ocr-val temp">{{ t2[t2.length - 1]?.toFixed(2) || '--.-' }} °C</span></div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">容器压力</span><span class="ocr-val press">{{ p[p.length - 1]?.toFixed(3) || '--.--' }} MPa</span></div>
      </div>
      <div class="ocr-mini">
        <div class="ocr-mini-title">⚡ 系统状态</div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">测试状态</span><span class="badge" :class="testRunning ? 'badge-green' : ''">{{ testRunning ? '● 测试中' : '● 已暂停' }}</span></div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">已采集</span><span style="font-family:'JetBrains Mono'">{{ csvCount }} 条</span></div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">视频进度</span><span style="font-family:'JetBrains Mono'">{{ captureProgressPct }}%</span></div>
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

      <div class="capture-progress-track" aria-hidden="true">
        <div class="capture-progress-fill" :style="{ width: `${captureProgressPct}%` }"></div>
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
        <div class="monitoring-order-card">
          <div class="monitoring-card-head">
            <div class="monitoring-card-title">
              <Icon icon="mdi:clipboard-text-outline" />
              <span>当前工单</span>
            </div>
            <span class="monitoring-order-tag">{{ testRunning ? '测试中' : '已暂停' }}</span>
          </div>
          <div v-if="currentSelected" class="monitoring-order-body">
            <div class="monitoring-order-grid">
              <div
                v-for="field in orderDetailFields"
                :key="field.label"
                class="monitoring-order-item"
                :class="{ 'is-wide': field.wide }"
              >
                <div class="monitoring-order-label">{{ field.label }}</div>
                <div
                  class="monitoring-order-value"
                  :class="{
                    'is-code': field.code,
                    'is-hot': field.hot,
                    'is-pressure': field.pressure,
                    'is-multiline': field.wide,
                  }"
                >
                  {{ field.value }}
                </div>
              </div>
            </div>
            <div class="monitoring-order-footer">
              <div class="monitoring-order-stat">
                <span>采集状态</span>
                <strong>{{ testRunning ? '正常' : '暂停' }}</strong>
              </div>
              <div class="monitoring-order-stat">
                <span>已采集数据</span>
                <strong>{{ csvCount }} 条</strong>
              </div>
            </div>
          </div>
          <div v-else class="monitoring-order-empty">
            <Icon icon="mdi:clipboard-remove-outline" />
            <span>未选择排程仪器</span>
          </div>
        </div>
      </div>
      <div v-if="exportedCaptureDir" class="export-path">已保存：{{ exportedCaptureDir }}</div>
    </div>

    <div class="test-controls">
      <button class="control-action control-action-pause" v-if="testRunning" @click="emit('pause')">
        <span class="control-icon"><Icon icon="mdi:pause" /></span>
        <span class="control-copy">
          <strong>测试暂停</strong>
          <small>暂停采集进程</small>
        </span>
      </button>
      <button class="control-action control-action-pause" v-else @click="emit('resume')">
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
  --capture-green: #2563eb;
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
  grid-template-columns: minmax(0, 1fr) 380px;
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
.monitoring-count,
.monitoring-order-tag {
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

.monitoring-order-tag {
  color: var(--color-accent-blue);
  background: rgba(37, 99, 235, 0.08);
}

.monitoring-chart-body {
  padding: 8px 14px 14px;
}

.monitoring-chart {
  width: 100%;
  height: 420px;
  min-height: 420px;
}

.monitoring-order-body {
  padding: 14px;
}

.monitoring-order-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
}

.monitoring-order-item {
  min-width: 0;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.86));
}

.monitoring-order-item.is-wide {
  grid-column: 1 / -1;
}

.monitoring-order-label {
  font-size: 12px;
  color: var(--capture-muted);
}

.monitoring-order-value {
  margin-top: 7px;
  font-size: 14px;
  font-weight: 700;
  color: var(--capture-ink);
  line-height: 1.35;
  word-break: break-word;
}

.monitoring-order-value.is-code {
  font-size: 13px;
  color: var(--color-accent-blue);
}

.monitoring-order-value.is-hot {
  color: #dc2626;
}

.monitoring-order-value.is-pressure {
  color: #0284c7;
}

.monitoring-order-value.is-multiline {
  white-space: pre-wrap;
  line-height: 1.55;
}

.monitoring-order-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
}

.monitoring-order-stat {
  padding: 12px;
  border-radius: 14px;
  background: rgba(37, 99, 235, 0.06);
  border: 1px solid rgba(37, 99, 235, 0.12);
}

.monitoring-order-stat span {
  display: block;
  font-size: 12px;
  color: var(--capture-muted);
}

.monitoring-order-stat strong {
  display: block;
  margin-top: 7px;
  font-size: 18px;
  font-weight: 800;
  color: var(--capture-ink);
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

.live-measurement-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--capture-line);
}

.live-measurement-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.live-measurement-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--capture-ink);
}

.live-measurement-subtitle {
  margin-top: 3px;
  color: var(--capture-muted);
  font-size: 12px;
}

.live-measurement-head span {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  color: var(--capture-muted);
  font-size: 11px;
  font-weight: 700;
}

.live-measurement-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.live-measurement-item {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  padding: 10px 12px;
  min-width: 0;
}

.live-measurement-name {
  color: var(--color-text-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.live-measurement-value {
  margin-top: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 15px;
  font-weight: 700;
}

.live-measurement-confidence {
  margin-top: 4px;
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.channel-unit {
  margin-left: 2px;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.live-measurement-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 12px;
  border: 1px dashed var(--capture-line);
  border-radius: 12px;
  color: var(--capture-muted);
  font-size: 12px;
}

@media (max-width: 1100px) {
  .test-controls {
    grid-template-columns: 1fr;
  }

  .monitoring-board {
    grid-template-columns: 1fr;
  }

  .monitoring-chart {
    height: 320px;
    min-height: 320px;
  }
}

@media (max-width: 768px) {
  .monitoring-card-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .monitoring-card-meta {
    justify-content: flex-start;
  }

  .monitoring-order-grid,
  .monitoring-order-footer {
    grid-template-columns: 1fr;
  }
}
</style>
