<script setup lang="ts">
/**
 * X-Ray 测试页面
 * 
 * 实现完整测试流程：
 * 1. 设备检测 -> 2. 扫描夹具 -> 3. 扫描电路板 -> 4. 批量下载数据 -> 5. 逐板执行测试
 * 
 * 工单状态处理（每块电路板）：
 * - status=1 新工单: 下载工艺 -> 开始测试
 * - status=2 待继续: 下载临时数据 -> 继续测试
 * - status=4 待重做: 下载工艺+反馈+报告 -> 反馈测试
 * - status=8 疑问工单: 下载工艺+疑问+报告 -> 疑问测试
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import { useScanner } from '@/composables/useScanner'
import { useCamera } from '@/composables/useCamera'
import { useLayout } from '@/composables/useLayout'
import { orderApi, type TestUnit, OrderStatus, OrderType } from '@/services/order'
import { processApi, type ProcessData, type TempOrderData, type FeedbackData, type QuestionData } from '@/services/process'
import { reportApi, type TestReport, type ReportData } from '@/services/report'
import { startWorktime, stopWorktime } from '@/services/worktime'
import { parseFeedbackTargets, parseQuestionTargets, parseTempTargetIds, type TargetItem } from '@/utils/feedbackQuestion'

// 导入公共组件
import { DeviceCheckOverlay, HistoryReportPanel, DownloadProgress } from '@/components/visual-test'

// 导入测试执行组件
import XrayTestExecutor from './components/XrayTestExecutor.vue'
import TempTestExecutor from '../visual-inspection/components/tests/TempTestExecutor.vue'
import {useWindow} from "@/composables/useWindow.ts";

// ==================== 类型定义 ====================

// 测试模式
type TestMode = 'normal' | 'continue' | 'feedback' | 'question'

// 夹具槽位
interface FixturePosition {
  id: number
  status: 0 | 1 | 2 | 3 // 0=空, 1=选中, 2=已绑定, 3=测试完成
  board?: TestUnit
  // 工艺/临时/反馈/疑问数据（每个槽位独立）
  processData?: ProcessData
  tempData?: TempOrderData
  feedbackData?: FeedbackData
  questionData?: QuestionData
  feedbackReport?: ReportData
  questionReport?: ReportData
  testMode?: TestMode
  isDevTest?: boolean
}

// ==================== 状态定义 ====================

const { userInfo, getAuthHeaders } = useAuth()
const scanner = useScanner()
const camera = useCamera()
const { enterEditMode, exitEditMode } = useLayout()
const {openReportPreview} = useWindow()

// 页面阶段: detect(设备检测) -> ready(准备) -> selecting(选择电路板) -> testing(测试中) -> selecting(循环)
type PagePhase = 'detect' | 'ready' | 'selecting' | 'testing'
const phase = ref<PagePhase>('detect')

// 监听 phase 变化，在测试和选择阶段隐藏侧边栏
watch(phase, (newPhase) => {
  if (newPhase === 'testing' || newPhase === 'selecting') {
    enterEditMode()
  } else {
    exitEditMode()
  }
})

// 设备检测状态
const deviceCheckStatus = ref<'checking' | 'success' | 'error'>('checking')
const deviceErrorMsg = ref('')
const scannerOk = ref(false)
const cameraOk = ref(false)

// 夹具状态
const fixtureScanned = ref(false)
const fixtureId = ref('')
const positionList = ref<FixturePosition[]>([])

// 已添加的电路板
const addedBoards = ref<TestUnit[]>([])

// 历史报告
const historyReports = ref<TestReport[]>([])
const showHistory = ref(false)
const isLoadingHistory = ref(false)

// 下载状态
const isDownloading = ref(false)
const downloadProgress = ref(0)
const downloadTotal = ref(0)
const downloadText = ref('正在下载工艺数据...')

// 测试状态
const isTesting = ref(false)
const currentTestIndex = ref(0)  // 当前测试的电路板索引
const currentTestBoard = ref<FixturePosition | null>(null)  // 当前测试的槽位


// 提示消息
const toastMessage = ref('')
const toastType = ref<'error' | 'success' | 'info'>('info')
const showToast = ref(false)

// ==================== 计算属性 ====================

const showDeviceOverlay = computed(() => phase.value === 'detect')

// 当前选中的位置
const selectedPosition = computed(() => {
  return positionList.value.find(p => p.status === 1) || null
})

// 扫描提示文本
const scanHintText = computed(() => {
  if (!fixtureScanned.value) return '请扫描夹具二维码'
  if (selectedPosition.value) return `槽位 ${selectedPosition.value.id}: 请扫描电路板`
  return '所有槽位已填满'
})

const canStartTest = computed(() => {
  return fixtureScanned.value && addedBoards.value.length > 0
})

const boundPositionCount = computed(() => {
  return positionList.value.filter(p => p.status === 2 || p.status === 3).length
})

// ==================== 设备检测 ====================

async function checkDevices() {
  deviceCheckStatus.value = 'checking'
  deviceErrorMsg.value = ''
  scannerOk.value = false
  cameraOk.value = false

  try {
    scannerOk.value = await scanner.checkScanner()
  } catch {
    scannerOk.value = false
  }

  try {
    const cameras = await camera.getDeviceList()
    cameraOk.value = cameras.length > 0
  } catch {
    cameraOk.value = false
  }

  if (scannerOk.value && cameraOk.value) {
    deviceCheckStatus.value = 'success'
  } else {
    deviceCheckStatus.value = 'error'
    const errors = []
    if (!scannerOk.value) errors.push('扫码枪异常')
    if (!cameraOk.value) errors.push('摄像头异常')
    deviceErrorMsg.value = errors.join('，')
  }
}

function enterMainInterface() {
  phase.value = 'ready'
  startScanner()
}

// ==================== 扫码处理 ====================

async function startScanner() {
  await scanner.startScanning(handleScanData)
}

async function stopScanner() {
  await scanner.stopScanning()
}

// 显示提示消息
function showMessage(msg: string, type: 'error' | 'success' | 'info' = 'info') {
  toastMessage.value = msg
  toastType.value = type
  showToast.value = true
  setTimeout(() => { showToast.value = false }, 2500)
}

// 下载进度回调
function onDownloadProgress(loaded: number, total: number) {
  downloadProgress.value = loaded
  downloadTotal.value = total
}

// 处理扫描数据
function handleScanData(data: string) {
  console.log('扫描到:', data, '夹具已扫:', fixtureScanned.value)

  if (!fixtureScanned.value) {
    handleFixtureScan(data)
  } else {
    // 判断是位置码还是电路板码
    if (data.length === 1 && /^\d$/.test(data)) {
      handlePositionScan(parseInt(data))
    } else {
      handleBoardScan(data)
    }
  }
}

// 处理夹具扫描
function handleFixtureScan(data: string) {
  const lastChar = data[data.length - 1]
  const slotCount = parseInt(lastChar)

  if (isNaN(slotCount) || slotCount < 1 || slotCount > 10) {
    initFixture(data, 4)
  } else {
    const id = data.slice(0, -1) || data
    initFixture(id, slotCount)
  }
}

// 初始化夹具
function initFixture(id: string, slotCount: number) {
  fixtureId.value = id
  positionList.value = []

  // 逐个添加位置（带动画效果），第一个自动选中
  for (let i = 1; i <= slotCount; i++) {
    setTimeout(() => {
      positionList.value.push({
        id: i,
        status: i === 1 ? 1 : 0 // 第一个槽位自动选中
      })
    }, 80 * i)
  }

  fixtureScanned.value = true
  showMessage(`夹具已识别，共 ${slotCount} 个槽位`, 'success')
}

// 处理位置扫描
function handlePositionScan(posId: number) {
  const pos = positionList.value.find(p => p.id === posId)
  if (!pos) {
    showMessage(`槽位 ${posId} 不存在`, 'error')
    return
  }

  if (pos.status === 2) {
    showMessage(`槽位 ${posId} 已绑定电路板`, 'error')
    return
  }

  if (pos.status === 3) {
    showMessage(`槽位 ${posId} 已完成测试`, 'info')
    return
  }

  selectSlot(pos)
}

// 选择槽位
function selectSlot(pos: FixturePosition) {
  // 取消之前选中的位置
  positionList.value.forEach(p => {
    if (p.status === 1) p.status = 0
  })
  pos.status = 1
}

// 自动选择下一个空槽位
function selectNextEmptySlot() {
  const emptySlot = positionList.value.find(p => p.status === 0)
  if (emptySlot) {
    emptySlot.status = 1
  }
}

// 处理电路板扫描
async function handleBoardScan(serial: string) {
  // 检查是否已添加
  const alreadyAdded = positionList.value.some(p => p.board?.serial === serial)
  if (alreadyAdded) {
    showMessage('该电路板已添加', 'error')
    return
  }

  // 检查是否有选中的位置
  const selectedPos = positionList.value.find(p => p.status === 1)
  if (!selectedPos) {
    showMessage('没有可用槽位', 'error')
    return
  }

  // 查询工单
  const response = await orderApi.getOrderBySerial(serial, getAuthHeaders())
  if (!response.success || !response.data || response.data.length === 0) {
    showMessage('未找到该电路板的工单', 'error')
    return
  }

  // 找到 X-Ray 测试工单
  const xrayOrder = response.data.find(o => o.process_type === 'X-Ray测试')
  if (!xrayOrder) {
    showMessage('该电路板无 X-Ray 测试工单', 'error')
    return
  }

  // 绑定到选中的位置
  selectedPos.board = xrayOrder
  selectedPos.status = 2
  selectedPos.isDevTest = xrayOrder.testunit_type === OrderType.Temporary
  addedBoards.value.push(xrayOrder)

  // 确定测试模式
  const status = selectedPos.isDevTest
    ? xrayOrder.dev_testunit_status
    : xrayOrder.testunit_status
  const statusStr = String(status)

  switch (statusStr) {
    case OrderStatus.New:
      selectedPos.testMode = 'normal'
      break
    case OrderStatus.Testing:
      selectedPos.testMode = 'continue'
      break
    case OrderStatus.Feedback:
      selectedPos.testMode = 'feedback'
      break
    case OrderStatus.Question:
      selectedPos.testMode = 'question'
      break
    default:
      selectedPos.testMode = 'normal'
  }

  showMessage(`槽位 ${selectedPos.id} 已绑定 [${getStatusText(status)}]`, 'success')

  // 查询该电路板的历史报告并追加
  const hasBoardId = xrayOrder.board_id != null || xrayOrder.prod_board_id != null || xrayOrder.temp_board_id != null
  if (hasBoardId) {
    loadBoardHistory(xrayOrder)
  }

  // 自动选择下一个空槽位
  await nextTick()
  selectNextEmptySlot()
}

// ==================== 夹具操作 ====================

function resetFixture() {
  fixtureScanned.value = false
  fixtureId.value = ''
  positionList.value = []
  addedBoards.value = []
  historyReports.value = []
  currentTestIndex.value = 0
  currentTestBoard.value = null
}

function resetPosition(pos: FixturePosition) {
  if (pos.board) {
    const index = addedBoards.value.findIndex(b =>
      (b.testunit_id && b.testunit_id === pos.board?.testunit_id) ||
      (b.dev_testunit_id && b.dev_testunit_id === pos.board?.dev_testunit_id)
    )
    if (index > -1) {
      addedBoards.value.splice(index, 1)
    }
  }

  // 重置槽位数据
  pos.status = 0
  pos.board = undefined
  pos.processData = undefined
  pos.tempData = undefined
  pos.feedbackData = undefined
  pos.questionData = undefined
  pos.feedbackReport = undefined
  pos.questionReport = undefined
  pos.testMode = undefined
  pos.isDevTest = undefined

  // 如果没有选中的槽位，选中这个
  const hasSelected = positionList.value.some(p => p.status === 1)
  if (!hasSelected) {
    pos.status = 1
  }
}

function selectPosition(pos: FixturePosition) {
  if (pos.status === 2 || pos.status === 3) return
  selectSlot(pos)
}

// ==================== 测试流程 ====================

/**
 * 开始批量测试 - 进入电路板选择页面
 * 参考原程序 ScanBoard.vue startXrayTest 和 XrayTest.vue 的选择流程
 */
