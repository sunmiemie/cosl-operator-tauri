<script setup lang="ts">
/**
 * TempTestExecutor.vue - 临时工单测试执行器组件
 * 
 * 功能：
 * - 处理临时工单(dev_testunit)的检测流程
 * - 使用 TempTestProcess 作为检测面板
 * - 数据结构：tempReportJson.json.tempTest[]
 */

// 禁用属性继承，避免 Teleport 导致的 fragment 警告
defineOptions({
  inheritAttrs: false
})

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import { useCamera } from '@/composables/useCamera'
import { useConfig } from '@/composables/useConfig'
import { useWindow } from '@/composables/useWindow'
import { TempTestProcess } from '@/components/visual-test'
import type { TempReportJson } from '@/components/visual-test/TempTestProcess.vue'
import type { TestUnit } from '@/services/order'
import { processApi } from '@/services/process'
import { reportApi, type TestReport } from '@/services/report'

// ==================== 类型定义 ====================

type TestMode = 'normal' | 'continue' | 'feedback' | 'question'
type DeviceType = 'micro' | 'xray'

// Props
const props = withDefaults(defineProps<{
  testUnit: TestUnit
  mode: TestMode
  isDevTest: boolean
  tempReportData?: TempReportJson  // 继续测试时的已保存数据
  targetList?: number[]            // 疑问/打回模式下需要重检的项目ID列表（通用）
  feedbackReason?: string          // 打回理由（反馈模式时显示）
  deviceType?: DeviceType          // 摄像头类型：micro=显微镜, xray=X-Ray
}>(), {
  deviceType: 'micro'
})

// Emits
const emit = defineEmits<{
  complete: []
  exit: []
  error: [message: string]
  'request-exit': [saveProgress: () => Promise<boolean>]
}>()

// ==================== 状态定义 ====================

const { userInfo, getAuthHeaders } = useAuth()
const camera = useCamera()
const { config, initConfig } = useConfig()

// X-Ray 裁剪相关
const cropCanvasRef = ref<HTMLCanvasElement | null>(null)
let cropAnimationId: number | null = null

// 判断是否使用 X-Ray 摄像头并启用裁剪
const isXrayWithCrop = computed(() => {
  return props.deviceType === 'xray' && config.value.xrayCropArea?.enabled === true
})

// 测试步骤: 1=检测中, 2=预览报告
const testStep = ref(1)

// 加载状态
const isLoading = ref(false)
const isSaving = ref(false)

// 临时报告数据
const tempReportJson = ref<TempReportJson>(createEmptyReport())

// 图片预览
const viewerVisible = ref(false)
const viewerUrl = ref('')

// 历史报告
const historyReportList = ref<TestReport[]>([])
const isLoadingHistory = ref(false)
const showHistoryDropdown = ref(false)

// 窗口管理
const { openReportPreview } = useWindow()

// ==================== 计算属性 ====================

/** 委托人信息 (临时工单特有字段) */
const consignorInfo = computed(() => {
  const unit = props.testUnit as any
  return {
    consignor: unit.dev_testunit_consignor || '未知',
    type: unit.dev_testunit_type || '未知',
    desc: unit.dev_testunit_desc || ''
  }
})

// ==================== 辅助函数 ====================

/** 获取预览项的样式类 */
function getPreviewItemClass(item: any) {
  const classes: string[] = []
  if (item.pass === 1 && !item.warn) classes.push('is-pass')
  if (item.pass === 1 && item.warn) classes.push('is-warn')
  if (item.pass === 2) classes.push('is-error')
  if (item.pass === 3) classes.push('is-question')
  if (item.pass === 4) classes.push('is-mixed')
  return classes
}

/** 打开图片预览 */
function openViewer(url: string) {
  viewerUrl.value = url
  viewerVisible.value = true
}

// ==================== 生命周期 ====================

onMounted(async () => {
  await initConfig()
  await initTest()
  
  // 根据设备类型选择摄像头
  const deviceIndex = props.deviceType === 'xray' 
    ? config.value.xrayDevice 
    : config.value.microDevice
  const deviceName = props.deviceType === 'xray' ? 'X-Ray' : '显微镜'
  
  if (deviceIndex >= 0) {
    try {
      const success = await camera.startCamera(deviceIndex)
      if (!success) {
        console.warn(`[临时测试] ${deviceName}摄像头启动返回失败`)
      } else if (isXrayWithCrop.value) {
        // X-Ray 且启用裁剪时启动裁剪绘制循环
        startCropLoop()
      }
    } catch (err) {
      console.error(`[临时测试] ${deviceName}摄像头启动异常:`, err)
    }
  } else {
    console.warn(`[临时测试] 未配置${deviceName}摄像头设备索引`)
  }
  
  // 新测试时，上传初始临时数据让后端有记录
  if (props.mode === 'normal') {
    await saveTempProgress()
  }
})

