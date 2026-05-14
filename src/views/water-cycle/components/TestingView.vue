<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { invoke } from '@tauri-apps/api/core'

import { COLLECTION_CHANNELS, configuredRoiCount, roiRegions, selectedOrder } from '../composables/useTestStore'

const { camera, ocr, statusMutating = false } = defineProps<{ camera: any; ocr: any; statusMutating?: boolean }>()
const emit = defineEmits<{
  back: []
  confirmSync: []
}>()
void ocr

const stepItems = [
  { key: 'schedule', label: '开始测试', status: 'done' },
  { key: 'startup', label: '运行前检查', status: 'done' },
  { key: 'monitor', label: '摄像头画面监控', status: 'active' },
  { key: 'collect', label: '生成曲线', status: 'pending' },
  { key: 'report', label: '截取/保存', status: 'pending' },
] as const

const availableCameras = ref<Array<{ deviceId: string; label: string; index?: number }>>([])
const selectedCameraIndex = ref(0)
const roiCanvasRef = ref<HTMLCanvasElement | null>(null)
const isOcrConfigMode = ref(false)
const activeRoiKey = ref<string | null>(null)
const roiDragStart = ref<{ x: number; y: number } | null>(null)
const roiDragCurrent = ref<{ x: number; y: number } | null>(null)

const roiSummary = computed(() =>
  COLLECTION_CHANNELS.map((channel) => ({
    ...channel,
    configured: Boolean(roiRegions.value[channel.id]),
  }))
)

const monitorStatusText = computed(() => (camera.currentFrame.value ? '监控中' : '等待连接'))
const monitorStatusClass = computed(() => (camera.currentFrame.value ? 'online' : 'offline'))

async function startMonitorCamera() {
  const deviceList = await camera.getDeviceList()
  availableCameras.value = deviceList
  if (!deviceList.length) return
  const nextIndex = deviceList[selectedCameraIndex.value]?.index ?? selectedCameraIndex.value
  await camera.startCamera(nextIndex)
}

async function handleCameraChange() {
  const target = availableCameras.value[selectedCameraIndex.value]
  await camera.startCamera(target?.index ?? selectedCameraIndex.value)
}

function selectRoiTarget(key: string) {
  activeRoiKey.value = activeRoiKey.value === key ? null : key
}

function onRoiMouseDown(e: MouseEvent) {
  if (!activeRoiKey.value || !roiCanvasRef.value) return
  const rect = roiCanvasRef.value.getBoundingClientRect()
  roiDragStart.value = {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  }
  roiDragCurrent.value = { ...roiDragStart.value }
}

function onRoiMouseMove(e: MouseEvent) {
  if (!roiDragStart.value || !roiCanvasRef.value) return
  const rect = roiCanvasRef.value.getBoundingClientRect()
  roiDragCurrent.value = {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  }
  drawRoiOverlay()
}

function onRoiMouseUp() {
  if (!roiDragStart.value || !roiDragCurrent.value || !activeRoiKey.value) return
  const width = Math.abs(roiDragCurrent.value.x - roiDragStart.value.x)
  const height = Math.abs(roiDragCurrent.value.y - roiDragStart.value.y)

  if (width > 0.01 && height > 0.01) {
    const channel = COLLECTION_CHANNELS.find((item) => item.id === activeRoiKey.value)
    roiRegions.value[activeRoiKey.value] = {
      id: activeRoiKey.value,
      label: channel?.name || activeRoiKey.value,
      x: Math.min(roiDragStart.value.x, roiDragCurrent.value.x),
      y: Math.min(roiDragStart.value.y, roiDragCurrent.value.y),
      width,
      height,
    }
  }

  roiDragStart.value = null
  roiDragCurrent.value = null
  drawRoiOverlay()
}

function drawRoiOverlay() {
  const canvas = roiCanvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (isOcrConfigMode.value) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const colorMap = Object.fromEntries(COLLECTION_CHANNELS.map((channel) => [channel.id, channel.color]))

  Object.entries(roiRegions.value).forEach(([key, region]) => {
    const x = region.x * canvas.width
    const y = region.y * canvas.height
    const width = region.width * canvas.width
    const height = region.height * canvas.height

    if (isOcrConfigMode.value) ctx.clearRect(x, y, width, height)

    ctx.strokeStyle = colorMap[key] || '#3b82f6'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, width, height)
    ctx.fillStyle = colorMap[key] || '#3b82f6'
    ctx.font = '12px sans-serif'
    ctx.fillText(region.label || key, x + 4, y > 16 ? y - 6 : y + 16)
  })

  if (roiDragStart.value && roiDragCurrent.value && activeRoiKey.value) {
    ctx.strokeStyle = colorMap[activeRoiKey.value] || '#ffffff'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 3])
    ctx.strokeRect(
      roiDragStart.value.x * canvas.width,
      roiDragStart.value.y * canvas.height,
      (roiDragCurrent.value.x - roiDragStart.value.x) * canvas.width,
      (roiDragCurrent.value.y - roiDragStart.value.y) * canvas.height,
    )
    ctx.setLineDash([])
  }
}

