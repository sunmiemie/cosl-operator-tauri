<script setup lang="ts">
/**
 * 弓曲度测试执行器
 * 
 * 支持测试模式:
 * - normal: 新工单，从头开始测试
 * - continue: 继续测试，从上次中断处继续
 * 
 * 参考原程序 PlaneTest.vue
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

// 测试模式
type TestMode = 'normal' | 'continue'

// 弓曲度测试结果
interface PlaneResult {
  size: string
  leftUrl: string
  rightUrl: string
  leftPass: 1 | 2  // 1=合格, 2=不合格
  rightPass: 1 | 2
  noteList?: string[]
  errorList?: Array<{
    name: string
    error: { desc: string; url: string }
  }>
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

// Canvas 相关
const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasParentRef = ref<HTMLDivElement | null>(null)
const planePix = ref(0)  // 画面高度像素
const planeLine = ref(0) // 参考线位置

// 测量点
const measurePoints = ref<{ x: number; y: number }[]>([])
const measureDistance = ref(0)

// 工艺数据
const processSize = computed(() => {
  return props.processData?.json?.eyes?.plane?.size || '未知'
})

// 测试结果
const leftUrl = ref('')
const rightUrl = ref('')
const leftPass = ref<1 | 2>(1)
const rightPass = ref<1 | 2>(1)
const noteList = ref<string[]>([])

// 备注编辑
const noteDialogVisible = ref(false)
const noteInput = ref('')

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

// 是否可以进入下一步
const canProceed = computed(() => {
  return leftUrl.value && rightUrl.value
})

// 总览图
const overviewImage = computed(() => {
  return props.processData?.json?.eyes?.total?.url || ''
})

// ==================== 工具函数 ====================

function showMessage(msg: string, type: 'error' | 'success' | 'info' = 'info') {
  toastMessage.value = msg
  toastType.value = type
  showToast.value = true
  setTimeout(() => { showToast.value = false }, 2500)
}

// ==================== Canvas 相关函数 ====================

// 设置视频帧到 Canvas
function drawFrame() {
  if (!canvasRef.value || !canvasParentRef.value) return
  
  const frame = camera.currentFrame.value
  if (!frame) return
  
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const img = new Image()
  img.onload = () => {
    // 记录画面高度
    if (planePix.value === 0) {
      planePix.value = img.height
    }
    
    // 设置 Canvas 尺寸
    canvas.width = img.width
    canvas.height = img.height
    
    // 计算显示尺寸（适应父容器）
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
    
    // 绘制参考线
    drawGuidelines(ctx, img.width, img.height)
    
    // 绘制测量点和线
    drawMeasurements(ctx)
  }
  img.src = frame
}

// 绘制参考线
function drawGuidelines(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = 'red'
  ctx.lineWidth = 3
  ctx.beginPath()
  
  // 中心参考线
  ctx.moveTo(0, height - planeLine.value)
  ctx.lineTo(width, height - planeLine.value)
  
  // 上下偏移线（基于测量距离）
  if (measureDistance.value > 0) {
    const offset = 3.5 * measureDistance.value * 100
    ctx.moveTo(0, height - planeLine.value - offset)
    ctx.lineTo(width, height - planeLine.value - offset)
    ctx.moveTo(0, height - planeLine.value + offset)
    ctx.lineTo(width, height - planeLine.value + offset)
  }
  
  ctx.stroke()
}

// 绘制测量点和线
function drawMeasurements(ctx: CanvasRenderingContext2D) {
  if (measurePoints.value.length === 0) return
  
  ctx.fillStyle = 'red'
  
  // 绘制第一个点
  ctx.beginPath()
  ctx.arc(measurePoints.value[0].x, measurePoints.value[0].y, 10, 0, 2 * Math.PI)
  ctx.fill()
  
  // 绘制第二个点和连线
  if (measurePoints.value.length === 2) {
    ctx.beginPath()
    ctx.arc(measurePoints.value[1].x, measurePoints.value[1].y, 10, 0, 2 * Math.PI)
    ctx.fill()
    
    // 连线
    ctx.strokeStyle = 'red'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(measurePoints.value[0].x, measurePoints.value[0].y)
    ctx.lineTo(measurePoints.value[1].x, measurePoints.value[1].y)
    ctx.stroke()
  }
}

// Canvas 点击处理
function handleCanvasClick(event: MouseEvent) {
  if (!canvasRef.value) return
  
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  
  // 计算相对于原始画布尺寸的坐标
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = (event.clientX - rect.left) * scaleX
  const y = (event.clientY - rect.top) * scaleY
  
  // 最多两个点
  if (measurePoints.value.length >= 2) {
    measurePoints.value = []
  }
  
  measurePoints.value.push({ x, y })
  
  // 计算距离
  if (measurePoints.value.length === 2) {
    const p1 = measurePoints.value[0]
    const p2 = measurePoints.value[1]
    measureDistance.value = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    ) / 100
  }
}

// ==================== 测试操作 ====================

// 拍摄正面照片（从Canvas获取，包含参考线用于判断弓曲度）
async function takeLeftPhoto() {
  if (!canvasRef.value) {
    showMessage('无法获取摄像头画面', 'error')
    return
  }
  // 弓曲度检测需要包含参考线，直接从Canvas获取带有参考线的图像
  leftUrl.value = canvasRef.value.toDataURL('image/png')
  showMessage('正面照片已拍摄', 'success')
}

// 拍摄对面照片（从Canvas获取，包含参考线用于判断弓曲度）
async function takeRightPhoto() {
  if (!canvasRef.value) {
    showMessage('无法获取摄像头画面', 'error')
    return
  }
  // 弓曲度检测需要包含参考线，直接从Canvas获取带有参考线的图像
  rightUrl.value = canvasRef.value.toDataURL('image/png')
  showMessage('对面照片已拍摄', 'success')
}

// 设置正面结果
function setLeftResult(pass: 1 | 2) {
  leftPass.value = pass
}

// 设置对面结果
function setRightResult(pass: 1 | 2) {
  rightPass.value = pass
}

// 打开备注对话框
function openNoteDialog() {
  noteInput.value = ''
  noteDialogVisible.value = true
}

// 添加备注
function addNote() {
  if (!noteInput.value.trim()) {
    showMessage('请输入备注内容', 'error')
    return
  }
  noteList.value.push(noteInput.value.trim())
  noteDialogVisible.value = false
  showMessage('备注已添加', 'success')
}

// 下一步
function handleNext() {
  if (!leftUrl.value || !rightUrl.value) {
    showMessage('请完成正面和对面的拍照', 'error')
    return
  }
  testStep.value = 2
}

// 返回上一步
function handleBack() {
  testStep.value = 1
}

// ==================== 报告提交 ====================

async function submitReport() {
  if (isSubmitting.value) return
  
  isSubmitting.value = true
  
  try {
    // 构建报告数据
    const planeResult: PlaneResult = {
      size: processSize.value,
      leftUrl: leftUrl.value,
      rightUrl: rightUrl.value,
      leftPass: leftPass.value,
      rightPass: rightPass.value,
    }
    
    // 添加备注
    if (noteList.value.length > 0) {
      planeResult.noteList = noteList.value
    }
    
    // 添加异常列表
    if (leftPass.value === 2 || rightPass.value === 2) {
      planeResult.errorList = []
      if (leftPass.value === 2) {
        planeResult.errorList.push({
          name: '正面弓曲度',
          error: { desc: '电路板弓曲', url: leftUrl.value }
        })
      }
      if (rightPass.value === 2) {
        planeResult.errorList.push({
          name: '对面弓曲度',
          error: { desc: '电路板弓曲', url: rightUrl.value }
        })
      }
    }
    
    // 构建完整报告
    const reportJson = {
      testunit_id: props.testUnit.testunit_id || props.testUnit.dev_testunit_id,
      testunit_type: 2, // 弓曲度测试
      board_id: props.testUnit.board_id,
      board_serialnumber: props.testUnit.serial,
      json: {
        plane: planeResult
      }
    }
    
    // 判断测试结果状态
    const hasError = leftPass.value === 2 || rightPass.value === 2
    const testStatus = hasError ? 3 : 2 // 3=异常, 2=正常
    
    // 上传报告
    const unitId = props.isDevTest 
      ? props.testUnit.dev_testunit_id 
      : props.testUnit.testunit_id
    
    if (!unitId) {
      throw new Error('工单ID不存在')
    }
    
    let response
    if (props.isDevTest) {
      // 临时工单上传
      response = await reportApi.uploadTempReport({
        dev_testunit_id: unitId,
        serialNumber: props.testUnit.serial || '',
        userId: userInfo.value?.id || 0,
        testType: 2,
        dev_testunit_status: testStatus,
        file: reportJson,
      }, getAuthHeaders())
    } else {
      // 正式工单上传
      response = await reportApi.uploadReport({
        testunit_id: unitId,
        serialNumber: props.testUnit.serial || '',
        userId: userInfo.value?.id || 0,
        testType: 2,
        testunit_status: testStatus,
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

// 监听摄像头帧更新
let frameInterval: number | null = null

onMounted(async () => {
  // 初始化配置
  await initConfig()
  
  // 启动弓曲度摄像头（带异常处理）
  const planeDevice = config.value.planeDevice
  if (planeDevice >= 0) {
    try {
      const success = await camera.startCamera(planeDevice)
      if (success) {
        // 定时刷新 Canvas
        frameInterval = window.setInterval(() => {
          if (testStep.value === 1) {
            drawFrame()
          }
        }, 33) // ~30fps
      } else {
        console.warn('[弓曲度] 摄像头启动返回失败')
      }
    } catch (err) {
      console.error('[弓曲度] 摄像头启动异常:', err)
    }
  } else {
    showMessage('未配置弓曲度摄像头，请在设置中配置', 'error')
  }
  
  // 如果是继续测试，加载之前的数据
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
    console.warn('[弓曲度] 停止摄像头时出现异常:', err)
  }
})

// 加载临时数据
function loadTempData() {
  const tempJson = props.tempData?.json
  if (!tempJson?.eyes?.plane) return
  
  const plane = tempJson.eyes.plane
  if (plane.leftUrl) leftUrl.value = plane.leftUrl
  if (plane.rightUrl) rightUrl.value = plane.rightUrl
  if (plane.leftPass) leftPass.value = plane.leftPass
  if (plane.rightPass) rightPass.value = plane.rightPass
  if (plane.note) noteList.value = plane.note
}

// 监听参考线变化重新绘制
watch(planeLine, () => {
  drawFrame()
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
        <div class="info-icon">
          <Icon icon="mdi:chart-bell-curve" />
        </div>
        <div class="info-content">
          <span class="info-title">弓曲度检测</span>
          <span class="info-meta">
            {{ props.testUnit.boardmodel }} · S/N: {{ props.testUnit.serial }}
            · 厚度: {{ processSize }}mm
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
        <div :class="['step', { active: testStep >= 1 }]">
          <span class="step-num">1</span>
          <span class="step-label">检测</span>
        </div>
        <Icon icon="mdi:chevron-right" class="step-arrow" />
        <div :class="['step', { active: testStep >= 2 }]">
          <span class="step-num">2</span>
          <span class="step-label">结果</span>
        </div>
      </div>
    </div>
    
    <!-- 测试阶段 1: 检测 -->
    <div v-if="testStep === 1" class="test-content">
      <!-- 总览图 -->
      <div v-if="overviewImage" class="overview-bar">
        <img :src="overviewImage" alt="总览图" class="overview-img" />
      </div>
      
      <div class="test-main">
        <!-- 左侧：实时画面 -->
        <div class="camera-section">
          <div class="section-header">
            <Icon icon="mdi:video" />
            <span>实时画面</span>
          </div>
          <div ref="canvasParentRef" class="camera-view">
            <canvas 
              ref="canvasRef" 
              @click="handleCanvasClick"
              class="camera-canvas"
            />
          </div>
          
          <!-- 参考线控制 -->
          <div class="line-control">
            <span class="control-label">参考线位置</span>
            <input 
              type="range" 
              v-model.number="planeLine" 
              :min="0" 
              :max="planePix || 1080"
              class="line-slider"
            />
            <span class="control-value">{{ planeLine }}px</span>
          </div>
        </div>
        
        <!-- 右侧：照片和结果 -->
        <div class="result-section">
          <!-- 正面弓曲度 -->
          <div class="photo-card">
            <div class="card-header">
              <Icon icon="mdi:checkbox-marked-circle-outline" />
              <span>正面弓曲度检测</span>
              <div class="result-badge" :class="{ pass: leftPass === 1, fail: leftPass === 2 }">
                {{ leftPass === 1 ? '合格' : '不合格' }}
              </div>
            </div>
            <div class="card-body">
              <div class="photo-preview">
                <img v-if="leftUrl" :src="leftUrl" alt="正面" />
                <div v-else class="photo-placeholder">
                  <Icon icon="mdi:camera" />
                  <span>等待拍摄</span>
                </div>
              </div>
              <div class="photo-actions">
                <div class="result-buttons">
                  <button 
                    @click="setLeftResult(1)" 
                    :class="['btn-result', { active: leftPass === 1 }]"
                  >
                    <Icon icon="mdi:check" />
                    合格
                  </button>
                  <button 
                    @click="setLeftResult(2)" 
                    :class="['btn-result btn-fail', { active: leftPass === 2 }]"
                  >
                    <Icon icon="mdi:close" />
                    不合格
                  </button>
                </div>
                <button @click="takeLeftPhoto" class="btn btn-primary">
                  <Icon icon="mdi:camera" />
                  拍摄
                </button>
              </div>
            </div>
          </div>
          
          <!-- 对面弓曲度 -->
          <div class="photo-card">
            <div class="card-header">
              <Icon icon="mdi:checkbox-marked-circle-outline" />
              <span>对面弓曲度检测</span>
              <div class="result-badge" :class="{ pass: rightPass === 1, fail: rightPass === 2 }">
                {{ rightPass === 1 ? '合格' : '不合格' }}
              </div>
            </div>
            <div class="card-body">
              <div class="photo-preview">
                <img v-if="rightUrl" :src="rightUrl" alt="对面" />
                <div v-else class="photo-placeholder">
                  <Icon icon="mdi:camera" />
                  <span>等待拍摄</span>
                </div>
              </div>
              <div class="photo-actions">
                <div class="result-buttons">
                  <button 
                    @click="setRightResult(1)" 
                    :class="['btn-result', { active: rightPass === 1 }]"
                  >
                    <Icon icon="mdi:check" />
                    合格
                  </button>
                  <button 
                    @click="setRightResult(2)" 
                    :class="['btn-result btn-fail', { active: rightPass === 2 }]"
                  >
                    <Icon icon="mdi:close" />
                    不合格
                  </button>
                </div>
                <button @click="takeRightPhoto" class="btn btn-primary">
                  <Icon icon="mdi:camera" />
                  拍摄
                </button>
              </div>
            </div>
          </div>
          
          <!-- 备注 -->
          <div class="notes-section">
            <div class="notes-header">
              <Icon icon="mdi:note-text" />
              <span>备注 ({{ noteList.length }})</span>
              <button @click="openNoteDialog" class="btn btn-sm">
                <Icon icon="mdi:plus" />
                添加
              </button>
            </div>
            <div v-if="noteList.length > 0" class="notes-list">
              <div v-for="(note, idx) in noteList" :key="idx" class="note-item">
                {{ note }}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 底部操作栏 -->
      <div class="bottom-bar">
        <div></div>
        <button 
          @click="handleNext" 
          :disabled="!canProceed"
          class="btn btn-primary btn-lg"
        >
          下一步
          <Icon icon="mdi:arrow-right" />
        </button>
      </div>
    </div>
    
    <!-- 测试阶段 2: 结果预览 -->
    <div v-else-if="testStep === 2" class="result-content">
      <div class="result-summary">
        <div class="summary-header">
          <Icon icon="mdi:file-document" />
          <span>检测报告预览</span>
        </div>
        
        <div class="summary-cards">
          <!-- 正面结果 -->
          <div class="summary-card">
            <div class="summary-label">正面弓曲度</div>
            <img :src="leftUrl" class="summary-img" />
            <div :class="['summary-result', { pass: leftPass === 1, fail: leftPass === 2 }]">
              <Icon :icon="leftPass === 1 ? 'mdi:check-circle' : 'mdi:close-circle'" />
              {{ leftPass === 1 ? '合格' : '不合格' }}
            </div>
          </div>
          
          <!-- 对面结果 -->
          <div class="summary-card">
            <div class="summary-label">对面弓曲度</div>
            <img :src="rightUrl" class="summary-img" />
            <div :class="['summary-result', { pass: rightPass === 1, fail: rightPass === 2 }]">
              <Icon :icon="rightPass === 1 ? 'mdi:check-circle' : 'mdi:close-circle'" />
              {{ rightPass === 1 ? '合格' : '不合格' }}
            </div>
          </div>
        </div>
        
        <!-- 备注列表 -->
        <div v-if="noteList.length > 0" class="summary-notes">
          <div class="notes-title">备注:</div>
          <ul>
            <li v-for="(note, idx) in noteList" :key="idx">{{ note }}</li>
          </ul>
        </div>
        
        <!-- 总体结果 -->
        <div class="overall-result">
          <div :class="['result-status', { pass: leftPass === 1 && rightPass === 1 }]">
            <Icon :icon="leftPass === 1 && rightPass === 1 ? 'mdi:check-decagram' : 'mdi:alert-decagram'" />
            {{ leftPass === 1 && rightPass === 1 ? '检测正常' : '检测异常' }}
          </div>
        </div>
      </div>
      
      <!-- 底部操作栏 -->
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
          <Icon v-if="isSubmitting" icon="mdi:loading" class="animate-spin" />
          <Icon v-else icon="mdi:cloud-upload" />
          {{ isSubmitting ? '提交中...' : '上传报告' }}
        </button>
      </div>
    </div>
    
    <!-- 备注对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="noteDialogVisible" class="modal-overlay" @click.self="noteDialogVisible = false">
          <div class="modal-content">
            <div class="modal-header">
              <span>添加备注</span>
              <button @click="noteDialogVisible = false" class="btn-close">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div class="modal-body">
              <textarea 
                v-model="noteInput" 
                placeholder="请输入备注内容..."
                class="note-textarea"
                rows="4"
              ></textarea>
            </div>
            <div class="modal-footer">
              <button @click="noteDialogVisible = false" class="btn btn-ghost">取消</button>
              <button @click="addNote" class="btn btn-primary">添加</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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

.toast-error {
  background: rgba(239, 68, 68, 0.9);
  color: white;
}

.toast-success {
  background: rgba(34, 197, 94, 0.9);
  color: white;
}

.toast-info {
  background: rgba(59, 130, 246, 0.9);
  color: white;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-1rem);
}

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
  color: rgb(74, 222, 128);
  font-size: 0.8125rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  cursor: pointer;
}

.history-btn:hover {
  background: rgba(74, 222, 128, 0.1);
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
  background: rgb(74, 222, 128);
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
  padding: 0.5rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.overview-img {
  height: 4rem;
  object-fit: contain;
}

.test-main {
  flex: 1;
  display: flex;
  gap: 1rem;
  padding: 1rem;
  min-height: 0;
}

/* 摄像头区域 */
.camera-section {
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

.camera-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  min-height: 0;
}

