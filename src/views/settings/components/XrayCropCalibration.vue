<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useCamera } from '@/composables/useCamera'
import { useConfig, type XrayCropArea } from '@/composables/useConfig'

// Props
const props = defineProps<{
  visible: boolean
  xrayDeviceIndex: number
}>()

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

// 摄像头和配置
const camera = useCamera()
const { config, setConfigItem } = useConfig()

// Canvas 引用
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 图片尺寸（从摄像头获取的实际尺寸）
const imageWidth = ref(1920)
const imageHeight = ref(1080)

// 裁剪区域（本地状态，用于实时调整）
const cropW = ref<[number, number]>([0, 1920])
const cropH = ref<[number, number]>([0, 1080])
const cropEnabled = ref(false)

// 是否正在初始化
const isInitializing = ref(false)

// 控制弹窗显示
const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

// 初始化摄像头和配置
async function initCamera() {
  if (!props.visible || props.xrayDeviceIndex < 0) return
  
  isInitializing.value = true
  
  try {
    // 加载已保存的配置
    const savedCropArea = config.value.xrayCropArea
    if (savedCropArea) {
      cropW.value = [...savedCropArea.w] as [number, number]
      cropH.value = [...savedCropArea.h] as [number, number]
      cropEnabled.value = savedCropArea.enabled
    }
    
    // 启动摄像头
    await camera.startCamera(props.xrayDeviceIndex)
    
    // 开始绘制循环
    requestAnimationFrame(drawFrame)
  } catch (error) {
    console.error('初始化 X-Ray 摄像头失败:', error)
  } finally {
    isInitializing.value = false
  }
}

// 释放摄像头
async function releaseCamera() {
  await camera.stopCamera()
}

// 绘制帧和辅助线
function drawFrame() {
  if (!props.visible || !canvasRef.value) return
  
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  // 获取当前帧
  const frameData = camera.currentFrame.value
  if (frameData) {
    const img = new Image()
    img.onload = () => {
      // 更新实际尺寸（首次获取）
      if (imageWidth.value !== img.width || imageHeight.value !== img.height) {
        imageWidth.value = img.width
        imageHeight.value = img.height
        // 如果裁剪范围超出了实际尺寸，调整为实际尺寸
        if (cropW.value[1] > img.width) {
          cropW.value = [cropW.value[0], img.width]
        }
        if (cropH.value[1] > img.height) {
          cropH.value = [cropH.value[0], img.height]
        }
      }
      
      // 设置 canvas 尺寸
      canvas.width = img.width
      canvas.height = img.height
      
      // 绘制图像
      ctx.drawImage(img, 0, 0, img.width, img.height)
      
      // 绘制辅助线和裁剪区域
      drawGuidelines(ctx, img.width, img.height)
    }
    img.src = frameData
  }
  
  // 继续下一帧
  if (props.visible) {
    requestAnimationFrame(drawFrame)
  }
}

// 绘制辅助线和裁剪区域
function drawGuidelines(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) {
  ctx.strokeStyle = 'red'
  ctx.lineWidth = 2
  
  // 绘制垂直辅助线（左右边界）
  ctx.beginPath()
  ctx.moveTo(cropW.value[0], 0)
  ctx.lineTo(cropW.value[0], canvasHeight)
  ctx.moveTo(cropW.value[1], 0)
  ctx.lineTo(cropW.value[1], canvasHeight)
  ctx.stroke()
  
  // 绘制水平辅助线（上下边界）
  // 注意：h 是从底部计算的，所以需要转换
  ctx.beginPath()
  ctx.moveTo(0, canvasHeight - cropH.value[0])
  ctx.lineTo(canvasWidth, canvasHeight - cropH.value[0])
  ctx.moveTo(0, canvasHeight - cropH.value[1])
  ctx.lineTo(canvasWidth, canvasHeight - cropH.value[1])
  ctx.stroke()
  
  // 填充裁剪区域（半透明红色）
  ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'
  const xMin = Math.min(cropW.value[0], cropW.value[1])
  const xMax = Math.max(cropW.value[0], cropW.value[1])
  const yMin = canvasHeight - Math.min(cropH.value[0], cropH.value[1])
  const yMax = canvasHeight - Math.max(cropH.value[0], cropH.value[1])
  ctx.fillRect(xMin, yMax, xMax - xMin, yMin - yMax)
}

// 保存配置
async function saveConfig() {
  const cropArea: XrayCropArea = {
    w: cropW.value,
    h: cropH.value,
    enabled: cropEnabled.value
  }
  await setConfigItem('xrayCropArea', cropArea)
  console.log('X-Ray 裁剪区域已保存:', cropArea)
}

