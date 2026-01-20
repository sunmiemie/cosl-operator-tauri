<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useCamera, type PhotoResult } from '@/composables/useCamera'
import { useConfig, type XrayCropArea } from '@/composables/useConfig'

// 定义 props
interface Props {
  visible: boolean
  multiMode?: boolean
  maxCount?: number
  deviceType?: 'micro' | 'plane' | 'xray'  // 设备类型：显微镜/水平仪/X光机
}

const props = withDefaults(defineProps<Props>(), {
  multiMode: false,
  maxCount: 5,
  deviceType: 'micro'
})

// 定义 emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'photo-taken': [dataUrl: string]
  'photos-taken': [dataUrls: string[]]
}>()

// 摄像头控制
const camera = useCamera()
const { config } = useConfig()

// 根据 deviceType 获取配置的设备索引
const deviceIndex = computed(() => {
  switch (props.deviceType) {
    case 'micro': return config.value.microDevice
    case 'plane': return config.value.planeDevice
    case 'xray': return config.value.xrayDevice
    default: return 0
  }
})

// 判断是否启用了 X-Ray 裁剪
const isXrayCropEnabled = computed(() => {
  return props.deviceType === 'xray' && config.value.xrayCropArea?.enabled
})

// 获取 X-Ray 裁剪配置
const xrayCropArea = computed(() => config.value.xrayCropArea)

// 视频元素引用
const videoRef = ref<HTMLVideoElement | null>(null)

// Canvas 引用（用于 X-Ray 裁剪预览）
const cropCanvasRef = ref<HTMLCanvasElement | null>(null)

// 动画帧 ID
let animationFrameId: number | null = null

// 已拍摄的照片
const capturedPhotos = ref<PhotoResult[]>([])

// 预览图片
const previewPhoto = ref<string>('')
const showPreview = ref(false)

// 关闭对话框
function closeDialog() {
  stopCropDrawLoop()
  camera.stopCamera()
  capturedPhotos.value = []
  emit('update:visible', false)
}

// 初始化摄像头
async function initCamera() {
  if (!props.visible) return
  
  await camera.getDeviceList()
  
  if (videoRef.value) {
    camera.bindVideoElement(videoRef.value)
  }
  
  // 使用配置的设备索引启动摄像头
  const index = deviceIndex.value >= 0 ? deviceIndex.value : 0
  await camera.startCamera(index)
  
  // 如果是 X-Ray 且启用了裁剪，启动裁剪绘制循环
  if (isXrayCropEnabled.value) {
    startCropDrawLoop()
  }
}

// 启动裁剪绘制循环
function startCropDrawLoop() {
  if (animationFrameId) return
  drawCroppedFrame()
}

// 停止裁剪绘制循环
function stopCropDrawLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

// 绘制裁剪后的帧到 canvas
function drawCroppedFrame() {
  if (!props.visible || !isXrayCropEnabled.value) {
    animationFrameId = null
    return
  }
  
  const canvas = cropCanvasRef.value
  const cropConfig = xrayCropArea.value
  const frameData = camera.currentFrame.value
  
  // 使用 camera.currentFrame 而不是 video 元素（Tauri 模式）
  if (canvas && cropConfig && frameData) {
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // 计算裁剪区域
        const { sx, sy, sw, sh } = calculateCropRegion(img.width, img.height, cropConfig)
        
        // 设置 canvas 尺寸为裁剪后的尺寸
        canvas.width = sw
        canvas.height = sh
        
        // 绘制裁剪后的画面
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      }
    }
    img.src = frameData
  }
  
  animationFrameId = requestAnimationFrame(drawCroppedFrame)
}

// 计算裁剪区域（像素坐标）
function calculateCropRegion(videoWidth: number, videoHeight: number, cropConfig: XrayCropArea) {
  // 确保裁剪边界有效
  const wMin = Math.min(cropConfig.w[0], cropConfig.w[1])
  const wMax = Math.max(cropConfig.w[0], cropConfig.w[1])
  const hMin = Math.min(cropConfig.h[0], cropConfig.h[1])
  const hMax = Math.max(cropConfig.h[0], cropConfig.h[1])
  
  // 计算裁剪尺寸
  let sw = wMax - wMin
  let sh = hMax - hMin
  
  // 如果裁剪区域无效（宽度或高度为0），返回整个画面
  if (sw <= 0 || sh <= 0) {
    return { sx: 0, sy: 0, sw: videoWidth, sh: videoHeight }
  }
  
  // 限制在视频尺寸范围内
  const sx = Math.max(0, Math.min(wMin, videoWidth))
  const sy = Math.max(0, videoHeight - Math.min(hMax, videoHeight))
  sw = Math.min(sw, videoWidth - sx)
  sh = Math.min(sh, videoHeight - sy)
  
  // 再次验证
  if (sw <= 0 || sh <= 0) {
    return { sx: 0, sy: 0, sw: videoWidth, sh: videoHeight }
  }
  
  return { sx, sy, sw, sh }
}