onUnmounted(async () => {
  // 停止裁剪绘制循环
  stopCropLoop()
  
  try {
    await camera.stopCamera()
  } catch (err) {
    console.warn('[临时测试] 停止摄像头时出现异常:', err)
  }
})

// 监听摄像头激活状态，在激活后启动裁剪循环
watch(() => camera.isActive.value, (isActive) => {
  if (isActive && isXrayWithCrop.value) {
    startCropLoop()
  } else {
    stopCropLoop()
  }
})

// ==================== X-Ray 裁剪逻辑 ====================

/** 启动裁剪绘制循环 */
function startCropLoop() {
  if (cropAnimationId) return
  cropAnimationId = requestAnimationFrame(drawCroppedFrame)
}

/** 停止裁剪绘制循环 */
function stopCropLoop() {
  if (cropAnimationId) {
    cancelAnimationFrame(cropAnimationId)
    cropAnimationId = null
  }
}

/** 绘制裁剪后的画面到 canvas */
function drawCroppedFrame() {
  if (!isXrayWithCrop.value) {
    cropAnimationId = null
    return
  }
  
  const canvas = cropCanvasRef.value
  const cropConfig = config.value.xrayCropArea
  const frameData = camera.currentFrame.value
  
  if (canvas && cropConfig && frameData) {
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // 计算裁剪区域
        const wMin = Math.min(cropConfig.w[0], cropConfig.w[1])
        const wMax = Math.max(cropConfig.w[0], cropConfig.w[1])
        const hMin = Math.min(cropConfig.h[0], cropConfig.h[1])
        const hMax = Math.max(cropConfig.h[0], cropConfig.h[1])
        
        let sw = wMax - wMin
        let sh = hMax - hMin
        
        // 如果裁剪区域无效，显示整个画面
        if (sw <= 0 || sh <= 0) {
          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)
        } else {
          const sx = Math.max(0, Math.min(wMin, img.width))
          const sy = Math.max(0, img.height - Math.min(hMax, img.height))
          sw = Math.min(sw, img.width - sx)
          sh = Math.min(sh, img.height - sy)
          
          canvas.width = sw
          canvas.height = sh
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
        }
      }
    }
    img.src = frameData
  }
  
  cropAnimationId = requestAnimationFrame(drawCroppedFrame)
}

/** 获取当前画面（X-Ray 时自动应用裁剪） */
function getCroppedFrame(): string | null {
  const frameData = camera.currentFrame.value
  if (!frameData) return null
  
  // 如果使用 X-Ray 裁剪 canvas，从 canvas 获取图片数据
  if (isXrayWithCrop.value && cropCanvasRef.value) {
    return cropCanvasRef.value.toDataURL('image/jpeg', 0.9)
  }
  
  return frameData
}

// ==================== 初始化 ====================

/** 创建空报告数据 - 与旧版临时工单模板结构对齐 */
function createEmptyReport(): TempReportJson {
  return {
    dev_testunit_id: props.testUnit.dev_testunit_id || 0,
    testunit_type: 4,  // 临时测试
    board_id: props.testUnit.board_id || 0,
    board_serialnumber: props.testUnit.serial || '',
    json: {
      // 保持 plane/twoD/twoDBak 字段以对齐旧版结构
      plane: {
        size: '',
        leftPass: 0,
        rightPass: 0,
        leftUrl: '',
        rightUrl: ''
      },
      twoD: '',
      twoDBak: '',
      tempTest: [
        { id: 1, pass: 1, name: '合格项', desc: '', save: [] },
        { id: 2, pass: 2, name: '缺陷项', desc: '', save: [], error: { url: [], desc: '' } },
        { id: 3, pass: 3, name: '疑问项', desc: '', save: [], question: { url: [], desc: '' } }
      ]
    }
  }
}

