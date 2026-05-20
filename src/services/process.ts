/**
 * 工艺服务 - 工艺相关 API
 * 
 * 参考原程序 api/test.py 的实现，提供以下功能:
 * - 工艺下载 (download_process)
 * - 临时工单下载 (download_temp_order)
 * - 反馈数据下载 (download_feedback)
 * - 疑问数据下载 (download_question)
 * - 报告下载 (download_report)
 * 
 * 新增缓存支持:
 * - 工艺/临时数据/反馈/报告的本地缓存
 * - 优先读取本地缓存，加快加载速度
 */
import { http, type ApiResponse } from './http'
import { invoke } from '@tauri-apps/api/core'

// ==================== 类型定义 ====================

/**
 * 检测步骤项 (工作数据)
 * 参考原程序 ThreeDTest.vue localJson.value.eyes.total.step[]
 */
export interface StepItem {
  id: number
  name: string
  desc?: string
  pass: 0 | 1 | 2 | 3 | 4  // 0=未检测, 1=合格, 2=缺陷, 3=疑问, 4=缺陷+疑问
  error?: {
    url: string[]
    desc: string
  }
  question?: {
    url: string[]
    desc: string
  }
  warn?: {
    url: string[]
    desc: string
  }
}

/**
 * 留存图片项 (工作数据)
 * 参考原程序 ThreeDTest.vue localJson.value.eyes.total.pic[]
 */
export interface PicItem {
  id: number
  name: string
  desc?: string
  url?: string       // 参考示例图
  save: string[]     // 已拍摄的图片
}

/**
 * 整体检测数据
 * 参考原程序 localJson.value.eyes.total
 */
export interface TotalData {
  url: string                  // 参考图 URL
  step: StepItem[]             // 检测步骤列表
  pic: PicItem[]               // 留存图片列表
  stepNote?: string[]          // 步骤备注
  picNote?: string[]           // 图片备注
}

/**
 * 具体点位数据
 * 参考原程序 localJson.value.eyes.area[].detail[]
 */
export interface DetailData {
  id: number
  name: string
  url?: string
  step: StepItem[]
  pic: PicItem[]
  stepNote?: string[]
  picNote?: string[]
}

/**
 * 区域通用检测数据
 * 参考原程序 localJson.value.eyes.area[].general
 */
export interface GeneralData {
  step: StepItem[]
  pic: PicItem[]
  stepNote?: string[]
  picNote?: string[]
}

/**
 * 区域数据
 * 参考原程序 localJson.value.eyes.area[]
 */
export interface AreaData {
  id: number
  url?: string                 // 区域参考图
  general: GeneralData         // 区域通用检测
  detail: DetailData[]         // 具体点位列表
}

/**
 * 目检面数据 (正面/背面)
 * 参考原程序 localJson.value.eyes / eyesBak
 */
export interface EyesSideData {
  total: TotalData
  area: AreaData[]
}

/**
 * X-Ray 检测数据
 * 参考原程序 processJson.xray
 */
export interface XrayData {
  total: TotalData
  area: AreaData[]
}

/**
 * 工艺 JSON 结构 (工作数据)
 * 参考原程序 ThreeDTest.vue 的 localJson / processJson
 * 
 * 注意: 这是测试过程中使用的工作数据结构,
 * 与报告数据结构 (stepList/picList) 略有不同
 */
export interface ProcessJson {
  // 弓曲度测试
  plane?: {
    size: string
    leftUrl: string
    rightUrl: string
  }
  // 2D 留存
  twoD?: string
  twoDBak?: string
  // 3D 目检 (正面)
  eyes?: EyesSideData
  // 3D 目检 (背面)
  eyesBak?: EyesSideData
  // X-Ray 检测
  xray?: XrayData
}

/**
 * 工艺数据接口 (完整工艺)
 * 从服务端下载的完整工艺数据
 */
export interface ProcessData {
  id: number
  name: string
  version?: string
  json: ProcessJson
  created_at?: string
  updated_at?: string
}

// ==================== 报告相关类型 ====================

/**
 * 报告步骤项 (报告数据)
 * 与 StepItem 不同，报告中使用 stepList/picList
 */
export interface ReportStepItem {
  id: number
  name: string
  pass: number
}

/**
 * 报告图片项
 */
export interface ReportPicItem {
  id: number
  name: string
  save: string[]
}

/**
 * 旧版类型兼容 - 工艺区域
 * @deprecated 请使用 AreaData
 */
export interface ProcessArea {
  id: number
  name: string
  url?: string
  general?: GeneralData
  detail?: DetailData[]
}

/**
 * 旧版类型兼容 - 工艺点位
 * @deprecated 请使用 DetailData
 */
