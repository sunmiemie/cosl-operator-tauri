<script setup lang="ts">
/**
 * 2D留存测试执行器
 * 
 * 支持测试模式:
 * - normal: 新工单，从头开始测试
 * - continue: 继续测试，从上次中断处继续
 * 
 * 参考原程序 TwoDTest.vue
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import { useCamera } from '@/composables/useCamera'
import { useConfig } from '@/composables/useConfig'
import { useWindow } from '@/composables/useWindow'
import type { TestUnit } from '@/services/order'
import type { ProcessData, TempOrderData } from '@/services/process'
import { reportApi, type TestReport } from '@/services/report'

// ==================== 类型定义 ====================

type TestMode = 'normal' | 'continue'

// 拍摄的图片项
interface PhotoItem {
  id: number
  url: string
}

// Props
const props = defineProps<{
  testUnit: TestUnit
  mode: TestMode
  isDevTest: boolean
  processData?: ProcessData
  tempData?: TempOrderData
}>()

// Emits
const emit = defineEmits<{
  complete: []
  exit: []
  error: [message: string]
}>()

// ==================== 状态定义 ====================

const { userInfo, getAuthHeaders } = useAuth()
const camera = useCamera()
const { config, initConfig } = useConfig()

// 测试步骤: 1=测试中, 2=结果预览
const testStep = ref(1)

// 当前面: front=正面, back=背面
const currentSide = ref<'front' | 'back'>('front')

// Canvas 相关
const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasParentRef = ref<HTMLDivElement | null>(null)
const cropCanvasRef = ref<HTMLCanvasElement | null>(null)

// 画面尺寸
const frameWidth = ref(1920)
const frameHeight = ref(1080)

// 裁剪线位置 [左边界, 右边界]
const cropLine = ref<[number, number]>([0, 1920])

// 拍摄的图片列表
const frontPhotos = ref<PhotoItem[]>([])
const backPhotos = ref<PhotoItem[]>([])

// 拼接后的图片
const frontConcatImage = ref('')
const backConcatImage = ref('')

// 裁剪后的最终图片
const frontFinalImage = ref('')
const backFinalImage = ref('')

// 拼接/裁剪状态
const isConcating = ref(false)
const isCropping = ref(false)

// 拖拽状态
const isDragging = ref(false)
const dragIndex = ref(-1)

// 提交状态
const isSubmitting = ref(false)

// 提示消息
const toastMessage = ref('')
const toastType = ref<'error' | 'success' | 'info'>('info')
const showToast = ref(false)

// 历史报告
const historyReportList = ref<TestReport[]>([])
const isLoadingHistory = ref(false)
const showHistoryDropdown = ref(false)

// 窗口管理
const { openReportPreview } = useWindow()

// ==================== 计算属性 ====================

// 当前照片列表
const currentPhotos = computed(() => {
  return currentSide.value === 'front' ? frontPhotos.value : backPhotos.value
})

// 当前拼接图
const currentConcatImage = computed(() => {
  return currentSide.value === 'front' ? frontConcatImage.value : backConcatImage.value
})

// 当前最终图
const currentFinalImage = computed(() => {
  return currentSide.value === 'front' ? frontFinalImage.value : backFinalImage.value
})

// 是否可以进入下一步
const canProceed = computed(() => {
  if (currentSide.value === 'front') {
    return frontFinalImage.value !== ''
  }
  return frontFinalImage.value !== '' && backFinalImage.value !== ''
})

// 总览图
const overviewImage = computed(() => {
  if (currentSide.value === 'front') {
    return props.processData?.json?.eyes?.total?.url || ''
  }
  return props.processData?.json?.eyesBak?.total?.url || ''
})

// ==================== 工具函数 ====================

function showMessage(msg: string, type: 'error' | 'success' | 'info' = 'info') {
  toastMessage.value = msg
  toastType.value = type
  showToast.value = true
  setTimeout(() => { showToast.value = false }, 2500)
}

// ==================== Canvas 相关函数 ====================

// 绘制帧到 Canvas
function drawFrame() {
  if (!canvasRef.value || !canvasParentRef.value) return
  
  const frame = camera.currentFrame.value
  if (!frame) return
  
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const img = new Image()
  img.onload = () => {
    // 记录画面尺寸
    frameWidth.value = img.width
    frameHeight.value = img.height
    
    // 初始化裁剪线
    if (cropLine.value[1] === 1920 && img.width !== 1920) {
      cropLine.value = [0, img.width]
    }
    
    // 设置 Canvas 尺寸
    canvas.width = img.width
    canvas.height = img.height
    
    // 计算显示尺寸
    const parent = canvasParentRef.value!
    const maxWidth = parent.clientWidth
    const maxHeight = parent.clientHeight
    const imgRatio = img.width / img.height
    const divRatio = maxWidth / maxHeight
    
    if (imgRatio >= divRatio) {
      canvas.style.width = `${maxWidth}px`
      canvas.style.height = `${maxWidth / imgRatio}px`
    } else {
      canvas.style.height = `${maxHeight}px`
      canvas.style.width = `${maxHeight * imgRatio}px`
    }
    
    // 绘制图像
    ctx.drawImage(img, 0, 0, img.width, img.height)
    
    // 绘制裁剪线
    drawCropLines(ctx, img.width, img.height)
  }
  img.src = frame
}

// 绘制裁剪线
function drawCropLines(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = 'red'
  ctx.lineWidth = 3
  ctx.beginPath()
  
  // 左裁剪线
  ctx.moveTo(cropLine.value[0], 0)
  ctx.lineTo(cropLine.value[0], height)
  
  // 右裁剪线
  ctx.moveTo(cropLine.value[1], 0)
  ctx.lineTo(cropLine.value[1], height)
  
  ctx.stroke()
}

// ==================== 拍照操作 ====================

// 拍照（2D留存不应包含参考线，从原始帧裁剪）
async function takePhoto() {
  const frame = camera.currentFrame.value
  if (!frame) {
    showMessage('无法获取摄像头画面', 'error')
    return
  }
  
  // 加载原始帧图像（不含裁剪线）
  const img = new Image()
  img.onload = () => {
    const left = cropLine.value[0]
    const right = cropLine.value[1]
    const cropWidth = right - left
    
    // 创建临时 Canvas 用于裁剪
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = cropWidth
    tempCanvas.height = img.height
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return
    
    // 从原始图像裁剪（不包含参考线）
    tempCtx.drawImage(img, left, 0, cropWidth, img.height, 0, 0, cropWidth, img.height)
    
    const dataUrl = tempCanvas.toDataURL('image/png')
    const photos = currentSide.value === 'front' ? frontPhotos : backPhotos
    
    photos.value.push({
      id: Date.now(),
      url: dataUrl
    })
    
    showMessage('照片已拍摄', 'success')
  }
  img.src = frame
}

// 删除照片
function removePhoto(index: number) {
  const photos = currentSide.value === 'front' ? frontPhotos : backPhotos
  photos.value.splice(index, 1)
}

// 拖拽开始
function onDragStart(index: number) {
  isDragging.value = true
  dragIndex.value = index
}

// 拖拽结束
function onDragEnd() {
  isDragging.value = false
  dragIndex.value = -1
}

// 拖拽放置
function onDrop(targetIndex: number) {
  if (dragIndex.value === -1 || dragIndex.value === targetIndex) return
  
  const photos = currentSide.value === 'front' ? frontPhotos : backPhotos
  const draggedItem = photos.value[dragIndex.value]
  
  photos.value.splice(dragIndex.value, 1)
  photos.value.splice(targetIndex, 0, draggedItem)
  
  // 重新编号
  photos.value.forEach((item, idx) => {
    item.id = idx + 1
  })
}

// ==================== 图片拼接 ====================

async function concatImages() {
  const photos = currentSide.value === 'front' ? frontPhotos.value : backPhotos.value
  
  if (photos.length === 0) {
    showMessage('请先拍摄照片', 'error')
    return
  }
  
  isConcating.value = true
  
  try {
    // 加载所有图片
    const images: HTMLImageElement[] = []
    for (const photo of photos) {
      const img = await loadImage(photo.url)
      images.push(img)
    }
    
    // 计算总宽度和最大高度
    const totalWidth = images.reduce((sum, img) => sum + img.width, 0)
    const maxHeight = Math.max(...images.map(img => img.height))
    
    // 创建拼接 Canvas
    const canvas = document.createElement('canvas')
    canvas.width = totalWidth
    canvas.height = maxHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context error')
    
    // 拼接图片
    let x = 0
    for (const img of images) {
      ctx.drawImage(img, x, 0)
      x += img.width
    }
    
    const dataUrl = canvas.toDataURL('image/png')
    
    if (currentSide.value === 'front') {
      frontConcatImage.value = dataUrl
    } else {
      backConcatImage.value = dataUrl
    }
    
    showMessage('图片拼接完成，请进行裁剪', 'success')
  } catch (err) {
    showMessage(`拼接失败: ${err}`, 'error')
  } finally {
    isConcating.value = false
  }
}

// 加载图片
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// ==================== 图片裁剪 ====================

// 裁剪区域状态
const cropRect = ref({ x: 0, y: 0, width: 0, height: 0 })
const isCropMode = ref(false)
const cropStartPos = ref({ x: 0, y: 0 })

// 开始裁剪模式
function startCropMode() {
  if (!currentConcatImage.value) {
    showMessage('请先拼接图片', 'error')
    return
  }
  isCropMode.value = true
  cropRect.value = { x: 0, y: 0, width: 0, height: 0 }
}

// 裁剪 Canvas 鼠标事件
function onCropMouseDown(e: MouseEvent) {
  if (!isCropMode.value || !cropCanvasRef.value) return
  
  const rect = cropCanvasRef.value.getBoundingClientRect()
  const scaleX = cropCanvasRef.value.width / rect.width
  const scaleY = cropCanvasRef.value.height / rect.height
  
  cropStartPos.value = {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  }
  
  cropRect.value = {
    x: cropStartPos.value.x,
    y: cropStartPos.value.y,
    width: 0,
    height: 0
  }
  
  isCropping.value = true
}

function onCropMouseMove(e: MouseEvent) {
  if (!isCropping.value || !cropCanvasRef.value) return
  
  const rect = cropCanvasRef.value.getBoundingClientRect()
  const scaleX = cropCanvasRef.value.width / rect.width
  const scaleY = cropCanvasRef.value.height / rect.height
  
  const currentX = (e.clientX - rect.left) * scaleX
  const currentY = (e.clientY - rect.top) * scaleY
  
  cropRect.value = {
    x: Math.min(cropStartPos.value.x, currentX),
    y: Math.min(cropStartPos.value.y, currentY),
    width: Math.abs(currentX - cropStartPos.value.x),
    height: Math.abs(currentY - cropStartPos.value.y)
  }
  
  drawCropCanvas()
}

function onCropMouseUp() {
  isCropping.value = false
}

// 绘制裁剪 Canvas
function drawCropCanvas() {
  if (!cropCanvasRef.value || !currentConcatImage.value) return
  
  const canvas = cropCanvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const img = new Image()
  img.onload = () => {
    canvas.width = img.width
    canvas.height = img.height
    
    // 绘制图片
    ctx.drawImage(img, 0, 0)
    
    // 绘制裁剪框
    if (cropRect.value.width > 0 && cropRect.value.height > 0) {
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(
        cropRect.value.x,
        cropRect.value.y,
        cropRect.value.width,
        cropRect.value.height
      )
      
      // 半透明遮罩
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      // 上
      ctx.fillRect(0, 0, canvas.width, cropRect.value.y)
      // 下
      ctx.fillRect(0, cropRect.value.y + cropRect.value.height, canvas.width, canvas.height - cropRect.value.y - cropRect.value.height)
      // 左
      ctx.fillRect(0, cropRect.value.y, cropRect.value.x, cropRect.value.height)
      // 右
      ctx.fillRect(cropRect.value.x + cropRect.value.width, cropRect.value.y, canvas.width - cropRect.value.x - cropRect.value.width, cropRect.value.height)
    }
  }
  img.src = currentConcatImage.value
}

// 确认裁剪
async function confirmCrop() {
  if (cropRect.value.width === 0 || cropRect.value.height === 0) {
    showMessage('请先框选裁剪区域', 'error')
    return
  }
  
  try {
    const img = await loadImage(currentConcatImage.value)
    
    const canvas = document.createElement('canvas')
    canvas.width = cropRect.value.width
    canvas.height = cropRect.value.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context error')
    
    ctx.drawImage(
      img,
      cropRect.value.x, cropRect.value.y, cropRect.value.width, cropRect.value.height,
      0, 0, cropRect.value.width, cropRect.value.height
    )
    
    const dataUrl = canvas.toDataURL('image/png')
    
    if (currentSide.value === 'front') {
      frontFinalImage.value = dataUrl
    } else {
      backFinalImage.value = dataUrl
    }
    
    isCropMode.value = false
    showMessage('裁剪完成', 'success')
  } catch (err) {
    showMessage(`裁剪失败: ${err}`, 'error')
  }
}

// 取消裁剪
function cancelCrop() {
  isCropMode.value = false
  cropRect.value = { x: 0, y: 0, width: 0, height: 0 }
}

// 重置当前面
function resetCurrentSide() {
  if (currentSide.value === 'front') {
    frontFinalImage.value = ''
    frontConcatImage.value = ''
  } else {
    backFinalImage.value = ''
    backConcatImage.value = ''
  }
  isCropMode.value = false
}

// ==================== 导航操作 ====================

// 下一步
function handleNext() {
  if (currentSide.value === 'front') {
    if (!frontFinalImage.value) {
      showMessage('请完成正面2D留存', 'error')
      return
    }
    // 切换到背面
    currentSide.value = 'back'
  } else {
    if (!backFinalImage.value) {
      showMessage('请完成背面2D留存', 'error')
      return
    }
    // 进入结果预览
    testStep.value = 2
  }
}

// 返回
function handleBack() {
  if (testStep.value === 2) {
    testStep.value = 1
  } else if (currentSide.value === 'back') {
    currentSide.value = 'front'
  }
}


// ==================== 报告提交 ====================

async function submitReport() {
  if (isSubmitting.value) return
  
  isSubmitting.value = true
  
  try {
    // 构建报告数据
    const reportJson = {
      testunit_id: props.testUnit.testunit_id || props.testUnit.dev_testunit_id,
      testunit_type: 3, // 2D留存测试
      board_id: props.testUnit.board_id,
      board_serialnumber: props.testUnit.serial,
      json: {
        twoD: frontFinalImage.value,
        twoDBak: backFinalImage.value
      }
    }
    
    // 上传报告
    const unitId = props.isDevTest 
      ? props.testUnit.dev_testunit_id 
      : props.testUnit.testunit_id
    
    if (!unitId) {
      throw new Error('工单ID不存在')
    }
    
    let response
    if (props.isDevTest) {
      response = await reportApi.uploadTempReport({
        dev_testunit_id: unitId,
        serialNumber: props.testUnit.serial || '',
        userId: userInfo.value?.id || 0,
        testType: 3,
        dev_testunit_status: 2, // 2D留存默认正常
        file: reportJson,
      }, getAuthHeaders())
    } else {
      response = await reportApi.uploadReport({
        testunit_id: unitId,
        serialNumber: props.testUnit.serial || '',
        userId: userInfo.value?.id || 0,
        testType: 3,
        testunit_status: 2,
        file: reportJson,
      }, getAuthHeaders())
    }
    
    if (response.success) {
      showMessage('报告上传成功', 'success')
      setTimeout(() => {
        emit('complete')
      }, 1000)
    } else {
      throw new Error(response.error || '上传失败')
    }
  } catch (err) {
    console.error('提交报告失败:', err)
    showMessage(`提交失败: ${err}`, 'error')
  } finally {
    isSubmitting.value = false
  }
}

// ==================== 生命周期 ====================

let frameInterval: number | null = null

onMounted(async () => {
  await initConfig()
  
  // 启动显微镜摄像头（带异常处理）
  const microDevice = config.value.microDevice
  if (microDevice >= 0) {
    try {
      const success = await camera.startCamera(microDevice)
      if (success) {
        frameInterval = window.setInterval(() => {
          if (testStep.value === 1 && !isCropMode.value) {
            drawFrame()
          }
        }, 33)
      } else {
        console.warn('[2D留存] 摄像头启动返回失败')
      }
    } catch (err) {
      console.error('[2D留存] 摄像头启动异常:', err)
    }
  } else {
    showMessage('未配置显微镜摄像头，请在设置中配置', 'error')
  }
  
  // 加载临时数据
  if (props.mode === 'continue' && props.tempData) {
    loadTempData()
  }
})

onUnmounted(async () => {
  if (frameInterval) {
    clearInterval(frameInterval)
  }
  try {
    await camera.stopCamera()
  } catch (err) {
    console.warn('[2D留存] 停止摄像头时出现异常:', err)
  }
})

function loadTempData() {
  const tempJson = props.tempData?.json
  if (!tempJson?.eyes) return
  
  if (tempJson.eyes.twoD) {
    frontFinalImage.value = tempJson.eyes.twoD
  }
  if (tempJson.eyes.twoDBak) {
    backFinalImage.value = tempJson.eyes.twoDBak
  }
}

// 监听裁剪线变化
watch(cropLine, () => {
  drawFrame()
}, { deep: true })

// 监听拼接图变化，绘制裁剪 Canvas
watch([currentConcatImage, isCropMode], () => {
  if (isCropMode.value && currentConcatImage.value) {
    nextTick(() => {
      drawCropCanvas()
    })
  }
})

// ==================== 历史报告 ====================

/** 获取历史报告列表 */
async function loadHistoryReports() {
  if (!props.testUnit) return
  
  isLoadingHistory.value = true
  try {
    const boardId = props.testUnit.board_id
    
    // 正式工单：查询 mode=0
    const result = await reportApi.getHistoryList({
      mode: 0,
      boardId: boardId
    }, getAuthHeaders())
    
    if (result.success && result.data) {
      historyReportList.value = result.data
    }
  } catch (err) {
    console.error('获取历史报告失败:', err)
  } finally {
    isLoadingHistory.value = false
  }
}

