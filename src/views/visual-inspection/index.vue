<script setup lang="ts">
/**
 * 目检测试页面
 * 
 * 实现完整测试流程：
 * 1. 设备检测 -> 2. 扫码获取工单 -> 3. 根据状态下载数据 -> 4. 执行测试 -> 5. 上传报告
 * 
 * 工单状态处理：
 * - status=1 新工单: 下载工艺 -> 开始测试
 * - status=2 待继续: 下载临时数据 -> 继续测试
 * - status=4 待重做: 下载工艺+反馈+报告 -> 反馈测试
 * - status=8 疑问工单: 下载工艺+疑问+报告 -> 疑问测试
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import { useScanner } from '@/composables/useScanner'
import { useCamera } from '@/composables/useCamera'
import { useLayout } from '@/composables/useLayout'
import { orderApi, type TestUnit, OrderStatus, OrderType } from '@/services/order'
import { processApi, type ProcessData, type TempOrderData, type FeedbackData, type QuestionData } from '@/services/process'
import { reportApi, type ReportData } from '@/services/report'
import { startWorktime, stopWorktime } from '@/services/worktime'

// 导入公共组件
import {
  DeviceCheckOverlay,
  OrderTable,
  CountdownDialog,
  DownloadProgress,
} from '@/components/visual-test'

// 导入测试执行组件
import ThreeDTestExecutor from './components/tests/ThreeDTestExecutor.vue'
import TwoDTestExecutor from './components/tests/TwoDTestExecutor.vue'
import PlaneTestExecutor from './components/tests/PlaneTestExecutor.vue'
import TempTestExecutor from './components/tests/TempTestExecutor.vue'

// ==================== 类型定义 ====================

// 测试模式
type TestMode = 'normal' | 'continue' | 'feedback' | 'question'

// ==================== 状态定义 ====================

const { userInfo, getAuthHeaders } = useAuth()
const scanner = useScanner()
const camera = useCamera()
const { enterEditMode, exitEditMode } = useLayout()

// 页面阶段
type PagePhase = 'detect' | 'ready' | 'testing'
const phase = ref<PagePhase>('detect')

// 监听 phase 变化，在测试阶段隐藏侧边栏
watch(phase, (newPhase) => {
  if (newPhase === 'testing') {
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

// 工单数据
const waitingList = ref<TestUnit[]>([])
const availableOrders = ref<TestUnit[]>([])
const isLoadingOrders = ref(false)

// 扫描状态
const currentSN = ref('')

// 测试状态
const currentTestUnit = ref<TestUnit | null>(null)
const nextTestUnit = ref<TestUnit | null>(null)  // 下一个可继续测试的工单
const needContinue = ref(false)  // 是否有下一个工单可继续
const testType = ref<number>(-1)  // 2=弓曲度, 3=2D, 4=3D
const testMode = ref<TestMode>('normal')  // 测试模式
const isDevTest = ref(false)  // 是否临时工单

// 工艺数据
const processJson = ref<ProcessData | null>(null)
const tempReportJson = ref<TempOrderData | null>(null)
const feedbackJson = ref<FeedbackData | null>(null)
const questionJson = ref<QuestionData | null>(null)
const feedbackReport = ref<ReportData | null>(null)
const questionReport = ref<ReportData | null>(null)

// 下载进度
const isDownloading = ref(false)
const downloadProgress = ref(0)
const downloadTotal = ref(0)
const downloadText = ref('正在下载工艺数据...')

// 倒计时
const countdownVisible = ref(false)
const countdownSeconds = ref(5)

// 允许的测试类型
const allowedTestTypes = ['2D留存', '3D检测', '弓曲度测试']

// 提示消息
const toastMessage = ref('')
const toastType = ref<'error' | 'success' | 'info'>('info')
const showToast = ref(false)

// ==================== 计算属性 ====================

const showDeviceOverlay = computed(() => phase.value === 'detect')

const filteredWaitingList = computed(() => {
  return waitingList.value.filter(item => 
    item.process_type && allowedTestTypes.includes(item.process_type)
  )
})

// 扫描提示
const scanHintText = computed(() => {
  if (currentSN.value) return currentSN.value
  return '等待扫描电路板...'
})

// ==================== 工具函数 ====================

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

// 获取测试类型ID
function getTestTypeId(processType?: string): number {
  switch (processType) {
    case '弓曲度测试': return 2
    case '2D留存': return 3
    case '3D检测': return 4
    default: return -1
  }
}

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
  loadWaitingOrders()
  startScanner()
}

// ==================== 工单管理 ====================

async function loadWaitingOrders() {
  isLoadingOrders.value = true
  try {
    const response = await orderApi.getOrderData(getAuthHeaders())
    if (response.success && response.data) {
      waitingList.value = response.data
    }
  } catch (err) {
    console.error('加载工单失败:', err)
    showMessage('加载工单失败', 'error')
  } finally {
    isLoadingOrders.value = false
  }
}

function refreshData() {
  loadWaitingOrders()
}

// ==================== 扫码处理 ====================

async function startScanner() {
  await scanner.startScanning(handleScanData)
}

async function stopScanner() {
  await scanner.stopScanning()
}

function handleScanData(data: string) {
  console.log('扫描到:', data)
  currentSN.value = data
  findMatchingOrders(data)
}

async function findMatchingOrders(serial: string) {
  // 从后端查询可执行工单
  console.log('[findMatchingOrders] 查询工单, serial:', serial)
  const response = await orderApi.getOrderBySerial(serial, getAuthHeaders())
  
  console.log('[findMatchingOrders] API响应:', response)
  
  if (!response.success || !response.data) {
    console.error('[findMatchingOrders] 查询失败:', response.error)
    showMessage('查询工单失败', 'error')
    return
  }
  
  console.log('[findMatchingOrders] 原始工单数据:', response.data)
  console.log('[findMatchingOrders] 允许的测试类型:', allowedTestTypes)
  
  // 过滤允许的测试类型
  availableOrders.value = response.data.filter(
    item => {
      const match = item.process_type && allowedTestTypes.includes(item.process_type)
      console.log(`[findMatchingOrders] 工单 ${item.testunit_id || item.dev_testunit_id}, process_type: ${item.process_type}, status: ${item.testunit_status || item.dev_testunit_status}, 匹配: ${match}`)
      return match
    }
  )
  
  console.log('[findMatchingOrders] 过滤后工单:', availableOrders.value)
  
  if (availableOrders.value.length === 0) {
    showMessage('该电路板无待做工单', 'error')
  } else if (availableOrders.value.length === 1) {
    // 只有一个工单，启动倒计时
    needContinue.value = false
    countdownSeconds.value = 5
    startCountdown(availableOrders.value[0])
  } else if (availableOrders.value.length === 2) {
    // 有两个工单，可以连续测试
    needContinue.value = true
    showMessage(`找到 ${availableOrders.value.length} 个工单，请选择`, 'info')
  } else {
    showMessage(`找到 ${availableOrders.value.length} 个工单，请选择`, 'info')
  }
}

// ==================== 测试流程 ====================

function startCountdown(unit: TestUnit) {
  currentTestUnit.value = unit
  countdownVisible.value = true
}

function cancelCountdown() {
  countdownVisible.value = false
}

function handleCountdownStart() {
  if (currentTestUnit.value) {
    startEyesTest(currentTestUnit.value)
  }
}

/**
 * 开始目检测试
 * 参考原程序 ScanBoard.vue:624-692 startEyesTest
 */
