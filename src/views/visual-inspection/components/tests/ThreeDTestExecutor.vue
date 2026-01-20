<script setup lang="ts">
/**
 * 3D检测测试执行器
 * 
 * 参考原程序 ThreeDTest.vue 完整实现多层级测试流程
 * 
 * 测试流程:
 * - threeDStep=1: 正面整体检测 (step -> pic)
 * - threeDStep=2: 正面区域检测 (general.step -> general.pic -> detail[].step -> detail[].pic)
 * - threeDStep=3: 背面整体检测 (如有 eyesBak)
 * - threeDStep=4: 背面区域检测
 * 
 * 布局: 摄像头 55% / 测试面板 45%
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import { useCamera } from '@/composables/useCamera'
import { useConfig } from '@/composables/useConfig'
import { StepProcess, PicProcess } from '@/components/visual-test'
import type { TestUnit } from '@/services/order'
import { 
  processApi,
  type ProcessData, type ProcessJson, type TempOrderData, type FeedbackData, type QuestionData,
  type StepItem, type PicItem, type EyesSideData, type AreaData, type TotalData
} from '@/services/process'
import { reportApi, type ReportUploadParams } from '@/services/report'

// ==================== 类型定义 ====================

type TestMode = 'normal' | 'continue' | 'feedback' | 'question'
type TotalMethod = 'step' | 'pic'
type AreaMethod = 'step' | 'pic' | 'detail'
type PointMethod = 'step' | 'pic'

// Props
const props = defineProps<{
  testUnit: TestUnit
  mode: TestMode
  isDevTest: boolean
  processData?: ProcessData
  tempData?: TempOrderData
  feedbackData?: FeedbackData
  questionData?: QuestionData
}>()

// Emits
const emit = defineEmits<{
  complete: []
  exit: []
  error: [message: string]
  'request-exit': [saveProgress: () => Promise<boolean>]  // 请求退出，传递保存进度的函数
}>()

// ==================== 状态定义 ====================

const { userInfo, getAuthHeaders } = useAuth()
const camera = useCamera()
const { config, initConfig } = useConfig()

// 测试步骤: 1=正面整体, 2=正面区域, 3=背面整体, 4=背面区域
const threeDStep = ref(1)

// 当前检测模式
const totalMethods = ref<TotalMethod>('step')
const areaMethods = ref<AreaMethod>('step')
const pointMethods = ref<PointMethod>('step')

// 区域和点位计数
const areaCount = ref(0)
const pointCount = ref(0)
const bakAreaCount = ref(0)
const currentArea = ref(0)
const currentPoint = ref(0)

// 加载状态
const isLoading = ref(false)
const isSaving = ref(false)

// 工艺数据 (工作副本)
const localJson = ref<ProcessJson | null>(null)

// 报告数据
const reportJson = ref<{
  testunit_id: number
  testunit_type: number
  board_id: number
  board_serialnumber: string
  json: {
    threeD: {
      eyes: { total: object; area: object[] }
      eyesBak?: { total: object; area: object[] }
    }
  }
} | null>(null)

// ==================== 计算属性 ====================

// 当前正面/背面数据
const currentSideData = computed((): EyesSideData | null => {
  if (!localJson.value) return null
  if (threeDStep.value <= 2) {
    return localJson.value.eyes || null
  } else {
    return localJson.value.eyesBak || null
  }
})

// 当前整体数据
const currentTotalData = computed((): TotalData | null => {
  return currentSideData.value?.total || null
})

// 当前区域数据
const currentAreaData = computed((): AreaData | null => {
  if (!currentSideData.value || currentArea.value <= 0) return null
  return currentSideData.value.area[currentArea.value - 1] || null
})

// 当前点位数据
const currentDetailData = computed(() => {
  if (!currentAreaData.value || currentPoint.value <= 0) return null
  return currentAreaData.value.detail[currentPoint.value - 1] || null
})

// 是否有背面
const hasBackSide = computed(() => {
  return localJson.value?.eyesBak && localJson.value.eyesBak.total?.url
})

// 当前步骤标题
const currentStepTitle = computed(() => {
  const side = threeDStep.value <= 2 ? '正面' : '背面'
  
  if (threeDStep.value === 1 || threeDStep.value === 3) {
    return `${side}(整体)检测`
  }
  
  if (currentArea.value === 0) return `${side}区域检测`
  
  if (areaMethods.value === 'step' || areaMethods.value === 'pic') {
    return `${side}通用-${currentArea.value}区`
  }
  
  if (currentPoint.value > 0 && currentDetailData.value) {
    return `${side}${currentArea.value}区-${currentDetailData.value.name}`
  }
  
  return `${side}区域检测`
})

// 当前参考图
const currentReferenceImage = computed(() => {
  if (threeDStep.value === 1 || threeDStep.value === 3) {
    return currentTotalData.value?.url || ''
  }
  if (currentAreaData.value) {
    return currentAreaData.value.url || ''
  }
  return ''
})

// 当前步骤数据
const currentStepData = computed((): StepItem[] => {
  if (threeDStep.value === 1 || threeDStep.value === 3) {
    // 整体检测
    if (totalMethods.value === 'step') {
      return currentTotalData.value?.step || []
    }
  } else {
    // 区域检测
    if (areaMethods.value === 'step') {
      return currentAreaData.value?.general.step || []
    }
    if (areaMethods.value === 'detail' && pointMethods.value === 'step') {
      return currentDetailData.value?.step || []
    }
  }
  return []
})

// 当前图片数据
const currentPicData = computed((): PicItem[] => {
  if (threeDStep.value === 1 || threeDStep.value === 3) {
    if (totalMethods.value === 'pic') {
      return currentTotalData.value?.pic || []
    }
  } else {
    if (areaMethods.value === 'pic') {
      return currentAreaData.value?.general.pic || []
    }
    if (areaMethods.value === 'detail' && pointMethods.value === 'pic') {
      return currentDetailData.value?.pic || []
    }
  }
  return []
})

// 是否显示步骤面板
const showStepPanel = computed(() => {
  if (threeDStep.value === 1 || threeDStep.value === 3) {
    return totalMethods.value === 'step'
  }
  if (areaMethods.value === 'step') return true
  if (areaMethods.value === 'detail' && pointMethods.value === 'step') return true
  return false
})

// 是否显示图片面板
const showPicPanel = computed(() => {
  if (threeDStep.value === 1 || threeDStep.value === 3) {
    return totalMethods.value === 'pic'
  }
  if (areaMethods.value === 'pic') return true
  if (areaMethods.value === 'detail' && pointMethods.value === 'pic') return true
  return false
})

// ==================== 初始化 ====================

onMounted(async () => {
  // 初始化配置
  await initConfig()
  await initTest()
  
  // 启动显微镜摄像头
  const microDevice = config.value.microDevice
  if (microDevice >= 0) {
    await camera.startCamera(microDevice)
  } else {
    console.warn('未配置显微镜摄像头')
  }
  
  // 新测试时，上传初始临时数据让后端 TempTestUnit 有记录
  // 这样即使中途退出，工单状态变为"待继续"后扫码也能找到
  if (props.mode === 'normal' && localJson.value) {
    await saveTempProgress()
  }
})

onUnmounted(() => {
  camera.stopCamera()
})

async function initTest() {
  isLoading.value = true
  
  try {
    // 根据模式初始化数据
    if (props.mode === 'continue' && props.tempData?.data) {
      // 继续测试: 使用保存的工作状态
      localJson.value = JSON.parse(JSON.stringify(props.tempData.data))
      console.log('[ThreeDTest] 继续测试模式，加载临时数据:', localJson.value)
    } else if (props.processData?.json) {
      // 新测试/反馈/疑问: 使用下载的工艺
      localJson.value = JSON.parse(JSON.stringify(props.processData.json))
      console.log('[ThreeDTest] 新测试模式，加载工艺数据:', localJson.value)
    } else {
      console.error('[ThreeDTest] 工艺数据加载失败 - processData:', props.processData, 'tempData:', props.tempData)
      emit('error', '工艺数据加载失败')
      return
    }
    
    // 调试: 检查数据结构
    console.log('[ThreeDTest] localJson.eyes:', localJson.value?.eyes)
    console.log('[ThreeDTest] localJson.eyes.total:', localJson.value?.eyes?.total)
    console.log('[ThreeDTest] localJson.eyes.total.step:', localJson.value?.eyes?.total?.step)
    
    // 初始化计数
    if (localJson.value?.eyes) {
      areaCount.value = localJson.value.eyes.area?.length || 0
    }
    if (localJson.value?.eyesBak) {
      bakAreaCount.value = localJson.value.eyesBak.area?.length || 0
    }
    
    // 初始化报告数据
    initReportJson()
    
  } catch (err) {
    console.error('初始化测试失败:', err)
    emit('error', '初始化测试失败')
  } finally {
    isLoading.value = false
  }
}

function initReportJson() {
  reportJson.value = {
    testunit_id: props.testUnit.testunit_id || props.testUnit.dev_testunit_id || 0,
    testunit_type: 4,
    board_id: props.testUnit.board_id || 0,
    board_serialnumber: props.testUnit.serial || '',
    json: {
      threeD: {
        eyes: {
          total: { stepList: [], stepNote: [], picList: [], picNote: [] },
          area: []
        }
      }
    }
  }
}

// ==================== 导航逻辑 ====================

// 下一步
async function handleNext() {
  // 整体检测阶段
  if (threeDStep.value === 1 || threeDStep.value === 3) {
    if (totalMethods.value === 'step') {
      // 验证步骤完成
      if (!validateSteps(currentTotalData.value?.step || [])) {
        return
      }
      totalMethods.value = 'pic'
    } else {
      // 验证图片完成
      if (!validatePics(currentTotalData.value?.pic || [])) {
        return
      }
      // 进入区域检测
      if (threeDStep.value === 1) {
        threeDStep.value = 2
        currentArea.value = 1
        resetAreaState()
      } else {
        threeDStep.value = 4
        currentArea.value = 1
        resetAreaState()
      }
    }
    return
  }
  
  // 区域检测阶段
  await handleAreaNext()
}

// 区域检测下一步
async function handleAreaNext() {
  const side = threeDStep.value <= 2 ? localJson.value?.eyes : localJson.value?.eyesBak
  if (!side) return
  
  const areaData = side.area[currentArea.value - 1]
  if (!areaData) return
  
  pointCount.value = areaData.detail?.length || 0
  
  if (areaMethods.value === 'step') {
    // 验证区域通用步骤
    if (!validateSteps(areaData.general.step)) return
    areaMethods.value = 'pic'
  } else if (areaMethods.value === 'pic') {
    // 验证区域通用图片
    if (!validatePics(areaData.general.pic)) return
    areaMethods.value = 'detail'
    currentPoint.value = 1
    pointMethods.value = 'step'
  } else if (areaMethods.value === 'detail') {
    const detailData = areaData.detail[currentPoint.value - 1]
    if (!detailData) return
    
    if (pointMethods.value === 'step') {
      // 验证点位步骤
      if (!validateSteps(detailData.step)) return
      pointMethods.value = 'pic'
    } else {
      // 验证点位图片
      if (!validatePics(detailData.pic)) return
      
      // 移动到下一个点位或区域
      if (currentPoint.value < pointCount.value) {
        currentPoint.value++
        pointMethods.value = 'step'
      } else if (currentArea.value < areaCount.value) {
        currentArea.value++
        resetAreaState()
      } else {
        // 完成当前面
        await handleSideComplete()
      }
    }
  }
}

// 完成当前面检测
async function handleSideComplete() {
  if (threeDStep.value === 2) {
    // 正面完成
    if (hasBackSide.value) {
      // 有背面, 继续背面检测
      threeDStep.value = 3
      totalMethods.value = 'step'
      currentArea.value = 0
      currentPoint.value = 0
      areaCount.value = bakAreaCount.value
    } else {
      // 无背面, 测试完成
      await handleTestComplete()
    }
  } else {
    // 背面完成, 测试完成
    await handleTestComplete()
  }
}

// 上一步
function handlePrevious() {
  if (threeDStep.value === 1 || threeDStep.value === 3) {
    if (totalMethods.value === 'pic') {
      totalMethods.value = 'step'
    }
  } else if (threeDStep.value === 3) {
    // 从背面整体返回正面区域
    threeDStep.value = 2
    goToLastArea()
  } else {
    // 区域检测中返回
    handleAreaPrevious()
  }
}

// 区域检测上一步
function handleAreaPrevious() {
  if (areaMethods.value === 'step') {
    // 返回整体或上一个区域
    if (currentArea.value === 1) {
      threeDStep.value = threeDStep.value <= 2 ? 1 : 3
      totalMethods.value = 'pic'
      currentArea.value = 0
    } else {
      currentArea.value--
      goToAreaLastPoint()
    }
  } else if (areaMethods.value === 'pic') {
    areaMethods.value = 'step'
  } else if (areaMethods.value === 'detail') {
    if (pointMethods.value === 'pic') {
      pointMethods.value = 'step'
    } else if (currentPoint.value > 1) {
      currentPoint.value--
      pointMethods.value = 'pic'
    } else {
      areaMethods.value = 'pic'
      currentPoint.value = 0
    }
  }
}

// 重置区域状态
function resetAreaState() {
  areaMethods.value = 'step'
  pointMethods.value = 'step'
  currentPoint.value = 0
}

// 跳转到最后一个区域
function goToLastArea() {
  const side = localJson.value?.eyes
  if (!side) return
  currentArea.value = side.area.length
  goToAreaLastPoint()
}

// 跳转到区域最后一个点位
function goToAreaLastPoint() {
  const side = threeDStep.value <= 2 ? localJson.value?.eyes : localJson.value?.eyesBak
  if (!side) return
  const areaData = side.area[currentArea.value - 1]
  if (!areaData) return
  
  areaMethods.value = 'detail'
  pointMethods.value = 'pic'
  currentPoint.value = areaData.detail?.length || 0
}

// ==================== 验证逻辑 ====================

function validateSteps(steps: StepItem[]): boolean {
  for (const step of steps) {
    if (step.pass === 0) {
      ElMessage.warning('请完成所有检测步骤')
      return false
    }
    if (step.pass === 2 || step.pass === 4) {
      if (!step.error?.url?.length || !step.error?.desc) {
        ElMessage.warning('缺陷项需要添加图片和描述')
        return false
      }
    }
    if (step.pass === 3 || step.pass === 4) {
      if (!step.question?.url?.length || !step.question?.desc) {
        ElMessage.warning('疑问项需要添加图片和描述')
        return false
      }
    }
    if (step.warn) {
      if (!step.warn.url?.length || !step.warn.desc) {
        ElMessage.warning('制程警示需要添加图片和描述')
        return false
      }
    }
  }
  return true
}

function validatePics(pics: PicItem[]): boolean {
  for (const pic of pics) {
    if (pic.save.length === 0) {
      ElMessage.warning('请完成所有拍照留存项')
      return false
    }
  }
  return true
}

// ==================== 拍照逻辑 ====================

// 拍摄步骤缺陷图
async function handleStepSave(stepId: number) {
  const frame = camera.currentFrame.value
  if (!frame) {
    ElMessage.error('无法获取摄像头画面')
    return
  }
  
  const step = findStep(stepId)
  if (!step) return
  
  if (!step.error) {
    step.error = { url: [], desc: '' }
  }
  
  if (step.error.url.length >= 5) {
    ElMessage.warning('最多添加5张图片')
    return
  }
  
  step.error.url.push(frame)
}

// 拍摄步骤疑问图
async function handleStepSaveQuestion(stepId: number) {
  const frame = camera.currentFrame.value
  if (!frame) {
    ElMessage.error('无法获取摄像头画面')
    return
  }
  
  const step = findStep(stepId)
  if (!step) return
  
  if (!step.question) {
    step.question = { url: [], desc: '' }
  }
  
  if (step.question.url.length >= 5) {
    ElMessage.warning('最多添加5张图片')
    return
  }
  
  step.question.url.push(frame)
}

// 拍摄步骤警示图
async function handleStepSaveWarn(stepId: number) {
  const frame = camera.currentFrame.value
  if (!frame) {
    ElMessage.error('无法获取摄像头画面')
    return
  }
  
  const step = findStep(stepId)
  if (!step) return
  
  if (!step.warn) {
    step.warn = { url: [], desc: '' }
  }
  
  if (step.warn.url.length >= 5) {
    ElMessage.warning('最多添加5张图片')
    return
  }
  
  step.warn.url.push(frame)
}

// 拍摄留存图
async function handlePicSave(picId: number) {
  const frame = camera.currentFrame.value
  if (!frame) {
    ElMessage.error('无法获取摄像头画面')
    return
  }
  
  const pic = findPic(picId)
  if (!pic) return
  
  if (pic.save.length >= 5) {
    ElMessage.warning('最多添加5张图片')
    return
  }
  
  pic.save.push(frame)
}

// 查找步骤
function findStep(stepId: number): StepItem | null {
  const steps = currentStepData.value
  return steps.find(s => s.id === stepId) || null
}

// 查找图片
function findPic(picId: number): PicItem | null {
  const pics = currentPicData.value
  return pics.find(p => p.id === picId) || null
}

// ==================== 完成测试 ====================

async function handleTestComplete() {
  try {
    await ElMessageBox.confirm('测试已完成，是否提交报告？', '提交确认', {
      confirmButtonText: '提交',
      cancelButtonText: '取消',
      type: 'info'
    })
  } catch {
    return  // 用户取消
  }
  
  isSaving.value = true
  
  try {
    // 生成报告数据
    generateReport()
    
    // 上传报告
    const uploadParams: ReportUploadParams = {
      testunit_id: reportJson.value!.testunit_id,
      serialNumber: reportJson.value!.board_serialnumber,
      userId: userInfo.value?.id || 0,
      testType: 4,
      testunit_status: 3,
      file: reportJson.value!
    }
    
    const result = await reportApi.uploadReport(uploadParams, getAuthHeaders())
    
    if (result.success) {
      ElMessage.success('报告提交成功')
      emit('complete')
    } else {
      throw new Error(result.error || '提交失败')
    }
    
  } catch (err) {
    console.error('提交报告失败:', err)
    ElMessage.error('提交报告失败: ' + (err as Error).message)
  } finally {
    isSaving.value = false
  }
}

// 生成报告数据
function generateReport() {
  if (!localJson.value || !reportJson.value) return
  
  // 简化版报告生成 - 实际项目中需要按原程序完整实现
  const eyes = localJson.value.eyes
  if (eyes) {
    reportJson.value.json.threeD.eyes = {
      total: {
        stepList: eyes.total.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
        stepNote: eyes.total.stepNote || [],
        picList: eyes.total.pic.map(p => ({ id: p.id, name: p.name, save: p.save })),
        picNote: eyes.total.picNote || []
      },
      area: eyes.area.map(a => ({
        id: a.id,
        general: {
          stepList: a.general.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
          picList: a.general.pic.map(p => ({ id: p.id, name: p.name, save: p.save }))
        },
        detail: a.detail.map(d => ({
          id: d.id,
          name: d.name,
          stepList: d.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
          picList: d.pic.map(p => ({ id: p.id, name: p.name, save: p.save }))
        }))
      }))
    }
  }
  
  // 背面数据
  const eyesBak = localJson.value.eyesBak
  if (eyesBak && hasBackSide.value) {
    reportJson.value.json.threeD.eyesBak = {
      total: {
        stepList: eyesBak.total.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
        stepNote: eyesBak.total.stepNote || [],
        picList: eyesBak.total.pic.map(p => ({ id: p.id, name: p.name, save: p.save })),
        picNote: eyesBak.total.picNote || []
      },
      area: eyesBak.area.map(a => ({
        id: a.id,
        general: {
          stepList: a.general.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
          picList: a.general.pic.map(p => ({ id: p.id, name: p.name, save: p.save }))
        },
        detail: a.detail.map(d => ({
          id: d.id,
          name: d.name,
          stepList: d.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
          picList: d.pic.map(p => ({ id: p.id, name: p.name, save: p.save }))
        }))
      }))
    }
  }
}

// 保存临时进度
async function saveTempProgress(): Promise<boolean> {
  const unitId = props.testUnit.testunit_id || props.testUnit.dev_testunit_id
  if (!unitId || !localJson.value) {
    console.error('无法保存临时进度: 缺少工单ID或工艺数据')
    return false
  }
  
  const unitType: 0 | 1 = props.isDevTest ? 1 : 0
  
  try {
    // 构造临时数据结构
    const tempData: TempOrderData = {
      testunit_id: props.isDevTest ? undefined : unitId,
      dev_testunit_id: props.isDevTest ? unitId : undefined,
      testunit_type: 4,
      board_id: props.testUnit.board_id || 0,
      board_serialnumber: props.testUnit.serial || '',
      data: localJson.value  // 当前工艺工作状态
    }
    
    const result = await processApi.uploadTempTestUnit(unitType, unitId, tempData, getAuthHeaders())
    
    if (result.success) {
      console.log('临时进度保存成功')
      return true
    } else {
      console.error('临时进度保存失败:', result.error)
      return false
    }
  } catch (err) {
    console.error('保存临时进度异常:', err)
    return false
  }
}

// 暂停退出 - 将退出逻辑委托给父组件处理
function handlePauseExit() {
  emit('request-exit', saveTempProgress)
}
</script>

<template>
  <div class="threed-executor">
    <!-- 加载遮罩 -->
    <div v-if="isLoading || isSaving" class="loading-overlay">
      <div class="loading-content">
        <Icon icon="mdi:loading" class="loading-icon" />
        <span>{{ isSaving ? '保存中...' : '加载中...' }}</span>
      </div>
    </div>
    
    <!-- 顶部信息栏 -->
    <div class="executor-header">
      <div class="header-info">
        <div class="info-icon">
          <Icon icon="mdi:cube-scan" />
        </div>
        <div class="info-content">
          <span class="info-title">3D检测</span>
          <span class="info-meta">
            {{ props.testUnit.boardmodel }} · S/N: {{ props.testUnit.serial }}
          </span>
        </div>
      </div>
      
      <div class="step-indicator">
        <Icon icon="mdi:progress-clock" class="step-icon" />
        <span class="step-title">{{ currentStepTitle }}</span>
      </div>
      
      <!-- 参考图预览 -->
      <div class="reference-preview" v-if="currentReferenceImage">
        <img :src="currentReferenceImage" alt="参考图" />
      </div>
      
      <!-- 进度指示 -->
      <div class="progress-indicator">
        <span v-if="threeDStep <= 2">正面</span>
        <span v-else>背面</span>
        <span class="separator">|</span>
        <span v-if="currentArea > 0">区域 {{ currentArea }}/{{ areaCount }}</span>
        <span v-else>整体</span>
        <span v-if="currentPoint > 0" class="separator">|</span>
        <span v-if="currentPoint > 0">点位 {{ currentPoint }}/{{ pointCount }}</span>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="executor-content">
      <!-- 摄像头区域 (55%) -->
      <div class="camera-section">
        <div class="camera-header">
          <Icon icon="mdi:television" class="section-icon" />
          <span>实时画面</span>
        </div>
        <div class="camera-view">
          <canvas ref="canvasRef" id="videoCanvas" />
          <img 
            v-if="camera.currentFrame.value" 
            :src="camera.currentFrame.value" 
            alt="摄像头画面"
          />
          <div v-else class="camera-placeholder">
            <Icon icon="mdi:camera-off" />
            <span>摄像头加载中...</span>
          </div>
        </div>
      </div>

      <!-- 测试面板区域 (45%) -->
      <div class="test-panel">
        <!-- 步骤面板 -->
        <StepProcess
          v-if="showStepPanel && currentStepData.length > 0"
          :step-data="currentStepData"
          :image="currentReferenceImage"
          :mode="props.mode === 'feedback' ? 'feedback' : props.mode === 'question' ? 'question' : 'normal'"
          @click:save="handleStepSave"
          @click:save-question="handleStepSaveQuestion"
          @click:save-warn="handleStepSaveWarn"
        />

        <!-- 图片面板 -->
        <PicProcess
          v-if="showPicPanel && currentPicData.length > 0"
          :pic-data="currentPicData"
          :image="currentReferenceImage"
          @click:save="handlePicSave"
        />

        <!-- 空状态 - 当没有数据可显示时 -->
        <div v-if="!(showStepPanel && currentStepData.length > 0) && !(showPicPanel && currentPicData.length > 0)" class="empty-panel">
          <Icon icon="mdi:clipboard-check" />
          <span v-if="!localJson">工艺加载中...</span>
          <span v-else-if="!currentSideData">正在解析工艺数据...</span>
          <span v-else-if="!currentTotalData">暂无整体检测数据</span>
          <span v-else-if="showStepPanel && currentStepData.length === 0">暂无检测步骤 (step数组为空)</span>
          <span v-else-if="showPicPanel && currentPicData.length === 0">暂无留存图片 (pic数组为空)</span>
          <span v-else>准备就绪</span>
        </div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="executor-footer">
      <button class="btn btn-secondary" @click="handlePauseExit">
        <Icon icon="mdi:pause" />
        暂停退出
      </button>
      
      <div class="footer-center">
        <button 
          class="btn btn-outline" 
          @click="handlePrevious"
          :disabled="threeDStep === 1 && totalMethods === 'step'"
        >
          <Icon icon="mdi:arrow-left" />
          上一步
        </button>
      </div>
      
      <button class="btn btn-primary" @click="handleNext">
        下一步
        <Icon icon="mdi:arrow-right" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 容器 */
