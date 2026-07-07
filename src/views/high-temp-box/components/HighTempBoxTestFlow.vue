<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { HighTempBoxContext } from '../composables/useHighTempBox'

const props = defineProps<{ ctx: HighTempBoxContext }>()
const {
  currentStep,
  currentWorkOrder,
  SHUTDOWN_CHECK_ITEMS,
  shutdownCheckData,
  shutdownCompletedCount,
  shutdownProgress,
  isShutdownComplete,
  shutdownStatusCards,
  reportSnapshot,
  preCheckItems,
  togglePreCheck,
  isPreCheckComplete,
  completePreCheck,
  STARTUP_GUIDE_STEPS,
  guideStepIndex,
  prevGuideStep,
  nextGuideStep,
  completeTest,
  showCameraSelect,
  camera,
  selectAndStartCamera,
  getConfidenceLevel,
  displaySetTemp,
  displayCurrentTemp,
  ocrCurrentTemp,
  displayRunTime,
  roiCanvasRef,
  isOcrConfigMode,
  onRoiMouseDown,
  onRoiMouseMove,
  onRoiMouseUp,
  activeRoiKey,
  roiRegions,
  selectRoiTarget,
  cancelRoiConfig,
  saveAndExitRoiConfig,
  enterRoiConfig,
  tempHistory,
  chartRef,
  isRunning,
  togglePause,
  stopTest,
  setShutdownCheck,
  viewReport,
  backToShutdown,
  finishCompletedFlow,
  cancelExperiment,
  orderStatusMutating,
} = props.ctx

const pageTitle = computed(() => {
  if (currentStep.value === 'pre-check') return '开机前安全检查'
  if (currentStep.value === 'startup-guide') return '高温箱启动指南'
  if (currentStep.value === 'shutdown') return '关机流程'
  if (currentStep.value === 'report') return '测试报告'
  return '测试监控中'
})

const reportHistory = computed(() => reportSnapshot.value?.history ?? [])

const reportStats = computed(() => [
  {
    label: '目标温度',
    value: reportSnapshot.value?.targetTemp ?? '--',
    unit: reportSnapshot.value?.targetTemp !== undefined ? '°C' : '',
  },
  {
    label: '最终温度',
    value: reportSnapshot.value?.finalTemp ?? '--',
    unit: reportSnapshot.value?.finalTemp !== null && reportSnapshot.value?.finalTemp !== undefined ? '°C' : '',
  },
  {
    label: '平均温度',
    value: reportSnapshot.value?.summary.avgTemp ?? '--',
    unit: reportSnapshot.value?.summary.avgTemp !== null && reportSnapshot.value?.summary.avgTemp !== undefined ? '°C' : '',
  },
  {
    label: '采样点数',
    value: reportSnapshot.value?.summary.sampleCount ?? 0,
    unit: '',
  },
])

const reportTableRows = computed(() => {
  const order = currentWorkOrder.value
  return [
    [
      { label: '工单编号', value: order?.id || '--' },
      { label: '任务单号', value: reportSnapshot.value?.taskNumber || order?.taskNumber || '--' },
      { label: '测试日期', value: reportSnapshot.value?.testDate || order?.testDate || '--' },
      { label: '报告编号', value: reportSnapshot.value?.reportNo || '--' },
    ],
    [
      { label: '测试申请人', value: order?.applicant || '--' },
      { label: '测试操作人员', value: reportSnapshot.value?.tester || '--' },
      { label: '设备名称', value: order?.deviceName || '--' },
      { label: '设备编号', value: order?.deviceNumber || '--' },
    ],
    [
      { label: '测试平台', value: order?.testPlatform || '--' },
      { label: '目标温度', value: reportSnapshot.value?.targetTemp !== undefined ? `${reportSnapshot.value.targetTemp}°C` : '--' },
      { label: '测试时长', value: reportSnapshot.value?.durationText || '--' },
      { label: '完成时间', value: reportSnapshot.value?.completedAt || '--' },
    ],
    [
      { label: '温度下限', value: reportSnapshot.value?.summary.minTemp !== null && reportSnapshot.value?.summary.minTemp !== undefined ? `${reportSnapshot.value.summary.minTemp}°C` : '--' },
      { label: '温度上限', value: reportSnapshot.value?.summary.maxTemp !== null && reportSnapshot.value?.summary.maxTemp !== undefined ? `${reportSnapshot.value.summary.maxTemp}°C` : '--' },
      { label: '平均温度', value: reportSnapshot.value?.summary.avgTemp !== null && reportSnapshot.value?.summary.avgTemp !== undefined ? `${reportSnapshot.value.summary.avgTemp}°C` : '--' },
      { label: '备注说明', value: order?.remark || '--' },
    ],
  ]
})

const reportSampleRows = computed(() => reportHistory.value.slice(-12))