/** 历史下拉展开时触发 */
function handleHistoryDropdownOpen(visible: boolean) {
  showHistoryDropdown.value = visible
  if (visible && historyReportList.value.length === 0) {
    loadHistoryReports()
  }
}

/** 查看历史报告 - 打开独立窗口 */
async function handleViewHistoryReport(report: TestReport) {
  const reportMode = ((report as any).mode ?? 0) as 0 | 1
  const unitId = (report as any).unit_id ?? report.testunit_id ?? report.dev_testunit_id
  
  if (!unitId) {
    ElMessage.error('报告ID无效')
    return
  }
  
  try {
    await openReportPreview(reportMode, unitId)
  } catch (err) {
    console.error('打开报告窗口失败:', err)
    ElMessage.error('打开报告窗口失败')
  }
}

/** 格式化日期 */
function formatReportDate(dateStr?: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

/** 获取报告状态文本 */
function getReportStatusText(status?: number | string): string {
  const s = String(status)
  if (s === '2') return '正常'
  if (s === '3') return '异常'
  return '未知'
}

/** 获取报告状态类 */
function getReportStatusClass(status?: number | string): string {
  const s = String(status)
  if (s === '2') return 'status-pass'
  if (s === '3') return 'status-fail'
  return ''
}
</script>

<template>
  <div class="executor-container">
    <!-- 提示消息 -->
    <Transition name="toast">
      <div v-if="showToast" :class="['toast', `toast-${toastType}`]">
        <Icon :icon="toastType === 'error' ? 'mdi:alert-circle' : toastType === 'success' ? 'mdi:check-circle' : 'mdi:information'" />
        <span>{{ toastMessage }}</span>
      </div>
    </Transition>
    
    <!-- 顶部状态栏 -->
    <div class="status-bar">
      <div class="status-info">
        <div class="info-icon blue">
          <Icon icon="mdi:camera" />
        </div>
        <div class="info-content">
          <span class="info-title">2D留存测试</span>
          <span class="info-meta">
            {{ props.testUnit.boardmodel }} · S/N: {{ props.testUnit.serial }}
          </span>
        </div>
      </div>
      
      <!-- 历史报告下拉 -->
      <div class="history-dropdown">
        <button 
          class="btn btn-ghost history-btn"
          @click="handleHistoryDropdownOpen(!showHistoryDropdown)"
        >
          <Icon icon="mdi:history" />
          历史报告
          <Icon :icon="showHistoryDropdown ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
        </button>
        
        <!-- 下拉列表 -->
        <div v-if="showHistoryDropdown" class="history-dropdown-panel">
          <div v-if="isLoadingHistory" class="history-loading">
            <Icon icon="mdi:loading" class="loading-icon" />
            加载中...
          </div>
          <div v-else-if="historyReportList.length === 0" class="history-empty">
            暂无历史报告
          </div>
          <div v-else class="history-list">
            <div 
              v-for="report in historyReportList" 
              :key="(report as any).unit_id || report.id"
              class="history-item"
              @click="handleViewHistoryReport(report)"
            >
              <div class="history-info">
                <span class="history-model">{{ (report as any).model || report.boardmodel || '未知型号' }}</span>
                <span class="history-date">{{ formatReportDate((report as any).date || report.report_time) }}</span>
              </div>
              <div class="history-status" :class="getReportStatusClass((report as any).status)">
                {{ getReportStatusText((report as any).status) }}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 步骤指示器 -->
      <div class="step-indicator">
        <div :class="['step', { active: currentSide === 'front' || testStep === 2 }]">
          <span class="step-num">1</span>
          <span class="step-label">正面</span>
        </div>
        <Icon icon="mdi:chevron-right" class="step-arrow" />
        <div :class="['step', { active: currentSide === 'back' || testStep === 2 }]">
          <span class="step-num">2</span>
          <span class="step-label">背面</span>
        </div>
        <Icon icon="mdi:chevron-right" class="step-arrow" />
        <div :class="['step', { active: testStep === 2 }]">
          <span class="step-num">3</span>
          <span class="step-label">完成</span>
        </div>
      </div>
    </div>
    
    <!-- 测试阶段 -->
    <div v-if="testStep === 1" class="test-content">
      <!-- 总览图 -->
      <div v-if="overviewImage" class="overview-bar">
        <div class="side-badge" :class="currentSide">
          {{ currentSide === 'front' ? '正面2D留存' : '背面2D留存' }}
        </div>
        <img :src="overviewImage" alt="总览图" class="overview-img" />
      </div>
      
      <!-- 拍摄的照片列表 -->
      <div class="photos-bar">
        <div class="photos-header">
          <Icon icon="mdi:image-multiple" />
          <span>已拍摄照片 ({{ currentPhotos.length }})</span>
          <span class="tip">拖拽调整顺序</span>
        </div>
        <div class="photos-list">
          <div 
            v-for="(photo, index) in currentPhotos"
            :key="photo.id"
            class="photo-item"
            :class="{ dragging: isDragging && dragIndex === index }"
            draggable="true"
            @dragstart="onDragStart(index)"
            @dragend="onDragEnd"
            @dragover.prevent
            @drop="onDrop(index)"
          >
            <img :src="photo.url" alt="" />
            <div class="photo-index">{{ index + 1 }}</div>
            <button @click="removePhoto(index)" class="photo-remove">
              <Icon icon="mdi:close" />
            </button>
          </div>
          
          <!-- 操作按钮 -->
          <button @click="takePhoto" class="photo-add" :disabled="!camera.isActive.value">
            <Icon icon="mdi:camera-plus" />
          </button>
          <button 
            @click="concatImages" 
            class="photo-concat"
            :disabled="currentPhotos.length === 0 || isConcating"
          >
            <Icon :icon="isConcating ? 'mdi:loading' : 'mdi:image-filter-hdr'" :class="{ spin: isConcating }" />
          </button>
        </div>
      </div>
      
      <div class="test-main">
        <!-- 左侧：实时画面 -->
        <div v-if="!isCropMode" class="camera-section">
          <div class="section-header">
            <Icon icon="mdi:video" />
            <span>实时画面</span>
          </div>
          <div ref="canvasParentRef" class="camera-view">
            <canvas ref="canvasRef" class="camera-canvas" />
          </div>
          
          <!-- 裁剪线控制 -->
          <div class="crop-controls">
            <div class="crop-control">
              <span class="control-label">左边界</span>
              <input 
                type="range" 
                v-model.number="cropLine[0]" 
                :min="0" 
                :max="frameWidth"
                class="crop-slider"
              />
              <span class="control-value">{{ cropLine[0] }}px</span>
            </div>
            <div class="crop-control">
              <span class="control-label">右边界</span>
              <input 
                type="range" 
                v-model.number="cropLine[1]" 
                :min="0" 
                :max="frameWidth"
                class="crop-slider"
              />
              <span class="control-value">{{ cropLine[1] }}px</span>
            </div>
          </div>
        </div>
        
        <!-- 裁剪模式 -->
        <div v-else class="crop-section">
          <div class="section-header">
            <Icon icon="mdi:crop" />
            <span>裁剪图片</span>
            <div class="header-actions">
              <button @click="cancelCrop" class="btn btn-sm btn-ghost">取消</button>
              <button @click="confirmCrop" class="btn btn-sm btn-primary">确认裁剪</button>
            </div>
          </div>
          <div class="crop-view">
            <canvas 
              ref="cropCanvasRef"
              class="crop-canvas"
              @mousedown="onCropMouseDown"
              @mousemove="onCropMouseMove"
              @mouseup="onCropMouseUp"
              @mouseleave="onCropMouseUp"
            />
          </div>
          <div class="crop-tip">
            <Icon icon="mdi:gesture-tap-box" />
            按住鼠标拖动选择裁剪区域
          </div>
        </div>
        
        <!-- 右侧：预览和操作 -->
        <div class="preview-section">
          <!-- 拼接预览 -->
          <div class="preview-card">
            <div class="card-header">
              <Icon icon="mdi:image-filter-hdr" />
              <span>拼接预览</span>
              <button 
                v-if="currentConcatImage && !currentFinalImage"
                @click="startCropMode" 
                class="btn btn-sm btn-primary"
              >
                <Icon icon="mdi:crop" />
                裁剪
              </button>
            </div>
            <div class="preview-content">
              <img v-if="currentConcatImage" :src="currentConcatImage" alt="拼接图" />
              <div v-else class="preview-placeholder">
                <Icon icon="mdi:image-off" />
                <span>拍摄照片后点击拼接</span>
              </div>
            </div>
          </div>
          
          <!-- 最终结果 -->
          <div class="preview-card final">
            <div class="card-header">
              <Icon icon="mdi:check-circle" />
              <span>最终结果</span>
              <button 
                v-if="currentFinalImage"
                @click="resetCurrentSide" 
                class="btn btn-sm btn-ghost"
              >
                <Icon icon="mdi:refresh" />
                重做
              </button>
            </div>
            <div class="preview-content">
              <img v-if="currentFinalImage" :src="currentFinalImage" alt="最终图" />
              <div v-else class="preview-placeholder">
                <Icon icon="mdi:image-check" />
                <span>裁剪后显示</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 底部操作栏 -->
      <div class="bottom-bar">
        <button v-if="currentSide === 'back'" @click="handleBack" class="btn btn-ghost">
          <Icon icon="mdi:arrow-left" />
          返回正面
        </button>
        <div v-else></div>
        <button 
          @click="handleNext" 
          :disabled="!canProceed"
          class="btn btn-primary btn-lg"
        >
          {{ currentSide === 'front' ? '下一步：背面' : '完成' }}
          <Icon icon="mdi:arrow-right" />
        </button>
      </div>
    </div>
    
    <!-- 结果预览 -->
    <div v-else-if="testStep === 2" class="result-content">
      <div class="result-summary">
        <div class="summary-header">
          <Icon icon="mdi:file-document" />
          <span>2D留存结果预览</span>
        </div>
        
        <div class="summary-cards">
          <div class="summary-card">
            <div class="summary-label">正面2D留存</div>
            <img :src="frontFinalImage" class="summary-img" />
          </div>
          
          <div class="summary-card">
            <div class="summary-label">背面2D留存</div>
            <img :src="backFinalImage" class="summary-img" />
          </div>
        </div>
      </div>
      
      <div class="bottom-bar">
        <button @click="handleBack" class="btn btn-ghost">
          <Icon icon="mdi:arrow-left" />
          返回修改
        </button>
        <button 
          @click="submitReport" 
          :disabled="isSubmitting"
          class="btn btn-primary btn-lg"
        >
          <Icon v-if="isSubmitting" icon="mdi:loading" class="spin" />
          <Icon v-else icon="mdi:cloud-upload" />
          {{ isSubmitting ? '提交中...' : '上传报告' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 容器 */
.executor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

/* 提示消息 */
.toast {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.toast-error { background: rgba(239, 68, 68, 0.9); color: white; }
.toast-success { background: rgba(34, 197, 94, 0.9); color: white; }
.toast-info { background: rgba(59, 130, 246, 0.9); color: white; }

.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-1rem); }

/* 状态栏 */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.status-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.info-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgb(74, 222, 128) 0%, rgb(34, 197, 94) 100%);
  border-radius: 0.5rem;
  color: white;
  font-size: 1.25rem;
}