export interface ProcessPoint {
  id: number
  name: string
  step?: StepItem[]
  pic?: PicItem[]
}

/**
 * 旧版类型兼容 - 工艺步骤
 * @deprecated 请使用 StepItem
 */
export interface ProcessStep {
  id: number
  name: string
  desc?: string
  pass?: number
}

// 临时工单数据 (参考原程序 tempReportJson)
export interface TempOrderData {
  testunit_id?: number
  dev_testunit_id?: number
  testunit_type: number
  board_id: number
  board_serialnumber: string
  data?: ProcessJson  // 工艺 JSON 数据
  json?: {
    plane?: {
      size: string
      leftPass: number
      rightPass: number
      leftUrl: string
      rightUrl: string
      note?: string[]
    }
    twoD?: string
    twoDBak?: string
    tempTest?: TempTestItem[]
  }
}

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

// 反馈数据
export interface FeedbackData {
  id: number
  testunit_id?: number
  dev_testunit_id?: number
  feedback_json: unknown[]
  created_at?: string
}

// 疑问数据
export interface QuestionData {
  id: number
  testunit_id?: number
  dev_testunit_id?: number
  question_json: unknown[]
  created_at?: string
}

// 进度回调类型
export type ProgressCallback = (loaded: number, total: number) => void

// ==================== 工艺服务 ====================