async function startEyesTest(item: TestUnit) {
  countdownVisible.value = false
  await stopScanner()
  
  const unitType = item.testunit_type || 0
  const unitId = unitType === OrderType.Production 
    ? item.testunit_id 
    : item.dev_testunit_id
  const status = unitType === OrderType.Production
    ? item.testunit_status
    : item.dev_testunit_status
  
  if (!unitId) {
    showMessage('工单ID无效', 'error')
    return
  }
  
  // 设置测试类型
  testType.value = getTestTypeId(item.process_type)
  currentTestUnit.value = item
  isDevTest.value = unitType === OrderType.Temporary
  
  // 根据工单类型和状态下载不同数据
  // 将状态转换为字符串以便与 OrderStatus 比较
  const statusStr = String(status)
  
  if (unitType === OrderType.Production) {
    // 正式工单
    if (statusStr === OrderStatus.New) {
      // 新工单: 下载工艺
      testMode.value = 'normal'
      await downloadTestProcess(item.process_id!, unitId)
    } else if (statusStr === OrderStatus.Testing) {
      // 待继续: 下载临时数据
      testMode.value = 'continue'
      await downloadTempOrder(unitId, 0)
    } else if (statusStr === OrderStatus.Feedback) {
      // 待重做: 下载工艺 + 反馈 + 报告
      testMode.value = 'feedback'
      await downloadFeedBack(item.process_id!, unitId, 0)
    } else if (statusStr === OrderStatus.Question) {
      // 疑问工单: 下载工艺 + 疑问 + 报告
      testMode.value = 'question'
      await downloadQuestion(item.process_id!, unitId, 0)
    }
  } else {
    // 临时工单
    if (statusStr === OrderStatus.New) {
      // 新临时工单: 直接开始（无需下载工艺）
      testMode.value = 'normal'
      await changeStatusAndStart(unitId, 1)
      // 临时工单直接进入测试阶段
      phase.value = 'testing'
    } else if (statusStr === OrderStatus.Testing) {
      // 待继续
      testMode.value = 'continue'
      await downloadTempOrder(unitId, 1)
    } else if (statusStr === OrderStatus.Feedback) {
      // 待重做
      testMode.value = 'feedback'
      await downloadFeedBack(undefined, unitId, 1)
    } else if (statusStr === OrderStatus.Question) {
      // 疑问工单
      testMode.value = 'question'
      await downloadQuestion(undefined, unitId, 1)
    }
  }
  
  // 设置下一个可继续工单
  if (needContinue.value && availableOrders.value.length >= 2) {
    const currentIndex = availableOrders.value.indexOf(item)
    nextTestUnit.value = availableOrders.value[currentIndex === 0 ? 1 : 0]
  } else {
    nextTestUnit.value = null
  }
  
  // 开始工时计时
  startWorktime()
}