async function startTest() {
  if (!canStartTest.value) return

  await stopScanner()

  // 获取所有已绑定的槽位
  const boundPositions = positionList.value.filter(p => p.status === 2)

  // 先批量下载所有工艺数据
  isDownloading.value = true
  downloadText.value = '正在下载工艺数据...'

  const total = boundPositions.length

  for (let i = 0; i < total; i++) {
    const pos = boundPositions[i]
    if (!pos.board) continue

    downloadText.value = `正在下载 ${i + 1}/${total}: ${pos.board.serial}`

    try {
      await downloadBoardData(pos)
    } catch (err) {
      console.error(`下载 ${pos.board.serial} 数据失败:`, err)
    }

    // 更新进度
    downloadProgress.value = Math.round(((i + 1) / total) * 100)
    downloadTotal.value = 100
  }

  isDownloading.value = false

  // 进入电路板选择页面
  phase.value = 'selecting'
}

/**
 * 从选择页面返回准备阶段
 */
async function backToReady() {
  phase.value = 'ready'
  isTesting.value = false
  currentTestBoard.value = null
  currentTestIndex.value = 0

  // 停止工时计时并上传（如果正在计时）
  if (userInfo.value?.id) {
    await stopWorktime(userInfo.value.id, getAuthHeaders())
  }

  // 重新启动扫描器
  await startScanner()
}