.info-icon.blue {
  background: linear-gradient(135deg, rgb(96, 165, 250) 0%, rgb(59, 130, 246) 100%);
}

.info-content {
  display: flex;
  flex-direction: column;
}

.info-title {
  font-weight: 600;
  font-size: 1rem;
}

.info-meta {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

/* 历史报告下拉 */
.history-dropdown {
  position: relative;
}

.history-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: rgb(96, 165, 250);
  font-size: 0.8125rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  cursor: pointer;
}

.history-btn:hover {
  background: rgba(96, 165, 250, 0.1);
}

.history-dropdown-panel {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 100;
  min-width: 320px;
  max-height: 400px;
  overflow-y: auto;
  margin-top: 0.5rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.history-loading,
.history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.history-list {
  padding: 0.5rem;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.history-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.history-model {
  font-size: 0.875rem;
  font-weight: 500;
}

.history-date {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.history-status {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.history-status.status-pass {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(74, 222, 128);
}

.history-status.status-fail {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(248, 113, 113);
}

/* 步骤指示器 */
.step-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
}

.step {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  opacity: 0.5;
}

.step.active {
  opacity: 1;
}

.step-num {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-hover);
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 600;
}

.step.active .step-num {
  background: rgb(59, 130, 246);
  color: white;
}

.step-label {
  font-size: 0.8125rem;
}

.step-arrow {
  color: var(--color-text-secondary);
}

/* 测试内容 */
.test-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.overview-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.side-badge {
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 500;
}

.side-badge.front {
  background: rgba(59, 130, 246, 0.2);
  color: rgb(96, 165, 250);
}

.side-badge.back {
  background: rgba(168, 85, 247, 0.2);
  color: rgb(192, 132, 252);
}

.overview-img {
  height: 3rem;
  object-fit: contain;
}

/* 照片列表 */
.photos-bar {
  padding: 0.5rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.photos-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  margin-bottom: 0.5rem;
}

.photos-header .tip {
  margin-left: auto;
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
}

.photos-list {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.photo-item {
  position: relative;
  width: 5rem;
  height: 5rem;
  flex-shrink: 0;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 2px solid var(--color-border);
  cursor: grab;
  transition: all 0.2s;
}

.photo-item:hover {
  border-color: rgb(59, 130, 246);
}

.photo-item.dragging {
  opacity: 0.5;
  border-style: dashed;
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-index {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.625rem;
  border-radius: 0.25rem;
}

.photo-remove {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.photo-item:hover .photo-remove {
  opacity: 1;
}

.photo-add,
.photo-concat {
  width: 5rem;
  height: 5rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  border: 2px dashed var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.photo-add:hover:not(:disabled),
.photo-concat:hover:not(:disabled) {
  border-color: rgb(59, 130, 246);
  color: rgb(59, 130, 246);
}

.photo-add:disabled,
.photo-concat:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.photo-concat {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgb(59, 130, 246);
  color: rgb(59, 130, 246);
}

/* 主内容 */
.test-main {
  flex: 1;
  display: flex;
  gap: 1rem;
  padding: 1rem;
  min-height: 0;
}

/* 摄像头区域 */
.camera-section,
.crop-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.875rem;
  font-weight: 500;
}

.header-actions {
  margin-left: auto;
  display: flex;
  gap: 0.5rem;
}

.camera-view,
.crop-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  min-height: 0;
  overflow: hidden;
}

.camera-canvas,
.crop-canvas {
  max-width: 100%;
  max-height: 100%;
}

.crop-canvas {
  cursor: crosshair;
}

.crop-controls {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.crop-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.control-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  min-width: 3rem;
}

.crop-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--color-bg-tertiary);
  border-radius: 2px;
  outline: none;
}

.crop-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: rgb(59, 130, 246);
  border-radius: 50%;
  cursor: pointer;
}

.control-value {
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
  min-width: 3.5rem;
  text-align: right;
}

.crop-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  border-top: 1px solid var(--color-border);
}