/**
 * 下载工艺并开始测试
 * 参考原程序 ScanBoard.vue:265-302 downloadTestProcess
 */
async function downloadTestProcess(processId: number, unitId: number) {
  isDownloading.value = true
  downloadText.value = '正在下载工艺数据...'
  downloadProgress.value = 0
  downloadTotal.value = 0
  
  try {
    console.log('[目检] 下载工艺, process_id:', processId)
    
    // 使用带缓存的下载方法
    const downloadResult = await processApi.downloadWithCache(
      processId, 
      getAuthHeaders(),
      onDownloadProgress
    )
    
    if (downloadResult.success && downloadResult.data) {
      processJson.value = downloadResult.data
      console.log('[目检] 工艺下载成功:', downloadResult.data)
    } else {
      throw new Error(downloadResult.error || '下载工艺失败')
    }
    
    // 更新工单状态
    await changeStatusAndStart(unitId, 0)
    
  } catch (err) {
    console.error('下载工艺失败:', err)
    showMessage('下载工艺失败，请检查网络连接', 'error')
    isDownloading.value = false
    return
  }
  
  isDownloading.value = false
  phase.value = 'testing'
}

/**
 * 下载临时工单数据（用于继续测试）
 * 参考原程序 ScanBoard.vue:304-343 downloadTempOrder
 * 
 * 原程序流程:
 * 1. download_temp_order 下载临时数据文件
 * 2. read_temp_testunit 读取临时数据，返回 { testunit_id, data }
 * 3. processJson.value = item.data (data 是保存的工艺工作状态)
 * 
 * 新程序设计:
 * - 将临时数据存储在 tempReportJson 中
 * - 测试执行器组件通过 tempData prop 获取并恢复测试进度
 */