/**
 * 从选择页面选择电路板开始测试
 */
async function selectBoardToTest(pos: FixturePosition) {
  // 允许已完成的槽位重新测试 (status === 3)
  if ((pos.status !== 2 && pos.status !== 3) || !pos.board) {
    showMessage('该电路板无法开始测试', 'error')
    return
  }

  // 临时工单疑问/打回模式: 校验目标清单不为空
  if (pos.isDevTest && (pos.testMode === 'feedback' || pos.testMode === 'question')) {
    const targetIds = getSlotTargetIds(pos)
    if (!targetIds || targetIds.length === 0) {
      const modeText = pos.testMode === 'feedback' ? '打回' : '疑问'
      showMessage(`${modeText}清单为空，无法进入测试`, 'error')
      return
    }
  }

  // 进入测试阶段
  phase.value = 'testing'
  isTesting.value = true
  currentTestBoard.value = pos

  // 计算当前槽位在可测试列表中的索引
  const testablePositions = positionList.value.filter(p => p.status === 2 || p.status === 3)
  const posIndex = testablePositions.findIndex(p => p.id === pos.id)
  currentTestIndex.value = posIndex >= 0 ? posIndex : 0

  // 开始工时计时
  startWorktime()

  // 更新工单状态为测试中（仅新工单需要更新状态）
  if (pos.testMode === 'normal') {
    const board = pos.board
    const unitId = board.testunit_type === OrderType.Production
      ? board.testunit_id
      : board.dev_testunit_id
    const mode: 0 | 1 = board.testunit_type === OrderType.Production ? 0 : 1

    if (unitId) {
      console.log('[X-Ray] 选择电路板开始测试, 更新工单状态, unitId:', unitId, 'mode:', mode)
      const result = await orderApi.changeStatus(unitId, mode, undefined, getAuthHeaders())
      if (!result.success) {
        console.warn('[X-Ray] 更新工单状态失败:', result.error)
      }
    }
  }
}

/**
 * 下载单个电路板的数据
 * 根据工单状态下载不同的数据
 */
async function downloadBoardData(pos: FixturePosition) {
  const board = pos.board
  if (!board) return

  const unitType = board.testunit_type || 0
  const unitId = unitType === OrderType.Production
    ? board.testunit_id
    : board.dev_testunit_id
  const status = unitType === OrderType.Production
    ? board.testunit_status
    : board.dev_testunit_status

  if (!unitId) return

  const type: 0 | 1 = unitType === OrderType.Production ? 0 : 1
  const statusStr = String(status)

  // 根据状态下载数据
  if (statusStr === OrderStatus.New) {
    // 新工单: 下载工艺（带缓存）
    if (board.process_id) {
      downloadText.value = `正在下载工艺: ${board.serial}`
      console.log('[X-Ray] 下载工艺, process_id:', board.process_id)
      const result = await processApi.downloadWithCache(
        board.process_id,
        getAuthHeaders(),
        onDownloadProgress
      )
      console.log('[X-Ray] 下载结果完整对象:', result)
      if (result.success && result.data) {
        pos.processData = result.data
        console.log('[X-Ray] 工艺已保存到 pos.processData')
      } else {
        console.error('[X-Ray] 工艺下载失败:', result.error)
      }
    } else {
      console.warn('[X-Ray] 工单没有 process_id:', board)
    }
  } else if (statusStr === OrderStatus.Testing) {
    // 待继续: 下载工艺 + 临时数据
    if (board.process_id) {
      downloadText.value = `正在下载工艺: ${board.serial}`
      console.log('[X-Ray] 待继续工单，下载工艺, process_id:', board.process_id)
      const processResult = await processApi.downloadWithCache(
        board.process_id,
        getAuthHeaders(),
        onDownloadProgress
      )
      if (processResult.success && processResult.data) {
        pos.processData = processResult.data
      }
    }
    downloadText.value = `正在下载临时数据: ${board.serial}`
    console.log('[X-Ray] 下载临时数据, unitId:', unitId)
    const result = await processApi.downloadTempOrder(unitId, type, getAuthHeaders(), onDownloadProgress)
    if (result.success && result.data) {
      pos.tempData = result.data
      console.log('[X-Ray] 临时数据下载成功')
    }
  } else if (statusStr === OrderStatus.Feedback) {
    // 待重做: 下载工艺 + 反馈 + 报告
    if (board.process_id) {
      downloadText.value = `正在下载工艺: ${board.serial}`
      const processResult = await processApi.downloadWithCache(
        board.process_id,
        getAuthHeaders(),
        onDownloadProgress
      )
      if (processResult.success && processResult.data) {
        pos.processData = processResult.data
      }
    }
    downloadText.value = `正在下载反馈数据: ${board.serial}`
    const feedbackResult = await processApi.downloadFeedback(unitId, type, getAuthHeaders(), onDownloadProgress)
    if (feedbackResult.success && feedbackResult.data) {
      pos.feedbackData = feedbackResult.data
    }
    downloadText.value = `正在下载报告: ${board.serial}`
    const reportResult = await reportApi.download(type, unitId, getAuthHeaders())
    if (reportResult.success && reportResult.data) {
      pos.feedbackReport = reportResult.data
    }
  } else if (statusStr === OrderStatus.Question) {
    // 疑问工单: 下载工艺 + 疑问 + 报告
    if (board.process_id) {
      downloadText.value = `正在下载工艺: ${board.serial}`
      const processResult = await processApi.downloadWithCache(
        board.process_id,
        getAuthHeaders(),
        onDownloadProgress
      )
      if (processResult.success && processResult.data) {
        pos.processData = processResult.data
      }
    }
    downloadText.value = `正在下载疑问数据: ${board.serial}`
    const questionResult = await processApi.downloadQuestion(unitId, type, getAuthHeaders(), onDownloadProgress)
    if (questionResult.success && questionResult.data) {
      pos.questionData = questionResult.data
    }
    downloadText.value = `正在下载报告: ${board.serial}`
    const reportResult = await reportApi.download(type, unitId, getAuthHeaders())
    if (reportResult.success && reportResult.data) {
      pos.questionReport = reportResult.data
    }
  }
}

/**
 * 单块电路板测试完成
 * 由测试执行组件调用，返回选择页面
 */
function handleBoardTestComplete() {
  if (currentTestBoard.value) {
    currentTestBoard.value.status = 3 // 标记为已完成
  }

  // 检查是否全部测试完成
  const remainingCount = positionList.value.filter(p => p.status === 2).length

  if (remainingCount === 0) {
    // 全部测试完成
    showMessage('所有电路板测试完成！', 'success')
  }

  // 返回选择页面，让用户选择下一个要测试的电路板
  phase.value = 'selecting'
  isTesting.value = false
  currentTestBoard.value = null
}