/** 初始化测试 */
async function initTest() {
  isLoading.value = true
  
  try {
    // 需要恢复数据的模式: continue（继续测试）、feedback（打回）、question（疑问）
    // 这些模式都需要从 tempReportData 恢复已有数据
    const needsDataRestore = ['continue', 'feedback', 'question'].includes(props.mode) && props.tempReportData
    
    if (needsDataRestore) {
      // 从保存的数据恢复（继续测试、打回、疑问模式）
      // 注意: tempReportData 可能是多种结构:
      // - TempOrderData 结构，其中 data 字段包含实际的 TempReportJson
      // - ReportData 结构（反馈/疑问报告），其中 json.tempTest 包含测试项
      // - 直接的 TempReportJson 结构
      const savedData = props.tempReportData as any
      
      console.log(`[TempTest] ${props.mode} 模式，接收到的数据:`, savedData)
      
      // 尝试从不同的数据结构中提取 TempReportJson
      if (savedData.data?.json?.tempTest) {
        // TempOrderData.data = TempReportJson 结构
        tempReportJson.value = JSON.parse(JSON.stringify(savedData.data))
        console.log('[TempTest] 从 data 字段提取数据')
      } else if (savedData.json?.tempTest) {
        // 直接是 TempReportJson 或 ReportData 结构（包含 json.tempTest）
        tempReportJson.value = JSON.parse(JSON.stringify(savedData))
        console.log('[TempTest] 直接使用包含 json.tempTest 的结构')
      } else {
        // 数据格式不正确，创建空报告
        console.warn('[TempTest] 无法识别的数据格式，创建空报告')
        tempReportJson.value = createEmptyReport()
      }
      
      // 确保基本信息正确
      tempReportJson.value.dev_testunit_id = props.testUnit.dev_testunit_id || tempReportJson.value.dev_testunit_id
      tempReportJson.value.board_id = props.testUnit.board_id || tempReportJson.value.board_id
      tempReportJson.value.board_serialnumber = props.testUnit.serial || tempReportJson.value.board_serialnumber
      
      console.log(`[TempTest] ${props.mode} 模式，最终数据:`, tempReportJson.value)
    } else {
      // 新测试: 创建空报告
      tempReportJson.value = createEmptyReport()
      console.log('[TempTest] 新测试模式，创建空报告')
    }
    
    // 确保数据结构正确
    normalizeReportData()
    
  } catch (err) {
    console.error('[TempTest] 初始化失败:', err)
    emit('error', '初始化测试数据失败')
  } finally {
    isLoading.value = false
  }
}

/** 规范化报告数据，确保必要字段存在 */
function normalizeReportData() {
  if (!tempReportJson.value.json) {
    tempReportJson.value.json = { tempTest: [] }
  }
  if (!Array.isArray(tempReportJson.value.json.tempTest)) {
    tempReportJson.value.json.tempTest = []
  }
  
  // 确保每个项目的数组字段存在
  for (const item of tempReportJson.value.json.tempTest) {
    if (!Array.isArray(item.save)) item.save = []
    if (item.error && !Array.isArray(item.error.url)) item.error.url = []
    if (item.question && !Array.isArray(item.question.url)) item.question.url = []
    if (item.warn && !Array.isArray(item.warn.url)) item.warn.url = []
  }
}

// ==================== 拍照保存 ====================

/** 从摄像头获取图片数据（X-Ray 时自动应用裁剪） */
async function captureImage(): Promise<string | null> {
  const frame = getCroppedFrame()
  if (!frame) {
    ElMessage.warning('无法获取摄像头画面')
    return null
  }
  return frame
}

/** 保存到留存图片 */
async function handleSave(id: number) {
  const item = tempReportJson.value.json.tempTest[id - 1]
  if (item.save.length >= 10) {
    ElMessage.info('最多添加10张图片')
    return
  }
  
  const img = await captureImage()
  if (img) {
    item.save.push(img)
  }
}

/** 保存到缺陷图片 */
async function handleSaveError(id: number) {
  const item = tempReportJson.value.json.tempTest[id - 1]
  if (!item.error) {
    item.error = { url: [], desc: '' }
  }
  if (item.error.url.length >= 5) {
    ElMessage.info('最多添加5张图片')
    return
  }
  
  const img = await captureImage()
  if (img) {
    item.error.url.push(img)
  }
}

/** 保存到疑问图片 */
async function handleSaveQuestion(id: number) {
  const item = tempReportJson.value.json.tempTest[id - 1]
  if (!item.question) {
    item.question = { url: [], desc: '' }
  }
  if (item.question.url.length >= 5) {
    ElMessage.info('最多添加5张图片')
    return
  }
  
  const img = await captureImage()
  if (img) {
    item.question.url.push(img)
  }
}