export const processApi = {
  /**
   * 检查工艺是否本地存在
   * 参考原程序 process_exist 方法
   * 
   * 通过 Tauri 命令检查本地缓存
   */
  async checkExist(
    processId: number,
    _headers?: Record<string, string>
  ): Promise<ApiResponse<{ code: number; exists: boolean }>> {
    try {
      const exists = await invoke<boolean>('cache_exists', {
        cacheType: 'process',
        id: String(processId)
      })
      return {
        success: true,
        data: { 
          code: exists ? 0 : 1,  // code: 0 表示存在, code: 1 表示不存在
          exists 
        }
      }
    } catch (err) {
      console.error('检查缓存失败:', err)
      return {
        success: true,
        data: { code: 1, exists: false }
      }
    }
  },

  /**
   * 下载工艺数据
   * 对应原程序 download_process 方法
   * 
   * API: GET /test/addprocess/download/?id={processId}
   */
  async download(
    processId: number,
    headers?: Record<string, string>,
    onProgress?: ProgressCallback
  ): Promise<ApiResponse<ProcessData>> {
    const queryParams = { id: String(processId) }
    
    let result: ApiResponse<ProcessData>
    
    if (onProgress) {
      result = await http.downloadWithProgress<ProcessData>(
        '/test/addprocess/download/',
        onProgress,
        headers,
        queryParams
      )
    } else {
      result = await http.get<ProcessData>('/test/addprocess/download/', headers, queryParams)
    }
    
    console.log('[processApi.download] 原始响应:', result)
    console.log('[processApi.download] result.data:', result.data)
    
    // 处理后端可能返回的包装结构 { code: 0, data: {...} }
    const responseData = result.data as unknown as { code?: number; data?: ProcessData }
    if (responseData && responseData.data && typeof responseData.code !== 'undefined') {
      console.log('[processApi.download] 检测到包装结构，提取 data 字段')
      result.data = responseData.data
    }
    
    // 下载成功后保存到本地缓存
    if (result.success && result.data) {
      try {
        await invoke('write_cache', {
          cacheType: 'process',
          id: String(processId),
          data: JSON.stringify(result.data)
        })
        console.log(`工艺 ${processId} 已缓存到本地`)
      } catch (err) {
        console.warn('缓存工艺数据失败:', err)
      }
    }
    
    return result
  },

  /**
   * 加载已存在的工艺（从本地缓存读取）
   * 对应原程序 load_exist_process 方法
   */
  async loadExist(
    processId: number,
    _headers?: Record<string, string>
  ): Promise<ApiResponse<ProcessData>> {
    try {
      const cachedData = await invoke<string>('read_cache', {
        cacheType: 'process',
        id: String(processId)
      })
      return {
        success: true,
        data: JSON.parse(cachedData) as ProcessData
      }
    } catch (err) {
      console.error('读取缓存工艺失败:', err)
      return {
        success: false,
        error: '读取缓存失败'
      }
    }
  },

  /**
   * 下载工艺（带缓存支持）
   * 
   * 优先使用本地缓存，如果不存在则从服务器下载并缓存
   * 参考原程序 download_process + process_exist + load_exist_process 的组合逻辑
   */
  async downloadWithCache(
    processId: number,
    headers?: Record<string, string>,
    onProgress?: ProgressCallback,
    forceDownload = false
  ): Promise<ApiResponse<ProcessData>> {
    console.log(`[processApi.downloadWithCache] 开始下载工艺 ${processId}, forceDownload=${forceDownload}`)
    
    // 如果不是强制下载，先检查本地缓存
    if (!forceDownload) {
      const existResult = await this.checkExist(processId)
      console.log(`[processApi.downloadWithCache] 缓存检查结果:`, existResult)
      
      if (existResult.success && existResult.data?.exists) {
        console.log(`[processApi.downloadWithCache] 工艺 ${processId} 存在本地缓存，直接读取`)
        const loadResult = await this.loadExist(processId)
        if (loadResult.success && loadResult.data) {
          console.log(`[processApi.downloadWithCache] 从缓存加载成功`)
          return loadResult
        }
        // 缓存读取失败，继续下载
        console.warn('[processApi.downloadWithCache] 读取缓存失败，重新下载')
      } else {
        console.log(`[processApi.downloadWithCache] 本地无缓存，从服务器下载`)
      }
    }
    
    // 从服务器下载（download 方法会自动缓存）
    const result = await this.download(processId, headers, onProgress)
    console.log(`[processApi.downloadWithCache] 下载结果:`, result.success ? '成功' : result.error)
    return result
  },

  /**
   * 下载临时工单数据
   * 对应原程序 download_temp_order 方法
   * 
   * API: GET /test/testunit/temp/download/?id={unitId}&type={type}
   * 
   * @param unitId 工单ID
   * @param orderType 0=生产工单(testunit_id), 1=临时工单(dev_testunit_id)
   */
  async downloadTempOrder(
    unitId: number,
    orderType: 0 | 1,
    headers?: Record<string, string>,
    onProgress?: ProgressCallback
  ): Promise<ApiResponse<TempOrderData>> {
    const queryParams = {
      id: String(unitId),
      type: String(orderType)
    }
    
    if (onProgress) {
      return http.downloadWithProgress<TempOrderData>(
        '/test/testunit/temp/download/',
        onProgress,
        headers,
        queryParams
      )
    }
    
    return http.get<TempOrderData>('/test/testunit/temp/download/', headers, queryParams)
  },

  /**
   * 读取已下载的临时工单 JSON
   * 对应原程序 read_temp_testunit 方法
   * 
   * 注意: 原程序是从本地文件读取，这里暂时重新请求服务端
   */
  async readTempTestUnit(
    unitId: number,
    orderType: 0 | 1,
    headers?: Record<string, string>
  ): Promise<ApiResponse<TempOrderData>> {
    return http.get<TempOrderData>('/test/testunit/temp/download/', headers, {
      id: String(unitId),
      type: String(orderType)
    })
  },

  /**
   * 下载反馈数据
   * 对应原程序 download_feedback 方法
   * 
   * API: GET /test/testunit/feedback/download/?id={unitId}&type={type}
   * 
   * @param unitId 工单ID
   * @param feedbackType 0=生产工单, 1=临时工单
   */
  async downloadFeedback(
    unitId: number,
    feedbackType: 0 | 1,
    headers?: Record<string, string>,
    onProgress?: ProgressCallback
  ): Promise<ApiResponse<FeedbackData>> {
    const queryParams = {
      id: String(unitId),
      type: String(feedbackType)
    }
    
    if (onProgress) {
      return http.downloadWithProgress<FeedbackData>(
        '/test/testunit/feedback/download/',
        onProgress,
        headers,
        queryParams
      )
    }
    
    return http.get<FeedbackData>('/test/testunit/feedback/download/', headers, queryParams)
  },

  /**
   * 读取已下载的反馈 JSON
   * 对应原程序 read_feedback_json 方法
   */
  async readFeedbackJson(
    unitId: number,
    feedbackType: 0 | 1,
    headers?: Record<string, string>
  ): Promise<ApiResponse<FeedbackData>> {
    return http.get<FeedbackData>('/test/testunit/feedback/download/', headers, {
      id: String(unitId),
      type: String(feedbackType)
    })
  },

  /**
   * 下载疑问数据
   * 对应原程序 download_question 方法
   * 
   * API: GET /test/testunit/question/download/?id={unitId}&type={type}
   * 
   * @param unitId 工单ID
   * @param questionType 0=生产工单, 1=临时工单
   */
  async downloadQuestion(
    unitId: number,
    questionType: 0 | 1,
    headers?: Record<string, string>,
    onProgress?: ProgressCallback
  ): Promise<ApiResponse<QuestionData>> {
    const queryParams = {
      id: String(unitId),
      type: String(questionType)
    }
    
    if (onProgress) {
      return http.downloadWithProgress<QuestionData>(
        '/test/testunit/question/download/',
        onProgress,
        headers,
        queryParams
      )
    }
    
    return http.get<QuestionData>('/test/testunit/question/download/', headers, queryParams)
  },

  /**
   * 读取已下载的疑问 JSON
   * 对应原程序 read_question_json 方法
   */
  async readQuestionJson(
    unitId: number,
    questionType: 0 | 1,
    headers?: Record<string, string>
  ): Promise<ApiResponse<QuestionData>> {
    return http.get<QuestionData>('/test/testunit/question/download/', headers, {
      id: String(unitId),
      type: String(questionType)
    })
  },

  /**
   * 上传临时测试进度
   * 对应原程序 upload_temp_testunit 方法
   * 
   * API: POST /test/testunit/temp/upload/
   * 
   * @param unitType 0=生产工单, 1=临时工单
   * @param unitId 工单ID
   * @param data 测试进度数据
   */
  async uploadTempTestUnit(
    unitType: 0 | 1,
    unitId: number,
    data: TempOrderData,
    headers?: Record<string, string>
  ): Promise<ApiResponse<{ msg: string }>> {
    const formData = new FormData()
    
    if (unitType === 0) {
      formData.append('testunit_id', String(unitId))
    } else {
      formData.append('dev_testunit_id', String(unitId))
    }
    formData.append('unit_type', String(unitType))
    
    // 将数据转为 JSON 文件
    const jsonBlob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    formData.append('file', jsonBlob, 'data.json')
    
    return http.postFormData<{ msg: string }>('/test/testunit/temp/upload/', formData, headers)
  },
}