async function downloadTempOrder(unitId: number, type: 0 | 1) {
  isDownloading.value = true
  downloadText.value = '正在下载临时进度...'
  
  try {
    const downloadResult = await processApi.downloadTempOrder(
      unitId, 
      type,
      getAuthHeaders(),
      onDownloadProgress
    )
    
    if (downloadResult.success && downloadResult.data) {
      console.log('[Visual] 下载临时数据成功:', downloadResult.data)
      
      // 无论是临时工单还是正式工单，都将临时数据存入 tempReportJson
      // 测试执行器会根据 mode='continue' 使用 tempData 恢复进度
      tempReportJson.value = downloadResult.data
      
      // 检查数据结构
      if (downloadResult.data.data?.json?.tempTest) {
        console.log('[Visual] 找到 data.json.tempTest, 长度:', downloadResult.data.data.json.tempTest.length)
      } else if (downloadResult.data.json?.tempTest) {
        console.log('[Visual] 找到 json.tempTest, 长度:', downloadResult.data.json?.tempTest?.length)
      } else {
        console.log('[Visual] 未找到 tempTest 数据')
      }
      
      // 如果临时数据中包含 data 字段（工艺工作状态），同时设置 processJson
      // 这样执行器可以同时访问原始工艺和保存的进度
      if (downloadResult.data.data) {
        // 构造一个 ProcessData 结构，将保存的工作状态作为 json
        processJson.value = {
          id: downloadResult.data.testunit_id || downloadResult.data.dev_testunit_id || 0,
          name: '',
          json: downloadResult.data.data
        } as ProcessData
      }
    } else {
      throw new Error(downloadResult.error || '下载临时数据失败')
    }
    
  } catch (err) {
    console.error('下载临时数据失败:', err)
    showMessage('下载失败，请检查网络连接', 'error')
    isDownloading.value = false
    return
  }
  
  isDownloading.value = false
  phase.value = 'testing'
}

/**
 * 下载反馈数据（待重做工单）
 * 参考原程序 ScanBoard.vue:345-409 downloadFeedBack
 */
async function downloadFeedBack(processId: number | undefined, unitId: number, type: 0 | 1) {
  isDownloading.value = true
  downloadText.value = '正在下载数据...'
  
  try {
    // 如果是正式工单，先下载工艺（使用缓存）
    if (type === 0 && processId) {
      downloadText.value = '正在下载工艺...'
      const downloadResult = await processApi.downloadWithCache(processId, getAuthHeaders(), onDownloadProgress)
      if (downloadResult.success && downloadResult.data) {
        processJson.value = downloadResult.data
      }
    }
    
    // 下载反馈数据
    downloadText.value = '正在下载反馈数据...'
    const feedbackResult = await processApi.downloadFeedback(
      unitId, 
      type,
      getAuthHeaders(),
      onDownloadProgress
    )
    if (feedbackResult.success && feedbackResult.data) {
      feedbackJson.value = feedbackResult.data
    }
    
    // 下载报告
    downloadText.value = '正在下载报告...'
    const reportResult = await reportApi.download(type, unitId, getAuthHeaders(), onDownloadProgress)
    if (reportResult.success && reportResult.data) {
      feedbackReport.value = reportResult.data
    }
    
  } catch (err) {
    console.error('下载反馈数据失败:', err)
    showMessage('下载失败，请检查网络连接', 'error')
    isDownloading.value = false
    return
  }
  
  isDownloading.value = false
  phase.value = 'testing'
}

/**
 * 下载疑问数据
 * 参考原程序 ScanBoard.vue:411-475 downloadQuestion
 */