/** 保存到制程警示图片 */
async function handleSaveWarn(id: number) {
  const item = tempReportJson.value.json.tempTest[id - 1]
  if (!item.warn) {
    item.warn = { url: [], desc: '' }
  }
  if (item.warn.url.length >= 5) {
    ElMessage.info('最多添加5张图片')
    return
  }
  
  const img = await captureImage()
  if (img) {
    item.warn.url.push(img)
  }
}

// ==================== 测试流程控制 ====================

/** 验证检测是否完成 */
function validateTest(): boolean {
  for (const item of tempReportJson.value.json.tempTest) {
    // 未检测的项目
    if (item.pass === 0) {
      ElMessage.warning(`检测项 "${item.name || '未命名'}" 未完成检测`)
      return false
    }
    
    // 名称不能为空
    if (!item.name || item.name.trim() === '') {
      ElMessage.warning('存在未命名的检测项')
      return false
    }
    
    // 缺陷项必须有图片和描述
    if (item.pass === 2 || item.pass === 4) {
      if (!item.error || item.error.url.length === 0 || !item.error.desc) {
        ElMessage.warning(`缺陷项 "${item.name}" 需要添加图片和描述`)
        return false
      }
    }
    
    // 疑问项必须有图片和描述
    if (item.pass === 3 || item.pass === 4) {
      if (!item.question || item.question.url.length === 0 || !item.question.desc) {
        ElMessage.warning(`疑问项 "${item.name}" 需要添加图片和描述`)
        return false
      }
    }
    
    // 制程警示必须有图片和描述
    if (item.warn) {
      if (item.warn.url.length === 0 || !item.warn.desc) {
        ElMessage.warning(`制程警示 "${item.name}" 需要添加图片和描述`)
        return false
      }
    }
  }
  
  // 疑问模式校验：疑问项必须被处理（改为合格或缺陷），不能保留疑问状态
  if (props.mode === 'question') {
    const unresolvedQuestions = tempReportJson.value.json.tempTest.filter(
      item => item.pass === 3 || item.pass === 4
    )
    if (unresolvedQuestions.length > 0) {
      ElMessage.error('疑问未处理，请将疑问项标记为合格或缺陷')
      return false
    }
  }
  
  return true
}

/** 下一步 */
async function handleNext() {
  if (!validateTest()) {
    return
  }
  
  try {
    await ElMessageBox.confirm(
      '确认完成该测试吗？',
      '完成确认',
      { confirmButtonText: '继续', cancelButtonText: '取消' }
    )
    
    // 停止摄像头（带异常处理）
    try {
      await camera.stopCamera()
    } catch (err) {
      console.warn('[临时测试] 停止摄像头时出现异常:', err)
    }
    testStep.value = 2
    
  } catch {
    // 用户取消
  }
}

/** 返回测试 */
async function backToTest() {
  // 根据设备类型选择摄像头重新启动
  const deviceIndex = props.deviceType === 'xray' 
    ? config.value.xrayDevice 
    : config.value.microDevice
  
  if (deviceIndex >= 0) {
    try {
      await camera.startCamera(deviceIndex)
      // X-Ray 且启用裁剪时重新启动裁剪循环
      if (isXrayWithCrop.value) {
        startCropLoop()
      }
    } catch (err) {
      console.warn('[临时测试] 重新启动摄像头时出现异常:', err)
    }
  }
  testStep.value = 1
}

/** 上传报告 */
async function uploadReport() {
  isSaving.value = true
  
  try {
    const unitId = props.testUnit.dev_testunit_id
    if (!unitId) {
      throw new Error('缺少工单ID')
    }
    
    // 构建上传参数
    const uploadParams = {
      dev_testunit_id: unitId,
      serialNumber: tempReportJson.value.board_serialnumber,
      userId: userInfo.value?.id || 0,
      testType: props.deviceType === 'xray' ? 5 : 4,
      dev_testunit_status: 3, // 待审核
      file: tempReportJson.value as any
    }
    
    // 根据模式选择正确的上传接口
    let result
    if (props.mode === 'feedback') {
      // 临时工单反馈模式
      result = await reportApi.feedbackTempReport(uploadParams, getAuthHeaders())
    } else if (props.mode === 'question') {
      // 临时工单疑问模式
      result = await reportApi.questionTempReport(uploadParams, getAuthHeaders())
    } else {
      // 正常/继续模式
      result = await reportApi.uploadTempReport(uploadParams, getAuthHeaders())
    }
    
    if (result.success) {
      ElMessage.success('报告上传成功')
      emit('complete')
    } else {
      throw new Error(result.error || '上传失败')
    }
    
  } catch (err: any) {
    console.error('[TempTest] 上传报告失败:', err)
    ElMessage.error(`上传报告失败: ${err.message}`)
  } finally {
    isSaving.value = false
  }
}

