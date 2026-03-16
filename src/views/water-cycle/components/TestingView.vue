<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { invoke } from '@tauri-apps/api/core'

// 修正路径：跳出 components 进入 composables
import { currentView, selectedOrder, roiRegions, COLLECTION_CHANNELS } from '../composables/useTestStore'

// 从父组件接收底层硬件/模型实例
const { camera, ocr } = defineProps<{ camera: any; ocr: any }>()
const emit = defineEmits(['confirm-sync', 'back'])

// 摄像头与画布引用
const selectedCameraIndex = ref(0)
const showCameraSelect = ref(false)
const roiCanvasRef = ref<HTMLCanvasElement | null>(null)

// ROI (Region of Interest) 配置交互状态
const isOcrConfigMode = ref(false)
const activeRoiKey = ref<string | null>(null) // 当前正在配置的通道 ID
const roiDragStart = ref<{ x: number; y: number } | null>(null) // 鼠标按下时的起始相对坐标(0~1)
const roiDragCurrent = ref<{ x: number; y: number } | null>(null) // 鼠标拖拽时的当前相对坐标(0~1)

// ============ 摄像头初始化 ============
async function startMonitorCamera() {
  const deviceList = await camera.getDeviceList()
  if (deviceList.length > 1) showCameraSelect.value = true
  await camera.startCamera(selectedCameraIndex.value)
}

// ============ ROI 拖拽框选逻辑 ============

// 选择要配置的通道
function selectRoiTarget(key: string) { activeRoiKey.value = activeRoiKey.value === key ? null : key }

// 鼠标在画布上按下：记录起点
function onRoiMouseDown(e: MouseEvent) {
  if (!activeRoiKey.value || !roiCanvasRef.value) return
  const rect = roiCanvasRef.value.getBoundingClientRect()
  roiDragStart.value = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  roiDragCurrent.value = { ...roiDragStart.value }
}

// 鼠标拖拽中：更新当前点并重绘
function onRoiMouseMove(e: MouseEvent) {
  if (!roiDragStart.value || !roiCanvasRef.value) return
  const rect = roiCanvasRef.value.getBoundingClientRect()
  // 限制坐标在 0~1 范围内，防止拖出边界
  roiDragCurrent.value = { 
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), 
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) 
  }
  drawRoiOverlay()
}

// 鼠标松开：计算宽高并保存坐标
function onRoiMouseUp() {
  if (!roiDragStart.value || !roiDragCurrent.value || !activeRoiKey.value) return
  const w = Math.abs(roiDragCurrent.value.x - roiDragStart.value.x)
  const h = Math.abs(roiDragCurrent.value.y - roiDragStart.value.y)
  
  // 忽略太小的点击误触
  if (w > 0.01 && h > 0.01) {
    const ch = COLLECTION_CHANNELS.find(c => c.id === activeRoiKey.value)
    // 采用相对坐标 (百分比) 存储，以自适应不同尺寸的屏幕和视频流缩放
    roiRegions.value[activeRoiKey.value] = {
      id: activeRoiKey.value, 
      label: ch?.name || activeRoiKey.value,
      x: Math.min(roiDragStart.value.x, roiDragCurrent.value.x), 
      y: Math.min(roiDragStart.value.y, roiDragCurrent.value.y), 
      width: w, height: h
    }
  }
  
  // 状态复位并重绘
  roiDragStart.value = null; roiDragCurrent.value = null; drawRoiOverlay()
}

// ============ 画布绘制逻辑 ============
function drawRoiOverlay() {
  const canvas = roiCanvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  
  // 配置模式下，增加一层半透明黑色遮罩，突出框选区
  if (isOcrConfigMode.value) { 
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(0, 0, width, height) 
  }
  
  // 颜色映射字典
  const colorMap = Object.fromEntries(COLLECTION_CHANNELS.map(c => [c.id, c.color]))
  
  // 绘制已存在的区域
  for (const [key, region] of Object.entries(roiRegions.value)) {
    // 将相对坐标(0~1)还原为画布上的绝对像素坐标
    const rx = region.x * width; const ry = region.y * height; 
    const rw = region.width * width; const rh = region.height * height
    
    // 在遮罩层上“挖空”当前区域
    if (isOcrConfigMode.value) ctx.clearRect(rx, ry, rw, rh)
    
    // 绘制边框和标签
    ctx.strokeStyle = colorMap[key] || '#888'; ctx.lineWidth = 2; ctx.strokeRect(rx, ry, rw, rh)
    ctx.fillStyle = colorMap[key] || '#888'; ctx.font = '12px sans-serif'; 
    ctx.fillText(region.label || key, rx + 4, ry - 4 > 12 ? ry - 4 : ry + 14)
  }
  
  // 绘制正在拖拽中的虚线框
  if (roiDragStart.value && roiDragCurrent.value && activeRoiKey.value) {
    ctx.strokeStyle = colorMap[activeRoiKey.value] || '#fff'; ctx.lineWidth = 2; ctx.setLineDash([6, 3])
    ctx.strokeRect(roiDragStart.value.x * width, roiDragStart.value.y * height, (roiDragCurrent.value.x - roiDragStart.value.x) * width, (roiDragCurrent.value.y - roiDragStart.value.y) * height)
    ctx.setLineDash([]) // 恢复实线
  }
}