async function downloadQuestion(processId: number | undefined, unitId: number, type: 0 | 1) {
  isDownloading.value = true
  downloadText.value = '正在下载数据...'
  
  try {
    // 如果是正式工单，先下载工艺（使用缓存）
    if (type === 0 && processId) {
      downloadText.value = '正在下载工艺...'
      const downloadResult = await processApi.downloadWithCache(processId, getAuthHeaders(), onDownloadProgress)
      if (downloadResult.success && downloadResult.data) {
        processJson.value = downloadResult.data
      }
    }
    
    // 下载疑问数据
    downloadText.value = '正在下载疑问数据...'
    const questionResult = await processApi.downloadQuestion(
      unitId, 
      type,
      getAuthHeaders(),
      onDownloadProgress
    )
    if (questionResult.success && questionResult.data) {
      questionJson.value = questionResult.data
    }
    
    // 下载报告
    downloadText.value = '正在下载报告...'
    const reportResult = await reportApi.download(type, unitId, getAuthHeaders(), onDownloadProgress)
    if (reportResult.success && reportResult.data) {
      questionReport.value = reportResult.data
    }
    
  } catch (err) {
    console.error('下载疑问数据失败:', err)
    showMessage('下载失败，请检查网络连接', 'error')
    isDownloading.value = false
    return
  }
  
  isDownloading.value = false
  phase.value = 'testing'
}

/**
 * 更新工单状态为测试中
 */
async function changeStatusAndStart(unitId: number, mode: 0 | 1) {
  const result = await orderApi.changeStatus(unitId, mode, undefined, getAuthHeaders())
  if (!result.success) {
    console.warn('更新工单状态失败:', result.error)
  }
}

/**
 * 测试完成处理
 * 参考原程序 ScanBoard.vue:698-713 handleEyesTestComplete
 */
async function handleTestComplete() {
  // 重置状态
  phase.value = 'ready'
  isDevTest.value = false
  testMode.value = 'normal'
  testType.value = -1
  feedbackReport.value = null
  feedbackJson.value = null
  questionReport.value = null
  questionJson.value = null
  processJson.value = null
  tempReportJson.value = null
  availableOrders.value = []
  currentSN.value = ''
  currentTestUnit.value = null
  nextTestUnit.value = null
  
  // 刷新工单列表并重新开始扫描
  await loadWaitingOrders()
  await startScanner()
  
  // 停止工时计时并上传
  if (userInfo.value?.id) {
    await stopWorktime(userInfo.value.id, getAuthHeaders())
  }
}

/**
 * 继续下一个测试（有多个工单时）
 * 参考原程序 ScanBoard.vue:715-729 handleEyesTestContinue
 */
function handleTestContinue() {
  if (nextTestUnit.value) {
    needContinue.value = false
    countdownSeconds.value = 10
    startCountdown(nextTestUnit.value)
  } else {
    handleTestComplete()
  }
}