const reportConclusion = computed(() => {
  if (!reportSnapshot.value) return '暂无测试结论'
  const summary = reportSnapshot.value.summary
  if (!summary.sampleCount) {
    return '本次测试未采集到有效温度数据，请检查识别区域配置或视频采集状态。'
  }
  return `本次高温箱测试共采集 ${summary.sampleCount} 个温度点，结论为“${summary.stabilityText}”。最终温度 ${
    reportSnapshot.value.finalTemp ?? '--'
  }${reportSnapshot.value.finalTemp !== null ? '°C' : ''}，可作为后续审核与归档依据。`
})

const reportChart = computed(() => {
  const history = reportHistory.value
  const width = 920
  const height = 360
  const padding = { top: 30, right: 28, bottom: 54, left: 58 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  if (!history.length) {
    return {
      width,
      height,
      padding,
      plotWidth,
      plotHeight,
      points: '',
      targetPoints: '',
      yTicks: [] as Array<{ value: string; y: number }>,
      xTicks: [] as Array<{ label: string; x: number }>,
    }
  }

  const targetTemp = reportSnapshot.value?.targetTemp
  const temps = history.map((item) => item.temp)
  const source = targetTemp !== undefined ? [...temps, targetTemp] : temps
  const rawMin = Math.min(...source)
  const rawMax = Math.max(...source)
  const min = Math.floor(rawMin - 3)
  const max = Math.ceil(rawMax + 3)
  const range = Math.max(max - min, 1)

  const toX = (index: number) => padding.left + (plotWidth * index) / Math.max(history.length - 1, 1)
  const toY = (value: number) => padding.top + plotHeight - ((value - min) / range) * plotHeight

  const points = history
    .map((item, index) => `${toX(index).toFixed(2)},${toY(item.temp).toFixed(2)}`)
    .join(' ')

  const targetPoints =
    targetTemp === undefined
      ? ''
      : history
          .map((_, index) => `${toX(index).toFixed(2)},${toY(targetTemp).toFixed(2)}`)
          .join(' ')

  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const value = max - (range / 5) * index
    return {
      value: `${value.toFixed(0)}°C`,
      y: toY(value),
    }
  })

  const tickIndexes = Array.from(new Set([0, Math.floor((history.length - 1) / 3), Math.floor(((history.length - 1) * 2) / 3), history.length - 1]))
  const xTicks = tickIndexes.map((index) => ({
    label: history[index]?.time || '',
    x: toX(index),
  }))

  return {
    width,
    height,
    padding,
    plotWidth,
    plotHeight,
    points,
    targetPoints,
    yTicks,
    xTicks,
  }
})
</script>

