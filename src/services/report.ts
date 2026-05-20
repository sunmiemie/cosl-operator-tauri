/**
 * 报告服务 - 测试报告相关 API
 * 
 * 参考原程序 api/test.py 的实现，提供以下功能:
 * - 上传测试报告 (upload_test_report)
 * - 上传临时报告 (upload_temp_report)
 * - 反馈测试报告 (feedback_test_report)
 * - 疑问测试报告 (question_test_report)
 * - 下载报告 (download_report)
 * - 获取历史报告列表 (get_history_report_list)
 */
import { http, type ApiResponse } from './http'
import type { ProgressCallback } from './process'

// ==================== 类型定义 ====================

// 测试报告接口
export interface TestReport {
  id: number
  testunit_id?: number
  dev_testunit_id?: number
  report_type?: string
  report_data?: ReportData
  data?: ReportData
  created_at?: string
  updated_at?: string
  status?: number
  // 历史报告额外字段
  model?: string
  boardmodel?: string   // 历史报告列表返回
  serial?: string       // 历史报告列表返回
  report_time?: string  // 历史报告列表返回
  report_result?: number | string  // 历史报告列表返回
  report_id?: number | string       // 兼容旧接口字段
  reportTime?: string               // 兼容旧接口字段
  result?: number | string          // 兼容旧接口字段
  type?: string
  date?: string
  mode?: number
  unit_id?: number
}

// 报告数据结构 (参考原程序 reportJson)
export interface ReportData {
  testunit_id?: number
  dev_testunit_id?: number
  testunit_type: number  // 2=弓曲度, 3=2D, 4=3D, 5=X-Ray
  board_id?: number | string
  board_serialnumber?: string
  json: ReportJson
}

// 步骤列表项 (与旧版一致)
export interface StepListItem {
  id: number
  name: string
  pass: number
}

// 图片列表项 (与旧版一致)
export interface PicListItem {
  id: number
  name: string
  save: string[]
}

// 异常项
export interface ErrorItem {
  id: number
  name: string
  pass: number
  error: {
    url: string | string[]
    desc: string
  }
}

// 疑问项
export interface QuestionItem {
  id: number
  name: string
  pass: number
  question: {
    url: string | string[]
    desc: string
  }
}

// 警告项
export interface WarnItem {
  id: number
  name: string
  pass: number
  warn: {
    url: string | string[]
    desc: string
  }
}

// 弓曲度检测数据 (与旧版一致)
export interface PlaneData {
  size: string
  leftPass?: number
  rightPass?: number
  leftUrl: string
  rightUrl: string
  noteList?: string[]
  errorList?: Array<{ name: string; error: { desc: string; url: string } }>
}

// 报告 JSON 结构 (与旧版前端完全一致)
export interface ReportJson {
  plane?: PlaneData
  twoD?: string
  twoDBak?: string
  threeD?: {
    eyes?: ReportSection
    eyesBak?: ReportSection
  }
  xray?: ReportSection
  tempTest?: TempTestItem[]
}

// 总体/通用/点位检测数据 (与旧版一致)
export interface ReportTotalData {
  stepList: StepListItem[]
  stepNote: string[]
  picList: PicListItem[]
  picNote: string[]
  errorList?: ErrorItem[]
  questionList?: QuestionItem[]
  warnList?: WarnItem[]
}

// 报告区域数据 (与旧版一致)
export interface ReportSection {
  total: ReportTotalData
  area: ReportArea[]
}

// 报告区域 (与旧版一致，包含 general 和 detail)
export interface ReportArea {
  id: number
  general: ReportGeneralData
  detail: ReportPointData[]
}

// 通用检测数据 (与旧版一致)
export interface ReportGeneralData {
  stepList: StepListItem[]
  stepNote: string[]
  picList: PicListItem[]
  picNote: string[]
  errorList?: ErrorItem[]
  questionList?: QuestionItem[]
  warnList?: WarnItem[]
}

// 点位检测数据 (与旧版一致)
export interface ReportPointData {
  id: number
  name: string
  stepList: StepListItem[]
  stepNote: string[]
  picList: PicListItem[]
  picNote: string[]
  errorList?: ErrorItem[]
  questionList?: QuestionItem[]
  warnList?: WarnItem[]
}