// 直接退出测试（不保存进度）
async function exitTest() {
  await handleTestComplete()
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

function handleOrderSelect(unit: TestUnit) {
  startCountdown(unit)
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

function getTypeIcon(type?: string): string {
  switch (type) {
    case '3D检测': return 'mdi:cube-scan'
    case '2D留存': return 'mdi:camera'
    case '弓曲度测试': return 'mdi:chart-bell-curve'
    default: return 'mdi:clipboard-text'
  }
}

function getModeText(): string {
  switch (testMode.value) {
    case 'normal': return isDevTest.value ? '临时工单测试' : '正式工单测试'
    case 'continue': return '继续测试'
    case 'feedback': return '反馈测试（待重做）'
    case 'question': return '疑问测试'
    default: return '测试'
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
    <DeviceCheckOverlay
      :visible="showDeviceOverlay"
      :status="deviceCheckStatus"
      :scanner-ok="scannerOk"
      :camera-ok="cameraOk"
      :error-msg="deviceErrorMsg"
      accent-color="green"
      @enter="enterMainInterface"
      @recheck="checkDevices"
      @skip="enterMainInterface"
    />

    <!-- 下载进度遮罩层 -->
    <DownloadProgress
      :visible="isDownloading"
      :loaded="downloadProgress"
      :total="downloadTotal"
      :text="downloadText"
      accent-color="green"
    />

    <!-- 提示消息 -->
    <Transition name="toast">
      <div v-if="showToast" class="toast" :class="toastType">
        <Icon 
          :icon="toastType === 'error' ? 'mdi:alert-circle' : toastType === 'success' ? 'mdi:check-circle' : 'mdi:information'"
        />
        {{ toastMessage }}
      </div>
    </Transition>

    <!-- 主内容区 -->
    <template v-if="phase !== 'detect'">
      <!-- 页面头部 (测试时隐藏) -->
      <header v-if="phase !== 'testing'" class="page-header">
        <div class="header-left">
          <div class="header-icon">
            <Icon icon="mdi:eye-check" />
          </div>
          <div>
            <h1 class="header-title">目检测试</h1>
            <p class="header-subtitle">
              <span v-if="scanner.isScanning.value" class="scan-status">
                <span class="scan-dot"></span>
                等待扫描电路板
              </span>
              <span v-else>扫码枪未启动</span>
            </p>
          </div>
        </div>
        <div class="header-actions">
          <button 
            class="btn btn-icon"
            @click="refreshData"
            :disabled="isLoadingOrders"
            title="刷新数据"
          >
            <Icon icon="mdi:refresh" :class="{ 'animate-spin': isLoadingOrders }" />
          </button>
        </div>
      </header>

      <!-- 准备阶段 -->
      <template v-if="phase === 'ready'">
        <div class="main-layout">
          <!-- 左侧: 待测试列表 -->
          <div class="list-section">
            <OrderTable
              :orders="waitingList"
              :loading="isLoadingOrders"
              :allowed-types="allowedTestTypes"
              title="待测试工单"
            />
          </div>

          <!-- 右侧: 扫描区 + 可执行工单 -->
          <div class="scan-section">
            <!-- 扫描显示区 -->
            <div class="scan-card">
              <div class="scan-header">
                <Icon icon="mdi:qrcode-scan" :class="{ 'scanning': scanner.isScanning.value }" />
                <span>扫描结果</span>
              </div>
              <div class="scan-body">
                <div v-if="currentSN" class="scan-result">
                  <div class="result-value">{{ currentSN }}</div>
                  <div class="result-label">序列号</div>
                </div>
                <div v-else class="scan-empty">
                  <div class="scan-animation">
                    <Icon icon="mdi:barcode-scan" />
                  </div>
                  <p>{{ scanHintText }}</p>
                </div>
              </div>
            </div>

            <!-- 可执行工单 -->
            <div class="available-card">
              <div class="card-header">
                <Icon icon="mdi:clipboard-check-outline" />
                <span>可执行工单</span>
                <span v-if="availableOrders.length" class="count-badge">
                  {{ availableOrders.length }}
                </span>
              </div>
              <div class="card-body">
                <!-- 状态图例 -->
                <div v-if="availableOrders.length > 0" class="status-legend">
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
                
                <!-- 空状态 -->
                <div v-if="availableOrders.length === 0" class="empty-state">
                  <Icon icon="mdi:clipboard-text-search-outline" />
                  <span>扫描电路板后显示匹配工单</span>
                </div>
                <!-- 工单列表 -->
                <div v-else class="order-list">
                  <div 
                    v-for="order in availableOrders" 
                    :key="order.testunit_id || order.dev_testunit_id"
                    class="order-item"
                    @click="handleOrderSelect(order)"
                  >
                    <div class="order-icon">
                      <Icon :icon="getTypeIcon(order.process_type)" />
                    </div>
                    <div class="order-info">
                      <div class="order-main">
                        <span class="order-model">{{ order.boardmodel || '未知型号' }}</span>
                        <span 
                          class="order-status"
                          :class="getStatusClass(order.testunit_status || order.dev_testunit_status)"
                        >
                          {{ getStatusText(order.testunit_status || order.dev_testunit_status) }}
                        </span>
                      </div>
                      <div class="order-meta">
                        <span class="order-type">
                          {{ order.process_type }}
                          <template v-if="order.testunit_type === 1"> · 临时</template>
                        </span>
                        <span class="order-serial">{{ order.serial }}</span>
                      </div>
                    </div>
                    <Icon icon="mdi:chevron-right" class="order-arrow" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 测试阶段 -->
      <template v-if="phase === 'testing'">
        <div class="testing-layout">
          <!-- 测试主区域 (退出按钮已移至各测试组件内部) -->
          <div class="testing-main">
            <!-- 临时工单检测 (isDevTest=true) -->
            <TempTestExecutor
              v-if="isDevTest && currentTestUnit"
              :test-unit="currentTestUnit"
              :mode="testMode"
              :is-dev-test="true"
              :temp-report-data="tempReportJson || undefined"
              :feedback-list="feedbackJson ? (feedbackJson as any[]).map((f: any) => f.id) : undefined"
              @complete="handleTestComplete"
              @exit="exitTest"
              @request-exit="handleRequestExit"
              @error="(msg) => showMessage(msg, 'error')"
            />
            
            <!-- 3D 检测 (testType=4, 正常工单) -->
            <ThreeDTestExecutor
              v-else-if="testType === 4 && currentTestUnit"
              :test-unit="currentTestUnit"
              :mode="testMode"
              :is-dev-test="isDevTest"
              :process-data="processJson || undefined"
              :temp-data="tempReportJson || undefined"
              :feedback-data="feedbackJson || undefined"
              :question-data="questionJson || undefined"
              :previous-report="testMode === 'feedback' ? feedbackReport || undefined : testMode === 'question' ? questionReport || undefined : undefined"
              @complete="handleTestComplete"
              @exit="exitTest"
              @request-exit="handleRequestExit"
              @error="(msg) => showMessage(msg, 'error')"
            />
            
            <!-- 2D 留存 (testType=3) -->
            <TwoDTestExecutor
              v-else-if="testType === 3 && currentTestUnit"
              :test-unit="currentTestUnit"
              :mode="testMode === 'feedback' || testMode === 'question' ? 'normal' : testMode"
              :is-dev-test="isDevTest"
              :process-data="processJson || undefined"
              :temp-data="tempReportJson || undefined"
              @complete="handleTestComplete"
              @exit="exitTest"
              @error="(msg) => showMessage(msg, 'error')"
            />
            
            <!-- 弓曲度测试 (testType=2) -->
            <PlaneTestExecutor
              v-else-if="testType === 2 && currentTestUnit"
              :test-unit="currentTestUnit"
              :mode="testMode === 'feedback' || testMode === 'question' ? 'normal' : testMode"
              :is-dev-test="isDevTest"
              :process-data="processJson || undefined"
              :temp-data="tempReportJson || undefined"
              @complete="handleTestComplete"
              @exit="exitTest"
              @error="(msg) => showMessage(msg, 'error')"
            />
            
            <!-- 未知类型 -->
            <div v-else class="testing-placeholder">
              <Icon icon="mdi:help-circle" class="placeholder-icon" />
              <h3>未知测试类型</h3>
              <p>testType: {{ testType }}</p>
              <button @click="exitTest" class="btn btn-ghost" style="margin-top: 1rem;">
                <Icon icon="mdi:arrow-left" />
                返回
              </button>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- 倒计时对话框 -->
    <CountdownDialog
      v-model:visible="countdownVisible"
      :seconds="countdownSeconds"
      :title="currentTestUnit?.boardmodel || '准备开始'"
      :subtitle="currentTestUnit?.process_type || '测试即将开始...'"
      accent-color="green"
      @start="handleCountdownStart"
      @cancel="cancelCountdown"
    />
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
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.15));
  color: rgb(74, 222, 128);
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
  color: rgb(74, 222, 128);
}

.scan-dot {
  width: 6px;
  height: 6px;
  background: rgb(74, 222, 128);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
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

.btn-icon {
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text-secondary);
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text);
}

