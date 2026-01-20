<script setup lang="ts">
/**
 * 多图拼接组件
 * 用于拍摄大型电路板时，多次拍摄后自动拼接成完整图像
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'
import { Icon } from '@iconify/vue'
import { useCamera } from '@/composables/useCamera'
import { useConfig, type XrayCropArea } from '@/composables/useConfig'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// Props
interface Props {
  visible: boolean
  deviceType?: 'micro' | 'plane' | 'xray'
}

const props = withDefaults(defineProps<Props>(), {
  deviceType: 'micro'
})

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'use': [dataUrl: string]  // 直接引用拼接后的图片
}>()

// 摄像头和配置
const camera = useCamera()
const { config } = useConfig()

// 根据设备类型获取配置的索引
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

// 裁剪器引用
const cropperRef = ref<InstanceType<typeof Cropper> | null>(null)

// Canvas 引用
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 已拍摄的图片列表
const imageList = ref<{ id: number; url: string }[]>([])

// 裁剪辅助线位置 [左边界, 右边界]
const sliderRange = ref<[number, number]>([0, 800])
const sliderMax = ref(800)

// 拼接后的图片
const concatImage = ref('')

// 裁剪后的图片
const croppedImage = ref('')

// 加载状态
const isConcating = ref(false)

// vue-advanced-cropper 配置
const stencilProps = {
  aspectRatio: undefined,  // 自由比例
  movable: true,
  resizable: true
}

// 帧监听器
let frameUnlisten: UnlistenFn | null = null

// 打开对话框时启动摄像头
async function openCamera() {
  await camera.getDeviceList()
  
  const index = deviceIndex.value >= 0 ? deviceIndex.value : 0
  await camera.startCamera(index)
  
  // 监听摄像头帧
  frameUnlisten = await listen<{ frame: string }>('camera-frame', (event) => {
    drawFrameWithGuidelines(event.payload.frame)
  })
}

// 关闭对话框时释放摄像头
async function releaseCamera() {
  if (frameUnlisten) {
    frameUnlisten()
    frameUnlisten = null
  }
  await camera.stopCamera()
}

// 计算 X-Ray 裁剪区域（像素坐标）
function calculateXrayCropRegion(imgWidth: number, imgHeight: number, cropConfig: XrayCropArea) {
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
    return { sx: 0, sy: 0, sw: imgWidth, sh: imgHeight }
  }
  
  // 限制在图像尺寸范围内
  const sx = Math.max(0, Math.min(wMin, imgWidth))
  const sy = Math.max(0, imgHeight - Math.min(hMax, imgHeight))
  sw = Math.min(sw, imgWidth - sx)
  sh = Math.min(sh, imgHeight - sy)
  
  // 再次验证
  if (sw <= 0 || sh <= 0) {
    return { sx: 0, sy: 0, sw: imgWidth, sh: imgHeight }
  }
  
  return { sx, sy, sw, sh }
}

// 对图像应用 X-Ray 裁剪
function applyXrayCrop(img: HTMLImageElement, cropConfig: XrayCropArea): HTMLCanvasElement {
  const { sx, sy, sw, sh } = calculateXrayCropRegion(img.width, img.height, cropConfig)
  
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  }
  
  return canvas
}

// 绘制带辅助线的帧
function drawFrameWithGuidelines(frameDataUrl: string) {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const img = new Image()
  img.onload = () => {
    let displayWidth = img.width
    let displayHeight = img.height
    let sourceCanvas: HTMLCanvasElement | HTMLImageElement = img
    
    // 如果启用了 X-Ray 裁剪，先应用裁剪
    if (isXrayCropEnabled.value && xrayCropArea.value) {
      const croppedCanvas = applyXrayCrop(img, xrayCropArea.value)
      sourceCanvas = croppedCanvas
      displayWidth = croppedCanvas.width
      displayHeight = croppedCanvas.height
    }
    
    // 更新画布尺寸
    canvas.width = displayWidth
    canvas.height = displayHeight
    
    // 更新滑块最大值
    if (sliderMax.value !== displayWidth) {
      sliderMax.value = displayWidth
      sliderRange.value = [0, displayWidth]
    }
    
    // 绘制图像
    ctx.drawImage(sourceCanvas, 0, 0, displayWidth, displayHeight)
    
    // 绘制裁剪辅助线
    ctx.strokeStyle = '#ff0000'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sliderRange.value[0], 0)
    ctx.lineTo(sliderRange.value[0], canvas.height)
    ctx.moveTo(sliderRange.value[1], 0)
    ctx.lineTo(sliderRange.value[1], canvas.height)
    ctx.stroke()
  }
  img.src = frameDataUrl
}

// 拍照并裁剪
async function takePhoto() {
  const canvas = canvasRef.value
  if (!canvas) return
  
  // 获取当前帧
  const photo = await camera.takePhoto()
  if (!photo) return
  
  // 创建临时 canvas 进行裁剪
  const tempCanvas = document.createElement('canvas')
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) return
  
  const img = new Image()
  img.onload = () => {
    // 确定要裁剪的图像源
    let sourceWidth = img.width
    let sourceHeight = img.height
    let sourceCanvas: HTMLCanvasElement | HTMLImageElement = img
    
    // 如果启用了 X-Ray 裁剪，先应用裁剪
    if (isXrayCropEnabled.value && xrayCropArea.value) {
      const croppedCanvas = applyXrayCrop(img, xrayCropArea.value)
      sourceCanvas = croppedCanvas
      sourceWidth = croppedCanvas.width
      sourceHeight = croppedCanvas.height
    }
    
    const x = sliderRange.value[0]
    const width = sliderRange.value[1] - sliderRange.value[0]
    
    tempCanvas.width = width
    tempCanvas.height = sourceHeight
    
    // 只裁剪辅助线之间的区域
    tempCtx.drawImage(sourceCanvas, x, 0, width, sourceHeight, 0, 0, width, sourceHeight)
    
    const croppedUrl = tempCanvas.toDataURL('image/png')
    
    // 添加到列表
    imageList.value.push({
      id: imageList.value.length + 1,
      url: croppedUrl
    })
  }
  img.src = photo.dataUrl
}

// 删除已拍摄的图片
function deletePhoto(id: number) {
  const index = imageList.value.findIndex(img => img.id === id)
  if (index !== -1) {
    imageList.value.splice(index, 1)
    // 重新编号
    imageList.value.forEach((img, i) => {
      img.id = i + 1
    })
  }
}

// 图片拖拽排序
const photoDragFromIndex = ref(-1)
const photoDragToIndex = ref(-1)

function handlePhotoDragStart(e: DragEvent, index: number) {
  e.dataTransfer?.setData('text/plain', String(index))
  photoDragFromIndex.value = index
}

function handlePhotoDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  photoDragToIndex.value = index
}

function handlePhotoDragEnd() {
  if (photoDragFromIndex.value !== -1 && photoDragToIndex.value !== -1 && photoDragFromIndex.value !== photoDragToIndex.value) {
    const [item] = imageList.value.splice(photoDragFromIndex.value, 1)
    imageList.value.splice(photoDragToIndex.value, 0, item)
    // 重新编号
    imageList.value.forEach((img, i) => {
      img.id = i + 1
    })
  }
  photoDragFromIndex.value = -1
  photoDragToIndex.value = -1
}

// 拼接图片
async function handleConcat() {
  if (imageList.value.length === 0) return
  
  isConcating.value = true
  
  try {
    // 尝试调用 Rust 后端进行拼接
    const images = imageList.value.map(img => img.url)
    const result = await invoke<string>('concat_images', { images })
    concatImage.value = result
  } catch (e) {
    // 如果后端不可用，使用前端 Canvas 拼接
    console.warn('后端拼接失败，使用前端拼接:', e)
    concatImage.value = await concatImagesInFrontend()
  } finally {
    isConcating.value = false
  }
}

// 前端 Canvas 拼接实现
async function concatImagesInFrontend(): Promise<string> {
  return new Promise((resolve) => {
    // 加载所有图片
    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((res) => {
        const img = new Image()
        img.onload = () => res(img)
        img.src = url
      })
    }
    
    Promise.all(imageList.value.map(item => loadImage(item.url))).then(images => {
      // 计算总宽度和最大高度
      const totalWidth = images.reduce((sum, img) => sum + img.width, 0)
      const maxHeight = Math.max(...images.map(img => img.height))
      
      // 创建拼接画布
      const canvas = document.createElement('canvas')
      canvas.width = totalWidth
      canvas.height = maxHeight
      
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve('')
        return
      }
      
      // 横向拼接
      let x = 0
      images.forEach(img => {
        ctx.drawImage(img, x, 0)
        x += img.width
      })
      
      resolve(canvas.toDataURL('image/png'))
    })
  })
}

// 裁剪拼接后的图片
function handleCrop() {
  if (!cropperRef.value) return
  
  const { canvas } = cropperRef.value.getResult()
  if (canvas) {
    croppedImage.value = canvas.toDataURL('image/png')
  }
}

// 重置裁剪
function resetCrop() {
  croppedImage.value = ''
  concatImage.value = ''
}

// 保存图片到本地
async function handleSave() {
  if (!croppedImage.value) return
  
  // TODO: 使用 Tauri 文件系统保存
  // 目前先下载
  const link = document.createElement('a')
  link.download = `concat-${Date.now()}.png`
  link.href = croppedImage.value
  link.click()
}

// 直接引用图片
function handleUse() {
  if (!croppedImage.value) return
  
  emit('use', croppedImage.value)
  closeDialog()
}

// 关闭对话框
function closeDialog() {
  imageList.value = []
  concatImage.value = ''
  croppedImage.value = ''
  emit('update:visible', false)
}

// 监听 visible 变化
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    await openCamera()
  } else {
    await releaseCamera()
  }
})

// 组件卸载时清理
onUnmounted(() => {
  releaseCamera()
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
              <Icon icon="mdi:image-multiple" />
              多图拼接
            </h3>
            <button class="close-btn" @click="closeDialog">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <!-- 内容区 -->
          <div class="modal-content">
            <!-- 摄像头预览区 -->
            <div class="camera-section">
              <canvas ref="canvasRef" class="camera-canvas" />
              
              <!-- 裁剪区域滑块 -->
              <div class="slider-section">
                <span class="slider-label">裁剪区域</span>
                <input 
                  type="range" 
                  v-model.number="sliderRange[0]" 
                  :min="0" 
                  :max="sliderMax"
                  class="range-slider left"
                />
                <input 
                  type="range" 
                  v-model.number="sliderRange[1]" 
                  :min="0" 
                  :max="sliderMax"
                  class="range-slider right"
                />
              </div>
            </div>

            <!-- 已拍摄图片列表 -->
            <div class="photos-section">
              <div class="photos-header">
                <span class="photos-title">
                  已拍摄 ({{ imageList.length }})
                </span>
                <button class="take-btn" @click="takePhoto" title="拍照">
                  <Icon icon="mdi:camera" />
                  拍摄
                </button>
              </div>
              
              <div class="photos-list">
                <div 
                  v-for="(item, index) in imageList" 
                  :key="item.id" 
                  class="photo-item"
                  :class="{ 'drag-over': photoDragToIndex === index && photoDragFromIndex !== index }"
                  draggable="true"
                  @dragstart="handlePhotoDragStart($event, index)"
                  @dragover="handlePhotoDragOver($event, index)"
                  @dragend="handlePhotoDragEnd"
                >
                  <div class="drag-handle">
                    <Icon icon="mdi:drag-vertical" />
                  </div>
                  <img :src="item.url" alt="已拍摄" />
                  <span class="photo-num">{{ item.id }}</span>
                  <button class="delete-btn" @click="deletePhoto(item.id)">
                    <Icon icon="mdi:close" />
                  </button>
                </div>
                
                <div v-if="imageList.length === 0" class="photos-empty">
                  <Icon icon="mdi:image-plus-outline" />
                  <span>调整裁剪区域后点击拍摄</span>
                </div>
              </div>
            </div>

            <!-- 拼接/裁剪预览区 -->
            <div class="cropper-section">
              <template v-if="croppedImage">
                <img :src="croppedImage" alt="裁剪结果" class="cropped-preview" />
              </template>
              <template v-else-if="concatImage">
                <Cropper
                  ref="cropperRef"
                  :src="concatImage"
                  :stencil-props="stencilProps"
                  class="cropper-area"
                />
              </template>
              <template v-else>
                <div class="cropper-placeholder">
                  <Icon icon="mdi:image-filter-none" />
                  <span>拍摄多张图片后点击"拼接"</span>
                </div>
              </template>
            </div>
          </div>

          <!-- 底部操作栏 -->
          <div class="modal-footer">
            <div class="action-left">
              <button 
                class="action-btn primary"
                :disabled="imageList.length === 0 || isConcating"
                @click="handleConcat"
              >
                <Icon :icon="isConcating ? 'mdi:loading' : 'mdi:image-filter-hdr'" :class="{ spin: isConcating }" />
                拼接
              </button>
              <button 
                class="action-btn primary"
                :disabled="!concatImage || !!croppedImage"
                @click="handleCrop"
              >
                <Icon icon="mdi:crop" />
                裁剪
              </button>
              <button 
                v-if="croppedImage"
                class="action-btn"
                @click="resetCrop"
              >
                <Icon icon="mdi:refresh" />
                重置
              </button>
            </div>
            
            <div class="action-right">
              <button class="action-btn" @click="closeDialog">
                取消
              </button>
              <button 
                class="action-btn"
                :disabled="!croppedImage"
                @click="handleSave"
              >
                <Icon icon="mdi:content-save" />
                保存图片
              </button>
              <button 
                class="action-btn primary"
                :disabled="!croppedImage"
                @click="handleUse"
              >
                <Icon icon="mdi:check" />
                直接引用
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.modal-container {
  width: 90vw;
  max-width: 1200px;
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
  background: var(--color-bg-secondary);
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
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px;
  overflow-y: auto;
}

/* 摄像头预览区 */
.camera-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.camera-canvas {
  width: 100%;
  max-height: 300px;
  object-fit: contain;
  background: #000;
  border-radius: 8px;
}