// 直接退出测试（不保存进度）
async function exitTest() {
  isTesting.value = false
  phase.value = 'ready'
  currentTestIndex.value = 0
  currentTestBoard.value = null
  resetFixture()
  await startScanner()

  // 停止工时计时并上传
  if (userInfo.value?.id) {
    await stopWorktime(userInfo.value.id, getAuthHeaders())
  }
}

// 处理子组件的退出请求（带保存进度选项）
async function handleRequestExit(saveProgress: () => Promise<boolean>) {
  let shouldSave = false

  try {
    await ElMessageBox.confirm('是否保存当前进度？', '退出确认', {
      confirmButtonText: '保存并退出',
      cancelButtonText: '直接退出',
      distinguishCancelAndClose: true,
      type: 'warning'
    })
    shouldSave = true
  } catch (action) {
    if (action === 'close') {
      return  // 用户关闭弹窗，取消退出
    }
    // action === 'cancel' 直接退出，不保存
  }

  if (shouldSave) {
    const saved = await saveProgress()
    if (saved) {
      ElMessage.success('进度已保存，下次扫码可继续测试')
    } else {
      ElMessage.warning('保存失败，但仍将退出测试')
    }
  }

  exitTest()
}

// ==================== 历史报告 ====================

/**
 * 追加历史报告（去重 + 字段映射）
 * 将 API 返回的字段映射为 HistoryReportPanel 期望的字段
 */
function appendHistoryReports(newReports: TestReport[]) {
  const existingIds = new Set(
    historyReports.value.map(r => (r as any).unit_id || r.report_id || r.id)
  )
  const fresh = newReports
    .filter(r => {
      const key = (r as any).unit_id || r.report_id || r.id
      return key && !existingIds.has(key)
    })
    .map(r => ({
      ...r,
      // API 字段 → HistoryReportPanel 期望字段
      boardmodel: r.model || r.boardmodel,
      serial: (r as any).serial || (r as any).name,
      report_time: r.date || r.report_time,
      report_result: (r as any).report_result || r.status,
    })) as TestReport[]

  if (fresh.length > 0) {
    historyReports.value.push(...fresh)
  }
}

/**
 * 查询当前电路板的历史报告并追加
 * 根据 testunit_type 区分正式工单(mode=0) 和临时工单(mode=1)
 */
async function loadBoardHistory(board: {
  prod_board_id?: number
  temp_board_id?: number
}) {
  try {
    const response = await reportApi.getHistoryList({mode: 1, prodBoardId: board.prod_board_id, tempBoardId: board.temp_board_id}, getAuthHeaders())

    if (response.success && response.data && response.data.length > 0) {
      appendHistoryReports(response.data)
    }
  } catch (err) {
    console.error('[历史报告] 查询失败:', err)
  }
}

function handleHistoryToggle(expanded: boolean) {
  showHistory.value = expanded
}

function handleViewReport(report: TestReport) {
  const reportMode = ((report as any).mode ?? 0) as 0 | 1
  const unitId = (report as any).unit_id ?? report.testunit_id ?? report.dev_testunit_id
  if (!unitId) {
    ElMessage.error('报告ID无效')
    return
  }
  openReportPreview(reportMode, unitId)

}

// ==================== 工具函数 ====================

function getStatusText(status?: number): string {
  const statusStr = String(status)
  switch (statusStr) {
    case OrderStatus.New: return '新工单'
    case OrderStatus.Testing: return '待继续'
    case OrderStatus.Feedback: return '待重做'
    case OrderStatus.Question: return '疑问'
    default: return '未知'
  }
}

function getStatusClass(status?: number): string {
  const statusStr = String(status)
  switch (statusStr) {
    case OrderStatus.New: return 'status-new'
    case OrderStatus.Testing: return 'status-continue'
    case OrderStatus.Feedback: return 'status-redo'
    case OrderStatus.Question: return 'status-question'
    default: return 'status-unknown'
  }
}

function getModeText(mode?: TestMode): string {
  switch (mode) {
    case 'normal': return '正式测试'
    case 'continue': return '继续测试'
    case 'feedback': return '反馈测试'
    case 'question': return '疑问测试'
    default: return '测试'
  }
}

function getModeClass(mode?: TestMode): string {
  switch (mode) {
    case 'normal': return 'mode-normal'
    case 'continue': return 'mode-continue'
    case 'feedback': return 'mode-feedback'
    case 'question': return 'mode-question'
    default: return ''
  }
}

/**
 * 获取槽位的目标 ID 列表（用于临时工单的遮罩）
 */
function getSlotTargetIds(pos: FixturePosition): number[] | undefined {
  if (!pos.isDevTest) return undefined
  
  if (pos.testMode === 'feedback' && pos.feedbackData) {
    return parseTempTargetIds(pos.feedbackData, 'feedback')
  }
  if (pos.testMode === 'question' && pos.questionData) {
    return parseTempTargetIds(pos.questionData, 'question')
  }
  return undefined
}

/**
 * 获取槽位的反馈目标清单（用于正式工单的清单驱动重检）
 */
function getSlotFeedbackTargets(pos: FixturePosition): TargetItem[] | undefined {
  if (pos.testMode !== 'feedback' || !pos.feedbackData) return undefined
  return parseFeedbackTargets(
    pos.feedbackData,
    pos.processData?.json,
    pos.feedbackReport
  )
}

/**
 * 获取槽位的疑问目标清单（用于正式工单的清单驱动重检）
 */
function getSlotQuestionTargets(pos: FixturePosition): TargetItem[] | undefined {
  if (pos.testMode !== 'question' || !pos.questionData) return undefined
  return parseQuestionTargets(
    pos.questionData,
    pos.processData?.json,
    pos.questionReport
  )
}

/**
 * 获取槽位的临时报告数据（用于 TempTestExecutor 恢复数据）
 * 
 * 根据 testMode 选择正确的数据来源:
 * - continue: 使用 tempData（暂存的临时数据）
 * - feedback: 使用 feedbackReport（原报告，需要在上面修改）
 * - question: 使用 questionReport（原报告，需要在上面修改）
 * - normal: 无需恢复数据
 */
function getSlotTempReportData(pos: FixturePosition): unknown | undefined {
  if (!pos.isDevTest) return undefined
  
  switch (pos.testMode) {
    case 'continue':
      return pos.tempData
    case 'feedback':
      // 反馈模式: 返回原报告，TempTestExecutor 会从中恢复数据
      return pos.feedbackReport
    case 'question':
      // 疑问模式: 返回原报告，TempTestExecutor 会从中恢复数据
      return pos.questionReport
    default:
      return undefined
  }
}