.btn-ghost {
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.05);
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text);
}

/* 主布局 */
.main-layout {
  flex: 1;
  display: flex;
  gap: 1rem;
  min-height: 0;
}

.list-section {
  flex: 1;
  display: flex;
  min-width: 0;
}

.scan-section {
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex-shrink: 0;
}

/* 扫描卡片 */
.scan-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.scan-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.875rem;
  font-weight: 500;
}

.scan-header svg.scanning {
  color: rgb(74, 222, 128);
  animation: icon-pulse 1s ease-in-out infinite;
}

@keyframes icon-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.scan-body {
  padding: 1.5rem;
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scan-result {
  text-align: center;
}

.result-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1.5rem;
  font-weight: 600;
  color: rgb(74, 222, 128);
  margin-bottom: 0.25rem;
}

.result-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.scan-empty {
  text-align: center;
  color: var(--color-text-secondary);
}

.scan-animation {
  width: 3.5rem;
  height: 3.5rem;
  margin: 0 auto 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  opacity: 0.3;
  animation: breathe 2.5s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.1); opacity: 0.5; }
}

.scan-empty p {
  font-size: 0.8125rem;
}

/* 可执行工单卡片 */
.available-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
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
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

.card-body {
  flex: 1;
  padding: 0.75rem;
  overflow: auto;
}