// ==================== 缓存管理 API ====================

/**
 * 缓存大小信息
 */
export interface CacheSizes {
  process: number   // 工艺缓存大小 (MB)
  temp: number      // 临时工单缓存大小 (MB)
  feedback: number  // 反馈记录缓存大小 (MB)
  report: number    // 报告缓存大小 (MB)
  total: number     // 总大小 (MB)
}

/**
 * 缓存类型
 */
export type CacheType = 'process' | 'temp' | 'feedback' | 'report'

/**
 * 缓存管理 API
 */
export const cacheApi = {
  /**
   * 检查缓存是否存在
   */
  async exists(cacheType: CacheType, id: string): Promise<boolean> {
    try {
      return await invoke<boolean>('cache_exists', { cacheType, id })
    } catch (err) {
      console.error('检查缓存失败:', err)
      return false
    }
  },

  /**
   * 读取缓存
   */
  async read<T>(cacheType: CacheType, id: string): Promise<T | null> {
    try {
      const data = await invoke<string>('read_cache', { cacheType, id })
      return JSON.parse(data) as T
    } catch (err) {
      console.error('读取缓存失败:', err)
      return null
    }
  },

  /**
   * 写入缓存
   */
  async write(cacheType: CacheType, id: string, data: unknown): Promise<boolean> {
    try {
      await invoke('write_cache', { 
        cacheType, 
        id, 
        data: JSON.stringify(data) 
      })
      return true
    } catch (err) {
      console.error('写入缓存失败:', err)
      return false
    }
  },

  /**
   * 删除单个缓存
   */
  async delete(cacheType: CacheType, id: string): Promise<boolean> {
    try {
      await invoke('delete_cache', { cacheType, id })
      return true
    } catch (err) {
      console.error('删除缓存失败:', err)
      return false
    }
  },

  /**
   * 清除指定类型的所有缓存
   */
  async clear(cacheType: CacheType): Promise<boolean> {
    try {
      await invoke('clear_cache', { cacheType })
      return true
    } catch (err) {
      console.error('清除缓存失败:', err)
      return false
    }
  },

  /**
   * 获取指定类型缓存的大小 (MB)
   */
  async getSize(cacheType: CacheType): Promise<number> {
    try {
      return await invoke<number>('get_cache_size', { cacheType })
    } catch (err) {
      console.error('获取缓存大小失败:', err)
      return 0
    }
  },

  /**
   * 获取所有缓存的大小
   */
  async getAllSizes(): Promise<CacheSizes> {
    try {
      return await invoke<CacheSizes>('get_all_cache_sizes')
    } catch (err) {
      console.error('获取缓存大小失败:', err)
      return { process: 0, temp: 0, feedback: 0, report: 0, total: 0 }
    }
  },

  /**
   * 清除所有缓存
   */
  async clearAll(): Promise<boolean> {
    try {
      await invoke('clear_all_cache')
      return true
    } catch (err) {
      console.error('清除所有缓存失败:', err)
      return false
    }
  },

  /**
   * 列出指定类型的所有缓存 ID
   */
  async listIds(cacheType: CacheType): Promise<string[]> {
    try {
      return await invoke<string[]>('list_cache_ids', { cacheType })
    } catch (err) {
      console.error('列出缓存失败:', err)
      return []
    }
  },
}
