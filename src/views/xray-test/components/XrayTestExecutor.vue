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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import { useCamera } from '@/composables/useCamera'
import { useConfig } from '@/composables/useConfig'
import { StepProcess, PicProcess, ReportPreviewDialog } from '@/components/visual-test'
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
const reportPreviewVisible = ref(false)
const reportPreviewData = ref<ReportData | null>(null)
const reportPreviewMode = ref<'prod' | 'temp'>('prod')
const isLoadingReport = ref(false)

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
  
  // 启动 X-Ray 摄像头
  const xrayDevice = config.value.xrayDevice
  if (xrayDevice >= 0) {
    await camera.startCamera(xrayDevice)
  } else {
    console.warn('未配置 X-Ray 摄像头')
  }
  
  // 新测试时，上传初始临时数据让后端 TempTestUnit 有记录
  // 这样即使中途退出，工单状态变为"待继续"后扫码也能找到
  const slotMode = props.slotData.testMode || 'normal'
  if (slotMode === 'normal' && processJson.value) {
    await saveTempProgress()
  }
})

onUnmounted(() => {
  camera.stopCamera()
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
  
  // 使用 as any 避免复杂类型检查 - 生成的报告格式与原程序一致
  (reportJson.value.json as any).xray = {
    total: {
      stepList: processJson.value.total.step.map(s => ({ id: s.id, name: s.name, pass: s.pass })),
      stepNote: processJson.value.total.stepNote || [],
      picList: processJson.value.total.pic.map(p => ({ id: p.id, name: p.name, save: p.save })),
      picNote: processJson.value.total.picNote || []
    },
    area: processJson.value.area.map(a => ({
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
    const boardId = board.board_id
    const isTemp = board.testunit_type === 1
    
    let result
    if (isTemp) {
      // 临时工单：查询 mode=1
      result = await reportApi.getHistoryList({
        mode: 1,
        prodBoardId: boardId,
        tempBoardId: boardId
      }, getAuthHeaders())
    } else {
      // 正式工单：查询 mode=0
      result = await reportApi.getHistoryList({
        mode: 0,
        boardId: boardId
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

/** 查看历史报告 */
async function handleViewHistoryReport(report: TestReport) {
  isLoadingReport.value = true
  reportPreviewVisible.value = true
  
  try {
    // report.mode: 0=正式报告, 1=临时报告
    const reportMode = (report as any).mode ?? 0
    const unitId = (report as any).unit_id ?? report.testunit_id ?? report.dev_testunit_id
    
    if (!unitId) {
      ElMessage.error('报告ID无效')
      return
    }
    
    const result = await reportApi.download(reportMode, unitId, getAuthHeaders())
    
    if (result.success && result.data) {
      reportPreviewData.value = result.data
      reportPreviewMode.value = reportMode === 1 ? 'temp' : 'prod'
    } else {
      ElMessage.error('获取报告详情失败')
      reportPreviewVisible.value = false
    }
  } catch (err) {
    console.error('获取报告详情失败:', err)
    ElMessage.error('获取报告详情失败')
    reportPreviewVisible.value = false
  } finally {
    isLoadingReport.value = false
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
      <button 
        class="btn btn-outline" 
        @click="handlePrevious"
        :disabled="testStep === 2 && totalMethods === 'step'"
      >
        <Icon icon="mdi:arrow-left" />
        上一步
      </button>
      
      <button class="btn btn-primary" @click="handleNext">
        下一步
        <Icon icon="mdi:arrow-right" />
      </button>
    </div>
    
    <!-- 报告预览对话框 -->
    <ReportPreviewDialog
      v-model:visible="reportPreviewVisible"
      :data="reportPreviewData"
      :mode="reportPreviewMode"
      :loading="isLoadingReport"
    />
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
  color: var(--color-error);
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
  justify-content: center;
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
</style>