// 窗口变化时调整画布分辨率，避免由于 CSS 缩放导致绘制错位
function resizeRoiCanvas() {
  const canvas = roiCanvasRef.value; const parent = canvas?.parentElement
  if (!canvas || !parent) return
  canvas.width = parent.clientWidth; canvas.height = parent.clientHeight; drawRoiOverlay()
}

// 从系统缓存 (Tauri 本地) 中恢复上一次配置的 ROI 信息
async function loadCachedRoi() {
  try {
    const cached = await invoke<string>('read_cache', { cacheType: 'temp', id: 'wc-ocr-roi' })
    if (cached) roiRegions.value = JSON.parse(cached)
  } catch (e) { console.debug('未加载到本地缓存 ROI') }
}

// 保存配置并退出编辑模式
async function saveAndExitRoiConfig() {
  isOcrConfigMode.value = false; activeRoiKey.value = null
  try { 
    await invoke('write_cache', { cacheType: 'temp', id: 'wc-ocr-roi', content: JSON.stringify(roiRegions.value) }) 
  } catch (e) { console.error('持久化写入缓存失败') }
  drawRoiOverlay()
}

// 组件挂载：初始化摄像头、读取缓存并监听尺寸变化
onMounted(async () => {
  await startMonitorCamera(); await loadCachedRoi()
  nextTick(() => { resizeRoiCanvas(); window.addEventListener('resize', resizeRoiCanvas) })
})

onUnmounted(() => window.removeEventListener('resize', resizeRoiCanvas))
</script>

<template>
  <div class="monitor-container">
    <div class="monitor-header-params">
      <div class="param-group"><span class="p-label">任务单号</span><span class="p-value highlight">{{ selectedOrder?.taskNumber }}</span></div>
      <div class="param-group"><span class="p-label">测试设备</span><span class="p-value">{{ selectedOrder?.deviceName }}</span></div>
      <div class="param-group"><span class="p-label">流程长度</span><span class="p-value purple-text">{{ selectedOrder?.flowProcess }}</span></div>
    </div>
    
    <div class="monitor-main">
      <div class="video-main-section">
        <div class="video-card">
          <div class="video-card-header"><Icon icon="mdi:camera-outline" /> <span>主监控画面采集</span></div>
          <div class="video-viewport" style="position: relative;">
            
            <img v-if="camera.currentFrame.value" :src="camera.currentFrame.value" class="camera-frame" />
            <div v-else class="camera-placeholder"><Icon icon="mdi:loading" class="spin-icon" />等待连接...</div>
            
            <canvas ref="roiCanvasRef" class="roi-overlay" :class="{ 'config-active': isOcrConfigMode }" 
                    @mousedown="onRoiMouseDown" @mousemove="onRoiMouseMove" @mouseup="onRoiMouseUp" @mouseleave="onRoiMouseUp" />
            
            <div v-if="isOcrConfigMode" class="roi-config-panel">
              <div class="roi-buttons-grid">
                <button v-for="c in COLLECTION_CHANNELS" :key="c.id" 
                        class="roi-btn" 
                        :class="{ active: activeRoiKey === c.id, configured: !!roiRegions[c.id] }" 
                        :style="{ color: c.color, '--roi-color': c.color }" 
                        @click="selectRoiTarget(c.id)">
                  {{ c.name }}
                </button>
              </div>
              <button class="btn-solid-primary small" style="margin-top:10px" @click="saveAndExitRoiConfig">保存配置</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="monitor-sidebar">
        <div class="action-panel">
          <button class="icon-action-btn" @click="isOcrConfigMode = true"><Icon icon="mdi:cog" /> 配置 ROI</button>
        </div>
      </div>
    </div>
    
    <div class="monitor-footer">
      <button class="btn-outline" @click="emit('back')">返回排程</button>
      <button class="btn-solid-primary" @click="emit('confirm-sync')"><Icon icon="mdi:database-export" /> 确认并同步</button>
    </div>
  </div>
</template>