/* 状态图例 */
.status-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
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

.legend-dot.status-new { background: rgb(74, 222, 128); }
.legend-dot.status-continue { background: rgb(96, 165, 250); }
.legend-dot.status-redo { background: rgb(248, 113, 113); }
.legend-dot.status-question { background: rgb(251, 146, 60); }

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
}

.empty-state svg {
  font-size: 2rem;
  opacity: 0.3;
}

/* 工单列表 */
.order-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s;
}

.order-item:hover {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.05);
}

.order-item:hover .order-arrow {
  opacity: 1;
  transform: translateX(2px);
}

.order-icon {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgba(34, 197, 94, 0.1);
  color: rgb(74, 222, 128);
  font-size: 1.125rem;
  flex-shrink: 0;
}

.order-info {
  flex: 1;
  min-width: 0;
}

.order-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.order-model {
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.order-status {
  flex-shrink: 0;
  font-size: 0.6875rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

.status-new {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

.status-continue {
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

.status-redo {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

.status-question {
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
}

.status-unknown {
  background: rgba(107, 114, 128, 0.15);
  color: rgb(156, 163, 175);
}

.order-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.order-type {
  opacity: 0.8;
}

.order-serial {
  font-family: monospace;
}

.order-arrow {
  color: var(--color-text-secondary);
  opacity: 0;
  transition: all 0.15s;
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

.testing-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.info-icon {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
  font-size: 1.125rem;
}

.info-content {
  display: flex;
  flex-direction: column;
}

.info-model {
  font-size: 0.9375rem;
  font-weight: 600;
}

.info-meta {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-family: monospace;
}

.testing-main {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* 当内部是测试执行器时，不需要额外样式 */
.testing-main > :deep(.executor-container) {
  flex: 1;
}

/* 当内部是占位符时，居中显示 */
.testing-main > .testing-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.testing-placeholder {
  text-align: center;
  color: var(--color-text-secondary);
}

.placeholder-icon {
  font-size: 4rem;
  opacity: 0.15;
  color: rgb(74, 222, 128);
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

.temp-badge {
  display: inline-block;
  margin-top: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
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

/* 动画 */
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
