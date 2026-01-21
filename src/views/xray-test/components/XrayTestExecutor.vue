<script setup lang="ts">
/**
 * X-Ray 测试执行器
 * 
 * 参考原程序 XrayTest.vue 完整实现 X-Ray 测试流程
 * 
 * 测试流程:
 * - testStep=1: 选择测试电路板
 * - testStep=2: 整体检测 (step -> pic)
 * - testStep=3: 区域检测 (general.step -> general.pic -> detail[].step -> detail[].pic)
 * - testStep=4: 测试结果预览
 * 
 * 布局: 摄像头 55% / 测试面板 45%
 */
import { ref, computed, onMounted, onUnmounted, reactive, Teleport } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import { useCamera } from '@/composables/useCamera'
import { useConfig } from '@/composables/useConfig'
import { useWindow } from '@/composables/useWindow'
import { StepProcess, PicProcess } from '@/components/visual-test'
import type { TestUnit } from '@/services/order'
import { 
  processApi,
  type ProcessData, type TempOrderData, type FeedbackData, type QuestionData,
  type StepItem, type PicItem, type XrayData, type AreaData, type TotalData, type ProcessJson
} from '@/services/process'
import { reportApi, type ReportUploadParams, type ReportData, type TestReport } from '@/services/report'

// ==================== 类型定义 ====================

type TestMode = 'normal' | 'continue' | 'feedback' | 'question'
type TotalMethod = 'step' | 'pic'
type AreaMethod = 'step' | 'pic' | 'detail'
type PointMethod = 'step' | 'pic'

// 槽位数据
interface SlotData {
  id: number
  board: TestUnit
  processData?: ProcessData
  tempData?: TempOrderData
  feedbackData?: FeedbackData
  questionData?: QuestionData
  feedbackReport?: unknown
  questionReport?: unknown
  testMode?: TestMode
  isDevTest?: boolean
}