// ==================== 生命周期 ====================

onMounted(() => {
  checkDevices()
})

onUnmounted(() => {
  stopScanner()
  // 确保离开页面时恢复侧边栏显示
  exitEditMode()
})

watch(() => scanner.error.value, (err) => {
  if (err) {
    console.error('扫码枪错误:', err)
  }
})
</script>

<template>
  <div class="page-container">
    <!-- 设备检测遮罩层 -->
    <DeviceCheckOverlay :visible="showDeviceOverlay" :status="deviceCheckStatus" :scanner-ok="scannerOk"
      :camera-ok="cameraOk" :error-msg="deviceErrorMsg" accent-color="orange" @enter="enterMainInterface"
      @recheck="checkDevices" @skip="enterMainInterface" />

    <!-- 下载进度遮罩层 -->
    <DownloadProgress :visible="isDownloading" :loaded="downloadProgress" :total="downloadTotal" :text="downloadText"
      accent-color="orange" />

    <!-- 提示消息 -->
    <Transition name="toast">
      <div v-if="showToast" class="toast" :class="toastType">
        <Icon
          :icon="toastType === 'error' ? 'mdi:alert-circle' : toastType === 'success' ? 'mdi:check-circle' : 'mdi:information'" />
        {{ toastMessage }}
      </div>
    </Transition>

    <!-- 主内容区 -->
    <template v-if="phase !== 'detect'">
      <!-- 页面头部 (测试和选择时隐藏) -->
      <header v-if="phase === 'ready'" class="page-header">
        <div class="header-left">
          <div class="header-icon">
            <Icon icon="mdi:radioactive" />
          </div>
          <div>
            <h1 class="header-title">X-Ray 测试</h1>
            <p class="header-subtitle">
              <span v-if="scanner.isScanning.value" class="scan-status">
                <span class="scan-dot"></span>
                {{ scanHintText }}
              </span>
              <span v-else>扫码枪未启动</span>
            </p>
          </div>
        </div>
        <div class="header-actions">
          <button v-if="fixtureScanned" @click="resetFixture" class="btn btn-ghost">
            <Icon icon="mdi:refresh" />
            重置
          </button>
          <button v-if="canStartTest" @click="startTest" class="btn btn-primary">
            <Icon icon="mdi:play" />
            开始测试 ({{ addedBoards.length }})
          </button>
        </div>
      </header>

      <!-- 准备阶段 -->
      <template v-if="phase === 'ready'">
        <div class="main-layout">
          <!-- 左侧: 夹具槽位 -->
          <div class="fixture-section">
            <div class="section-header">
              <div class="section-title">
                <Icon icon="mdi:tray-full" />
                夹具槽位
              </div>
              <div v-if="fixtureId" class="fixture-badge">
                <Icon icon="mdi:barcode" />
                {{ fixtureId }}
              </div>
              <div class="slot-progress">
                <span class="progress-text">{{ boundPositionCount }}/{{ positionList.length }}</span>
                <div class="progress-bar-mini">
                  <div class="progress-fill-mini"
                    :style="{ width: positionList.length ? `${(boundPositionCount / positionList.length) * 100}%` : '0%' }">
                  </div>
                </div>
              </div>
            </div>

            <!-- 状态图例 -->
            <div v-if="fixtureScanned && addedBoards.length > 0" class="status-legend">
              <span class="legend-item">
                <span class="legend-dot status-new"></span>新工单
              </span>
              <span class="legend-item">
                <span class="legend-dot status-continue"></span>待继续
              </span>
              <span class="legend-item">
                <span class="legend-dot status-redo"></span>待重做
              </span>
              <span class="legend-item">
                <span class="legend-dot status-question"></span>疑问
              </span>
            </div>

            <div class="fixture-body">
              <!-- 未扫描夹具 -->
              <div v-if="!fixtureScanned" class="empty-state">
                <div class="empty-icon-wrapper">
                  <Icon icon="mdi:qrcode-scan" class="empty-icon" />
                </div>
                <p class="empty-title">等待扫描夹具</p>
                <p class="empty-desc">扫描夹具二维码以开始</p>
              </div>

              <!-- 槽位列表 - 纵向排列 -->
              <div v-else class="slot-list">
                <TransitionGroup name="slot-item">
                  <div v-for="pos in positionList" :key="pos.id" class="slot-row" :class="{
                    'is-empty': pos.status === 0,
                    'is-selected': pos.status === 1,
                    'is-bound': pos.status === 2,
                    'is-done': pos.status === 3
                  }" @click="selectPosition(pos)">
                    <!-- 槽位序号 -->
                    <div class="slot-index">
                      <span>{{ pos.id }}</span>
                    </div>

                    <!-- 槽位内容 -->
                    <div class="slot-main">
                      <template v-if="(pos.status === 2 || pos.status === 3) && pos.board">
                        <div class="board-info-row">
                          <Icon :icon="pos.status === 3 ? 'mdi:check-circle' : 'mdi:circle'" class="status-icon"
                            :class="pos.status === 3 ? 'success' : getModeClass(pos.testMode)" />
                          <div class="board-details">
                            <div class="board-serial-row">
                              <span class="board-serial">{{ pos.board.serial }}</span>
                              <span v-if="pos.testMode" class="mode-badge" :class="getModeClass(pos.testMode)">
                                {{ getModeText(pos.testMode) }}
                              </span>
                              <span v-if="pos.isDevTest" class="temp-badge">临时</span>
                            </div>
                            <span class="board-model">{{ pos.board.boardmodel || '未知型号' }}</span>
                          </div>
                        </div>
                      </template>
                      <template v-else-if="pos.status === 1">
                        <div class="waiting-row">
                          <div class="pulse-ring"></div>
                          <Icon icon="mdi:barcode-scan" class="waiting-icon" />
                          <span class="waiting-text">等待扫描电路板...</span>
                        </div>
                      </template>
                      <template v-else>
                        <div class="empty-row">
                          <Icon icon="mdi:plus-circle-outline" class="empty-slot-icon" />
                          <span class="empty-text">点击选择此槽位</span>
                        </div>
                      </template>
                    </div>

                    <!-- 操作按钮 -->
                    <div v-if="pos.status === 2" class="slot-actions">
                      <button @click.stop="resetPosition(pos)" class="slot-action slot-action-remove" title="移除">
                        <Icon icon="mdi:close" />
                      </button>
                    </div>
                  </div>
                </TransitionGroup>
              </div>
            </div>
          </div>

          <!-- 右侧: 信息面板 -->
          <div class="info-section">
            <!-- 待测电路板列表 -->
            <div class="info-card board-card">
              <div class="card-header">
                <Icon icon="mdi:clipboard-list" />
                <span>待测电路板</span>
                <span class="count-badge">{{ addedBoards.length }}</span>
              </div>
              <div class="card-body">
                <div v-if="addedBoards.length === 0" class="card-empty">
                  <Icon icon="mdi:package-variant-closed" />
                  <span>扫描电路板后显示</span>
                </div>
                <div v-else class="board-list">
                  <div v-for="(board, index) in addedBoards" :key="board.testunit_id || board.dev_testunit_id"
                    class="board-list-item">
                    <div class="board-num">{{ index + 1 }}</div>
                    <div class="board-content">
                      <div class="item-serial-row">
                        <span class="item-serial">{{ board.serial }}</span>
                        <span class="item-status"
                          :class="getStatusClass(board.testunit_status || board.dev_testunit_status)">
                          {{ getStatusText(board.testunit_status || board.dev_testunit_status) }}
                        </span>
                      </div>
                      <span class="item-model">{{ board.boardmodel || '未知' }}</span>
                    </div>
                    <Icon icon="mdi:check" class="item-check" />
                  </div>
                </div>
              </div>
            </div>

            <!-- 历史报告 -->
            <HistoryReportPanel :reports="historyReports" :loading="isLoadingHistory" :expanded="showHistory"
              title="历史报告" @update:expanded="handleHistoryToggle" @view="handleViewReport" />
          </div>
        </div>
      </template>

      <!-- 选择阶段 - 选择要测试的电路板 -->
      <template v-if="phase === 'selecting'">
        <div class="selecting-layout">
          <!-- 页面头部 -->
          <header class="selecting-header">
            <div class="selecting-header-left">
              <button class="btn btn-ghost" @click="backToReady">
                <Icon icon="mdi:arrow-left" />
                返回
              </button>
              <div class="selecting-icon">
                <Icon icon="mdi:radioactive" />
              </div>
              <div>
                <h1 class="selecting-title">选择电路板</h1>
                <p class="selecting-subtitle">请选择要进行 X-Ray 测试的电路板</p>
              </div>
            </div>
            <div class="selecting-header-right">
              <div class="selecting-progress">
                <span class="progress-label">测试进度</span>
                <span class="progress-value">
                  {{positionList.filter(p => p.status === 3).length}} / {{positionList.filter(p => p.status === 2 ||
                    p.status === 3).length }}
                </span>
              </div>
            </div>
          </header>

          <!-- 电路板列表 -->
          <div class="selecting-content">
            <div class="board-list">
              <div v-for="pos in positionList.filter(p => p.status === 2 || p.status === 3)" :key="pos.id"
                class="board-row" :class="{
                  'is-done': pos.status === 3,
                  'mode-new': pos.testMode === 'normal',
                  'mode-continue': pos.testMode === 'continue',
                  'mode-feedback': pos.testMode === 'feedback',
                  'mode-question': pos.testMode === 'question'
                }" @click="selectBoardToTest(pos)">
                <!-- 槽位序号 -->
                <div class="row-index">
                  <span>{{ pos.id }}</span>
                </div>

                <!-- 主要内容 -->
                <div class="row-main">
                  <div class="row-info">
                    <Icon :icon="pos.status === 3 ? 'mdi:check-circle' : 'mdi:circle'" class="row-status-icon"
                      :class="pos.status === 3 ? 'success' : getModeClass(pos.testMode)" />
                    <div class="row-details">
                      <div class="row-serial-line">
                        <span class="row-serial">{{ pos.board?.serial || '未知' }}</span>
                        <span class="row-mode-badge" :class="getModeClass(pos.testMode)">
                          {{ getModeText(pos.testMode) }}
                        </span>
                        <span v-if="pos.isDevTest" class="row-temp-badge">临时</span>
                        <span v-if="pos.status === 3" class="row-done-badge">
                          <Icon icon="mdi:check" />
                          已完成
                        </span>
                      </div>
                      <span class="row-model">{{ pos.board?.boardmodel || '未知型号' }}</span>
                    </div>
                  </div>
                </div>

                <!-- 操作按钮 -->
                <div class="row-action">
                  <Icon :icon="pos.status === 3 ? 'mdi:refresh' : 'mdi:play'" />
                  <span>{{ pos.status === 3 ? '重测' : '测试' }}</span>
                </div>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="positionList.filter(p => p.status === 2 || p.status === 3).length === 0" class="selecting-empty">
              <Icon icon="mdi:alert-circle-outline" class="empty-icon" />
              <p>没有可测试的电路板</p>
            </div>
          </div>
        </div>
      </template>

      <!-- 测试阶段 -->
      <template v-if="phase === 'testing'">
        <div class="testing-layout">
          <div class="testing-main">
            <!-- 临时工单检测 (isDevTest=true) - 使用 X-Ray 摄像头 -->
            <TempTestExecutor v-if="currentTestBoard && currentTestBoard.board && currentTestBoard.isDevTest"
              :test-unit="currentTestBoard.board as any" :mode="(currentTestBoard.testMode as any) || 'normal'"
              :is-dev-test="true" :temp-report-data="(getSlotTempReportData(currentTestBoard) as any) || undefined"
              :target-list="getSlotTargetIds(currentTestBoard)"
              :feedback-reason="currentTestBoard.board?.feedback_reason"
              device-type="xray"
              @complete="handleBoardTestComplete" @exit="exitTest" @request-exit="handleRequestExit"
              @error="(msg: string) => showMessage(msg, 'error')" />

            <!-- X-Ray 测试执行器 (正常工单) -->
            <XrayTestExecutor v-else-if="currentTestBoard && currentTestBoard.board"
              :slot-data="currentTestBoard as any" :fixture-id="fixtureId" :total-boards="addedBoards.length"
              :current-index="currentTestIndex"
              :feedback-targets="getSlotFeedbackTargets(currentTestBoard)"
              :question-targets="getSlotQuestionTargets(currentTestBoard)"
              :feedback-reason="currentTestBoard.board?.feedback_reason"
              @complete="handleBoardTestComplete" @exit="exitTest"
              @request-exit="handleRequestExit" @error="(msg: string) => showMessage(msg, 'error')" />

            <!-- 无测试数据时的占位 -->
            <div v-else class="testing-placeholder">
              <Icon icon="mdi:radioactive" class="placeholder-icon" />
              <h3>准备中...</h3>
              <p>正在加载测试数据</p>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* 页面容器 */
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 提示消息 */
.toast {
  position: absolute;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.toast.error {
  background: rgba(239, 68, 68, 0.9);
  color: white;
}

.toast.success {
  background: rgba(34, 197, 94, 0.9);
  color: white;
}

.toast.info {
  background: rgba(59, 130, 246, 0.9);
  color: white;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-0.5rem);
}