<template>
  <div class="test-view">
    <div class="test-header">
      <div class="header-left">
        <h2>{{ pageTitle }}</h2>
        <div class="order-tag">工单: {{ currentWorkOrder?.id }}</div>
      </div>
      <button v-if="currentStep === 'pre-check' || currentStep === 'startup-guide' || currentStep === 'monitoring'" class="back-btn" :disabled="orderStatusMutating" @click="cancelExperiment">
        <Icon icon="mdi:arrow-left" /> 返回主页
      </button>
    </div>

    <div class="test-content" :class="{ 'is-report-content': currentStep === 'report' }">
      <div v-if="currentStep === 'pre-check'" class="modal-overlay">
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

      <div v-else-if="currentStep === 'startup-guide'" class="modal-overlay">
        <div class="startup-check-modal">
          <button class="back-btn top-right" :disabled="orderStatusMutating" @click="cancelExperiment">
            <Icon icon="mdi:arrow-left" /> 返回主页
          </button>
          <h2 class="modal-title">高温箱启动指南</h2>

          <div class="guide-progress">
            <div
              v-for="(_step, idx) in STARTUP_GUIDE_STEPS"
              :key="idx"
              class="progress-dot"
              :class="{ active: idx === guideStepIndex, done: idx < guideStepIndex }"
            ></div>
          </div>

          <div class="guide-card">
            <div class="guide-badge">{{ STARTUP_GUIDE_STEPS[guideStepIndex].badge }}</div>
            <p class="guide-text">{{ STARTUP_GUIDE_STEPS[guideStepIndex].text }}</p>
            <div v-if="STARTUP_GUIDE_STEPS[guideStepIndex].images.length" class="guide-images">
              <img
                v-for="(img, i) in STARTUP_GUIDE_STEPS[guideStepIndex].images"
                :key="i"
                :src="img"
                :alt="`${STARTUP_GUIDE_STEPS[guideStepIndex].badge} - ${i + 1}`"
              />
            </div>
            <div v-if="STARTUP_GUIDE_STEPS[guideStepIndex].warning" class="guide-warning">
              <Icon icon="mdi:alert" />
              {{ STARTUP_GUIDE_STEPS[guideStepIndex].warning }}
            </div>
          </div>

          <div class="modal-actions guide-actions">
            <button class="cancel-btn" :disabled="guideStepIndex === 0" @click="prevGuideStep">上一步</button>
            <button class="next-btn" @click="nextGuideStep">
              {{ guideStepIndex === STARTUP_GUIDE_STEPS.length - 1 ? '完成启动，开始监控' : '下一步' }}
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="currentStep === 'monitoring'" class="monitor-panel">
        <div v-if="showCameraSelect" class="camera-select-overlay">
          <div class="camera-select-modal">
            <h3>选择视频采集卡</h3>
            <div class="camera-list">
              <button
                v-for="dev in camera.devices.value"
                :key="dev.deviceId"
                class="camera-option"
                @click="selectAndStartCamera(dev.index ?? 0)"
              >
                <Icon icon="mdi:camera" />
                <span>{{ dev.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="monitor-grid">
          <div class="monitor-card">
            <div class="monitor-label">
              设定温度
              <span class="confidence-dot" :class="getConfidenceLevel('setTemp')"></span>
            </div>
            <div class="monitor-value">{{ displaySetTemp }}<small>°C</small></div>
          </div>
          <div class="monitor-card active">
            <div class="monitor-label">
              当前温度
              <span class="confidence-dot" :class="getConfidenceLevel('currentTemp')"></span>
            </div>
            <div class="monitor-value">{{ displayCurrentTemp }}<small v-if="ocrCurrentTemp !== null">°C</small></div>
          </div>
          <div class="monitor-card">
            <div class="monitor-label">
              运行时长
              <span class="confidence-dot" :class="getConfidenceLevel('runTime')"></span>
            </div>
            <div class="monitor-value time-value">{{ displayRunTime }}</div>
          </div>
        </div>

        <div class="monitor-main">
          <div class="video-container">
            <img v-if="camera.currentFrame.value" :src="camera.currentFrame.value" class="video-feed" alt="采集卡画面" />
            <div v-else class="video-placeholder">
              <Icon icon="mdi:video-off-outline" class="placeholder-icon" />
              <p v-if="camera.isLoading.value">正在连接采集卡...</p>
              <p v-else-if="camera.error.value">{{ camera.error.value }}</p>
              <p v-else>等待视频信号</p>
            </div>

            <canvas
              ref="roiCanvasRef"
              class="roi-overlay"
              :class="{ 'config-active': isOcrConfigMode }"
              @mousedown="onRoiMouseDown"
              @mousemove="onRoiMouseMove"
              @mouseup="onRoiMouseUp"
              @mouseleave="onRoiMouseUp"
            />

            <div v-if="isOcrConfigMode" class="roi-config-panel">
              <div class="roi-config-title">选择要配置的识别区域，然后在画面上拖拽框选</div>
              <div class="roi-buttons">
                <button class="roi-btn set-temp" :class="{ active: activeRoiKey === 'setTemp', configured: !!roiRegions.setTemp }" @click="selectRoiTarget('setTemp')">
                  <Icon icon="mdi:target" />设定温度
                </button>
                <button class="roi-btn current-temp" :class="{ active: activeRoiKey === 'currentTemp', configured: !!roiRegions.currentTemp }" @click="selectRoiTarget('currentTemp')">
                  <Icon icon="mdi:thermometer" />当前温度
                </button>
                <button class="roi-btn run-time" :class="{ active: activeRoiKey === 'runTime', configured: !!roiRegions.runTime }" @click="selectRoiTarget('runTime')">
                  <Icon icon="mdi:timer-outline" />运行时间
                </button>
              </div>
              <div class="roi-config-actions">
                <button class="secondary-btn" @click="cancelRoiConfig">取消</button>
                <button class="primary-btn small" @click="saveAndExitRoiConfig"><Icon icon="mdi:check" />保存配置</button>
              </div>
            </div>

            <div v-if="camera.isActive.value" class="camera-status"><span class="live-dot"></span>LIVE</div>
          </div>

          <div class="chart-container">
            <div class="chart-header"><Icon icon="mdi:chart-line" /><span>温度曲线</span></div>
            <div ref="chartRef" class="chart-area"></div>
            <div v-if="tempHistory.length === 0" class="chart-empty-hint"><p>配置 OCR 识别区域后将自动采集温度数据</p></div>
          </div>
        </div>

        <div class="action-bar monitor-actions">
          <button v-if="!isOcrConfigMode" class="secondary-btn" @click="enterRoiConfig"><Icon icon="mdi:crop" />配置识别区域</button>
          <div class="action-spacer"></div>
          <button class="secondary-btn warning" @click="togglePause">
            <Icon :icon="isRunning ? 'mdi:pause' : 'mdi:play'" />{{ isRunning ? '暂停测试' : '继续测试' }}
          </button>
          <button class="secondary-btn danger" @click="stopTest"><Icon icon="mdi:stop" />中止测试</button>
          <button class="primary-btn finish-btn" @click="completeTest"><Icon icon="mdi:check-circle-outline" />测试结束</button>
        </div>
      </div>

      <div v-else-if="currentStep === 'shutdown'" class="shutdown-panel">
        <div class="shutdown-alert" :class="isShutdownComplete ? 'is-success' : 'is-warning'">
          <strong>{{ isShutdownComplete ? '关机完成' : '请逐项完成关机操作' }}</strong>
          <span>{{ isShutdownComplete ? '所有关机检查项已确认，可查看测试报告或返回主界面。' : '确认每一项关机步骤后，方可查看测试报告。' }}</span>
        </div>

        <div class="shutdown-progress-card">
          <div class="progress-row">
            <span>关机检查进度</span>
            <strong>{{ shutdownCompletedCount }}/{{ SHUTDOWN_CHECK_ITEMS.length }}</strong>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${shutdownProgress}%` }"></div>
          </div>
        </div>

        <div class="shutdown-check-list">
          <div
            v-for="(item, index) in SHUTDOWN_CHECK_ITEMS"
            :key="item"
            class="shutdown-check-item"
            :class="{
              'is-done': shutdownCheckData[index],
              'is-active': !shutdownCheckData[index] && (index === 0 || shutdownCheckData[index - 1])
            }"
          >
            <div class="shutdown-check-main">
              <div class="shutdown-check-number">{{ index + 1 }}</div>
              <div class="shutdown-check-content">{{ item }}</div>
            </div>
            <button
              v-if="!shutdownCheckData[index]"
              class="shutdown-check-btn"
              :disabled="index > 0 && !shutdownCheckData[index - 1]"
              @click="setShutdownCheck(index)"
            >
              确认已完成
            </button>
            <div v-else class="shutdown-check-done">
              <Icon icon="mdi:check-circle" /> 已确认
            </div>
          </div>
        </div>

        <div class="shutdown-status-grid">
          <div v-for="card in shutdownStatusCards" :key="card.label" class="shutdown-status-card">
            <div class="status-item-label">{{ card.label }}</div>
            <div class="status-item-value" :class="`is-${card.tone}`">{{ card.value }}</div>
          </div>
        </div>

        <div class="action-bar shutdown-actions">
          <button class="secondary-btn" :disabled="!isShutdownComplete" @click="viewReport">
            <Icon icon="mdi:file-document-outline" /> 查看测试报告
          </button>
          <div class="action-spacer"></div>
          <button class="primary-btn finish-btn" :disabled="!isShutdownComplete || orderStatusMutating" @click="finishCompletedFlow">
            <Icon icon="mdi:home-export-outline" /> 返回主界面
          </button>
        </div>
      </div>

      <div v-else-if="currentStep === 'report'" class="report-panel">
        <div class="report-document">
          <div class="report-hero">
            <div class="report-number-pill">报告编号: {{ reportSnapshot?.reportNo || '--' }}</div>
            <div class="report-hero-title">高温箱测试报告</div>
            <div class="report-hero-subtitle">High Temperature Chamber Test Report</div>
          </div>

          <div class="report-document-body">
            <section class="report-section">
              <h3 class="report-section-title">一、基本信息</h3>
              <table class="report-info-table">
                <tbody>
                  <tr v-for="(row, rowIndex) in reportTableRows" :key="rowIndex">
                    <template v-for="(cell, cellIndex) in row" :key="`${rowIndex}-${cellIndex}`">
                      <th>{{ cell.label }}</th>
                      <td>{{ cell.value }}</td>
                    </template>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="report-section">
              <h3 class="report-section-title">二、温度统计</h3>
              <div class="report-stats-grid">
                <div v-for="item in reportStats" :key="item.label" class="report-stat-card">
                  <div class="report-stat-label">{{ item.label }}</div>
                  <div class="report-stat-value">
                    {{ item.value }}
                    <span v-if="item.unit" class="report-stat-unit">{{ item.unit }}</span>
                  </div>
                </div>
              </div>
            </section>

            <section class="report-section">
              <h3 class="report-section-title">三、温度变化曲线</h3>
              <div class="report-chart-card">
                <div class="report-chart-header">
                  <div class="report-chart-title">温度随时间变化图</div>
                  <div class="report-chart-legend">
                    <div class="legend-item">
                      <span class="legend-line legend-target"></span>
                      <span>设定温度</span>
                    </div>
                    <div class="legend-item">
                      <span class="legend-line legend-actual"></span>
                      <span>实际温度</span>
                    </div>
                  </div>
                </div>

                <div v-if="reportHistory.length" class="report-svg-wrapper">
                  <svg
                    class="report-chart-svg"
                    :viewBox="`0 0 ${reportChart.width} ${reportChart.height}`"
                    preserveAspectRatio="none"
                  >
                    <g>
                      <line
                        v-for="tick in reportChart.yTicks"
                        :key="tick.value"
                        :x1="reportChart.padding.left"
                        :x2="reportChart.width - reportChart.padding.right"
                        :y1="tick.y"
                        :y2="tick.y"
                        class="chart-grid-line"
                      />
                      <text
                        v-for="tick in reportChart.yTicks"
                        :key="`label-${tick.value}`"
                        :x="reportChart.padding.left - 10"
                        :y="tick.y + 4"
                        class="chart-axis-label is-y"
                      >
                        {{ tick.value }}
                      </text>
                      <line
                        v-for="tick in reportChart.xTicks"
                        :key="tick.label"
                        :x1="tick.x"
                        :x2="tick.x"
                        :y1="reportChart.padding.top"
                        :y2="reportChart.height - reportChart.padding.bottom"
                        class="chart-grid-line vertical"
                      />
                      <text
                        v-for="tick in reportChart.xTicks"
                        :key="`x-${tick.label}`"
                        :x="tick.x"
                        :y="reportChart.height - reportChart.padding.bottom + 24"
                        class="chart-axis-label is-x"
                      >
                        {{ tick.label }}
                      </text>
                      <polyline v-if="reportChart.targetPoints" :points="reportChart.targetPoints" class="chart-target-line" />
                      <polyline :points="reportChart.points" class="chart-actual-line" />
                    </g>
                  </svg>
                </div>
                <div v-else class="report-chart-empty">本次测试未采集到有效温度数据。</div>
              </div>
            </section>

            <section class="report-section">
              <h3 class="report-section-title">四、采样记录</h3>
              <table class="report-data-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>采样时间</th>
                    <th>实际温度</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!reportSampleRows.length">
                    <td colspan="3" class="report-empty-cell">本次测试未采集到有效温度数据。</td>
                  </tr>
                  <tr v-for="(point, index) in reportSampleRows" :key="`${point.time}-${point.temp}`">
                    <td>{{ index + 1 }}</td>
                    <td>{{ point.time }}</td>
                    <td>{{ point.temp }}°C</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="report-section">
              <h3 class="report-section-title">五、测试结论</h3>
              <div class="report-conclusion-box">
                <div class="report-conclusion-title">{{ reportSnapshot?.summary.stabilityText || '暂无结论' }}</div>
                <div class="report-conclusion-text">{{ reportConclusion }}</div>
                <div class="report-pass-badge">测试完成</div>
              </div>
            </section>
          </div>

          <div class="report-document-footer">
            <p>本报告由高温箱测试平台自动生成</p>
            <p>报告生成时间: {{ reportSnapshot?.completedAt || '--' }}</p>
          </div>
        </div>

        <div class="action-bar">
          <button class="secondary-btn" @click="backToShutdown"><Icon icon="mdi:arrow-left" />返回关机流程</button>
          <div class="action-spacer"></div>
          <button class="primary-btn finish-btn" :disabled="orderStatusMutating" @click="finishCompletedFlow">
            <Icon icon="mdi:check" />完成并返回主界面
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.test-view{flex:1;background:var(--color-bg-secondary);border-radius:12px;border:1px solid var(--color-border);display:flex;flex-direction:column;overflow:hidden}
.test-header{padding:20px;border-bottom:1px solid var(--color-border);display:flex;justify-content:space-between;align-items:center}
.header-left h2{margin:0;font-size:20px}
.order-tag{font-size:13px;color:var(--color-text-secondary);margin-top:4px}
.back-btn{background:transparent;border:1px solid var(--color-border);padding:8px 16px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--color-text-secondary)}
.back-btn.top-right{position:absolute;top:16px;right:16px}
.test-content{flex:1;min-height:0;padding:24px;overflow-y:auto;display:flex;justify-content:center}
.test-content.is-report-content{overflow:hidden}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;backdrop-filter:blur(4px)}
.startup-check-modal{background:var(--color-bg-secondary);color:var(--color-text-primary);border-radius:16px;padding:32px;max-width:700px;width:100%;box-shadow:0 20px 40px -12px rgba(0,0,0,0.3);border:1px solid var(--color-border);position:relative}
.modal-title{font-size:24px;font-weight:700;text-align:center;margin-bottom:24px;color:var(--color-text-primary)}
.check-list-container{background:var(--color-bg-tertiary);border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid var(--color-border)}
.check-list{display:flex;flex-direction:column;gap:12px}
.check-item{display:flex;align-items:flex-start;gap:14px;cursor:pointer;padding:10px;border-radius:8px;transition:background .2s}
.check-item:hover{background:var(--color-bg-primary)}
.checkbox-wrapper{position:relative;width:20px;height:20px;flex-shrink:0;margin-top:2px}
.checkbox-wrapper input{position:absolute;opacity:0;cursor:pointer;width:100%;height:100%;z-index:1}
.custom-checkbox{width:100%;height:100%;border:2px solid var(--color-border);border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all .2s;background:var(--color-bg-primary)}
.check-item.is-checked .custom-checkbox{background:var(--color-accent-blue);border-color:var(--color-accent-blue);color:#fff}
.check-text{font-size:15px;line-height:1.5;color:var(--color-text-primary)}
.modal-actions{display:flex;gap:16px}
.guide-actions{margin-top:24px}
.cancel-btn,.next-btn{flex:1;padding:12px 24px;border-radius:10px;font-size:16px;font-weight:600;transition:all .2s;cursor:pointer}
.cancel-btn{background:transparent;color:var(--color-text-secondary);border:1px solid var(--color-border)}
.cancel-btn:disabled{opacity:.5;cursor:not-allowed}
.next-btn{background:var(--color-accent-blue);color:#fff;border:none;box-shadow:0 4px 12px rgba(88,166,255,.2)}
.next-btn:disabled{background:var(--color-bg-tertiary);color:var(--color-text-tertiary);cursor:not-allowed;box-shadow:none}
.guide-progress{display:flex;gap:8px;justify-content:center;margin-bottom:16px}
.progress-dot{width:12px;height:12px;border-radius:50%;background:var(--color-border)}
.progress-dot.active{background:var(--color-accent-blue);transform:scale(1.2)}
.progress-dot.done{background:var(--color-success)}
.guide-card{background:var(--color-bg-tertiary);padding:32px;border-radius:12px;text-align:center}
.guide-badge{display:inline-block;padding:4px 12px;background:var(--color-accent-blue);color:#fff;border-radius:20px;font-size:14px;margin-bottom:16px}
.guide-text{font-size:18px;line-height:1.6}
.guide-images{margin-top:16px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;max-height:360px;overflow-y:auto;padding:8px}
.guide-images img{max-width:100%;height:auto;max-height:320px;border-radius:8px;object-fit:contain}
.guide-warning{margin-top:16px;color:var(--color-error);display:flex;align-items:center;justify-content:center;gap:8px}
.monitor-panel{width:100%;display:flex;flex-direction:column;gap:16px;flex:1}
.monitor-grid{display:flex;gap:16px}
.monitor-card{flex:1;background:var(--color-bg-primary);border:1px solid var(--color-border);padding:16px 20px;border-radius:12px;text-align:center}
.monitor-card.active{border-color:var(--color-accent-blue);background:rgba(59,130,246,.05)}
.monitor-label{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:var(--color-text-secondary)}
.monitor-value{font-size:28px;font-weight:700;color:var(--color-text-primary);margin-top:4px}
.monitor-value.time-value{font-family:monospace;letter-spacing:1px}
.confidence-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--color-border)}
.confidence-dot.high{background:#22c55e}.confidence-dot.medium{background:#f59e0b}.confidence-dot.low{background:#ef4444}.confidence-dot.none{background:var(--color-border)}
.monitor-main{display:flex;gap:16px;flex:1;min-height:0}
.video-container{flex:0 0 55%;position:relative;background:#000;border-radius:12px;overflow:hidden;border:1px solid var(--color-border)}
.video-feed{width:100%;height:100%;object-fit:contain;display:block}
.video-placeholder{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:rgba(255,255,255,.4);min-height:300px}
.video-placeholder .placeholder-icon{font-size:48px;margin-bottom:12px}
.roi-overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.roi-overlay.config-active{pointer-events:auto;cursor:crosshair}
.roi-config-panel{position:absolute;bottom:0;left:0;right:0;background:rgba(15,23,42,.92);backdrop-filter:blur(8px);padding:12px 16px;display:flex;flex-direction:column;gap:10px;border-top:1px solid rgba(255,255,255,.1)}
.roi-config-title{font-size:12px;color:rgba(255,255,255,.7);text-align:center}
.roi-buttons{display:flex;gap:8px;justify-content:center}
.roi-btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.7);font-size:13px;cursor:pointer}
.roi-btn.active{border-color:currentColor;background:rgba(255,255,255,.15)}
.roi-btn.configured::after{content:' ✓'}
.roi-btn.set-temp{color:#f59e0b}.roi-btn.current-temp{color:#3b82f6}.roi-btn.run-time{color:#10b981}
.roi-config-actions{display:flex;gap:8px;justify-content:flex-end}
.camera-status{position:absolute;top:10px;left:10px;display:flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(0,0,0,.6);border-radius:6px;font-size:11px;font-weight:600;color:#ef4444;letter-spacing:1px}
.live-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:livePulse 1.5s ease-in-out infinite}
@keyframes livePulse{0%,100%{opacity:1}50%{opacity:.4}}
.chart-container{flex:0 0 45%;display:flex;flex-direction:column;background:var(--color-bg-primary);border:1px solid var(--color-border);border-radius:12px;overflow:hidden;position:relative}
.chart-header{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--color-border);font-size:14px;font-weight:600;color:var(--color-text-secondary)}
.chart-area{flex:1;min-height:250px}
.chart-empty-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--color-text-tertiary);font-size:13px;pointer-events:none}
.camera-select-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:100;backdrop-filter:blur(4px)}
.camera-select-modal{background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:12px;padding:24px;min-width:300px}
.camera-select-modal h3{margin:0 0 16px;font-size:16px;text-align:center}
.camera-list{display:flex;flex-direction:column;gap:8px}
.camera-option{display:flex;align-items:center;gap:10px;padding:12px 16px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-primary);color:var(--color-text-primary);font-size:14px;cursor:pointer}
.action-bar{display:flex;align-items:center;gap:16px}
.action-spacer{flex:1}
.monitor-actions{padding-top:6px;flex-wrap:wrap}
.secondary-btn,.primary-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 22px;border-radius:14px;cursor:pointer;font-size:15px;font-weight:700;line-height:1;transition:all .2s ease;white-space:nowrap}
.secondary-btn .iconify,.primary-btn .iconify{font-size:18px}
.secondary-btn{border:1px solid var(--color-border);background:var(--color-bg-primary);color:var(--color-text-secondary);box-shadow:0 6px 18px rgba(15,23,42,.04)}
.secondary-btn:hover:not(:disabled),.primary-btn:hover:not(:disabled){transform:translateY(-1px)}
.secondary-btn:hover:not(:disabled){background:var(--color-bg-tertiary);border-color:rgba(148,163,184,.45)}
.secondary-btn.warning{color:#d97706;border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.08)}
.secondary-btn.warning:hover:not(:disabled){background:rgba(245,158,11,.12)}
.secondary-btn.danger{color:#dc2626;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06)}
.secondary-btn.danger:hover:not(:disabled){background:rgba(239,68,68,.1)}
.secondary-btn:disabled,.primary-btn:disabled,.shutdown-check-btn:disabled{opacity:.5;cursor:not-allowed}
.primary-btn{border:none;background:linear-gradient(135deg, var(--color-accent-blue), #2563eb);color:#fff;box-shadow:0 12px 24px rgba(59,130,246,.22)}
.primary-btn.small{min-height:36px;padding:0 14px;font-size:13px;border-radius:10px}
.finish-btn{min-width:136px;background:linear-gradient(135deg, #22c55e, #16a34a);box-shadow:0 12px 24px rgba(34,197,94,.2)}
.shutdown-panel{width:100%;display:flex;flex-direction:column;gap:16px}
.report-panel{width:100%;height:100%;min-height:0;display:flex;flex-direction:column;gap:16px;overflow:hidden}
.report-panel .action-bar{flex:0 0 auto;padding-top:16px;border-top:1px solid var(--color-border);background:var(--color-bg-secondary)}
.shutdown-alert{display:flex;flex-direction:column;gap:6px;padding:16px 18px;border-radius:12px;border:1px solid var(--color-border);background:var(--color-bg-tertiary);color:var(--color-text-secondary)}
.shutdown-alert strong{font-size:16px;color:var(--color-text-primary)}
.shutdown-alert.is-warning{border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.08)}
.shutdown-alert.is-success{border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.08)}
.shutdown-progress-card,.report-card{background:var(--color-bg-primary);border:1px solid var(--color-border);border-radius:12px;padding:18px}
.progress-row{display:flex;align-items:center;justify-content:space-between;font-size:14px;color:var(--color-text-secondary);margin-bottom:10px}
.progress-track{height:10px;border-radius:999px;background:var(--color-bg-tertiary);overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg, var(--color-accent-blue), var(--color-success,#16a34a));border-radius:999px;transition:width .2s ease}
.shutdown-check-list{display:flex;flex-direction:column;gap:12px}
.shutdown-check-item{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-radius:12px;border:1px solid var(--color-border);background:var(--color-bg-primary);transition:all .2s}
.shutdown-check-item.is-active{border-color:rgba(59,130,246,.35);box-shadow:0 0 0 3px rgba(59,130,246,.08)}
.shutdown-check-item.is-done{border-color:rgba(34,197,94,.3);background:rgba(34,197,94,.06)}
.shutdown-check-main{display:flex;align-items:center;gap:14px;min-width:0}
.shutdown-check-number{width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--color-bg-tertiary);color:var(--color-text-secondary);font-weight:700;flex-shrink:0}
.shutdown-check-item.is-done .shutdown-check-number{background:var(--color-success,#16a34a);color:#fff}
.shutdown-check-content{font-size:15px;color:var(--color-text-primary);line-height:1.6}
.shutdown-check-btn{padding:10px 16px;border:none;border-radius:10px;background:var(--color-accent-blue);color:#fff;font-size:14px;font-weight:600;cursor:pointer;flex-shrink:0}
.shutdown-check-done{display:flex;align-items:center;gap:6px;color:var(--color-success,#16a34a);font-size:14px;font-weight:600;flex-shrink:0}
.shutdown-status-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.shutdown-status-card{padding:18px;border-radius:12px;border:1px solid var(--color-border);background:var(--color-bg-primary)}
.status-item-label{font-size:13px;color:var(--color-text-secondary)}
.status-item-value{margin-top:10px;font-size:22px;font-weight:700;color:var(--color-text-primary)}
.status-item-value.is-success{color:var(--color-success,#16a34a)}
.status-item-value.is-running{color:var(--color-accent-blue)}
.status-item-value.is-idle{color:var(--color-text-tertiary)}
.report-document{flex:1 1 auto;min-height:0;background:#fff;color:#212529;border-radius:16px;overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable;box-shadow:0 12px 32px rgba(15,23,42,.12);border:1px solid rgba(148,163,184,.2)}
.report-hero{position:relative;padding:40px 32px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;text-align:center}
.report-number-pill{position:absolute;top:20px;right:28px;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.18);font-size:14px}
.report-hero-title{font-size:34px;font-weight:800;letter-spacing:2px}
.report-hero-subtitle{margin-top:10px;font-size:18px;opacity:.92;letter-spacing:1px}
.report-document-body{padding:32px}
.report-section{margin-bottom:32px}
.report-section-title{margin:0 0 18px;padding-left:14px;border-left:5px solid #667eea;font-size:24px;font-weight:800;color:#2c3e50}
.report-info-table,.report-data-table{width:100%;border-collapse:collapse}
.report-info-table th,.report-info-table td,.report-data-table th,.report-data-table td{border:1px solid #dee2e6;padding:12px 14px}
.report-info-table th{width:11%;background:#f8f9fa;color:#495057;text-align:left;font-weight:700}
.report-info-table td{width:14%;background:#fff;color:#212529;word-break:break-word}
.report-info-table tr:hover td{background:#f8f9fa}
.report-stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
.report-stat-card{background:#fff;border:2px solid #e9ecef;border-radius:12px;padding:20px;text-align:center;transition:all .2s ease}
.report-stat-card:hover{border-color:#667eea;box-shadow:0 8px 18px rgba(102,126,234,.14)}
.report-stat-label{font-size:14px;color:#7f8c8d;margin-bottom:10px}
.report-stat-value{font-size:30px;font-weight:800;color:#2c3e50}
.report-stat-unit{font-size:17px;color:#95a5a6;margin-left:4px}
.report-chart-card{background:#f8f9fa;border-radius:12px;padding:24px}
.report-chart-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
.report-chart-title{font-size:20px;font-weight:800;color:#2c3e50}
.report-chart-legend{display:flex;gap:24px;flex-wrap:wrap}
.legend-item{display:flex;align-items:center;gap:10px;font-size:14px;color:#495057}
.legend-line{display:inline-block;width:42px;height:3px;border-radius:999px}
.legend-target{background:#667eea}
.legend-actual{background:#f5576c}
.report-svg-wrapper{width:100%;height:400px;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.05);overflow:hidden}
.report-chart-svg{width:100%;height:100%}
.chart-grid-line{stroke:#e9ecef;stroke-width:1}
.chart-grid-line.vertical{stroke-dasharray:3 4}
.chart-axis-label{fill:#6b7280;font-size:12px}
.chart-axis-label.is-y{text-anchor:end}
.chart-axis-label.is-x{text-anchor:middle}
.chart-target-line{fill:none;stroke:#667eea;stroke-width:3;stroke-dasharray:8 6;stroke-linecap:round;stroke-linejoin:round}
.chart-actual-line{fill:none;stroke:#f5576c;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.report-chart-empty{display:flex;align-items:center;justify-content:center;height:220px;background:#fff;border-radius:10px;color:#94a3b8}
.report-data-table th{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;text-align:center;font-weight:700}
.report-data-table td{text-align:center;background:#fff}
.report-data-table tbody tr:nth-child(even) td{background:#f8f9fa}
.report-data-table tbody tr:hover td{background:#eef2f7}
.report-empty-cell{color:#94a3b8;padding:32px 12px!important}
.report-conclusion-box{background:#d4edda;border:2px solid #28a745;border-radius:12px;padding:24px}
.report-conclusion-title{font-size:20px;font-weight:800;color:#155724;margin-bottom:12px}
.report-conclusion-text{font-size:16px;line-height:1.8;color:#155724}
.report-pass-badge{display:inline-flex;align-items:center;justify-content:center;margin-top:14px;padding:8px 20px;border-radius:999px;background:#28a745;color:#fff;font-size:18px;font-weight:700}
.report-document-footer{padding:20px 32px;background:#f8f9fa;border-top:1px solid #dee2e6;text-align:center;color:#7f8c8d;font-size:12px}
.report-document-footer p + p{margin-top:6px}
@media (max-width: 1280px){.monitor-grid,.monitor-main,.shutdown-status-grid,.report-stats-grid{grid-template-columns:1fr}.monitor-grid,.monitor-main{display:grid}.video-container,.chart-container{flex:auto}.shutdown-check-item{flex-direction:column;align-items:flex-start}.shutdown-check-btn,.shutdown-check-done{width:100%;justify-content:center}.monitor-actions .action-spacer{display:none}.monitor-actions{gap:12px}.monitor-actions .secondary-btn,.monitor-actions .primary-btn{flex:1 1 calc(50% - 6px)}.report-info-table,.report-info-table tbody,.report-info-table tr{display:block}.report-info-table th,.report-info-table td{display:block;width:100%}.report-info-table th{border-bottom:none}.report-info-table td{border-top:none}.report-chart-header{flex-direction:column;align-items:flex-start}.report-number-pill{position:static;display:inline-flex;margin-bottom:18px}.report-hero-title{font-size:28px}}
</style>