.slider-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
}

.slider-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.range-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  background: var(--color-bg-tertiary);
  border-radius: 3px;
  outline: none;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--color-accent-blue);
  border-radius: 50%;
  cursor: pointer;
}

/* 已拍摄图片列表 */
.photos-section {
  background: var(--color-bg-secondary);
  border-radius: 10px;
  padding: 12px;
}

.photos-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.photos-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.take-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-accent-blue);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.take-btn:hover {
  background: #4c9aed;
}

.photos-list {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 80px;
}

.photo-item {
  position: relative;
  width: 100px;
  height: 75px;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid var(--color-border);
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-num {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  background: var(--color-accent-blue);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-item .delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-item:hover .delete-btn {
  opacity: 1;
}

.photo-item .drag-handle {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 14px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border-radius: 3px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.2s;
}

.photo-item:hover .drag-handle {
  opacity: 1;
}

.photo-item[draggable="true"] {
  cursor: grab;
}

.photo-item[draggable="true"]:active {
  cursor: grabbing;
  opacity: 0.7;
}

.photo-item.drag-over {
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.3);
}

.photos-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.photos-empty :deep(svg) {
  font-size: 28px;
}

/* 裁剪预览区 */
.cropper-section {
  flex: 1;
  min-height: 250px;
  background: var(--color-bg-secondary);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cropper-area {
  width: 100%;
  height: 100%;
}

.cropped-preview {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.cropper-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.cropper-placeholder :deep(svg) {
  font-size: 48px;
  opacity: 0.5;
}

/* 底部操作栏 */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.action-left,
.action-right {
  display: flex;
  gap: 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
  color: white;
}

.action-btn.primary:hover:not(:disabled) {
  background: #4c9aed;
}

/* 动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.modal-enter-active,
.modal-leave-active {
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