// ==================== 暂存与退出 ====================

/** 保存临时进度 */
async function saveTempProgress(): Promise<boolean> {
  const unitId = props.testUnit.dev_testunit_id
  if (!unitId) {
    console.error('无法保存临时进度: 缺少工单ID')
    return false
  }
  
  try {
    // 构造上传数据 - data 字段包含完整的 TempReportJson
    const tempData = {
      dev_testunit_id: unitId,
      testunit_type: 4,
      board_id: props.testUnit.board_id || 0,
      board_serialnumber: props.testUnit.serial || '',
      data: tempReportJson.value as any
    }
    
    console.log('[TempTest] 准备上传临时数据:', tempData)
    console.log('[TempTest] tempTest 数量:', tempReportJson.value.json?.tempTest?.length || 0)
    
    const result = await processApi.uploadTempTestUnit(1, unitId as number, tempData as any, getAuthHeaders())
    
    if (result.success) {
      console.log('[TempTest] 临时进度保存成功')
      return true
    } else {
      console.error('[TempTest] 保存临时进度失败:', result.error)
      return false
    }
  } catch (err) {
    console.error('[TempTest] 保存临时进度异常:', err)
    return false
  }
}

/** 暂停退出 - 委托给父组件处理 */
function handlePauseExit() {
  emit('request-exit', saveTempProgress)
}

// ==================== 历史报告 ====================