// 裁剪图片（将 dataUrl 裁剪后返回）
function cropImage(dataUrl: string, cropConfig: XrayCropArea): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const { sx, sy, sw, sh } = calculateCropRegion(img.width, img.height, cropConfig)
      
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      }
      
      resolve(canvas.toDataURL('image/png'))
    }
    img.src = dataUrl
  })
}

// 拍照
async function handleTakePhoto() {
  const photo = await camera.takePhoto()
  if (!photo) return
  
  // 如果是 X-Ray 且启用了裁剪，对照片进行裁剪
  let finalDataUrl = photo.dataUrl
  if (isXrayCropEnabled.value && xrayCropArea.value) {
    finalDataUrl = await cropImage(photo.dataUrl, xrayCropArea.value)
  }
  
  if (props.multiMode) {
    // 多图模式：添加到列表
    capturedPhotos.value.push({ ...photo, dataUrl: finalDataUrl })
  } else {
    // 单图模式：直接返回
    emit('photo-taken', finalDataUrl)
    closeDialog()
  }
}

// 预览照片
function handlePreview(dataUrl: string) {
  previewPhoto.value = dataUrl
  showPreview.value = true
}

// 删除照片
function handleDeletePhoto(index: number) {
  capturedPhotos.value.splice(index, 1)
}

// 确认提交
function handleConfirm() {
  if (props.multiMode) {
    const dataUrls = capturedPhotos.value.map(p => p.dataUrl)
    emit('photos-taken', dataUrls)
  }
  closeDialog()
}

// 切换摄像头
async function handleSwitchCamera() {
  const currentIndex = camera.devices.value.findIndex(
    d => d.deviceId === camera.currentDeviceId.value
  )
  const nextIndex = (currentIndex + 1) % camera.devices.value.length
  const nextDevice = camera.devices.value[nextIndex]
  if (nextDevice) {
    await camera.switchCamera(nextDevice.deviceId)
  }
}

// 监听 visible 变化
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    await initCamera()
  } else {
    camera.stopCamera()
    capturedPhotos.value = []
  }
})

// 组件挂载时初始化
onMounted(async () => {
  if (props.visible) {
    await initCamera()
  }
})