function resizeRoiCanvas() {
  const canvas = roiCanvasRef.value
  const parent = canvas?.parentElement
  if (!canvas || !parent) return
  canvas.width = parent.clientWidth
  canvas.height = parent.clientHeight
  drawRoiOverlay()
}

async function loadCachedRoi() {
  try {
    const cached = await invoke<string>('read_cache', { cacheType: 'temp', id: 'wc-ocr-roi' })
    if (cached) roiRegions.value = JSON.parse(cached)
  } catch {
    console.debug('未加载到本地缓存 ROI')
  }
}

async function saveAndExitRoiConfig() {
  isOcrConfigMode.value = false
  activeRoiKey.value = null
  try {
    await invoke('write_cache', {
      cacheType: 'temp',
      id: 'wc-ocr-roi',
      data: JSON.stringify(roiRegions.value),
    })
  } catch (error) {
    console.error('持久化写入缓存失败:', error)
  }
  drawRoiOverlay()
}

onMounted(async () => {
  await loadCachedRoi()
  await startMonitorCamera()
  nextTick(() => {
    resizeRoiCanvas()
    window.addEventListener('resize', resizeRoiCanvas)
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeRoiCanvas)
})
</script>

<template>
  <div class="monitor-container">
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

    <div class="monitor-header-grid">
      <div class="info-card">
        <span class="info-label">任务单号</span>
        <span class="info-value highlight">{{ selectedOrder?.taskNumber || '--' }}</span>
      </div>
      <div class="info-card">
        <span class="info-label">测试设备</span>
        <span class="info-value">{{ selectedOrder?.deviceName || '--' }}</span>
      </div>
      <div class="info-card">
        <span class="info-label">流程长度</span>
        <span class="info-value accent">{{ selectedOrder?.flowProcess || '--' }}</span>
      </div>
      <div class="info-card">
        <span class="info-label">监控状态</span>
        <span class="status-pill" :class="monitorStatusClass">
          <span class="status-dot"></span>
          {{ monitorStatusText }}
        </span>
      </div>
    </div>

    <div class="monitor-main">
      <div class="video-card">
        <div class="panel-header">
          <div class="panel-title">
            <Icon icon="mdi:video-outline" />
            <span>主监控画面</span>
          </div>
          <div class="record-badge">
            <span class="record-dot"></span>
            REC
          </div>
        </div>

        <div class="video-viewport">
          <img v-if="camera.currentFrame.value" :src="camera.currentFrame.value" class="camera-frame" />
          <div v-else class="camera-placeholder">
            <Icon icon="mdi:camera-off-outline" class="placeholder-icon" />
            <p>摄像头画面采集区域</p>
            <span>等待视频流接入...</span>
          </div>

          <div class="viewport-corners">
            <span></span><span></span><span></span><span></span>
          </div>
          <div class="crosshair">
            <span class="crosshair-h"></span>
            <span class="crosshair-v"></span>
          </div>
          <div class="timestamp-badge">{{ new Date().toLocaleString('zh-CN') }}</div>

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
            <div class="roi-config-header">
              <div>
                <div class="roi-config-title">OCR 识别区域配置</div>
                <div class="roi-config-tip">选择通道后在画面中框选区域，保存后用于采集阶段自动识别。</div>
              </div>
              <button class="ghost-btn" @click="saveAndExitRoiConfig">保存配置</button>
            </div>
            <div class="roi-buttons-grid">
              <button
                v-for="channel in COLLECTION_CHANNELS"
                :key="channel.id"
                class="roi-btn"
                :class="{ active: activeRoiKey === channel.id, configured: !!roiRegions[channel.id] }"
                :style="{ '--roi-color': channel.color, color: channel.color }"
                @click="selectRoiTarget(channel.id)"
              >
                {{ channel.name }}
              </button>
            </div>
          </div>
        </div>

        <div class="viewport-note">
          当前页面用于确认摄像头视角、ROI 识别区域和基础监控状态，确认无误后进入数据采集。
        </div>
      </div>

      <div class="monitor-sidebar">
        <div class="side-card">
          <div class="side-title">监控设置</div>
          <div class="camera-select-row">
            <span>采集设备</span>
            <select v-model="selectedCameraIndex" class="camera-select" @change="handleCameraChange">
              <option v-for="(device, index) in availableCameras" :key="device.deviceId" :value="index">
                {{ device.label }}
              </option>
            </select>
          </div>
          <div class="setting-row">
            <span>识别区域</span>
            <strong>{{ configuredRoiCount }}/{{ COLLECTION_CHANNELS.length }}</strong>
          </div>
          <div class="setting-row">
            <span>分辨率</span>
            <strong>{{ camera.currentFrame.value ? '实时视频流' : '待连接' }}</strong>
          </div>
          <button class="primary-lite-btn" @click="isOcrConfigMode = true">
            <Icon icon="mdi:cog-outline" />
            配置 ROI
          </button>
        </div>

        <div class="side-card">
          <div class="side-title">识别通道</div>
          <div class="channel-list">
            <div v-for="item in roiSummary" :key="item.id" class="channel-row">
              <span class="channel-name">
                <span class="channel-color" :style="{ background: item.color }"></span>
                {{ item.name }}
              </span>
              <span class="channel-state" :class="{ configured: item.configured }">
                {{ item.configured ? '已配置' : '未配置' }}
              </span>
            </div>
          </div>
        </div>

        <div class="side-card">
          <div class="side-title">确认项</div>
          <ul class="confirm-list">
            <li>核对任务单号、设备名称与实际工单一致</li>
            <li>确认主画面覆盖被测区域，画面稳定无抖动</li>
            <li>如需 OCR 采集，至少完成对应通道 ROI 框选</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="monitor-footer">
      <button class="btn-outline" :disabled="statusMutating" @click="emit('back')">返回排程</button>
      <button class="btn-primary" :disabled="statusMutating" @click="emit('confirmSync')">
        <Icon icon="mdi:play-circle-outline" />
        确认并开始数据采集
      </button>
    </div>
  </div>
</template>

<style scoped>
.monitor-container { display:flex; flex-direction:column; gap:16px; min-height:0; flex:1; overflow-y:auto; padding-right:6px; }
.step-card,
.info-card,
.video-card,
.side-card { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:16px; }
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
.monitor-header-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:16px; }
.info-card { padding:18px 20px; display:flex; flex-direction:column; gap:8px; }
.info-label { font-size:12px; color:var(--color-text-secondary); }
.info-value { font-size:18px; font-weight:700; color:var(--color-text-primary); }
.info-value.highlight { color:var(--color-accent-blue); }
.info-value.accent { color:#8b5cf6; }
.status-pill { display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border-radius:999px; width:max-content; font-weight:600; font-size:13px; }
.status-pill.online { background:rgba(34,197,94,.14); color:#16a34a; }
.status-pill.offline { background:rgba(245,158,11,.14); color:#d97706; }
.status-dot { width:8px; height:8px; border-radius:999px; background:currentColor; box-shadow:0 0 0 4px rgba(255,255,255,.08); }
.monitor-main { display:grid; grid-template-columns:minmax(0, 2.3fr) minmax(320px, .9fr); gap:16px; flex:1; min-height:0; }
.video-card { display:flex; flex-direction:column; overflow:hidden; min-height:0; }
.panel-header { display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--color-border); background:var(--color-bg-tertiary); }
.panel-title { display:flex; align-items:center; gap:10px; font-weight:700; color:var(--color-text-primary); }
.record-badge { display:flex; align-items:center; gap:8px; color:#ef4444; font-size:12px; font-weight:700; letter-spacing:.08em; }
.record-dot { width:8px; height:8px; border-radius:999px; background:#ef4444; animation:pulse 1.5s ease-in-out infinite; }
.video-viewport { position:relative; flex:1; min-height:420px; background:#0f172a; overflow:hidden; display:flex; align-items:center; justify-content:center; }
.camera-frame { width:100%; height:100%; object-fit:contain; display:block; position:relative; z-index:1; }
.camera-placeholder { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; gap:10px; color:rgba(255,255,255,.6); text-align:center; }
.placeholder-icon { font-size:54px; }
.camera-placeholder span { font-size:13px; color:rgba(255,255,255,.42); }
.viewport-corners span { position:absolute; width:30px; height:30px; border-color:rgba(34,211,238,.65); z-index:2; }
.viewport-corners span:nth-child(1) { top:22px; left:22px; border-top:2px solid; border-left:2px solid; }
.viewport-corners span:nth-child(2) { top:22px; right:22px; border-top:2px solid; border-right:2px solid; }
.viewport-corners span:nth-child(3) { bottom:22px; left:22px; border-bottom:2px solid; border-left:2px solid; }
.viewport-corners span:nth-child(4) { bottom:22px; right:22px; border-bottom:2px solid; border-right:2px solid; }
.crosshair { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:2; pointer-events:none; }
.crosshair-h { width:100px; height:1px; background:rgba(34,211,238,.35); }
.crosshair-v { position:absolute; width:1px; height:100px; background:rgba(34,211,238,.35); }
.timestamp-badge { position:absolute; left:18px; bottom:18px; z-index:2; padding:6px 10px; border-radius:8px; background:rgba(15,23,42,.72); color:rgba(255,255,255,.75); font-size:12px; font-family:monospace; }
.roi-overlay { position:absolute; inset:0; width:100%; height:100%; z-index:3; pointer-events:none; }
.roi-overlay.config-active { pointer-events:auto; cursor:crosshair; }
.roi-config-panel { position:absolute; left:0; right:0; bottom:0; z-index:4; padding:16px; background:linear-gradient(180deg, rgba(15,23,42,.2), rgba(15,23,42,.92)); backdrop-filter:blur(6px); }
.roi-config-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:12px; }
.roi-config-title { font-size:14px; font-weight:700; color:#fff; }
.roi-config-tip { font-size:12px; color:rgba(255,255,255,.72); margin-top:4px; }
.roi-buttons-grid { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:8px; }
.roi-btn { min-height:34px; border:1px solid rgba(255,255,255,.14); border-radius:10px; background:rgba(255,255,255,.06); font-size:12px; cursor:pointer; transition:all .2s ease; }
.roi-btn:hover { background:rgba(255,255,255,.12); }
.roi-btn.active { border-color:var(--roi-color); box-shadow:0 0 0 1px var(--roi-color) inset; background:rgba(255,255,255,.16); }
.roi-btn.configured::after { content:' · 已配'; font-size:11px; opacity:.85; }
.ghost-btn,
.btn-outline,
.btn-primary,
.primary-lite-btn { border:none; cursor:pointer; border-radius:10px; transition:all .2s ease; }
.ghost-btn { padding:10px 14px; background:rgba(255,255,255,.1); color:#fff; }
.ghost-btn:hover { background:rgba(255,255,255,.16); }
.viewport-note { padding:14px 18px; font-size:13px; color:var(--color-text-secondary); border-top:1px solid var(--color-border); }
.monitor-sidebar { display:flex; flex-direction:column; gap:16px; min-height:0; }
.side-card { padding:16px; display:flex; flex-direction:column; gap:14px; }
.side-title { font-size:14px; font-weight:700; color:var(--color-text-primary); }
.camera-select-row,
.setting-row,
.channel-row { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:13px; color:var(--color-text-secondary); }
.camera-select { flex:1; max-width:180px; padding:8px 10px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-primary); }
.primary-lite-btn { display:flex; align-items:center; justify-content:center; gap:8px; padding:11px 14px; background:rgba(59,130,246,.12); color:var(--color-accent-blue); border:1px solid rgba(59,130,246,.2); }
.primary-lite-btn:hover { background:rgba(59,130,246,.18); }
.channel-list { display:flex; flex-direction:column; gap:10px; max-height:240px; overflow:auto; }
.channel-name { display:flex; align-items:center; gap:8px; color:var(--color-text-primary); }
.channel-color { width:10px; height:10px; border-radius:999px; }
.channel-state { padding:4px 8px; border-radius:999px; background:var(--color-bg-tertiary); color:var(--color-text-tertiary); font-size:12px; }
.channel-state.configured { background:rgba(34,197,94,.14); color:#16a34a; }
.confirm-list { margin:0; padding-left:18px; color:var(--color-text-secondary); display:flex; flex-direction:column; gap:8px; font-size:13px; }
.monitor-footer { display:flex; align-items:center; justify-content:center; gap:16px; }
.btn-outline,
.btn-primary { min-width:220px; padding:13px 24px; font-size:15px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; }
.btn-outline { background:var(--color-bg-secondary); color:var(--color-text-primary); border:1px solid var(--color-border); }
.btn-outline:hover:not(:disabled) { background:var(--color-bg-hover); }
.btn-primary { background:var(--color-primary, #3b82f6); color:#fff; box-shadow:0 12px 24px rgba(59,130,246,.18); }
.btn-primary:hover:not(:disabled) { transform:translateY(-1px); opacity:.94; }
.btn-outline:disabled,
.btn-primary:disabled { opacity:.55; cursor:not-allowed; transform:none; }
@keyframes pulse { 0% { opacity:1; } 50% { opacity:.35; } 100% { opacity:1; } }
@media (max-width: 1280px) {
  .monitor-header-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  .monitor-main { grid-template-columns:1fr; }
}
.monitor-container::-webkit-scrollbar { width: 10px; }
.monitor-container::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.35); border-radius: 999px; }
.monitor-container::-webkit-scrollbar-track { background: transparent; }
</style>
