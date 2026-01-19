import { useConfig } from '@/composables/useConfig'

// HTTP请求方法类型
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

// 请求配置接口
interface RequestOptions {
  method?: HttpMethod
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
  queryParams?: Record<string, string>
}

// API响应接口
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  status?: number
}

/**
 * API服务类
 * 统一管理后端API请求
 */
class ApiService {
  private baseUrl: string = ''
  private defaultTimeout: number = 30000 // 30秒超时

  /**
   * 初始化API服务
   */
  async init(): Promise<void> {
    const { initConfig, config } = useConfig()
    await initConfig()
    this.baseUrl = config.value.backendUrl
    console.log('API服务已初始化, 后端地址:', this.baseUrl)
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
   * 构建完整URL（支持查询参数）
   */
  private buildUrl(endpoint: string, queryParams?: Record<string, string>): string {
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
   * 发送HTTP请求
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
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
      }

      if (!response.ok) {
        return {
          success: false,
          error: `请求失败: ${response.status} ${response.statusText}`,
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
          return {
            success: false,
            error: '请求超时',
          }
        }
        return {
          success: false,
          error: error.message,
        }
      }
      
      return {
        success: false,
        error: '未知错误',
      }
    }
  }

  /**
   * GET 请求
   * @param endpoint - API端点
   * @param headers - 请求头
   * @param queryParams - 查询参数
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
  async delete<T>(endpoint: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
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
   * @param endpoint - API端点
   * @param formData - FormData 对象
   * @param headers - 请求头（不要设置 Content-Type，让浏览器自动设置）
   */
  async postFormData<T>(
    endpoint: string,
    formData: FormData,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint)
    
    // 构建请求头（不设置 Content-Type，让浏览器自动设置 multipart/form-data boundary）
    const requestHeaders: Record<string, string> = {
      ...headers,
    }
    // 移除 Content-Type，让浏览器自动设置
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
        return {
          success: false,
          error: `请求失败: ${response.status} ${response.statusText}`,
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
}

// 导出单例实例
export const api = new ApiService()