/* 预览区域 */
.preview-section {
  width: 20rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.preview-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.preview-card.final {
  border-color: rgba(59, 130, 246, 0.5);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.8125rem;
  font-weight: 500;
}

.card-header .btn {
  margin-left: auto;
}

.preview-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  min-height: 0;
}

.preview-content img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-secondary);
}

.preview-placeholder .iconify {
  font-size: 2rem;
  opacity: 0.3;
}

.preview-placeholder span {
  font-size: 0.75rem;
}

/* 底部操作栏 */
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
}

/* 结果预览 */
.result-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.result-summary {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.summary-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.summary-label {
  padding: 0.75rem;
  font-weight: 500;
  text-align: center;
  border-bottom: 1px solid var(--color-border);
}

.summary-img {
  width: 100%;
  height: 16rem;
  object-fit: contain;
  background: #000;
}

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.btn:hover { background: var(--color-bg-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary {
  background: linear-gradient(135deg, rgb(96, 165, 250) 0%, rgb(59, 130, 246) 100%);
  color: white;
}

.btn-primary:hover { filter: brightness(1.1); }

.btn-ghost {
  background: transparent;
  border: 1px solid var(--color-border);
}

.btn-ghost:hover { background: var(--color-bg-tertiary); }

.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
.btn-lg { padding: 0.75rem 1.5rem; font-size: 1rem; }

/* 动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
