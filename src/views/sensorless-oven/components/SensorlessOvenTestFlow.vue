<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { SensorlessOvenContext } from '../composables/useSensorlessOven'
import SensorlessOvenReportPanel from './SensorlessOvenReportPanel.vue'

const props = defineProps<{ ctx: SensorlessOvenContext }>()
const chartWindowOptions = [5, 30, 60, 240]
const {
  currentView,
  currentWorkOrder,
  preCheckItems,
  togglePreCheck,
  isPreCheckComplete,
  completePreCheck,
  cancelExperiment,
  backToDashboard,
  refreshWorkOrders,
  orderStatusMutating,
  isTestRunning,
  canStartTest,
  canPauseTest,
  canEndTest,
  displayTargetTemp,
  chartRef,
  chartSummary,
  chartSeriesVisibility,
  chartWindowMinutes,
  chartRangeLocked,
  setChartWindowMinutes,
  toggleChartSeries,
  showAllChartSeries,
  tempHistory,
  testPhase,
  startTest,
  pauseTest,
  endTest,
  startingTest,
} = props.ctx

const showReport = computed(() => currentView.value === 'monitoring' && testPhase.value === 'ended')

async function handleReportSubmitted() {
  try {
    await refreshWorkOrders()
  } catch {
    // 忽略刷新失败，报告已提交成功
  }
  backToDashboard()
}

const pageTitle = computed(() => (currentView.value === 'pre-check' ? '开机前安全检查' : '测试监控中'))
const allChartSeriesVisible = computed(() => chartSeriesVisibility.value.left && chartSeriesVisibility.value.right)
const selectedInstruments = computed(() => currentWorkOrder.value?.selectedInstruments || [])
const instrumentSummary = computed(() => {
  const list = selectedInstruments.value
  if (!list.length) return '未选择仪器'
  return list.map((item) => `${item.name} / ${item.sn}`).join('，')
})

const formatTemp = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '--'
  return `${value.toFixed(1)} °C`
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
</script>