// 组件卸载时清理
onUnmounted(() => {
  stopCropDrawLoop()
  camera.stopCamera()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="closeDialog">
        <div class="modal-container">
          <!-- 标题栏 -->
          <div class="modal-header">
            <h3 class="modal-title">
              <Icon icon="mdi:camera" />
              {{ multiMode ? '多图拍摄' : '拍照' }}
            </h3>
            <button class="close-btn" @click="closeDialog">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <!-- 内容区 -->
          <div class="modal-content">
            <!-- 摄像头预览 -->
            <div class="camera-preview">
              <!-- 加载状态 -->
              <div v-if="camera.isLoading.value" class="loading-state">
                <Icon icon="mdi:loading" class="spin" />
                <span>正在启动摄像头...</span>
              </div>
              
              <!-- 错误状态 -->
              <div v-else-if="camera.error.value" class="error-state">
                <Icon icon="mdi:alert-circle" />
                <span>{{ camera.error.value }}</span>
                <button class="retry-btn" @click="initCamera">
                  <Icon icon="mdi:refresh" />
                  重试
                </button>
              </div>
              
              <!-- 视频预览（非 X-Ray 或未启用裁剪时显示） -->
              <video 
                ref="videoRef"
                class="camera-video"
                :class="{ hidden: camera.isLoading.value || camera.error.value || isXrayCropEnabled }"
                autoplay
                playsinline
                muted
              />
              
              <!-- 裁剪后的 Canvas 预览（X-Ray 启用裁剪时显示） -->
              <canvas
                v-show="isXrayCropEnabled && camera.isActive.value && !camera.isLoading.value && !camera.error.value"
                ref="cropCanvasRef"
                class="cropped-canvas"
              />
              
              <!-- 摄像头控制 -->
              <div v-if="camera.isActive.value" class="camera-controls">
                <!-- 切换摄像头 -->
                <button 
                  v-if="camera.devices.value.length > 1"
                  class="control-btn switch"
                  @click="handleSwitchCamera"
                  title="切换摄像头"
                >
                  <Icon icon="mdi:camera-flip" />
                </button>
                
                <!-- 拍照按钮 -->
                <button 
                  class="control-btn capture"
                  :disabled="multiMode && capturedPhotos.length >= maxCount"
                  @click="handleTakePhoto"
                  title="拍照"
                >
                  <Icon icon="mdi:camera" />
                </button>
                
                <!-- 设备信息 -->
                <div class="device-info">
                  <Icon icon="mdi:video-outline" />
                  <span>{{ camera.devices.value.find(d => d.deviceId === camera.currentDeviceId.value)?.label || '默认摄像头' }}</span>
                </div>
              </div>
            </div>

            <!-- 多图模式：已拍摄照片列表 -->
            <div v-if="multiMode" class="captured-photos">
              <div class="photos-header">
                <span class="photos-title">
                  已拍摄 ({{ capturedPhotos.length }}/{{ maxCount }})
                </span>
              </div>
              
              <div class="photos-list">
                <div 
                  v-for="(photo, index) in capturedPhotos" 
                  :key="index"
                  class="photo-item"
                >
                  <img :src="photo.dataUrl" alt="已拍摄" @click="handlePreview(photo.dataUrl)" />
                  <button class="delete-btn" @click="handleDeletePhoto(index)">
                    <Icon icon="mdi:close" />
                  </button>
                </div>
                
                <div v-if="capturedPhotos.length === 0" class="photos-empty">
                  <Icon icon="mdi:image-multiple-outline" />
                  <span>点击拍照按钮开始拍摄</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部操作栏 -->
          <div v-if="multiMode" class="modal-footer">
            <button class="cancel-btn" @click="closeDialog">
              取消
            </button>
            <button 
              class="confirm-btn"
              :disabled="capturedPhotos.length === 0"
              @click="handleConfirm"
            >
              <Icon icon="mdi:check" />
              确认 ({{ capturedPhotos.length }}张)
            </button>
          </div>
        </div>

        <!-- 图片预览 -->
        <Transition name="fade">
          <div v-if="showPreview" class="preview-overlay" @click="showPreview = false">
            <img :src="previewPhoto" alt="预览" class="preview-image" />
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.modal-container {
  width: 800px;
  max-width: 100%;
  max-height: 90vh;
  background: var(--color-bg-primary);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.modal-title :deep(svg) {
  color: var(--color-accent-blue);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.modal-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.camera-preview {
  position: relative;
  background: #000;
  min-height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #fff;
  font-size: 14px;
}

.loading-state :deep(svg),
.error-state :deep(svg) {
  font-size: 48px;
  opacity: 0.8;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.camera-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.camera-video.hidden {
  /* 使用 position absolute + opacity 0 而不是 display none，
     这样视频流仍然可以正常运行，只是不显示 */
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.cropped-canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.camera-controls {
  position: absolute;
  bottom: 20px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn.switch {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border-radius: 50%;
  font-size: 20px;
}

.control-btn.switch:hover {
  background: rgba(255, 255, 255, 0.3);
}

.control-btn.capture {
  width: 64px;
  height: 64px;
  background: var(--color-accent-blue);
  color: #fff;
  border-radius: 50%;
  font-size: 28px;
  box-shadow: 0 4px 20px rgba(88, 166, 255, 0.4);
}

.control-btn.capture:hover {
  transform: scale(1.05);
}

.control-btn.capture:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.device-info {
  position: absolute;
  bottom: 0;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-radius: 4px;
  font-size: 12px;
}

.captured-photos {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}

.photos-header {
  margin-bottom: 12px;
}

.photos-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.photos-list {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.photo-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-item .delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(239, 68, 68, 0.9);
  color: #fff;
  border-radius: 50%;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.photo-item:hover .delete-btn {
  opacity: 1;
}

.photos-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 40px;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.photos-empty :deep(svg) {
  font-size: 32px;
  opacity: 0.5;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}

.cancel-btn {
  padding: 10px 20px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: var(--color-bg-secondary);
}

.confirm-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  background: var(--color-accent-blue);
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.confirm-btn:hover {
  background: #4a9eff;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}

.preview-image {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
}

/* 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95) translateY(-20px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
