/**
 * HTTP 客户端 - 基础请求封装
 * 提供统一的 HTTP 请求方法、错误处理、超时控制
 */
import { useConfig } from '@/composables/useConfig'

// HTTP 请求方法类型
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

// 请求配置接口
interface RequestOptions {
  method?: HttpMethod
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
  queryParams?: Record<string, string>
}

// API 响应接口
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  status?: number
}

/**
 * HTTP 客户端类
 * 统一管理后端 API 请求
 */
class HttpClient {
  private baseUrl: string = ''
  private defaultTimeout: number = 30000 // 30秒超时
  private initialized: boolean = false

  /**
   * 初始化 HTTP 客户端
   */
  async init(): Promise<void> {
    if (this.initialized && this.baseUrl) return
    const { initConfig, config } = useConfig()
    await initConfig()
    this.baseUrl = config.value.backendUrl
    this.initialized = true
    console.log('HTTP 客户端已初始化, 后端地址:', this.baseUrl)
  }

  /**
   * 确保已初始化（在请求前自动调用）
   */
  private async ensureInit(): Promise<void> {
    if (!this.initialized || !this.baseUrl) {
      await this.init()
    }
  }

  /**
   * 获取当前后端地址
   */
  getBaseUrl(): string {
    return this.baseUrl
  }

  /**
   * 更新后端地址
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '') // 移除末尾斜杠
    console.log('后端地址已更新:', this.baseUrl)
  }

  /**
   * 刷新后端地址（从配置重新读取）
   */
  async refreshBaseUrl(): Promise<void> {
    const { config } = useConfig()
    this.baseUrl = config.value.backendUrl
    console.log('后端地址已刷新:', this.baseUrl)
  }

  /**
   * 构建完整 URL（支持查询参数）
   */
  buildUrl(endpoint: string, queryParams?: Record<string, string>): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    let url = `${this.baseUrl}${cleanEndpoint}`
    