<style scoped>
.monitor-container { display:flex; flex-direction:column; gap:20px; height:100%; }
.monitor-header-params { background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:20px 30px; border-radius:12px; display:flex; gap:50px; box-shadow:0 2px 4px rgba(0,0,0,.02); }
.param-group { display:flex; flex-direction:column; gap:6px; }
.p-label { font-size:12px; color:var(--color-text-secondary); }
.p-value { font-size:18px; font-weight:700; color:var(--color-text-primary); }
.p-value.highlight { color:var(--color-accent-blue); }
.purple-text { color:#8b5cf6; }
.status-badge { display:flex; align-items:center; gap:8px; background:#f0fdf4; color:#16a34a; padding:4px 12px; border-radius:20px; font-size:14px; font-weight:600; border:1px solid #dcfce7; }
.pulse-dot { width:8px; height:8px; background:#22c55e; border-radius:50%; animation:pulse 1.5s infinite; }
@keyframes pulse { 0%{opacity:1;} 50%{opacity:.3;} 100%{opacity:1;} }
.monitor-main { flex:1; display:flex; gap:20px; min-height:0; }
.video-main-section { flex:3; }
.monitor-sidebar { flex:1; display:flex; flex-direction:column; gap:20px; }
.video-card { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; height:100%; display:flex; flex-direction:column; overflow:hidden; }
.video-card-header { padding:12px 18px; background:var(--color-bg-tertiary); border-bottom:1px solid var(--color-border); font-weight:600; display:flex; align-items:center; gap:10px; color:var(--color-text-primary); }
.rec-indicator { margin-left:auto; color:#ef4444; font-size:12px; font-weight:bold; }
.video-viewport { flex:1; background:#0f172a; display:flex; align-items:center; justify-content:center; position:relative; color:#334155; }
.video-footer-info { padding:12px; font-size:13px; color:var(--color-text-secondary); background:var(--color-bg-tertiary); }
.camera-frame { width:100%; height:100%; object-fit:contain; display:block; }
.camera-placeholder { display:flex; flex-direction:column; align-items:center; gap:8px; color:rgba(255,255,255,.4); font-size:14px; }
.camera-placeholder .spin-icon { font-size:32px; animation:spin 1s linear infinite; }
.camera-placeholder.error { color:#ef4444; }
@keyframes spin { from{transform:rotate(0);} to{transform:rotate(360deg);} }
.camera-status { position:absolute; top:10px; left:10px; display:flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(0,0,0,.6); border-radius:6px; font-size:11px; font-weight:600; color:#ef4444; letter-spacing:1px; z-index:5; }
.live-dot { width:8px; height:8px; border-radius:50%; background:#ef4444; animation:livePulse 1.5s ease-in-out infinite; }
@keyframes livePulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
.roi-overlay { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:3; }
.roi-overlay.config-active { pointer-events:auto; cursor:crosshair; }
.roi-config-panel { position:absolute; bottom:0; left:0; right:0; background:rgba(15,23,42,.92); backdrop-filter:blur(8px); padding:12px 16px; display:flex; flex-direction:column; gap:10px; border-top:1px solid rgba(255,255,255,.1); z-index:10; }
.roi-config-title { font-size:12px; color:rgba(255,255,255,.7); text-align:center; }
.roi-buttons-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; justify-content:center; }
.roi-btn { display:flex; align-items:center; justify-content:center; gap:4px; padding:5px 8px; border:1px solid rgba(255,255,255,.2); border-radius:6px; background:rgba(255,255,255,.05); font-size:12px; cursor:pointer; transition:all .2s; white-space:nowrap; }
.roi-btn:hover { background:rgba(255,255,255,.1); }
.roi-btn.active { border-color:var(--roi-color); background:rgba(255,255,255,.15); }
.roi-btn.configured { opacity:1; }
.roi-btn.configured::after { content:' \2713'; }
.roi-config-actions { display:flex; gap:8px; justify-content:flex-end; }
.btn-outline, .btn-solid-primary { padding:12px 30px; border-radius:8px; cursor:pointer; }
.btn-outline { border:1px solid var(--color-border); background:var(--color-bg-secondary); color:var(--color-text-primary); }
.btn-outline:hover { background:var(--color-bg-hover); }
.btn-solid-primary { background:var(--color-primary); color:white; border:none; display:flex; align-items:center; gap:10px; box-shadow:0 4px 12px rgba(59,130,246,.2); }
.btn-solid-primary:hover { opacity:.9; }
.camera-select-panel { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; padding:15px; }
.camera-select { width:100%; padding:8px 12px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-bg-primary); color:var(--color-text-primary); font-size:13px; outline:none; cursor:pointer; }
.camera-select:focus { border-color:var(--color-accent-blue); }
.monitor-footer { display:flex; justify-content:center; gap:20px; padding:10px 0; }
</style>