.threed-executor {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--color-bg-primary);
}

/* 加载遮罩 */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  background: var(--color-bg-secondary);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
}

.loading-icon {
  font-size: 2rem;
  color: rgb(96, 165, 250);
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
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
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
  background: linear-gradient(135deg, rgb(96, 165, 250) 0%, rgb(59, 130, 246) 100%);
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

.step-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(96, 165, 250, 0.1);
  border-radius: 0.5rem;
  border: 1px solid rgba(96, 165, 250, 0.3);
}

.step-icon {
  font-size: 1.25rem;
  color: rgb(96, 165, 250);
}

.step-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.reference-preview {
  flex: 1;
  height: 3rem;
  display: flex;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.reference-preview img {
  height: 100%;
  object-fit: contain;
  cursor: pointer;
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.375rem;
  border: 1px solid var(--color-border);
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.separator {
  color: var(--color-border);
}

/* 主内容区 */
.executor-content {
  flex: 1;
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 0;
  overflow: hidden;
}

/* 摄像头区域 - 60% */
.camera-section {
  flex: 6;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.camera-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.875rem;
  font-weight: 500;
}

.section-icon {
  font-size: 1.125rem;
  color: rgb(96, 165, 250);
}

.camera-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.camera-view img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.camera-view canvas {
  display: none;
}

.camera-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--color-text-secondary);
}

.camera-placeholder svg {
  font-size: 3rem;
  opacity: 0.5;
}

/* 测试面板区域 - 40% */
.test-panel {
  flex: 4;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-panel {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: var(--color-bg-secondary);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.empty-panel svg {
  font-size: 3rem;
  opacity: 0.5;
}

/* 底部操作栏 */
.executor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.footer-center {
  display: flex;
  gap: 0.75rem;
}

/* 按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 1.25rem;
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
</style>
