<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { ScheduledSelection } from '../types'
import type { HighTempPressureVideoMeasurement } from '../composables/useHighTempPressureTesting'

defineProps<{
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

      <div class="video-capture-grid">
        <div class="video-pane source-pane">
          <div class="video-pane-title">源视频</div>
          <div class="source-file-card">
            <div class="source-file-icon">
              <Icon icon="mdi:filmstrip-box" />
            </div>
            <div class="source-file-body">
              <div class="source-file-name">{{ videoFileName || '未选择视频文件' }}</div>
              <div class="source-file-meta">
                {{ videoFileName ? '后台解码采样中，页面展示实时识别帧' : '支持 WMV / MP4 / AVI / MOV' }}
              </div>
            </div>
          </div>
          <div class="source-note">
            <Icon icon="mdi:information-outline" />
            <span>WMV 在当前 WebView 中不能稳定原生播放，已改为由 Python 解码并输出实时帧。</span>
          </div>
        </div>
        <div class="video-pane">
          <div class="video-pane-title">最新识别帧</div>
          <div class="frame-viewer">
            <img v-if="latestFrameUrl" :src="latestFrameUrl" class="capture-frame" alt="最新识别帧" />
            <div v-else class="capture-placeholder">
              <Icon icon="mdi:image-search-outline" />
              <span>等待脚本输出 latest_frame.jpg</span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="videoMeasurements.length" class="live-measurement-panel">
        <div class="live-measurement-head">
          <div>
            <div class="live-measurement-title">实时识别数据</div>
            <div class="live-measurement-subtitle">按视频识别结果动态显示字段，曲线和右侧实时参数重点取 250 试验容器三项</div>
          </div>
          <span>{{ videoMeasurements.length }} 项</span>
        </div>
        <div class="live-measurement-grid">
          <div v-for="measurement in videoMeasurements" :key="measurement.id" class="live-measurement-item">
            <div class="live-measurement-name">{{ measurement.name }}</div>
            <div class="live-measurement-value" :style="{ color: measurement.color }">
              {{ measurement.raw }}<span v-if="measurement.raw !== '--' && measurement.unit" class="channel-unit">{{ measurement.unit }}</span>
            </div>
            <div class="live-measurement-confidence" v-if="measurement.confidence !== null">
              置信度 {{ Math.round(measurement.confidence * 100) }}%
            </div>
          </div>
        </div>
      </div>
      <div v-else class="live-measurement-empty">
        <Icon icon="mdi:database-search-outline" />
        <span>等待视频识别结果，采样开始后将在这里实时显示具体数据。</span>
      </div>
      <div v-if="exportedCaptureDir" class="export-path">已保存：{{ exportedCaptureDir }}</div>
    </div>

    <div class="testing-grid">
      <div class="card chart-fill">
        <div class="card-header">
          <div class="card-title">📈 实时监控曲线</div>
        </div>
        <div class="card-body">
          <div id="htp-chart" class="chart-container"></div>
        </div>
      </div>
      <div class="right-col">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📊 实时参数</div>
            <span style="font-size:11px;color:var(--color-text-secondary)">测试中</span>
          </div>
          <div class="card-body" style="padding:10px 14px">
            <div class="realtime-stats">
              <div class="rt-stat"><div class="rt-stat-label">上部水温</div><div class="rt-stat-val temp">{{ t1[t1.length - 1]?.toFixed(1) || '--.-' }}°C</div></div>
              <div class="rt-stat"><div class="rt-stat-label">下部水温</div><div class="rt-stat-val temp">{{ t2[t2.length - 1]?.toFixed(1) || '--.-' }}°C</div></div>
              <div class="rt-stat" style="grid-column:span 2"><div class="rt-stat-label">容器压力</div><div class="rt-stat-val press">{{ p[p.length - 1]?.toFixed(2) || '--.--' }} MPa</div></div>
            </div>
            <div class="divider"></div>
            <div style="display:flex;justify-content:space-between">
              <div><div class="info-key">已采集数据</div><div class="info-val">{{ csvCount }} 条</div></div>
              <div><div class="info-key">采集状态</div><div class="info-val" style="color:var(--green-bright)">正常</div></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title">📋 当前工单</div></div>
          <div class="card-body" style="padding:10px 14px">
            <div class="info-grid" style="grid-template-columns:1fr 1fr;gap:8px" v-if="currentSelected">
              <div class="info-item"><div class="info-key">工单编号</div><div class="info-val" style="font-size:12px">{{ currentSelected.order.no }}</div></div>
              <div class="info-item"><div class="info-key">器皿类型</div><div class="info-val">{{ currentSelected.order.vesselType }}</div></div>
              <div class="info-item"><div class="info-key">目标温度</div><div class="info-val" style="color:var(--red-bright)">{{ currentSelected.order.targetTemp }}</div></div>
              <div class="info-item"><div class="info-key">目标压力</div><div class="info-val" style="color:var(--cyan)">{{ currentSelected.order.targetPressure }}</div></div>
              <div class="info-item"><div class="info-key">保温保压</div><div class="info-val">{{ currentSelected.order.keepCondition }}</div></div>
              <div class="info-item"><div class="info-key">仪器</div><div class="info-val">{{ (currentSelected.order.items || []).map(i => i.sn).join(' / ') }}</div></div>
            </div>
            <div v-else class="text-muted">未选择排程仪器</div>
          </div>
        </div>
      </div>
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

.video-capture-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.video-pane {
  min-width: 0;
}

.video-pane-title {
  color: var(--capture-muted);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

.source-file-card,
.frame-viewer {
  height: 240px;
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  background: #0f172a;
  overflow: hidden;
}

.source-file-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.94)),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 10px);
}

.source-file-icon {
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.14);
  border: 1px solid rgba(245, 158, 11, 0.22);
  font-size: 28px;
}

.source-file-body {
  min-width: 0;
}

.source-file-name {
  color: #f8fafc;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-file-meta {
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.6;
  margin-top: 8px;
}

.source-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 10px;
  color: var(--capture-muted);
  font-size: 12px;
  line-height: 1.55;
}

.source-note svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.frame-viewer {
  position: relative;
  display: grid;
  place-items: center;
  background:
    linear-gradient(135deg, #020617, #0f172a),
    radial-gradient(circle at 50% 40%, rgba(59, 130, 246, 0.14), transparent 42%);
}

.frame-viewer::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(circle at center, black, transparent 76%);
}

.capture-frame {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  max-height: 320px;
  object-fit: contain;
  display: block;
}

.capture-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #64748b;
  text-align: center;
  padding: 16px;
  min-height: 240px;
  font-size: 13px;
}

.capture-placeholder svg {
  font-size: 28px;
  color: #94a3b8;
}

.export-path {
  margin-top: 10px;
  font-size: 12px;
  color: var(--color-accent-blue);
  word-break: break-all;
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
  .video-capture-grid,
  .live-measurement-grid,
  .test-controls {
    grid-template-columns: 1fr;
  }

  .video-capture-head {
    align-items: stretch;
    flex-direction: column;
  }

  .select-video-btn {
    width: 100%;
  }
}
</style>