/** 获取历史报告列表 */
async function loadHistoryReports() {
  if (!props.testUnit) return
  
  isLoadingHistory.value = true
  try {
    // 临时工单：使用 prod_board_id 或 temp_board_id
    const prodBoardId = props.testUnit.prod_board_id
    const tempBoardId = props.testUnit.temp_board_id
    
    // 调试日志
    console.log('[历史报告] testUnit 数据:', JSON.stringify({
      testunit_type: props.testUnit.testunit_type,
      prod_board_id: prodBoardId,
      temp_board_id: tempBoardId,
    }))
    
    if (!prodBoardId && !tempBoardId) {
      console.warn('[历史报告] 临时工单缺少 prod_board_id 和 temp_board_id')
      historyReportList.value = []
      return
    }
    
    const result = await reportApi.getHistoryList({
      mode: 1,
      prodBoardId: prodBoardId,
      tempBoardId: tempBoardId
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
  // report.mode: 0=正式报告, 1=临时报告 (临时工单默认 mode=1)
  const reportMode = ((report as any).mode ?? 1) as 0 | 1
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
  <div class="temp-executor" v-bind="$attrs">
    <!-- 加载遮罩 -->
    <div v-if="isLoading || isSaving" class="loading-overlay">
      <div class="loading-content">
        <Icon icon="mdi:loading" class="loading-icon" />
        <span>{{ isSaving ? '保存中...' : '加载中...' }}</span>
      </div>
    </div>
    
    <!-- 顶部信息栏 -->
    <div class="executor-header">
      <div class="header-left">
        <div class="header-info">
          <div class="info-icon temp-icon">
            <Icon icon="mdi:clipboard-text-clock" />
          </div>
          <div class="info-content">
            <span class="info-title">临时检测</span>
            <span class="info-meta">
              {{ props.testUnit.boardmodel }} · S/N: {{ props.testUnit.serial }}
            </span>
          </div>
        </div>
        
        <div class="consignor-info">
          <span class="consignor-label">委托人:</span>
          <span class="consignor-value">{{ consignorInfo.consignor }}</span>
        </div>
      </div>
      
      <div class="header-right">
        <!-- 测试类型 -->
        <div class="test-type-badge">
          {{ consignorInfo.type }}
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
        
        <!-- 退出按钮 -->
        <button @click="handlePauseExit" class="btn btn-ghost header-exit-btn">
          <Icon icon="mdi:close" />
          退出测试
        </button>
      </div>
    </div>

    <!-- 打回理由横幅（反馈模式时显示） -->
    <div v-if="mode === 'feedback' && feedbackReason" class="feedback-reason-banner">
      <Icon icon="mdi:message-alert" />
      <span class="reason-label">打回理由:</span>
      <span class="reason-text">{{ feedbackReason }}</span>
    </div>

    <!-- 主内容区 -->
    <div class="executor-content">
      <!-- 步骤1: 检测中 -->
      <template v-if="testStep === 1">
        <!-- 摄像头区域 -->
        <div class="camera-section">
          <div class="camera-header">
            <Icon icon="mdi:television" class="section-icon" />
            <span>{{ deviceType === 'xray' ? 'X-Ray 实时画面' : '实时画面' }}</span>
            <span v-if="isXrayWithCrop" class="crop-badge">裁剪已启用</span>
          </div>
          <div class="camera-view">
            <!-- X-Ray 裁剪模式使用 canvas -->
            <canvas 
              v-if="isXrayWithCrop && camera.currentFrame.value"
              ref="cropCanvasRef"
              class="crop-canvas"
            />
            <!-- 普通模式直接显示图片 -->
            <img 
              v-else-if="camera.currentFrame.value" 
              :src="camera.currentFrame.value" 
              alt="摄像头画面"
            />
            <div v-else class="camera-placeholder">
              <Icon icon="mdi:camera-off" />
              <span>摄像头加载中...</span>
            </div>
          </div>
        </div>

        <!-- 检测面板 -->
        <div class="panel-section">
          <TempTestProcess 
            v-model:temp-report-json="tempReportJson"
            :mode="mode === 'feedback' ? 'feedback' : mode === 'question' ? 'question' : 'normal'"
            :target-list="targetList"
            @click:save="handleSave"
            @click:save-error="handleSaveError"
            @click:save-question="handleSaveQuestion"
            @click:save-warn="handleSaveWarn"
          />
        </div>
      </template>

      <!-- 步骤2: 报告预览 -->
      <template v-else-if="testStep === 2">
        <div class="report-preview-section">
          <div class="preview-header">
            <Icon icon="mdi:file-chart" class="section-icon" />
            <span>检测报告预览</span>
            <span class="preview-count">共 {{ tempReportJson.json.tempTest.length }} 项</span>
          </div>
          
          <div class="preview-content">
            <div class="preview-list">
              <div 
                v-for="(item, index) in tempReportJson.json.tempTest" 
                :key="item.id"
                class="preview-item"
                :class="getPreviewItemClass(item)"
              >
                <!-- 检测项标题 -->
                <div class="preview-item-header">
                  <span class="item-index">{{ index + 1 }}</span>
                  <span class="item-name">{{ item.name || '未命名检测项' }}</span>
                  <div class="item-badges">
                    <span v-if="item.pass === 1" class="badge badge-pass">
                      <Icon icon="mdi:check-circle" /> 通过
                    </span>
                    <span v-if="item.pass === 2 || item.pass === 4" class="badge badge-error">
                      <Icon icon="mdi:close-circle" /> 缺陷
                    </span>
                    <span v-if="item.pass === 3 || item.pass === 4" class="badge badge-question">
                      <Icon icon="mdi:help-circle" /> 疑问
                    </span>
                    <span v-if="item.warn" class="badge badge-warn">
                      <Icon icon="mdi:alert-circle" /> 制程警示
                    </span>
                  </div>
                </div>
                
                <!-- 描述 -->
                <div class="preview-row">
                  <span class="row-label">描述:</span>
                  <span class="row-value">{{ item.desc || '无描述' }}</span>
                </div>
                
                <!-- 留存图片 -->
                <div class="preview-row">
                  <span class="row-label">留存图片:</span>
                  <div v-if="item.save.length > 0" class="image-gallery">
                    <div v-for="(img, idx) in item.save" :key="idx" class="image-thumb">
                      <img :src="img" :alt="`留存${idx + 1}`" @click="openViewer(img)" />
                      <span class="image-label">图{{ idx + 1 }}</span>
                    </div>
                  </div>
                  <span v-else class="row-empty">无图片</span>
                </div>
                
                <!-- 缺陷详情 -->
                <template v-if="item.error">
                  <div class="preview-row">
                    <span class="row-label error-label">缺陷描述:</span>
                    <span class="row-value">{{ item.error.desc || '无描述' }}</span>
                  </div>
                  <div class="preview-row">
                    <span class="row-label error-label">缺陷图片:</span>
                    <div v-if="item.error.url.length > 0" class="image-gallery">
                      <div v-for="(img, idx) in item.error.url" :key="idx" class="image-thumb error">
                        <img :src="img" :alt="`缺陷${idx + 1}`" @click="openViewer(img)" />
                        <span class="image-label">图{{ idx + 1 }}</span>
                      </div>
                    </div>
                    <span v-else class="row-empty">无图片</span>
                  </div>
                </template>
                
                <!-- 疑问详情 -->
                <template v-if="item.question">
                  <div class="preview-row">
                    <span class="row-label question-label">疑问描述:</span>
                    <span class="row-value">{{ item.question.desc || '无描述' }}</span>
                  </div>
                  <div class="preview-row">
                    <span class="row-label question-label">疑问图片:</span>
                    <div v-if="item.question.url.length > 0" class="image-gallery">
                      <div v-for="(img, idx) in item.question.url" :key="idx" class="image-thumb question">
                        <img :src="img" :alt="`疑问${idx + 1}`" @click="openViewer(img)" />
                        <span class="image-label">图{{ idx + 1 }}</span>
                      </div>
                    </div>
                    <span v-else class="row-empty">无图片</span>
                  </div>
                </template>
                
                <!-- 制程警示详情 -->
                <template v-if="item.warn">
                  <div class="preview-row">
                    <span class="row-label warn-label">警示描述:</span>
                    <span class="row-value">{{ item.warn.desc || '无描述' }}</span>
                  </div>
                  <div class="preview-row">
                    <span class="row-label warn-label">警示图片:</span>
                    <div v-if="item.warn.url.length > 0" class="image-gallery">
                      <div v-for="(img, idx) in item.warn.url" :key="idx" class="image-thumb warn">
                        <img :src="img" :alt="`警示${idx + 1}`" @click="openViewer(img)" />
                        <span class="image-label">图{{ idx + 1 }}</span>
                      </div>
                    </div>
                    <span v-else class="row-empty">无图片</span>
                  </div>
                </template>
              </div>
              
              <!-- 空状态 -->
              <div v-if="tempReportJson.json.tempTest.length === 0" class="preview-empty">
                <Icon icon="mdi:clipboard-text-outline" />
                <span>暂无检测记录</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 底部操作栏 -->
    <div class="executor-footer">
      <!-- 步骤1: 检测中 -->
      <template v-if="testStep === 1">
        <div class="footer-left"></div>
        <button class="btn btn-primary" @click="handleNext">
          完成检测
          <Icon icon="mdi:arrow-right" />
        </button>
      </template>
      
      <!-- 步骤2: 报告预览 -->
      <template v-else-if="testStep === 2">
        <button class="btn btn-outline" @click="backToTest">
          <Icon icon="mdi:arrow-left" />
          返回修改
        </button>
        <button class="btn btn-primary" @click="uploadReport">
          <Icon icon="mdi:upload" />
          提交报告
        </button>
      </template>
    </div>

    <!-- 图片预览 -->
    <Teleport to="body">
      <div v-if="viewerVisible" class="viewer-overlay" @click="viewerVisible = false">
        <div class="viewer-content" @click.stop>
          <img :src="viewerUrl" alt="" />
          <button class="viewer-close" @click="viewerVisible = false">
            <Icon icon="mdi:close" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 容器 - 限制高度防止撑开外部页面 */
.temp-executor {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;  /* 关键: 限制最大高度 */
  width: 100%;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--color-bg);
  overflow: hidden;  /* 防止内容溢出 */
}

/* 打回理由横幅 */
.feedback-reason-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(251, 146, 60, 0.15);
  border: 1px solid rgba(251, 146, 60, 0.3);
  border-radius: 0.375rem;
  color: rgb(251, 146, 60);
  font-size: 0.875rem;
  flex-shrink: 0;
}

.feedback-reason-banner .reason-label {
  font-weight: 600;
}

.feedback-reason-banner .reason-text {
  flex: 1;
  color: var(--color-text-primary);
}

/* 加载遮罩 */
.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 0.75rem;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  background: var(--color-bg);
  border-radius: 0.75rem;
  color: var(--color-text);
}

.loading-icon {
  font-size: 2rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 顶部信息栏 */
.executor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-info {
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
  border-radius: 0.625rem;
  font-size: 1.25rem;
}

.temp-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.info-content {
  display: flex;
  flex-direction: column;
}

.info-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.info-meta {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.consignor-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.5rem;
}

.consignor-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.consignor-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.test-type-badge {
  padding: 0.375rem 0.75rem;
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.header-exit-btn {
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.header-exit-btn:hover {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
}

/* 历史报告下拉 */
.history-dropdown {
  position: relative;
}

.history-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: rgb(251, 191, 36);
  font-size: 0.8125rem;
}

.history-btn:hover {
  background: rgba(251, 191, 36, 0.1);
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

/* 主内容区 */
.executor-content {
  flex: 1 1 0;      /* 可伸缩，基础大小为0 */
  display: flex;
  gap: 0.75rem;
  min-height: 0;
  max-height: 100%; /* 限制最大高度 */
  overflow: hidden; /* 防止内容溢出 */
}

/* 摄像头区域 */
.camera-section {
  flex: 6;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
  min-width: 0;
}

.camera-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
}

.section-icon {
  font-size: 1.125rem;
  color: var(--color-primary);
}

.camera-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  min-height: 0;
  background: #000;
}

.camera-view img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.camera-view canvas {
  display: none;
}

/* X-Ray 裁剪 canvas 样式 */
.camera-view .crop-canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 裁剪标记 */
.crop-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--color-accent-orange);
  color: white;
  margin-left: auto;
}