/* 页面头部 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  font-size: 1.25rem;
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 88, 12, 0.15));
  color: rgb(251, 146, 60);
}

.header-title {
  font-size: 1.125rem;
  font-weight: 600;
}

.header-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
}

.scan-status {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  color: rgb(251, 146, 60);
}

.scan-dot {
  width: 6px;
  height: 6px;
  background: rgb(251, 146, 60);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.5;
    transform: scale(0.85);
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  transition: all 0.15s;
}

.btn-ghost {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.05);
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text);
}

.btn-primary {
  background: linear-gradient(135deg, rgb(249, 115, 22), rgb(234, 88, 12));
  color: white;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.25);
}

.btn-primary:hover {
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.35);
  transform: translateY(-1px);
}

/* 主布局 */
.main-layout {
  flex: 1;
  display: flex;
  gap: 1rem;
  min-height: 0;
}

/* 夹具区域 */
.fixture-section {
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
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.fixture-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-family: monospace;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: rgba(249, 115, 22, 0.12);
  color: rgb(251, 146, 60);
  border-radius: 0.25rem;
}

.slot-progress {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.progress-text {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.progress-bar-mini {
  width: 60px;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill-mini {
  height: 100%;
  background: linear-gradient(90deg, rgb(34, 197, 94), rgb(74, 222, 128));
  border-radius: 2px;
  transition: width 0.3s;
}

/* 状态图例 */
.status-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--color-border);
  background: rgba(0, 0, 0, 0.1);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.legend-dot.status-new {
  background: rgb(74, 222, 128);
}

.legend-dot.status-continue {
  background: rgb(96, 165, 250);
}

.legend-dot.status-redo {
  background: rgb(248, 113, 113);
}

.legend-dot.status-question {
  background: rgb(251, 146, 60);
}

.fixture-body {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

/* 空状态 */
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-icon-wrapper {
  width: 5rem;
  height: 5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.03);
  animation: breathe 2.5s ease-in-out infinite;
}

.empty-icon {
  font-size: 2.5rem;
  color: var(--color-text-secondary);
  opacity: 0.4;
}

@keyframes breathe {

  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }

  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
}

.empty-title {
  font-size: 1rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.empty-desc {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

/* 槽位列表 */
.slot-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.slot-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.625rem;
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: all 0.2s;
}

.slot-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.slot-row.is-selected {
  border-color: rgb(59, 130, 246);
  background: rgba(59, 130, 246, 0.08);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.slot-row.is-bound {
  border-color: rgba(249, 115, 22, 0.4);
  background: rgba(249, 115, 22, 0.06);
  cursor: default;
}

.slot-row.is-done {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.06);
  cursor: default;
}

.slot-index {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.slot-row.is-selected .slot-index {
  background: rgba(59, 130, 246, 0.2);
  color: rgb(96, 165, 250);
}

.slot-row.is-bound .slot-index {
  background: rgba(249, 115, 22, 0.2);
  color: rgb(251, 146, 60);
}

.slot-row.is-done .slot-index {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(74, 222, 128);
}

.slot-main {
  flex: 1;
  min-width: 0;
}

/* 已绑定状态 */
.board-info-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.status-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
}

.status-icon.success {
  color: rgb(74, 222, 128);
}

.status-icon.mode-normal {
  color: rgb(74, 222, 128);
}

.status-icon.mode-continue {
  color: rgb(96, 165, 250);
}

.status-icon.mode-feedback {
  color: rgb(248, 113, 113);
}

.status-icon.mode-question {
  color: rgb(251, 146, 60);
}

.board-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.board-serial-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.board-serial {
  font-family: monospace;
  font-size: 0.875rem;
  font-weight: 500;
}

.mode-badge,
.temp-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

.mode-badge.mode-normal {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

.mode-badge.mode-continue {
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

.mode-badge.mode-feedback {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

.mode-badge.mode-question {
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
}

.temp-badge {
  background: rgba(156, 163, 175, 0.15);
  color: rgb(156, 163, 175);
}

.board-model {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 等待扫描状态 */
.waiting-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  position: relative;
}

.pulse-ring {
  position: absolute;
  left: -2px;
  width: 20px;
  height: 20px;
  border: 2px solid rgb(59, 130, 246);
  border-radius: 50%;
  animation: ring-pulse 1.5s ease-out infinite;
  opacity: 0;
}

@keyframes ring-pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }

  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}

.waiting-icon {
  font-size: 1rem;
  color: rgb(96, 165, 250);
  animation: icon-pulse 1s ease-in-out infinite;
}

@keyframes icon-pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

.waiting-text {
  font-size: 0.8125rem;
  color: rgb(96, 165, 250);
}

/* 空槽位状态 */
.empty-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.empty-slot-icon {
  font-size: 1rem;
  color: var(--color-text-secondary);
  opacity: 0.4;
}

.empty-text {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  opacity: 0.6;
}

/* 槽位操作按钮组 */
.slot-actions {
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
}

.slot-action {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  opacity: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}

/* 移除按钮 - 红色主题 */
.slot-action-remove {
  background: rgba(239, 68, 68, 0.1);
  color: rgb(248, 113, 113);
}

.slot-action-remove:hover {
  background: rgba(239, 68, 68, 0.2);
}

.slot-row:hover .slot-action {
  opacity: 1;
}

/* 槽位动画 */
.slot-item-enter-active {
  transition: all 0.3s ease;
}

.slot-item-enter-from {
  opacity: 0;
  transform: translateX(-1rem);
}

/* 信息面板 */
.info-section {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex-shrink: 0;
}

/* 信息卡片 */
.info-card {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.board-card {
  flex: 1;
  min-height: 200px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.875rem;
  font-weight: 500;
}

.count-badge {
  margin-left: auto;
  min-width: 1.5rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
}

.card-body {
  flex: 1;
  padding: 0.75rem;
  overflow: auto;
}

.card-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
}

.card-empty svg {
  font-size: 1.75rem;
  opacity: 0.3;
}

/* 电路板列表 */

.board-num {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
  font-weight: 600;
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
  border-radius: 0.25rem;
  flex-shrink: 0;
}

.board-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.item-serial-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.item-serial {
  font-family: monospace;
  font-size: 0.75rem;
  font-weight: 500;
}

.item-status {
  font-size: 0.5625rem;
  padding: 0.0625rem 0.25rem;
  border-radius: 0.125rem;
  font-weight: 500;
}

.item-status.status-new {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

.item-status.status-continue {
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

.item-status.status-redo {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

.item-status.status-question {
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
}

.item-model {
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-check {
  color: rgb(74, 222, 128);
  font-size: 0.875rem;
  flex-shrink: 0;
}

/* 测试阶段 */
.testing-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.testing-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.625rem;
}

.testing-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.meta-label {
  color: var(--color-text-secondary);
}

.meta-value {
  font-weight: 500;
}

.meta-divider {
  color: var(--color-text-secondary);
  opacity: 0.4;
}

/* 当前测试信息 */
.current-test-info {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.625rem;
  overflow: hidden;
}

.test-progress-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
}

.test-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(249, 115, 22), rgb(234, 88, 12));
  transition: width 0.3s;
}

.current-board-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
}

.current-icon {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
  font-size: 1.125rem;
}

.current-details {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.current-serial {
  font-family: monospace;
  font-size: 0.9375rem;
  font-weight: 600;
}

.current-meta {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.current-mode-badge {
  font-size: 0.6875rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

.testing-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.testing-placeholder {
  text-align: center;
  color: var(--color-text-secondary);
}

.placeholder-icon {
  font-size: 4rem;
  opacity: 0.2;
  margin-bottom: 1rem;
}

.testing-placeholder h3 {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.testing-placeholder p {
  font-size: 0.875rem;
}

.debug-info {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.5rem;
  text-align: left;
  font-size: 0.75rem;
  font-family: monospace;
}

.debug-info p {
  margin: 0.25rem 0;
}

/* ==================== 选择页面样式 ==================== */
.selecting-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-primary);
}

.selecting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 2rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.selecting-header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.selecting-icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  background: linear-gradient(135deg, var(--color-accent-orange), #ea580c);
  color: white;
  border-radius: 0.75rem;
}

.selecting-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.selecting-subtitle {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0.25rem 0 0;
}

.selecting-header-right {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.selecting-progress {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.progress-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.progress-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-accent-orange);
}

.selecting-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0;
}

/* 电路板列表 - 纵向布局 */
.board-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0 auto;
}
.board-list-item {
  width: 100%;
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0;
}
.board-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.board-row:hover {
  border-color: var(--color-accent-orange);
  background: var(--color-bg-tertiary);
}

.board-row.is-done {
  opacity: 0.7;
}

.board-row.is-done:hover {
  opacity: 1;
  border-color: var(--color-accent-blue);
}

/* 槽位序号 */
.row-index {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-accent-orange);
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(249, 115, 22, 0.05));
  border: 1px solid rgba(249, 115, 22, 0.25);
  border-radius: 0.625rem;
  flex-shrink: 0;
}