// 确认并关闭
async function handleConfirm() {
  await saveConfig()
  dialogVisible.value = false
}

// 取消
function handleCancel() {
  dialogVisible.value = false
}

// 监听 visible 变化
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    await initCamera()
  } else {
    await releaseCamera()
  }
})

// 组件挂载
onMounted(async () => {
  if (props.visible) {
    await initCamera()
  }
})

// 组件卸载
onUnmounted(async () => {
  await releaseCamera()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-container">
          <!-- 标题栏 -->
          <div class="modal-header">
            <h3 class="modal-title">
              <Icon icon="mdi:crop" />
              X-Ray 区域校准
            </h3>
            <button class="close-btn" @click="handleCancel">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <!-- 内容区 -->
          <div class="modal-content">
            <!-- 加载状态 -->
            <div v-if="isInitializing" class="loading-state">
              <Icon icon="mdi:loading" class="spin" />
              <span>正在初始化摄像头...</span>
            </div>
            
            <!-- 校准区域 -->
            <div v-else class="calibration-area">
              <!-- Canvas 区域和垂直滑块的包装器 -->
              <div class="canvas-wrapper">
                <!-- 垂直滑块（左侧）：上面的滑块控制上边界，下面的滑块控制下边界 -->
                <div class="vertical-slider">
                  <input 
                    type="range" 
                    :min="0" 
                    :max="imageHeight"
                    v-model.number="cropH[1]"
                    class="slider-v"
                    orient="vertical"
                  />
                  <input 
                    type="range" 
                    :min="0" 
                    :max="imageHeight"
                    v-model.number="cropH[0]"
                    class="slider-v"
                    orient="vertical"
                  />
                </div>
                
                <!-- Canvas -->
                <canvas 
                  ref="canvasRef" 
                  class="calibration-canvas"
                ></canvas>
              </div>
              
              <!-- 水平滑块（底部） -->
              <div class="horizontal-slider">
                <input 
                  type="range" 
                  :min="0" 
                  :max="imageWidth"
                  v-model.number="cropW[0]"
                  class="slider-h"
                />
                <input 
                  type="range" 
                  :min="0" 
                  :max="imageWidth"
                  v-model.number="cropW[1]"
                  class="slider-h"
                />
              </div>
            </div>
            
            <!-- 信息显示 -->
            <div class="info-bar">
              <div class="info-item">
                <span class="info-label">水平范围:</span>
                <span class="info-value">{{ cropW[0] }} - {{ cropW[1] }} px</span>
              </div>
              <div class="info-item">
                <span class="info-label">垂直范围:</span>
                <span class="info-value">{{ cropH[0] }} - {{ cropH[1] }} px</span>
              </div>
              <div class="info-item">
                <span class="info-label">裁剪尺寸:</span>
                <span class="info-value">{{ Math.abs(cropW[1] - cropW[0]) }} x {{ Math.abs(cropH[1] - cropH[0]) }} px</span>
              </div>
              <label class="enable-toggle">
                <input type="checkbox" v-model="cropEnabled" />
                <span>启用裁剪</span>
              </label>
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="modal-footer">
            <button class="btn-secondary" @click="handleCancel">
              取消
            </button>
            <button class="btn-primary" @click="handleConfirm">
              <Icon icon="mdi:check" />
              确定
            </button>
          </div>
        </div>
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
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-container {
  width: 80vw;
  max-width: 1200px;
  max-height: 90vh;
  background: var(--color-bg-primary);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
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
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.modal-content {
  flex: 1;
  padding: 20px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.loading-state :deep(svg) {
  font-size: 32px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.calibration-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.canvas-wrapper {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.vertical-slider {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.slider-v {
  writing-mode: vertical-lr;
  direction: rtl;
  flex: 1;
  width: 16px;
  accent-color: var(--color-accent-red);
  cursor: pointer;
}

.calibration-canvas {
  flex: 1;
  max-height: 50vh;
  object-fit: contain;
  background: #000;
  border-radius: 8px;
}

.horizontal-slider {
  display: flex;
  gap: 8px;
  padding-left: 40px;
}

.slider-h {
  flex: 1;
  height: 16px;
  accent-color: var(--color-accent-red);
  cursor: pointer;
}

.info-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
  flex-wrap: wrap;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.info-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
}

.enable-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-primary);
}

.enable-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--color-accent-blue);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.btn-secondary,
.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

.btn-primary {
  background: var(--color-accent-blue);
  border: none;
  color: white;
}

.btn-primary:hover {
  background: #4a9eff;
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
</style>