.camera-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-text-secondary);
}

.camera-placeholder svg {
  font-size: 3rem;
  opacity: 0.5;
}

/* 检测面板区域 */
.panel-section {
  flex: 4 1 0;      /* flex-grow: 4, flex-shrink: 1, flex-basis: 0 */
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;    /* 关键: 让子组件正确滚动 */
  max-height: 100%; /* 限制最大高度 */
  overflow: hidden;
}

/* 报告预览区域 */
/* 报告预览区域 */
.report-preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.preview-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  font-size: 0.9375rem;
  font-weight: 600;
}

.preview-count {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  padding: 0.125rem 0.5rem;
  border-radius: 0.5rem;
}

.preview-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* 预览项卡片 */
.preview-item {
  padding: 1rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  border-left: 4px solid #9ca3af;
}

.preview-item.is-pass { border-left-color: #22c55e; }
.preview-item.is-warn { border-left-color: #f59e0b; }
.preview-item.is-error { border-left-color: #ef4444; }
.preview-item.is-question { border-left-color: #6b7280; }
.preview-item.is-mixed { border-left-color: #a855f7; }

/* 预览项标题 */
.preview-item-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.item-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  background: var(--color-bg-tertiary);
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.item-name {
  flex: 1;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.item-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-pass { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.badge-error { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.badge-question { background: rgba(107, 114, 128, 0.15); color: #6b7280; }
.badge-warn { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }

/* 预览行 */
.preview-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.preview-row:last-child {
  margin-bottom: 0;
}

.row-label {
  flex-shrink: 0;
  width: 5rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.row-label.error-label { color: #ef4444; }
.row-label.question-label { color: #6b7280; }
.row-label.warn-label { color: #f59e0b; }

.row-value {
  flex: 1;
  color: var(--color-text);
  word-break: break-word;
}

.row-empty {
  color: var(--color-text-tertiary);
  font-style: italic;
}

/* 图片画廊 */
.preview-item .image-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.image-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.image-thumb img {
  width: 5rem;
  height: 5rem;
  object-fit: cover;
  border-radius: 0.375rem;
  border: 2px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s;
}

.image-thumb img:hover {
  border-color: var(--color-primary);
  transform: scale(1.05);
}

.image-thumb.error img { border-color: rgba(239, 68, 68, 0.5); }
.image-thumb.question img { border-color: rgba(107, 114, 128, 0.5); }
.image-thumb.warn img { border-color: rgba(245, 158, 11, 0.5); }

.image-thumb .image-label {
  font-size: 0.625rem;
  color: var(--color-text-tertiary);
}

/* 空状态 */
.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem;
  color: var(--color-text-tertiary);
}

.preview-empty svg {
  font-size: 3rem;
  opacity: 0.5;
}

/* 底部操作栏 */
/* 底部操作栏 */
.executor-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.footer-left {
  display: flex;
  gap: 0.75rem;
}

/* 按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background: transparent;
}

.btn:hover {
  background: var(--color-bg-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, rgb(96, 165, 250) 0%, rgb(59, 130, 246) 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.btn-outline {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.btn-outline:hover:not(:disabled) {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--color-bg-tertiary);
}

/* 滚动条样式 */
.preview-content::-webkit-scrollbar {
  width: 6px;
}

.preview-content::-webkit-scrollbar-track {
  background: var(--color-bg-secondary);
  border-radius: 3px;
}

.preview-content::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.preview-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-tertiary);
}

/* 图片预览 */
.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.9);
}

.viewer-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.viewer-content img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
}

.viewer-close {
  position: absolute;
  top: -2rem;
  right: -2rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.viewer-close:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