.camera-canvas {
  max-width: 100%;
  max-height: 100%;
  cursor: crosshair;
}

.line-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
}

.control-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.line-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--color-bg-tertiary);
  border-radius: 2px;
  outline: none;
}

.line-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: rgb(74, 222, 128);
  border-radius: 50%;
  cursor: pointer;
}

.control-value {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  min-width: 4rem;
  text-align: right;
}

/* 结果区域 */
.result-section {
  width: 22rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
}

.photo-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
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

.result-badge {
  margin-left: auto;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
}

.result-badge.pass {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(74, 222, 128);
}

.result-badge.fail {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(248, 113, 113);
}

.card-body {
  padding: 0.75rem;
}

.photo-preview {
  aspect-ratio: 16/9;
  background: #000;
  border-radius: 0.5rem;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.photo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  gap: 0.25rem;
}

.photo-placeholder .iconify {
  font-size: 2rem;
  opacity: 0.3;
}

.photo-placeholder span {
  font-size: 0.75rem;
}

.photo-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.result-buttons {
  display: flex;
  gap: 0.375rem;
}

.btn-result {
  padding: 0.375rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-result:hover {
  border-color: rgb(74, 222, 128);
}

.btn-result.active {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgb(74, 222, 128);
  color: rgb(74, 222, 128);
}

.btn-result.btn-fail:hover {
  border-color: rgb(248, 113, 113);
}

.btn-result.btn-fail.active {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgb(248, 113, 113);
  color: rgb(248, 113, 113);
}

/* 备注 */
.notes-section {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.notes-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.8125rem;
}

.notes-header .btn-sm {
  margin-left: auto;
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
}

.notes-list {
  padding: 0.5rem 0.75rem;
  max-height: 6rem;
  overflow-y: auto;
}

.note-item {
  padding: 0.375rem 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  border-bottom: 1px dashed var(--color-border);
}

.note-item:last-child {
  border-bottom: none;
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
  margin-bottom: 1.5rem;
}

.summary-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
  text-align: center;
}

