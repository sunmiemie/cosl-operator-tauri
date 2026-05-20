/**
 * HALT-HASS 测试报告管理
 * 处理报告生成和上传
 */
import { ref, computed } from 'vue'
import type {
  HaltHassOrder,
  HaltHassReportJson,
  ScannedBoard,
  NodeRunResult,
} from '@/views/halt-hass-test/types'
import { TEST_RESULT } from '@/views/halt-hass-test/types'
import { uploadReport, buildReportJson } from '@/services/halt-hass-order'
import { useAuth } from '@/composables/useAuth'

export function useHaltHassReport() {
  const { userInfo } = useAuth()

  // ==================== 状态 ====================

  // 报告数据
  const reportJson = ref<HaltHassReportJson | null>(null)

  // 测试结果
  const testResult = ref<number>(TEST_RESULT.NORMAL)

  // 备注
  const remark = ref('')

  // 上传状态
  const isUploading = ref(false)
  const uploadProgress = ref(0)
  const uploadError = ref('')

  // 上传成功的报告 ID
  const uploadedReportId = ref<number | null>(null)

  // ==================== 计算属性 ====================

  const hasReport = computed(() => reportJson.value !== null)

  const resultText = computed(() => {
    switch (testResult.value) {
      case TEST_RESULT.NORMAL:
        return '正常'
      case TEST_RESULT.ABNORMAL:
        return '异常'
      case TEST_RESULT.QUESTION:
        return '疑问'
      default:
        return '未知'
    }
  })

  const flowchartSummary = computed(() => {
    if (!reportJson.value) return null
    const { flowchartResult } = reportJson.value
    return {
      total: flowchartResult.totalNodes,
      success: flowchartResult.successNodes,
      failed: flowchartResult.failedNodes,
      successRate: flowchartResult.totalNodes > 0
        ? Math.round((flowchartResult.successNodes / flowchartResult.totalNodes) * 100)
        : 0,
    }
  })

  // ==================== 方法 ====================

  /**
   * 生成报告
   */
  function generateReport(params: {
    order: HaltHassOrder
    boards: ScannedBoard[]
    startTime: Date
    endTime: Date
    nodeResults: NodeRunResult[]
    testData?: Record<string, unknown>
  }): void {
    const { order, boards, startTime, endTime, nodeResults, testData } = params

    // 计算节点统计
    const totalNodes = nodeResults.length
    const successNodes = nodeResults.filter(r => r.status === 'success').length
    const failedNodes = nodeResults.filter(r => r.status === 'error').length

    // 构建报告 JSON
    reportJson.value = buildReportJson({
      orderId: order.id,
      orderNo: order.orderNo,
      boards,
      startTime,
      endTime,
      flowchartResult: {
        nodes: nodeResults,
        totalNodes,
        successNodes,
        failedNodes,
      },
      testData,
      remark: remark.value,
    })

    // 根据节点结果自动设置测试结果
    if (failedNodes > 0) {
      testResult.value = TEST_RESULT.ABNORMAL
    } else {
      testResult.value = TEST_RESULT.NORMAL
    }
  }

  /**
   * 设置测试结果
   */
  function setTestResult(result: number): void {
    testResult.value = result
  }

  /**
   * 设置备注
   */
  function setRemark(text: string): void {
    remark.value = text
    if (reportJson.value) {
      reportJson.value.remark = text
    }
  }

  /**
   * 上传报告
   */
  async function upload(): Promise<boolean> {
    if (!reportJson.value || !userInfo.value) {
      uploadError.value = '报告数据或用户信息不存在'
      return false
    }

    isUploading.value = true
    uploadProgress.value = 0
    uploadError.value = ''

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        if (uploadProgress.value < 90) {
          uploadProgress.value += 10
        }
      }, 200)

      const result = await uploadReport({
        orderId: reportJson.value.orderId,
        reportJson: reportJson.value,
        result: testResult.value,
        operatorId: userInfo.value.id,
        remark: remark.value,
      })

      clearInterval(progressInterval)
      uploadProgress.value = 100

      if (!result.success) {
        uploadError.value = result.error || '上传失败'
        return false
      }

      uploadedReportId.value = result.data?.id ?? null
      return true
    } catch (error) {
      uploadError.value = error instanceof Error ? error.message : '未知错误'
      return false
    } finally {
      isUploading.value = false
    }
  }

  /**
   * 重置报告
   */
  function reset(): void {
    reportJson.value = null
    testResult.value = TEST_RESULT.NORMAL
    remark.value = ''
    isUploading.value = false
    uploadProgress.value = 0
    uploadError.value = ''
    uploadedReportId.value = null
  }

  /**
   * 获取报告预览数据（用于显示）
   */
  function getPreviewData(): {
    orderNo: string
    duration: string
    boardCount: number
    result: string
    summary: {
      total: number
      success: number
      failed: number
    }
  } | null {
    if (!reportJson.value) return null

    const { flowchartResult } = reportJson.value
    const duration = reportJson.value.duration

    // 格式化时长
    const hours = Math.floor(duration / 3600)
    const minutes = Math.floor((duration % 3600) / 60)
    const seconds = duration % 60
    const durationStr = hours > 0
      ? `${hours}时${minutes}分${seconds}秒`
      : minutes > 0
        ? `${minutes}分${seconds}秒`
        : `${seconds}秒`

    return {
      orderNo: reportJson.value.orderNo,
      duration: durationStr,
      boardCount: reportJson.value.boards.length,
      result: resultText.value,
      summary: {
        total: flowchartResult.totalNodes,
        success: flowchartResult.successNodes,
        failed: flowchartResult.failedNodes,
      },
    }
  }

  return {
    // 状态（只读）
    reportJson,
    testResult,
    remark,
    isUploading,
    uploadProgress,
    uploadError,
    uploadedReportId,

    // 计算属性
    hasReport,
    resultText,
    flowchartSummary,

    // 方法
    generateReport,
    setTestResult,
    setRemark,
    upload,
    reset,
    getPreviewData,
  }
}