/* 主要内容 */
.row-main {
  flex: 1;
  min-width: 0;
}

.row-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.row-status-icon {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
  border-radius: 50%;
  transition: all 0.2s ease;
  /* 默认颜色 */
  color: var(--color-accent-green);
  background: rgba(34, 197, 94, 0.12);
}

/* 已完成状态 */
.row-status-icon.success {
  color: var(--color-accent-green);
  background: rgba(34, 197, 94, 0.12);
}

/* 新工单 - 绿色 */
.row-status-icon.mode-normal {
  color: var(--color-accent-green);
  background: rgba(34, 197, 94, 0.12);
}

/* 继续测试 - 蓝色 */
.row-status-icon.mode-continue {
  color: var(--color-accent-blue);
  background: rgba(59, 130, 246, 0.12);
}

/* 反馈 - 橙色 */
.row-status-icon.mode-feedback {
  color: var(--color-accent-orange);
  background: rgba(249, 115, 22, 0.12);
}

/* 疑问 - 紫色 */
.row-status-icon.mode-question {
  color: var(--color-accent-purple);
  background: rgba(168, 85, 247, 0.12);
}

.board-row:hover .row-status-icon {
  transform: scale(1.1);
}

.row-details {
  flex: 1;
  min-width: 0;
}

.row-serial-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.row-serial {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.row-mode-badge {
  font-size: 0.625rem;
  font-weight: 500;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.row-mode-badge.status-new {
  background: rgba(34, 197, 94, 0.15);
  color: var(--color-accent-green);
}

.row-mode-badge.status-continue {
  background: rgba(59, 130, 246, 0.15);
  color: var(--color-accent-blue);
}

.row-mode-badge.status-feedback {
  background: rgba(249, 115, 22, 0.15);
  color: var(--color-accent-orange);
}

.row-mode-badge.status-question {
  background: rgba(168, 85, 247, 0.15);
  color: var(--color-accent-purple);
}

.row-temp-badge {
  font-size: 0.625rem;
  font-weight: 500;
  padding: 0.125rem 0.375rem;
  background: rgba(100, 116, 139, 0.15);
  color: var(--color-text-secondary);
  border-radius: 0.25rem;
}

.row-done-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  font-size: 0.625rem;
  font-weight: 500;
  padding: 0.125rem 0.375rem;
  background: rgba(34, 197, 94, 0.15);
  color: var(--color-accent-green);
  border-radius: 0.25rem;
}

.row-model {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
}

/* 操作按钮 */
.row-action {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  transition: all 0.2s;
  flex-shrink: 0;
}

.board-row:hover .row-action {
  background: var(--color-accent-orange);
  border-color: var(--color-accent-orange);
  color: white;
}

.board-row.is-done:hover .row-action {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}

.selecting-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: var(--color-text-secondary);
}