// 兼容旧接口 - ReportPoint
export interface ReportPoint extends ReportPointData {}

// 临时测试项
export interface TempTestItem {
  id: number
  pass: number  // 1=合格, 2=缺陷, 3=疑问
  name: string
  desc: string
  save: string[]
  error?: {
    url: string[]
    desc: string
  }
  question?: {
    url: string[]
    desc: string
  }
}

// 上传报告参数 (参考原程序 upload_test_report)
export interface ReportUploadParams {
  testunit_id: number
  serialNumber: string
  userId: number
  testType: number  // 2=弓曲度, 3=2D, 4=3D, 5=X-Ray
  testunit_status: number  // 2=正常, 3=异常
  file: ReportData
}

// 上传临时报告参数 (参考原程序 upload_temp_report)
export interface TempReportUploadParams {
  dev_testunit_id: number
  serialNumber: string
  userId: number
  testType: number
  dev_testunit_status: number
  file: ReportData
}

// 历史报告查询参数
export interface HistoryReportParams {
  mode: 0 | 1  // 0=生产工单, 1=临时工单
  boardId?: number  // mode=0 时使用
  prodBoardId?: number  // mode=1 时使用
  tempBoardId?: number  // mode=1 时使用
}

// 历史报告响应
interface HistoryReportResponse {
  code: number
  msg: string
  data: TestReport[]
  total?: number
}

// API 响应
// 报告下载响应 - 后端直接返回 {code, data} 格式
interface ApiReportResponse {
  code?: number
  msg?: string
  data?: ReportData
  // 兼容原程序的嵌套格式 {result: {data}}
  result?: {
    code?: number
    data?: ReportData
    msg?: string
  }
}

// ==================== 报告服务 ====================

