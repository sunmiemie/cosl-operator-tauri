<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useCamera, type PhotoResult } from '@/composables/useCamera'
import { useConfig } from '@/composables/useConfig'

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

// 视频元素引用
const videoRef = ref<HTMLVideoElement | null>(null)

// 已拍摄的照片
const capturedPhotos = ref<PhotoResult[]>([])

// 预览图片
const previewPhoto = ref<string>('')
const showPreview = ref(false)

// 关闭对话框
function closeDialog() {
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
}

// 拍照
async function handleTakePhoto() {
  const photo = await camera.takePhoto()
  if (!photo) return
  
  if (props.multiMode) {
    // 多图模式：添加到列表
    capturedPhotos.value.push(photo)
  } else {
    // 单图模式：直接返回
    emit('photo-taken', photo.dataUrl)
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
              
              <!-- 视频预览 -->
              <video 
                ref="videoRef"
                class="camera-video"
                :class="{ hidden: camera.isLoading.value || camera.error.value }"
                autoplay
                playsinline
                muted
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
  display: none;
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