.selecting-empty .empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

/* ==================== 亮色主题适配 ==================== */
:global(html.light) .selecting-icon {
  background: linear-gradient(135deg, #ea580c, #c2410c);
}

:global(html.light) .row-index {
  background: linear-gradient(135deg, rgba(234, 88, 12, 0.12), rgba(234, 88, 12, 0.05));
  border-color: rgba(234, 88, 12, 0.2);
}

:global(html.light) .row-mode-badge.status-new {
  background: rgba(22, 163, 74, 0.12);
}

:global(html.light) .row-mode-badge.status-continue {
  background: rgba(37, 99, 235, 0.12);
}

:global(html.light) .row-mode-badge.status-feedback {
  background: rgba(234, 88, 12, 0.12);
}

:global(html.light) .row-mode-badge.status-question {
  background: rgba(124, 58, 237, 0.12);
}

:global(html.light) .row-temp-badge {
  background: rgba(100, 116, 139, 0.1);
}

:global(html.light) .row-done-badge {
  background: rgba(22, 163, 74, 0.12);
}

:global(html.light) .row-status-icon {
  background: rgba(22, 163, 74, 0.1);
}

:global(html.light) .row-status-icon.success,
:global(html.light) .row-status-icon.mode-normal {
  background: rgba(22, 163, 74, 0.1);
}

:global(html.light) .row-status-icon.mode-continue {
  background: rgba(37, 99, 235, 0.1);
}

:global(html.light) .row-status-icon.mode-feedback {
  background: rgba(234, 88, 12, 0.1);
}

:global(html.light) .row-status-icon.mode-question {
  background: rgba(124, 58, 237, 0.1);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