<template>
  <div class="test-view">
    <div v-if="currentView !== 'monitoring'" class="test-header">
      <div class="header-left">
        <h2>{{ pageTitle }}</h2>
        <div class="order-tag">工单: {{ currentWorkOrder?.id }}</div>
      </div>
      <button class="back-btn" :disabled="orderStatusMutating" @click="cancelExperiment">
        <Icon icon="mdi:arrow-left" /> 返回主页
      </button>
    </div>

    <div class="test-content" :class="{ 'is-monitor-content': currentView === 'monitoring' }">
      <div v-if="currentView === 'pre-check'" class="modal-overlay">
        <div class="startup-check-modal">
          <h2 class="modal-title">开机检查</h2>

          <div class="check-list-container">
            <div class="check-list">
              <label
                v-for="item in preCheckItems"
                :key="item.id"
                class="check-item"
                :class="{ 'is-checked': item.checked }"
              >
                <div class="checkbox-wrapper">
                  <input type="checkbox" :checked="item.checked" @change="togglePreCheck(item.id)" />
                  <div class="custom-checkbox">
                    <Icon v-if="item.checked" icon="mdi:check" />
                  </div>
                </div>
                <span class="check-text">{{ item.text }}</span>
              </label>
            </div>
          </div>

          <div class="modal-actions">
            <button class="cancel-btn" :disabled="orderStatusMutating" @click="cancelExperiment">取消</button>
            <button class="next-btn" :disabled="!isPreCheckComplete" @click="completePreCheck">下一步</button>
          </div>
        </div>
      </div>

      <SensorlessOvenReportPanel
        v-else-if="showReport"
        :ctx="props.ctx"
        @submitted="handleReportSubmitted"
        @back="cancelExperiment"
      />

      <div v-else-if="currentView === 'monitoring'" class="panel">
        <div class="testing-scroll-region">
          <div class="ocr-capture-card">
            <div class="order-strip">
              <div class="order-strip-cell order-strip-main">
                <span class="order-strip-icon"><Icon icon="mdi:file-document-outline" /></span>
                <div class="order-strip-headings">
                  <div class="order-strip-name">{{ currentWorkOrder?.deviceName || '无感烘箱' }}</div>
                  <div class="order-strip-sub">
                    工单 {{ currentWorkOrder?.id || '-' }} · 申请人 {{ currentWorkOrder?.applicant || '-' }}
                  </div>
                </div>
              </div>
              <div class="order-strip-cell">
                <span>目标温度</span>
                <strong class="order-strip-temp">{{ displayTargetTemp === '--' ? '-' : `${displayTargetTemp}°C` }}</strong>
              </div>
              <div class="order-strip-cell">
                <span>测试平台</span>
                <strong>{{ currentWorkOrder?.testPlatform || '无感烘箱' }}</strong>
              </div>
              <div class="order-strip-cell">
                <span>测试仪器</span>
                <strong>{{ instrumentSummary }}</strong>
              </div>
              <button class="order-strip-back" :disabled="orderStatusMutating" @click="cancelExperiment">
                <Icon icon="mdi:arrow-left" /> 返回主页
              </button>
            </div>

            <section class="overview-zone">
              <div class="overview-metrics">
                <div class="overview-metric metric-left">
                  <span>左侧温度</span>
                  <strong>{{ formatTemp(chartSummary.latestLeft) }}</strong>
                </div>
                <div class="overview-metric metric-right">
                  <span>右侧温度</span>
                  <strong>{{ formatTemp(chartSummary.latestRight) }}</strong>
                </div>
                <div class="overview-metric">
                  <span>目标温度</span>
                  <strong>{{ displayTargetTemp === '--' ? '--' : `${displayTargetTemp} °C` }}</strong>
                </div>
                <div class="overview-metric">
                  <span>温度最高值</span>
                  <strong>{{ formatTemp(chartSummary.maxTemp) }}</strong>
                </div>
                <div class="overview-metric">
                  <span>温度最低值</span>
                  <strong>{{ formatTemp(chartSummary.minTemp) }}</strong>
                </div>
                <div class="overview-metric">
                  <span>已采集条数</span>
                  <strong>{{ chartSummary.count }} 条</strong>
                </div>
              </div>

              <div class="test-controls">
                <button class="control-action control-action-start" :disabled="!canStartTest" @click="startTest">
                  <span class="control-icon"><Icon icon="mdi:play" /></span>
                  <span class="control-copy">
                    <strong>测试开始</strong>
                    <small>{{ startingTest ? '正在连接设备...' : isTestRunning ? '采集进行中' : '按设置中的左右设备启动采集' }}</small>
                  </span>
                </button>
                <button class="control-action control-action-pause" :disabled="!canPauseTest" @click="pauseTest">
                  <span class="control-icon"><Icon icon="mdi:pause" /></span>
                  <span class="control-copy">
                    <strong>测试暂停</strong>
                    <small>暂停当前采集进程</small>
                  </span>
                </button>
                <button class="control-action control-action-end" :disabled="!canEndTest" @click="endTest">
                  <span class="control-icon"><Icon icon="mdi:check" /></span>
                  <span class="control-copy">
                    <strong>测试结束</strong>
                    <small>关闭串口并结束本次采集</small>
                  </span>
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
                      @click="setChartWindowMinutes(null)"
                    >
                      自动
                    </button>
                    <button
                      type="button"
                      :class="{ active: chartWindowMinutes === 0 && !chartRangeLocked }"
                      @click="setChartWindowMinutes(0)"
                    >
                      全程
                    </button>
                    <button
                      v-for="minutes in chartWindowOptions"
                      :key="minutes"
                      type="button"
                      :class="{ active: chartWindowMinutes === minutes && !chartRangeLocked }"
                      @click="setChartWindowMinutes(minutes)"
                    >
                      {{ minutes >= 60 ? `${minutes / 60} 小时` : `${minutes} 分钟` }}
                    </button>
                  </div>
                  <div class="chart-series-legend" role="group" aria-label="选择显示曲线">
                    <span class="chart-series-label">显示曲线</span>
                    <button
                      type="button"
                      class="monitoring-series series-left"
                      :class="{ inactive: !chartSeriesVisibility.left }"
                      :aria-pressed="chartSeriesVisibility.left"
                      @click="toggleChartSeries('left')"
                    >
                      左侧温度
                      <Icon :icon="chartSeriesVisibility.left ? 'mdi:eye-outline' : 'mdi:eye-off-outline'" />
                    </button>
                    <button
                      type="button"
                      class="monitoring-series series-right"
                      :class="{ inactive: !chartSeriesVisibility.right }"
                      :aria-pressed="chartSeriesVisibility.right"
                      @click="toggleChartSeries('right')"
                    >
                      右侧温度
                      <Icon :icon="chartSeriesVisibility.right ? 'mdi:eye-outline' : 'mdi:eye-off-outline'" />
                    </button>
                    <button
                      v-if="!allChartSeriesVisible"
                      type="button"
                      class="chart-series-reset"
                      @click="showAllChartSeries"
                    >
                      全部显示
                    </button>
                  </div>
                </div>

                <div class="monitoring-chart-body">
                  <div ref="chartRef" class="monitoring-chart"></div>
                  <div v-if="!tempHistory.length" class="monitoring-chart-empty">
                    {{ isTestRunning ? '正在等待第一个温度数据点' : '点击测试开始后显示左右侧温度曲线' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.test-view {
  flex: 1;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.test-header {
  padding: 10px 20px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-left h2 { margin: 0; font-size: 16px; }
.order-tag { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }
.back-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary);
}
.test-content {
  flex: 1;
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  justify-content: center;
}
.test-content.is-monitor-content {
  padding: 16px;
  overflow: hidden;
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
.startup-check-modal {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border-radius: 16px;
  padding: 32px;
  max-width: 700px;
  width: 100%;
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
}
.modal-title {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 24px;
}
.check-list-container {
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid var(--color-border);
}
.check-list { display: flex; flex-direction: column; gap: 12px; }
.check-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  cursor: pointer;
  padding: 10px;
  border-radius: 8px;
}
.check-item:hover { background: var(--color-bg-primary); }
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
  background: var(--color-bg-primary);
}
.check-item.is-checked .custom-checkbox {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
  color: #fff;
}
.check-text { font-size: 15px; line-height: 1.5; }
.modal-actions { display: flex; gap: 16px; }
.cancel-btn,
.next-btn {
  flex: 1;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.cancel-btn {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
.cancel-btn:disabled,
.next-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.next-btn {
  background: var(--color-accent-blue);
  color: #fff;
  border: none;
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.2);
}

.panel {
  --capture-ink: #1f2937;
  --capture-muted: #64748b;
  --capture-line: rgba(148, 163, 184, 0.32);
  --capture-green: var(--color-accent-green, #10b981);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.testing-scroll-region {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 8px;
}
.ocr-capture-card {
  border: 1px solid var(--capture-line);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(248, 250, 252, 0.94), rgba(241, 245, 249, 0.82)),
    radial-gradient(circle at 18% 0%, rgba(245, 158, 11, 0.13), transparent 34%);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
  padding: 12px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.overview-zone {
  flex: 0 0 auto;
  padding: 10px 12px;
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
  margin-bottom: 8px;
}
.capture-kicker {
  color: #2563eb;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  margin-bottom: 2px;
}
.overview-title {
  color: var(--capture-ink);
  font-size: 14px;
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
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}
.overview-metric {
  min-width: 0;
  min-height: 44px;
  padding: 6px 9px;
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
  margin-top: 3px;
  overflow: hidden;
  color: #172033;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metric-left {
  border-color: rgba(225, 75, 85, 0.2);
  background: rgba(225, 75, 85, 0.06);
}
.metric-left > strong { color: #c53d48; }
.metric-right {
  border-color: rgba(245, 158, 11, 0.22);
  background: rgba(245, 158, 11, 0.07);
}
.metric-right > strong { color: #c97508; }
.overview-time-metric { grid-column: span 2; }
.overview-time-metric > strong { font-size: 13px; }
.overview-time-metric.remaining {
  border-color: rgba(37, 99, 235, 0.18);
  background: rgba(37, 99, 235, 0.05);
}
.overview-time-metric.remaining > strong {
  color: #2557a7;
  font-size: 15px;
}
.test-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.control-action {
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 12px;
  background: #fff;
  color: var(--capture-ink);
  cursor: pointer;
  min-height: 42px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
}
.control-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  box-shadow: none;
}
.control-action:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.11);
}
.control-icon {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 9px;
  font-size: 15px;
}
.control-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.control-copy strong { font-size: 13px; line-height: 1.15; }
.control-copy small { color: var(--capture-muted); font-size: 10px; }
.control-action-start .control-icon {
  color: #047857;
  background: rgba(16, 185, 129, 0.14);
}
.control-action-pause .control-icon {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}
.control-action-end {
  border-color: rgba(37, 99, 235, 0.28);
}
.control-action-end .control-icon {
  color: var(--capture-green);
  background: rgba(37, 99, 235, 0.13);
}
.order-strip {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  border: 1px solid #dce5f4;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  box-shadow: 0 4px 14px rgba(23, 32, 51, 0.05);
}
.order-strip-cell {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 5px 12px;
  border-radius: 9px;
  border: 1px solid #e6ebf3;
  background: #f8fafc;
}
.order-strip-cell > span {
  color: #667085;
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}
.order-strip-cell > strong {
  color: #172033;
  font-size: 13px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-strip-temp { color: #c53d48 !important; }
.order-strip-main {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(16, 185, 129, 0.06);
}
.order-strip-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 9px;
  font-size: 16px;
  color: var(--capture-green);
  background: rgba(16, 185, 129, 0.14);
}
.order-strip-headings { min-width: 0; }
.order-strip-name {
  color: var(--capture-ink);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-strip-sub {
  color: #667085;
  font-size: 10px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-strip-back {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.order-strip-back:disabled { cursor: not-allowed; opacity: 0.5; }
.monitoring-board {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  margin-top: 10px;
}
.monitoring-chart-card {
  border: 1px solid #dce5f4;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 5px 18px rgba(23, 32, 51, 0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.monitoring-order-card {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
  overflow: auto;
  min-height: 0;
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
}
.monitoring-updated {
  color: #7a8190;
  font-size: 11px;
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
  flex-wrap: wrap;
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
  color: #b45309;
  font-size: 11px;
  font-weight: 700;
}
.chart-window-control button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #d8e0ec;
  border-radius: 999px;
  background: #fff;
  color: #667085;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
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
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.chart-series-label {
  color: #667085;
  font-size: 12px;
  font-weight: 600;
}
.monitoring-series {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  gap: 5px;
}
.monitoring-series::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-right: 6px;
}
.series-left {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
}
.series-left::before { background: #e14b55; }
.series-right {
  color: #ea580c;
  background: rgba(249, 115, 22, 0.08);
}
.series-right::before { background: #f59e0b; }
.monitoring-series.inactive {
  border-color: #e1e6ee;
  background: #f5f7fa;
  color: #98a2b3;
  opacity: 0.78;
}
.monitoring-series.inactive::before { background: #b8c0cc; }
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
.monitoring-chart-body {
  flex: 1 1 auto;
  min-height: 320px;
  position: relative;
  padding: 0 10px 10px;
}
.monitoring-chart {
  width: 100%;
  height: 100%;
  min-height: 320px;
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
.compact-order-head { padding: 13px 14px; }
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
.compact-order-body { padding: 14px; }
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
}
.testing-item-sn {
  margin-top: 4px;
  color: var(--capture-muted);
  font-size: 12px;
}
.metric-card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}
.metric-card {
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
.metric-temp .metric-value { color: #dc2626; }
.instrument-list-card {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
}
.report-info-label {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 700;
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

@media (max-width: 1100px) {
  .monitoring-board { grid-template-columns: 1fr; }
  .overview-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .overview-time-metric { grid-column: span 3; }
  .test-controls { grid-template-columns: 1fr; }
}
</style>