export const reportApi = {
  /**
   * 上传测试报告
   * 对应原程序 upload_test_report 方法
   * 
   * API: POST /test/report/upload/
   * 
   * @param params 报告参数
   */
  async uploadReport(
    params: ReportUploadParams,
    headers?: Record<string, string>
  ): Promise<ApiResponse<{ msg: string }>> {
    const formData = new FormData()
    formData.append('testunit_id', String(params.testunit_id))
    formData.append('serial_number', params.serialNumber)
    formData.append('user_id', String(params.userId))
    formData.append('test_type', String(params.testType))
    formData.append('testunit_status', String(params.testunit_status))
    
    // 将报告数据转为 JSON 文件
    const jsonBlob = new Blob([JSON.stringify(params.file)], { type: 'application/json' })
    formData.append('file', jsonBlob, 'data.json')
    
    return http.postFormData<{ msg: string }>('/test/report/upload/', formData, headers)
  },

  /**
   * 上传临时报告
   * 对应原程序 upload_temp_report 方法
   * 
   * API: POST /test/devreport/upload/
   */
  async uploadTempReport(
    params: TempReportUploadParams,
    headers?: Record<string, string>
  ): Promise<ApiResponse<{ msg: string }>> {
    const formData = new FormData()
    formData.append('dev_testunit_id', String(params.dev_testunit_id))
    formData.append('serial_number', params.serialNumber)
    formData.append('user_id', String(params.userId))
    formData.append('test_type', String(params.testType))
    formData.append('dev_testunit_status', String(params.dev_testunit_status))
    
    const jsonBlob = new Blob([JSON.stringify(params.file)], { type: 'application/json' })
    formData.append('file', jsonBlob, 'data.json')
    
    return http.postFormData<{ msg: string }>('/test/devreport/upload/', formData, headers)
  },

  /**
   * 提交反馈报告（待重做工单完成后）
   * 对应原程序 feedback_test_report 方法
   * 
   * API: POST /test/report/feedback/
   */
  async feedbackReport(
    params: ReportUploadParams,
    headers?: Record<string, string>
  ): Promise<ApiResponse<{ msg: string }>> {
    const formData = new FormData()
    formData.append('testunit_id', String(params.testunit_id))
    formData.append('serial_number', params.serialNumber)
    formData.append('user_id', String(params.userId))
    formData.append('test_type', String(params.testType))
    formData.append('testunit_status', String(params.testunit_status))
    
    const jsonBlob = new Blob([JSON.stringify(params.file)], { type: 'application/json' })
    formData.append('file', jsonBlob, 'data.json')
    
    return http.postFormData<{ msg: string }>('/test/report/feedback/', formData, headers)
  },

  /**
   * 提交临时工单反馈报告
   * 对应原程序 feedback_temp_report 方法
   * 
   * API: POST /test/devreport/feedback/
   */
  async feedbackTempReport(
    params: TempReportUploadParams,
    headers?: Record<string, string>
  ): Promise<ApiResponse<{ msg: string }>> {
    const formData = new FormData()
    formData.append('dev_testunit_id', String(params.dev_testunit_id))
    formData.append('serial_number', params.serialNumber)
    formData.append('user_id', String(params.userId))
    formData.append('test_type', String(params.testType))
    formData.append('dev_testunit_status', String(params.dev_testunit_status))
    
    const jsonBlob = new Blob([JSON.stringify(params.file)], { type: 'application/json' })
    formData.append('file', jsonBlob, 'data.json')
    
    return http.postFormData<{ msg: string }>('/test/devreport/feedback/', formData, headers)
  },

  /**
   * 提交疑问报告（疑问工单完成后）
   * 对应原程序 question_test_report 方法
   * 
   * API: POST /test/report/question/
   */
  async questionReport(
    params: ReportUploadParams,
    headers?: Record<string, string>
  ): Promise<ApiResponse<{ msg: string }>> {
    const formData = new FormData()
    formData.append('testunit_id', String(params.testunit_id))
    formData.append('serial_number', params.serialNumber)
    formData.append('user_id', String(params.userId))
    formData.append('test_type', String(params.testType))
    formData.append('testunit_status', String(params.testunit_status))
    
    const jsonBlob = new Blob([JSON.stringify(params.file)], { type: 'application/json' })
    formData.append('file', jsonBlob, 'data.json')
    
    return http.postFormData<{ msg: string }>('/test/report/question/', formData, headers)
  },

  /**
   * 提交临时工单疑问报告
   * 对应原程序 question_temp_report 方法
   * 
   * API: POST /test/devreport/question/
   */
  async questionTempReport(
    params: TempReportUploadParams,
    headers?: Record<string, string>
  ): Promise<ApiResponse<{ msg: string }>> {
    const formData = new FormData()
    formData.append('dev_testunit_id', String(params.dev_testunit_id))
    formData.append('serial_number', params.serialNumber)
    formData.append('user_id', String(params.userId))
    formData.append('test_type', String(params.testType))
    formData.append('dev_testunit_status', String(params.dev_testunit_status))
    
    const jsonBlob = new Blob([JSON.stringify(params.file)], { type: 'application/json' })
    formData.append('file', jsonBlob, 'data.json')
    
    return http.postFormData<{ msg: string }>('/test/devreport/question/', formData, headers)
  },

  /**
   * 下载报告
   * 对应原程序 download_report 方法
   * 
   * API: 
   *   - 生产工单: GET /data/report/check/operate?unitId={unitId}
   *   - 临时工单: GET /data/devreport/check/operate?unitId={unitId}
   * 
   * @param reportType 0=生产工单, 1=临时工单
   * @param unitId 工单ID
   */
  async download(
    reportType: 0 | 1,
    unitId: number,
    headers?: Record<string, string>,
    onProgress?: ProgressCallback
  ): Promise<ApiResponse<ReportData>> {
    const endpoint = reportType === 0
      ? '/data/report/check/operate'
      : '/data/devreport/check/operate'
    
    const queryParams = { unitId: String(unitId) }
    
    if (onProgress) {
      const response = await http.downloadWithProgress<ApiReportResponse>(
        endpoint,
        onProgress,
        headers,
        queryParams
      )
      
      if (response.success && response.data) {
        // 优先检查直接格式 {code, data}，兼容嵌套格式 {result: {data}}
        const reportData = response.data.data ?? response.data.result?.data
        if (reportData) {
          return { success: true, data: reportData }
        }
      }
      return { success: false, error: response.error }
    }
    
    const response = await http.get<ApiReportResponse>(endpoint, headers, queryParams)
    
    if (response.success && response.data) {
      // 优先检查直接格式 {code, data}，兼容嵌套格式 {result: {data}}
      const reportData = response.data.data ?? response.data.result?.data
      if (reportData) {
        return { success: true, data: reportData }
      }
    }
    return { success: false, error: response.error }
  },

  /**
   * 获取历史报告列表
   * 对应原程序 get_history_report_list 方法
   * 
   * API: GET /test/history/list
   */
  async getHistoryList(
    params: HistoryReportParams,
    headers?: Record<string, string>
  ): Promise<ApiResponse<TestReport[]>> {
    const queryParams: Record<string, string> = {
      mode: String(params.mode)
    }
    
    if (params.mode === 0 && params.boardId !== undefined && params.boardId !== null) {
      queryParams.boardId = String(params.boardId)
    } else if (params.mode === 1) {
      // mode=1: 优先传 prodBoardId，其次传 tempBoardId
      if (params.prodBoardId !== undefined && params.prodBoardId !== null) {
        queryParams.prodBoardId = String(params.prodBoardId)
      }
      if (params.tempBoardId !== undefined && params.tempBoardId !== null) {
        queryParams.tempBoardId = String(params.tempBoardId)
      }
    }

    const response = await http.get<HistoryReportResponse>(
      '/test/history/list',
      headers,
      queryParams
    )
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.data || [],
      }
    }
    return { success: false, error: response.error, data: [] }
  },

  /**
   * 获取 X-Ray 历史报告（按电路板）
   */
  async getXrayHistory(
    params: { fixture_id?: string; board_serial?: string; board_id?: number },
    headers?: Record<string, string>
  ): Promise<ApiResponse<TestReport[]>> {
    // 优先使用 board_id 查询
    if (params.board_id !== undefined) {
      return this.getHistoryList({ mode: 0, boardId: params.board_id }, headers)
    }
    
    // 备选：使用自定义端点
    const queryParams: Record<string, string> = {}
    if (params.fixture_id) queryParams.fixture_id = params.fixture_id
    if (params.board_serial) queryParams.board_serial = params.board_serial

    const response = await http.get<HistoryReportResponse>(
      '/test/xray/history/',
      headers,
      queryParams
    )
    
    if (response.success && response.data) {
      return { success: true, data: response.data.data || [] }
    }
    return { success: false, error: response.error, data: [] }
  },

  /**
   * 获取目检历史报告（按电路板）
   */
  async getEyesHistory(
    params: { board_serial?: string; process_type?: string; board_id?: number },
    headers?: Record<string, string>
  ): Promise<ApiResponse<TestReport[]>> {
    // 优先使用 board_id 查询
    if (params.board_id !== undefined) {
      return this.getHistoryList({ mode: 0, boardId: params.board_id }, headers)
    }
    
    const queryParams: Record<string, string> = {}
    if (params.board_serial) queryParams.board_serial = params.board_serial
    if (params.process_type) queryParams.process_type = params.process_type

    const response = await http.get<HistoryReportResponse>(
      '/test/eyes/history/',
      headers,
      queryParams
    )
    
    if (response.success && response.data) {
      return { success: true, data: response.data.data || [] }
    }
    return { success: false, error: response.error, data: [] }
  },

  /**
   * 上传报告图片
   */
  async uploadImage(
    file: File,
    headers?: Record<string, string>
  ): Promise<ApiResponse<{ url: string }>> {
    const formData = new FormData()
    formData.append('file', file)
    return http.postFormData<{ url: string }>('/upload/report-image/', formData, headers)
  },

  /**
   * 查看报告（用于报告预览对话框）
   * 合并了 download 的逻辑，方便组件调用
   */
  async viewReport(
    reportInfo: { mode: 0 | 1; unit_id: number },
    headers?: Record<string, string>
  ): Promise<ApiResponse<ReportData>> {
    return this.download(reportInfo.mode, reportInfo.unit_id, headers)
  },
}
