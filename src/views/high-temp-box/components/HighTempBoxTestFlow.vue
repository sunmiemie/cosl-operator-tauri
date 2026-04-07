<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { HighTempBoxContext } from '../composables/useHighTempBox'

const props = defineProps<{ ctx: HighTempBoxContext }>()
const {
  currentStep,
  currentWorkOrder,
  backToDashboard,
  preCheckItems,
  togglePreCheck,
  isPreCheckComplete,
  completePreCheck,
  STARTUP_GUIDE_STEPS,
  guideStepIndex,
  prevGuideStep,
  nextGuideStep,
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
  cancelExperiment,
  orderStatusMutating,
} = props.ctx
</script>

<template>
  <div class="test-view">
    <div class="test-header">
      <div class="header-left">
        <h2>{{ currentStep === 'pre-check' ? '开机前安全检查' : currentStep === 'startup-guide' ? '高温箱启动指南' : '测试监控中' }}</h2>
        <div class="order-tag">工单: {{ currentWorkOrder?.id }}</div>
      </div>
      <button class="back-btn" :disabled="orderStatusMutating" @click="cancelExperiment">
        <Icon icon="mdi:arrow-left" /> 返回主页
      </button>
    </div>

    <div class="test-content">
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
              v-for="(step, idx) in STARTUP_GUIDE_STEPS"
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

        <div class="action-bar">
          <button v-if="!isOcrConfigMode" class="secondary-btn" @click="enterRoiConfig"><Icon icon="mdi:crop" />配置识别区域</button>
          <div class="action-spacer"></div>
          <button class="secondary-btn warning" @click="togglePause">
            <Icon :icon="isRunning ? 'mdi:pause' : 'mdi:play'" />{{ isRunning ? '暂停测试' : '继续测试' }}
          </button>
          <button class="secondary-btn danger" @click="stopTest"><Icon icon="mdi:stop" />中止测试</button>
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
.test-content{flex:1;padding:24px;overflow-y:auto;display:flex;justify-content:center}
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
.secondary-btn{display:flex;align-items:center;gap:6px;padding:10px 20px;border:1px solid var(--color-border);background:transparent;border-radius:10px;cursor:pointer;color:var(--color-text-secondary);font-size:14px;font-weight:600;transition:all .2s}
.secondary-btn.warning{color:var(--color-warning);border-color:var(--color-warning)}
.secondary-btn.danger{color:var(--color-error);border-color:var(--color-error)}
.primary-btn.small{padding:6px 14px;font-size:13px;border-radius:8px}
</style>