    // 添加查询参数
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams(queryParams)
      url += `?${params.toString()}`
    }
    
    return url
  }

  /**
   * 发送 HTTP 请求
   */
  async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    // 确保客户端已初始化
    await this.ensureInit()

    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.defaultTimeout,
      queryParams,
    } = options

    const url = this.buildUrl(endpoint, queryParams)

    // 构建请求头
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    }

    // 构建请求配置
    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
    }

    // 添加请求体
    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body)
    }

    // 创建超时控制器
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    fetchOptions.signal = controller.signal

    try {
      const response = await fetch(url, fetchOptions)
      clearTimeout(timeoutId)

      // 解析响应
      let data: T | undefined
      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('application/json')) {
        data = await response.json()
      } else if (contentType?.includes('application/octet-stream') || 
                 contentType?.includes('text/plain')) {
        // 处理文件下载响应 - 尝试解析为 JSON
        const text = await response.text()
        try {
          data = JSON.parse(text)
          console.log('[HTTP] 解析 octet-stream 响应为 JSON 成功')
        } catch {
          console.warn('[HTTP] octet-stream 响应不是有效 JSON:', text.substring(0, 100))
        }
      }

      if (!response.ok) {
        const responseMessage =
          data && typeof data === 'object'
            ? String(
                (data as Record<string, unknown>).msg ||
                  (data as Record<string, unknown>).message ||
                  (data as Record<string, unknown>).detail ||
                  ''
              )
            : ''
        return {
          success: false,
          data,
          error: responseMessage || `请求失败: ${response.status} ${response.statusText}`,
          status: response.status,
        }
      }

      return {
        success: true,
        data,
        status: response.status,
      }
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { success: false, error: '请求超时' }
        }
        return { success: false, error: error.message }
      }
      
      return { success: false, error: '未知错误' }
    }
  }

  /**
   * GET 请求
   */
  async get<T>(
    endpoint: string, 
    headers?: Record<string, string>,
    queryParams?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', headers, queryParams })
  }

  /**
   * POST 请求
   */
  async post<T>(
    endpoint: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body, headers })
  }

  /**
   * PUT 请求
   */
  async put<T>(
    endpoint: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body, headers })
  }

  /**
   * DELETE 请求
   */
  async delete<T>(
    endpoint: string, 
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE', headers })
  }

  /**
   * PATCH 请求
   */
  async patch<T>(
    endpoint: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body, headers })
  }

  /**
   * POST FormData 请求（用于文件上传）
   */
  async postFormData<T>(
    endpoint: string,
    formData: FormData,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    // 确保客户端已初始化
    await this.ensureInit()

    const url = this.buildUrl(endpoint)
    
    // 不设置 Content-Type，让浏览器自动设置 multipart/form-data boundary
    const requestHeaders: Record<string, string> = { ...headers }
    delete requestHeaders['Content-Type']

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 上传超时60秒

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: formData,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      let data: T | undefined
      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('application/json')) {
        data = await response.json()
      }

      if (!response.ok) {
        const responseMessage =
          data && typeof data === 'object'
            ? String(
                (data as Record<string, unknown>).msg ||
                  (data as Record<string, unknown>).message ||
                  (data as Record<string, unknown>).detail ||
                  ''
              )
            : ''
        return {
          success: false,
          data,
          error: responseMessage || `请求失败: ${response.status} ${response.statusText}`,
          status: response.status,
        }
      }

      return { success: true, data, status: response.status }
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { success: false, error: '请求超时' }
        }
        return { success: false, error: error.message }
      }
      
      return { success: false, error: '未知错误' }
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<ApiResponse<{ connected: boolean }>> {
    try {
      const response = await this.get<unknown>('/login/service')
      return {
        success: response.success,
        data: { connected: response.success },
        error: response.error,
      }
    } catch {
      return {
        success: false,
        data: { connected: false },
        error: '无法连接到后端服务',
      }
    }
  }

  /**
   * 带进度的流式下载
   * 用于大文件下载并显示进度
   * @param endpoint API 端点
   * @param onProgress 进度回调 (loaded: 已下载字节, total: 总字节)
   * @param headers 请求头
   * @param queryParams 查询参数
   */
  async downloadWithProgress<T>(
    endpoint: string,
    onProgress: (loaded: number, total: number) => void,
    headers?: Record<string, string>,
    queryParams?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    // 确保客户端已初始化
    await this.ensureInit()

    const url = this.buildUrl(endpoint, queryParams)
    
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: requestHeaders,
      })

      if (!response.ok) {
        return {
          success: false,
          error: `请求失败: ${response.status} ${response.statusText}`,
          status: response.status,
        }
      }

      // 获取 Content-Length 用于计算进度
      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      // 检查是否支持流式读取
      if (!response.body) {
        // 不支持流式读取，直接返回数据
        const data = await response.json()
        onProgress(total, total)
        return { success: true, data, status: response.status }
      }

      // 使用 ReadableStream 读取数据并报告进度
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        loaded += value.length
        onProgress(loaded, total)
      }

      // 合并所有 chunks
      const allChunks = new Uint8Array(loaded)
      let position = 0
      for (const chunk of chunks) {
        allChunks.set(chunk, position)
        position += chunk.length
      }

      // 将 Uint8Array 转换为字符串，再解析为 JSON
      const decoder = new TextDecoder('utf-8')
      const text = decoder.decode(allChunks)
      const data = JSON.parse(text) as T

      return { success: true, data, status: response.status }
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: error.message }
      }
      return { success: false, error: '下载失败' }
    }
  }

  /**
   * 下载文件（返回 ArrayBuffer）
   * 用于二进制文件下载
   */
  async downloadFile(
    endpoint: string,
    onProgress?: (loaded: number, total: number) => void,
    headers?: Record<string, string>,
    queryParams?: Record<string, string>
  ): Promise<ApiResponse<ArrayBuffer>> {
    await this.ensureInit()

    const url = this.buildUrl(endpoint, queryParams)
    
    const requestHeaders: Record<string, string> = { ...headers }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: requestHeaders,
      })

      if (!response.ok) {
        return {
          success: false,
          error: `请求失败: ${response.status} ${response.statusText}`,
          status: response.status,
        }
      }

      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      if (!response.body || !onProgress) {
        const data = await response.arrayBuffer()
        onProgress?.(total, total)
        return { success: true, data, status: response.status }
      }

      // 流式读取
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        loaded += value.length
        onProgress(loaded, total)
      }

      // 合并 chunks 到 ArrayBuffer
      const allChunks = new Uint8Array(loaded)
      let position = 0
      for (const chunk of chunks) {
        allChunks.set(chunk, position)
        position += chunk.length
      }

      return { success: true, data: allChunks.buffer, status: response.status }
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: error.message }
      }
      return { success: false, error: '下载失败' }
    }
  }
}

// 导出单例实例
export const http = new HttpClient()