.summary-label {
  padding: 0.75rem;
  font-weight: 500;
  border-bottom: 1px solid var(--color-border);
}

.summary-img {
  width: 100%;
  height: 12rem;
  object-fit: contain;
  background: #000;
}

.summary-result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  font-weight: 600;
  border-top: 1px solid var(--color-border);
}

.summary-result.pass {
  color: rgb(74, 222, 128);
}

.summary-result.fail {
  color: rgb(248, 113, 113);
}

.summary-notes {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.notes-title {
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.summary-notes ul {
  margin: 0;
  padding-left: 1.25rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.overall-result {
  display: flex;
  justify-content: center;
}

.result-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 2rem;
  border-radius: 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
  background: rgba(239, 68, 68, 0.1);
  color: rgb(248, 113, 113);
}

.result-status.pass {
  background: rgba(34, 197, 94, 0.1);
  color: rgb(74, 222, 128);
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

.btn:hover {
  background: var(--color-bg-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, rgb(74, 222, 128) 0%, rgb(34, 197, 94) 100%);
  color: white;
}

.btn-primary:hover {
  filter: brightness(1.1);
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--color-border);
}

.btn-ghost:hover {
  background: var(--color-bg-tertiary);
}

.btn-lg {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal-content {
  width: 90%;
  max-width: 32rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
}

.btn-close {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  border-radius: 0.25rem;
}

.btn-close:hover {
  background: var(--color-bg-tertiary);
}

.modal-body {
  padding: 1rem;
}

.note-textarea {
  width: 100%;
  padding: 0.75rem;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  color: var(--color-text-primary);
  font-size: 0.875rem;
  resize: none;
}

.note-textarea:focus {
  outline: none;
  border-color: rgb(74, 222, 128);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid var(--color-border);
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
}

/* 动画 */
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