// Props
const props = defineProps<{
  slotData: SlotData
  fixtureId: string
  totalBoards: number
  currentIndex: number
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

// 测试步骤: 1=选择, 2=整体, 3=区域, 4=结果
const testStep = ref(2)

// 当前检测模式
const totalMethods = ref<TotalMethod>('step')
const areaMethods = ref<AreaMethod>('step')
const pointMethods = ref<PointMethod>('step')

// 区域和点位计数
const areaCount = ref(0)
const pointCount = ref(0)
const currentArea = ref(0)
const currentPoint = ref(0)

// 加载状态
const isLoading = ref(false)
const isSaving = ref(false)

// 工艺数据 (工作副本)
const processJson = ref<XrayData | null>(null)

// 报告数据 - 使用 any 类型以避免复杂的类型推断
const reportJson = ref<ReportData | null>(null)

// 历史报告
const historyReportList = ref<TestReport[]>([])
const isLoadingHistory = ref(false)
const showHistoryDropdown = ref(false)

// 窗口管理
const { openReportPreview } = useWindow()

// 快捷导航
interface QuickTreeNode {
  label: string
  index?: number
  disabled?: boolean
  children?: QuickTreeNode[]
}
const quickTreeData = ref<QuickTreeNode[]>([])
const showQuickNav = ref(false)

// 备注
const noteVisible = ref(false)
const noteForm = reactive({
  value: '',
  type: '' as 'total' | 'area' | '',
  stepType: '' as 'step' | 'pic' | '',
  areaType: '' as 'total' | 'detail' | '',
  areaId: 0,
  pointId: 0
})

// ==================== 计算属性 ====================

// 当前整体数据
const currentTotalData = computed((): TotalData | null => {
  return processJson.value?.total || null
})

// 当前区域数据
const currentAreaData = computed((): AreaData | null => {
  if (!processJson.value || currentArea.value <= 0) return null
  return processJson.value.area[currentArea.value - 1] || null
})

// 当前点位数据
const currentDetailData = computed(() => {
  if (!currentAreaData.value || currentPoint.value <= 0) return null
  return currentAreaData.value.detail[currentPoint.value - 1] || null
})

// 当前步骤标题
const currentStepTitle = computed(() => {
  if (testStep.value === 2) {
    return '整体检测'
  }
  
  if (currentArea.value === 0) return '区域检测'
  
  if (areaMethods.value === 'step' || areaMethods.value === 'pic') {
    return `通用检测-${currentArea.value}区`
  }
  
  if (currentPoint.value > 0 && currentDetailData.value) {
    return `${currentArea.value}区-${currentDetailData.value.name}`
  }
  
  return '区域检测'
})

// 当前参考图
const currentReferenceImage = computed(() => {
  if (testStep.value === 2) {
    return currentTotalData.value?.url || ''
  }
  if (currentAreaData.value) {
    return currentAreaData.value.url || ''
  }
  return ''
})

// 当前步骤数据
const currentStepData = computed((): StepItem[] => {
  if (testStep.value === 2) {
    if (totalMethods.value === 'step') {
      return currentTotalData.value?.step || []
    }
  } else if (testStep.value === 3) {
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
  if (testStep.value === 2) {
    if (totalMethods.value === 'pic') {
      return currentTotalData.value?.pic || []
    }
  } else if (testStep.value === 3) {
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
  if (testStep.value === 2) {
    return totalMethods.value === 'step'
  }
  if (testStep.value === 3) {
    if (areaMethods.value === 'step') return true
    if (areaMethods.value === 'detail' && pointMethods.value === 'step') return true
  }
  return false
})

// 是否显示图片面板
const showPicPanel = computed(() => {
  if (testStep.value === 2) {
    return totalMethods.value === 'pic'
  }
  if (testStep.value === 3) {
    if (areaMethods.value === 'pic') return true
    if (areaMethods.value === 'detail' && pointMethods.value === 'pic') return true
  }
  return false
})

// ==================== 初始化 ====================

onMounted(async () => {
  // 初始化配置
  await initConfig()
  await initTest()
  
  // 启动 X-Ray 摄像头（带异常处理）
  const xrayDevice = config.value.xrayDevice
  if (xrayDevice >= 0) {
    try {
      const success = await camera.startCamera(xrayDevice)
      if (!success) {
        console.warn('[X-Ray] 摄像头启动返回失败，可能无法正常显示实时画面')
      }
    } catch (err) {
      console.error('[X-Ray] 摄像头启动异常:', err)
      // 不阻断测试流程，但记录错误
    }
  } else {
    console.warn('[X-Ray] 未配置 X-Ray 摄像头设备索引')
  }
  
  // 新测试时，上传初始临时数据让后端 TempTestUnit 有记录
  // 这样即使中途退出，工单状态变为"待继续"后扫码也能找到
  const slotMode = props.slotData.testMode || 'normal'
  if (slotMode === 'normal' && processJson.value) {
    await saveTempProgress()
  }
})

onUnmounted(async () => {
  // 安全停止摄像头（带异常处理）
  try {
    await camera.stopCamera()
  } catch (err) {
    console.warn('[X-Ray] 停止摄像头时出现异常:', err)
  }
})

async function initTest() {
  isLoading.value = true
  
  try {
    const slotMode = props.slotData.testMode || 'normal'
    
    // 调试日志
    console.log('=== XrayTestExecutor initTest ===')
    console.log('slotMode:', slotMode)
    console.log('slotData:', props.slotData)
    console.log('processData:', props.slotData.processData)
    console.log('processData.json:', props.slotData.processData?.json)
    console.log('processData.json.xray:', props.slotData.processData?.json?.xray)
    console.log('tempData:', props.slotData.tempData)
    
    // 根据模式初始化数据
    if (slotMode === 'continue' && props.slotData.tempData?.data?.xray) {
      console.log('使用临时数据')
      processJson.value = JSON.parse(JSON.stringify(props.slotData.tempData.data.xray))
    } else if (props.slotData.processData?.json?.xray) {
      console.log('使用工艺数据')
      processJson.value = JSON.parse(JSON.stringify(props.slotData.processData.json.xray))
    } else {
      console.error('工艺数据为空，尝试查看完整 processData:', props.slotData.processData)
      emit('error', '工艺数据加载失败: 未找到 xray 数据')
      return
    }
    
    // 调试解析后的数据
    console.log('processJson (工作数据):', processJson.value)
    console.log('processJson.total:', processJson.value?.total)
    console.log('processJson.total.step:', processJson.value?.total?.step)
    console.log('processJson.area:', processJson.value?.area)
    
    // 规范化数据结构，确保所有数组都已初始化
    normalizeProcessData()
    
    // 初始化计数
    areaCount.value = processJson.value?.area?.length || 0
    console.log('areaCount:', areaCount.value)
    
    // 初始化报告数据
    initReportJson()
    
  } catch (err) {
    console.error('初始化测试失败:', err)
    emit('error', '初始化测试失败')
  } finally {
    isLoading.value = false
  }
}

/**
 * 规范化工艺数据，确保所有数组都已初始化
 * 避免从服务器下载的数据缺少某些数组字段导致运行时错误
 */
function normalizeProcessData() {
  if (!processJson.value) return
  
  // 规范化 total 数据
  if (processJson.value.total) {
    normalizeTotalData(processJson.value.total)
  }
  
  // 规范化 area 数据
  if (processJson.value.area) {
    for (const area of processJson.value.area) {
      if (area.general) {
        if (area.general.step) normalizeSteps(area.general.step)
        if (area.general.pic) normalizePics(area.general.pic)
      }
      if (area.detail) {
        for (const detail of area.detail) {
          if (detail.step) normalizeSteps(detail.step)
          if (detail.pic) normalizePics(detail.pic)
        }
      }
    }
  }
}

function normalizeTotalData(total: TotalData) {
  if (total.step) normalizeSteps(total.step)
  if (total.pic) normalizePics(total.pic)
  if (!total.stepNote) total.stepNote = []
  if (!total.picNote) total.picNote = []
}

function normalizeSteps(steps: StepItem[]) {
  for (const step of steps) {
    if (step.error && !Array.isArray(step.error.url)) {
      step.error.url = []
    }
    if (step.question && !Array.isArray(step.question.url)) {
      step.question.url = []
    }
    if (step.warn && !Array.isArray(step.warn.url)) {
      step.warn.url = []
    }
  }
}

function normalizePics(pics: PicItem[]) {
  for (const pic of pics) {
    if (!Array.isArray(pic.save)) {
      pic.save = []
    }
  }
}

function initReportJson() {
  const board = props.slotData.board
  reportJson.value = {
    testunit_id: board.testunit_id || board.dev_testunit_id || 0,
    testunit_type: 5,
    board_id: board.board_id || 0,
    board_serialnumber: board.serial || '',
    json: {
      xray: {
        total: { stepList: [], stepNote: [], picList: [], picNote: [] },
        area: []
      }
    }
  } as ReportData
}

// ==================== 导航逻辑 ====================

// 下一步
async function handleNext() {
  if (testStep.value === 2) {
    // 整体检测阶段
    if (totalMethods.value === 'step') {
      if (!validateSteps(currentTotalData.value?.step || [])) return
      totalMethods.value = 'pic'
    } else {
      if (!validatePics(currentTotalData.value?.pic || [])) return
      // 进入区域检测
      testStep.value = 3
      currentArea.value = 1
      resetAreaState()
    }
    return
  }
  
  if (testStep.value === 3) {
    await handleAreaNext()
  }
}

// 区域检测下一步
async function handleAreaNext() {
  if (!processJson.value) return
  
  const areaData = processJson.value.area[currentArea.value - 1]
  if (!areaData) return
  
  pointCount.value = areaData.detail?.length || 0
  
  if (areaMethods.value === 'step') {
    if (!validateSteps(areaData.general.step)) return
    areaMethods.value = 'pic'
  } else if (areaMethods.value === 'pic') {
    if (!validatePics(areaData.general.pic)) return
    areaMethods.value = 'detail'
    currentPoint.value = 1
    pointMethods.value = 'step'
  } else if (areaMethods.value === 'detail') {
    const detailData = areaData.detail[currentPoint.value - 1]
    if (!detailData) return
    
    if (pointMethods.value === 'step') {
      if (!validateSteps(detailData.step)) return
      pointMethods.value = 'pic'
    } else {
      if (!validatePics(detailData.pic)) return
      
      // 移动到下一个点位或区域
      if (currentPoint.value < pointCount.value) {
        currentPoint.value++
        pointMethods.value = 'step'
      } else if (currentArea.value < areaCount.value) {
        currentArea.value++
        resetAreaState()
      } else {
        // 测试完成
        await handleTestComplete()
      }
    }
  }
}

// 上一步
function handlePrevious() {
  if (testStep.value === 2) {
    if (totalMethods.value === 'pic') {
      totalMethods.value = 'step'
    }
  } else if (testStep.value === 3) {
    handleAreaPrevious()
  }
}

// 区域检测上一步
function handleAreaPrevious() {
  if (areaMethods.value === 'step') {
    if (currentArea.value === 1) {
      testStep.value = 2
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

// 跳转到区域最后一个点位
function goToAreaLastPoint() {
  if (!processJson.value) return
  const areaData = processJson.value.area[currentArea.value - 1]
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
  }
  return true
}

function validatePics(pics: PicItem[]): boolean {
  for (const pic of pics) {
    const saveCount = Array.isArray(pic.save) ? pic.save.length : 0
    if (saveCount === 0) {
      ElMessage.warning('请完成所有拍照留存项')
      return false
    }
  }
  return true
}

// ==================== 拍照逻辑 ====================

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

async function handlePicSave(picId: number) {
  const frame = camera.currentFrame.value
  if (!frame) {
    ElMessage.error('无法获取摄像头画面')
    return
  }
  
  const pic = findPic(picId)
  if (!pic) return
  
  // 确保 save 是数组
  if (!Array.isArray(pic.save)) {
    pic.save = []
  }
  
  if (pic.save.length >= 5) {
    ElMessage.warning('最多添加5张图片')
    return
  }
  
  pic.save.push(frame)
}

function findStep(stepId: number): StepItem | null {
  const steps = currentStepData.value
  return steps.find(s => s.id === stepId) || null
}

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
    generateReport()
    
    // 使用 as any 避免复杂类型检查 - 实际数据结构与后端协议一致
    const uploadParams: ReportUploadParams = {
      testunit_id: reportJson.value!.testunit_id || 0,
      serialNumber: reportJson.value!.board_serialnumber || '',
      userId: userInfo.value?.id || 0,
      testType: 5,
      testunit_status: 3,
      file: reportJson.value as any
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

function generateReport() {
  if (!processJson.value || !reportJson.value) return
  
  // 辅助函数：收集 step 中的 error/question/warn 项
  const collectStepLists = (steps: any[]) => {
    const errorList: any[] = []
    const questionList: any[] = []
    const warnList: any[] = []
    
    steps.forEach(s => {
      if (s.error) errorList.push(s)
      if (s.question) questionList.push(s)
      if (s.warn) warnList.push(s)
    })
    
    return { errorList, questionList, warnList }
  }
  
  // 处理 total 部分
  const totalLists = collectStepLists(processJson.value.total.step)
  const totalReport: any = {
    stepList: processJson.value.total.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
    stepNote: processJson.value.total.stepNote || [],
    picList: processJson.value.total.pic.map(p => ({ id: p.id, name: p.name, save: p.save })),
    picNote: processJson.value.total.picNote || []
  }
  if (totalLists.errorList.length > 0) totalReport.errorList = totalLists.errorList
  if (totalLists.questionList.length > 0) totalReport.questionList = totalLists.questionList
  if (totalLists.warnList.length > 0) totalReport.warnList = totalLists.warnList
  
  // 使用 as any 避免复杂类型检查 - 生成的报告格式与原程序一致
  (reportJson.value.json as any).xray = {
    total: totalReport,
    area: processJson.value.area.map(a => {
      // 处理 general 部分
      const generalLists = collectStepLists(a.general.step)
      const generalReport: any = {
        stepList: a.general.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
        stepNote: a.general.stepNote || [],
        picList: a.general.pic.map(p => ({ id: p.id, name: p.name, save: p.save })),
        picNote: a.general.picNote || []
      }
      if (generalLists.errorList.length > 0) generalReport.errorList = generalLists.errorList
      if (generalLists.questionList.length > 0) generalReport.questionList = generalLists.questionList
      if (generalLists.warnList.length > 0) generalReport.warnList = generalLists.warnList
      
      return {
        id: a.id,
        general: generalReport,
        detail: a.detail.map(d => {
          // 处理 detail 部分
          const detailLists = collectStepLists(d.step)
          const detailReport: any = {
            id: d.id,
            name: d.name,
            stepList: d.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
            stepNote: d.stepNote || [],
            picList: d.pic.map(p => ({ id: p.id, name: p.name, save: p.save })),
            picNote: d.picNote || []
          }
          if (detailLists.errorList.length > 0) detailReport.errorList = detailLists.errorList
          if (detailLists.questionList.length > 0) detailReport.questionList = detailLists.questionList
          if (detailLists.warnList.length > 0) detailReport.warnList = detailLists.warnList
          
          return detailReport
        })
      }
    })
  }
}

// 保存临时进度
async function saveTempProgress(): Promise<boolean> {
  const board = props.slotData.board
  const unitId = board.testunit_id || board.dev_testunit_id
  const isDevTest = props.slotData.isDevTest || false
  
  if (!unitId || !processJson.value) {
    console.error('无法保存临时进度: 缺少工单ID或工艺数据')
    return false
  }
  
  const unitType: 0 | 1 = isDevTest ? 1 : 0
  
  try {
    // 构造完整的工艺工作状态
    const workingJson: ProcessJson = {
      xray: processJson.value
    }
    
    // 构造临时数据结构
    const tempData: TempOrderData = {
      testunit_id: isDevTest ? undefined : unitId,
      dev_testunit_id: isDevTest ? unitId : undefined,
      testunit_type: 5,
      board_id: board.board_id || 0,
      board_serialnumber: board.serial || '',
      data: workingJson  // 当前工艺工作状态
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

// 暂停退出 - 根据模式处理退出逻辑
async function handlePauseExit() {
  const testMode = props.slotData.testMode
  
  // 打回/疑问模式不允许暂存
  if (testMode === 'feedback' || testMode === 'question') {
    const message = testMode === 'feedback' 
      ? '重新检测无法暂存，是否退出？' 
      : '疑问工单检测无法暂存，是否退出？'
    
    try {
      await ElMessageBox.alert(message, '确认退出测试', {
        confirmButtonText: '直接退出'
      })
      emit('exit')
    } catch {
      // 用户取消
    }
    return
  }
  
  // 正常模式: 委托给父组件处理保存逻辑
  emit('request-exit', saveTempProgress)
}

// ==================== 历史报告 ====================

/** 获取历史报告列表 */
async function loadHistoryReports() {
  const board = props.slotData.board
  if (!board) return
  
  isLoadingHistory.value = true
  try {
    const isTemp = board.testunit_type === 1
    
    // 调试日志：打印 board 数据
    console.log('[历史报告] board 数据:', JSON.stringify({
      testunit_type: board.testunit_type,
      board_id: board.board_id,
      prod_board_id: board.prod_board_id,
      temp_board_id: board.temp_board_id,
    }))
    
    let result
    if (isTemp) {
      // 临时工单：使用 prod_board_id 或 temp_board_id
      const prodBoardId = board.prod_board_id
      const tempBoardId = board.temp_board_id
      
      // 如果两个 ID 都没有，跳过查询
      if (!prodBoardId && !tempBoardId) {
        console.warn('[历史报告] 临时工单缺少 prod_board_id 和 temp_board_id')
        historyReportList.value = []
        return
      }
      
      result = await reportApi.getHistoryList({
        mode: 1,
        prodBoardId: prodBoardId,
        tempBoardId: tempBoardId
      }, getAuthHeaders())
    } else {
      // 正式工单：使用 board_id
      if (!board.board_id) {
        console.warn('[历史报告] 正式工单缺少 board_id')
        historyReportList.value = []
        return
      }
      result = await reportApi.getHistoryList({
        mode: 0,
        boardId: board.board_id
      }, getAuthHeaders())
    }
    
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
  // report.mode: 0=正式报告, 1=临时报告
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

// ==================== 快捷导航 ====================

/** 生成快捷导航树数据 */
function generateQuickTreeData() {
  if (!processJson.value) return
  
  quickTreeData.value = []
  
  // 根节点
  const root: QuickTreeNode = {
    label: 'X-Ray检测',
    children: []
  }
  quickTreeData.value.push(root)
  
  // 整体检测
  root.children!.push({
    label: '整体检测',
    children: [
      { label: '检测', disabled: true },
      { label: '留存', disabled: true }
    ]
  })
  
  // 区域检测
  const areas = processJson.value.area
  if (areas) {
    for (let i = 0; i < areas.length; i++) {
      const areaNode: QuickTreeNode = {
        label: `区域${i + 1}`,
        index: i,
        children: [
          {
            label: '通用检测',
            children: [
              { label: '检测', disabled: true },
              { label: '留存', disabled: true }
            ]
          },
          {
            label: '具体检测',
            children: []
          }
        ]
      }
      
      // 点位
      for (let j = 0; j < areas[i].detail.length; j++) {
        areaNode.children![1].children!.push({
          label: areas[i].detail[j].name,
          index: j,
          children: [
            { label: '检测', disabled: true },
            { label: '留存', disabled: true }
          ]
        })
      }
      
      root.children!.push(areaNode)
    }
  }
}

/** 判断快捷导航禁用状态 */
function judgeQuickStatus() {
  if (!processJson.value) return
  
  const xrayData = processJson.value
  
  // 检查整体
  if (xrayData.total) {
    const stepDisabled = checkStepIncomplete(xrayData.total.step)
    const picDisabled = checkPicIncomplete(xrayData.total.pic)
    if (quickTreeData.value[0]?.children?.[0]?.children) {
      quickTreeData.value[0].children[0].children[0].disabled = stepDisabled
      quickTreeData.value[0].children[0].children[1].disabled = picDisabled
    }
  }
  
  // 检查区域
  if (xrayData.area) {
    for (let i = 0; i < xrayData.area.length; i++) {
      const area = xrayData.area[i]
      // 通用检测
      const generalStepDisabled = checkStepIncomplete(area.general?.step)
      const generalPicDisabled = checkPicIncomplete(area.general?.pic)
      if (quickTreeData.value[0]?.children?.[i + 1]?.children?.[0]?.children) {
        quickTreeData.value[0].children[i + 1].children![0].children![0].disabled = generalStepDisabled
        quickTreeData.value[0].children[i + 1].children![0].children![1].disabled = generalPicDisabled
      }
      
      // 具体检测
      for (let j = 0; j < area.detail.length; j++) {
        const detail = area.detail[j]
        const detailStepDisabled = checkStepIncomplete(detail.step)
        const detailPicDisabled = checkPicIncomplete(detail.pic)
        if (quickTreeData.value[0]?.children?.[i + 1]?.children?.[1]?.children?.[j]?.children) {
          quickTreeData.value[0].children[i + 1].children![1].children![j].children![0].disabled = detailStepDisabled
          quickTreeData.value[0].children[i + 1].children![1].children![j].children![1].disabled = detailPicDisabled
        }
      }
    }
  }
}

/** 检查检测项是否未完成 */
function checkStepIncomplete(steps?: StepItem[]): boolean {
  if (!steps || steps.length === 0) return true
  
  for (const step of steps) {
    if (step.pass === 0) return true
    if (step.pass === 2 && (!step.error?.url || step.error.url.length === 0 || !step.error?.desc)) return true
    if (step.pass === 3 && (!step.question?.url || step.question.url.length === 0 || !step.question?.desc)) return true
    if (step.pass === 4) {
      if (!step.error?.url || step.error.url.length === 0 || !step.error?.desc) return true
      if (!step.question?.url || step.question.url.length === 0 || !step.question?.desc) return true
    }
    if (step.warn && (!step.warn.url || step.warn.url.length === 0 || !step.warn.desc)) return true
  }
  return false
}

/** 检查留存项是否未完成 */
function checkPicIncomplete(pics?: PicItem[]): boolean {
  if (!pics || pics.length === 0) return true
  
  for (const pic of pics) {
    if (!pic.save || pic.save.length === 0) return true
  }
  return false
}

/** 跳转到指定步骤 */
function goToStep(node: any) {
  if (!processJson.value) return
  
  const level = node.level
  const label = node.data.label
  
  if (level === 3) {
    // 整体检测 - 检测/留存
    testStep.value = 2
    currentArea.value = 0
    areaMethods.value = 'step'
    pointMethods.value = 'step'
    currentPoint.value = 0
    pointCount.value = 0
    
    if (label === '检测') {
      totalMethods.value = 'step'
    } else {
      totalMethods.value = 'pic'
    }
  } else if (level === 4) {
    // 区域通用检测 - 检测/留存
    testStep.value = 3
    totalMethods.value = 'pic'
    pointMethods.value = 'step'
    currentPoint.value = 0
    
    const areaIndex = node.parent?.parent?.data?.index ?? 0
    currentArea.value = areaIndex + 1
    pointCount.value = processJson.value.area[areaIndex]?.detail?.length || 0
    
    if (label === '检测') {
      areaMethods.value = 'step'
    } else {
      areaMethods.value = 'pic'
    }
  } else if (level === 5) {
    // 具体点位检测 - 检测/留存
    testStep.value = 3
    totalMethods.value = 'pic'
    areaMethods.value = 'detail'
    
    const areaIndex = node.parent?.parent?.parent?.data?.index ?? 0
    const pointIndex = node.parent?.data?.index ?? 0
    currentArea.value = areaIndex + 1
    currentPoint.value = pointIndex + 1
    pointCount.value = processJson.value.area[areaIndex]?.detail?.length || 0
    
    if (label === '检测') {
      pointMethods.value = 'step'
    } else {
      pointMethods.value = 'pic'
    }
  }
  
  showQuickNav.value = false
}

/** 打开快捷导航 */
function handleQuickNavOpen() {
  generateQuickTreeData()
  judgeQuickStatus()
  showQuickNav.value = true
}

// ==================== 备注功能 ====================

/** 打开备注编辑 */
function openNoteEdit(areaId: number, pointId: number) {
  // 根据当前状态判断备注类型
  if (testStep.value === 2) {
    // 整体检测
    noteForm.type = 'total'
    noteForm.stepType = totalMethods.value === 'step' ? 'step' : 'pic'
  } else {
    // 区域检测
    noteForm.type = 'area'
    if (areaMethods.value === 'step' || areaMethods.value === 'pic') {
      noteForm.areaType = 'total'
      noteForm.stepType = areaMethods.value === 'step' ? 'step' : 'pic'
    } else {
      noteForm.areaType = 'detail'
      noteForm.stepType = pointMethods.value === 'step' ? 'step' : 'pic'
    }
  }
  
  noteForm.areaId = areaId
  noteForm.pointId = pointId
  noteVisible.value = true
}

/** 关闭备注编辑 */
function closeNoteEdit() {
  noteForm.value = ''
  noteForm.type = ''
  noteForm.stepType = ''
  noteForm.areaType = ''
  noteForm.areaId = 0
  noteForm.pointId = 0
  noteVisible.value = false
}

/** 添加备注 */
function addNote() {
  if (!noteForm.value.trim()) {
    ElMessage.warning('请输入备注内容')
    return
  }
  
  if (!processJson.value) return
  
  if (noteForm.type === 'total') {
    // 整体备注
    if (noteForm.stepType === 'step') {
      if (!processJson.value.total.stepNote) processJson.value.total.stepNote = []
      processJson.value.total.stepNote.push(noteForm.value)
    } else {
      if (!processJson.value.total.picNote) processJson.value.total.picNote = []
      processJson.value.total.picNote.push(noteForm.value)
    }
  } else if (noteForm.type === 'area') {
    const areaIndex = (noteForm.areaId || currentArea.value) - 1
    if (areaIndex < 0 || areaIndex >= processJson.value.area.length) return
    
    const area = processJson.value.area[areaIndex]
    
    if (noteForm.areaType === 'total') {
      // 区域通用备注
      if (!area.general) area.general = { step: [], pic: [] }
      if (noteForm.stepType === 'step') {
        if (!area.general.stepNote) area.general.stepNote = []
        area.general.stepNote.push(noteForm.value)
      } else {
        if (!area.general.picNote) area.general.picNote = []
        area.general.picNote.push(noteForm.value)
      }
    } else {
      // 点位备注
      const pointIndex = (noteForm.pointId || currentPoint.value) - 1
      if (pointIndex < 0 || pointIndex >= area.detail.length) return
      
      const detail = area.detail[pointIndex]
      if (noteForm.stepType === 'step') {
        if (!detail.stepNote) detail.stepNote = []
        detail.stepNote.push(noteForm.value)
      } else {
        if (!detail.picNote) detail.picNote = []
        detail.picNote.push(noteForm.value)
      }
    }
  }
  
  ElMessage.success('备注添加成功')
  closeNoteEdit()
}
</script>

<template>
  <div class="xray-executor">
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
          <div class="info-icon">
            <Icon icon="mdi:radioactive" />
          </div>
          <div class="info-content">
            <span class="info-title">X-Ray 检测</span>
            <span class="info-meta">
              {{ props.slotData.board?.boardmodel }} · S/N: {{ props.slotData.board?.serial }}
            </span>
          </div>
        </div>
        
        <div class="step-indicator">
          <Icon icon="mdi:progress-clock" class="step-icon" />
          <span class="step-title">{{ currentStepTitle }}</span>
        </div>
      </div>
      
      <div class="header-right">
        <!-- 进度指示 -->
        <div class="progress-indicator">
          <span>夹具 {{ props.fixtureId }}</span>
          <span class="separator">·</span>
          <span>板 {{ props.currentIndex + 1 }}/{{ props.totalBoards }}</span>
          <span class="separator">|</span>
          <span v-if="currentArea > 0">区域 {{ currentArea }}/{{ areaCount }}</span>
          <span v-else>整体</span>
          <span v-if="currentPoint > 0" class="separator">|</span>
          <span v-if="currentPoint > 0">点位 {{ currentPoint }}/{{ pointCount }}</span>
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
                  <span class="history-date">{{ formatReportDate((report as any).date || (report as any).report_time) }}</span>
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

    <!-- 主内容区 -->
    <div class="executor-content">
      <!-- 摄像头区域 (55%) -->
      <div class="camera-section">
        <div class="camera-header">
          <Icon icon="mdi:television" class="section-icon" />
          <span>X-Ray 实时画面</span>
        </div>
        <div class="camera-view">
          <img 
            v-if="camera.currentFrame.value" 
            :src="camera.currentFrame.value" 
            alt="X-Ray画面"
          />
          <div v-else class="camera-placeholder">
            <Icon icon="mdi:camera-off" />
            <span>X-Ray 设备加载中...</span>
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
          :mode="props.slotData.testMode === 'feedback' ? 'feedback' : props.slotData.testMode === 'question' ? 'question' : 'normal'"
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

        <!-- 空状态 - 显示调试信息 -->
        <div v-if="!(showStepPanel && currentStepData.length > 0) && !(showPicPanel && currentPicData.length > 0)" class="empty-panel">
          <Icon icon="mdi:clipboard-check" />
          <span v-if="isLoading">正在加载工艺数据...</span>
          <span v-else-if="!processJson">未找到工艺数据</span>
          <span v-else-if="!processJson.total">工艺数据缺少 total 字段</span>
          <span v-else-if="showStepPanel && currentStepData.length === 0">暂无检测步骤</span>
          <span v-else-if="showPicPanel && currentPicData.length === 0">暂无留存项</span>
          <span v-else>准备就绪</span>
        </div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="executor-footer">
      <div class="footer-left">
        <!-- 快捷导航 -->
        <div class="quick-nav-dropdown">
          <button class="btn btn-ghost quick-nav-btn" @click="handleQuickNavOpen">
            <Icon icon="mdi:format-list-bulleted" />
          </button>
          
          <!-- 下拉面板 -->
          <div v-if="showQuickNav" class="quick-nav-panel">
            <div class="quick-nav-header">
              <span>快捷导航</span>
              <button class="btn-icon" @click="showQuickNav = false">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div class="quick-nav-content">
              <template v-for="(side, sideIdx) in quickTreeData" :key="sideIdx">
                <div class="nav-group">
                  <div class="nav-group-title">{{ side.label }}</div>
                  <template v-for="(item, itemIdx) in side.children" :key="itemIdx">
                    <!-- 整体检测 -->
                    <template v-if="item.label === '整体检测'">
                      <div class="nav-item-group">
                        <span class="nav-item-title">{{ item.label }}</span>
                        <div class="nav-item-actions">
                          <button 
                            v-for="(child, cIdx) in item.children" 
                            :key="cIdx"
                            class="nav-btn"
                            :class="{ disabled: child.disabled }"
                            :disabled="child.disabled"
                            @click="goToStep({ level: 3, data: child, parent: { data: item, parent: { data: side } } })"
                          >
                            {{ child.label }}
                          </button>
                        </div>
                      </div>
                    </template>
                    <!-- 区域检测 -->
                    <template v-else>
                      <div class="nav-area-group">
                        <div class="nav-area-title">{{ item.label }}</div>
                        <template v-for="(sub, subIdx) in item.children" :key="subIdx">
                          <!-- 通用检测 -->
                          <template v-if="sub.label === '通用检测'">
                            <div class="nav-item-group sub">
                              <span class="nav-item-title">{{ sub.label }}</span>
                              <div class="nav-item-actions">
                                <button 
                                  v-for="(child, cIdx) in sub.children" 
                                  :key="cIdx"
                                  class="nav-btn"
                                  :class="{ disabled: child.disabled }"
                                  :disabled="child.disabled"
                                  @click="goToStep({ level: 4, data: child, parent: { data: sub, parent: { data: item, parent: { data: side } } } })"
                                >
                                  {{ child.label }}
                                </button>
                              </div>
                            </div>
                          </template>
                          <!-- 具体检测 -->
                          <template v-else>
                            <div class="nav-detail-group">
                              <div class="nav-detail-title">{{ sub.label }}</div>
                              <div v-for="(point, pIdx) in sub.children" :key="pIdx" class="nav-item-group point">
                                <span class="nav-item-title">{{ point.label }}</span>
                                <div class="nav-item-actions">
                                  <button 
                                    v-for="(child, cIdx) in point.children" 
                                    :key="cIdx"
                                    class="nav-btn"
                                    :class="{ disabled: child.disabled }"
                                    :disabled="child.disabled"
                                    @click="goToStep({ level: 5, data: child, parent: { data: point, parent: { data: sub, parent: { data: item, parent: { data: side } } } } })"
                                  >
                                    {{ child.label }}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </template>
                        </template>
                      </div>
                    </template>
                  </template>
                </div>
              </template>
            </div>
          </div>
        </div>
        
        <button 
          class="btn btn-outline" 
          @click="handlePrevious"
          :disabled="testStep === 2 && totalMethods === 'step'"
        >
          <Icon icon="mdi:arrow-left" />
          上一步
        </button>
      </div>
      
      <div class="footer-right">
        <!-- 备注按钮 -->
        <button class="btn btn-ghost" @click="openNoteEdit(currentArea, currentPoint)">
          <Icon icon="mdi:note-edit" />
          备注
        </button>
        
        <button class="btn btn-primary" @click="handleNext">
          下一步
          <Icon icon="mdi:arrow-right" />
        </button>
      </div>
    </div>
    
    <!-- 备注对话框 -->
    <Teleport to="body">
      <div v-if="noteVisible" class="note-dialog-overlay" @click.self="closeNoteEdit">
        <div class="note-dialog">
          <div class="note-dialog-header">
            <span>添加备注</span>
            <button class="btn-icon" @click="closeNoteEdit">
              <Icon icon="mdi:close" />
            </button>
          </div>
          <div class="note-dialog-body">
            <textarea 
              v-model="noteForm.value"
              placeholder="请输入备注内容..."
              rows="6"
            ></textarea>
          </div>
          <div class="note-dialog-footer">
            <button class="btn btn-ghost" @click="closeNoteEdit">取消</button>
            <button class="btn btn-primary" @click="addNote">添加</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 容器 */
.xray-executor {
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
  color: rgb(245, 158, 11);
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

.header-exit-btn {
  color: var(--color-text-secondary);
}

.header-exit-btn:hover {
  color: var(--color-accent-red);
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
  background: linear-gradient(135deg, rgb(251, 191, 36) 0%, rgb(245, 158, 11) 100%);
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
  width: 100%;
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
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  flex-shrink: 0;



































































































































































































































































































































































































  
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

.footer-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* 快捷导航 */
.quick-nav-dropdown {
  position: relative;
}

.quick-nav-btn {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  font-size: 1.25rem;
}

.quick-nav-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 200;
  width: 360px;
  max-height: 500px;
  margin-bottom: 0.5rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.quick-nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  font-weight: 500;
}

.quick-nav-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

.nav-group {
  margin-bottom: 1rem;
}

.nav-group:last-child {
  margin-bottom: 0;
}

.nav-group-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(96, 165, 250);
  padding: 0.5rem 0.75rem;
  background: rgba(96, 165, 250, 0.1);
  border-radius: 0.375rem;
  margin-bottom: 0.5rem;
}

.nav-item-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.375rem;
  margin-bottom: 0.375rem;
}

.nav-item-group.sub {
  margin-left: 1rem;
}

.nav-item-group.point {
  margin-left: 2rem;
  background: rgba(255, 255, 255, 0.02);
}

.nav-item-title {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.nav-item-actions {
  display: flex;
  gap: 0.375rem;
}

.nav-btn {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid var(--color-border);
  background: transparent;
  color: rgb(96, 165, 250);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(96, 165, 250, 0.1);
}

.nav-btn.disabled,
.nav-btn:disabled {
  color: var(--color-text-secondary);
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-area-group {
  margin-bottom: 0.5rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--color-border);
}

.nav-area-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-primary);
  padding: 0.375rem 0.5rem;
  margin-bottom: 0.25rem;
}

.nav-detail-group {
  margin-left: 0.5rem;
  padding-left: 0.5rem;
  border-left: 1px dashed var(--color-border);
}

.nav-detail-title {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  padding: 0.25rem 0.5rem;
  font-style: italic;
}

/* 备注对话框 */
.note-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.note-dialog {
  width: 90%;
  max-width: 500px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.note-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  font-weight: 500;
}

.note-dialog-body {
  padding: 1.25rem;
}

.note-dialog-body textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  resize: none;
}

.note-dialog-body textarea:focus {
  outline: none;
  border-color: rgb(96, 165, 250);
}

.note-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: var(--color-bg-tertiary);
  border-top: 1px solid var(--color-border);
}

.btn-icon {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-primary);
}
</style>
