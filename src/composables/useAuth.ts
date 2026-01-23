import { ref, computed, readonly } from 'vue'
import { http } from '@/services/http'
import { load } from '@tauri-apps/plugin-store'

// 用户信息接口
export interface UserInfo {
  id: number
  username: string
  nickName: string
  roles: string[]
  introduction: string
  avatar: string
}

// 登录响应接口
interface LoginResponse {
  code: number
  msg: string
  data: {
    token?: string
  }
}

// 用户信息响应接口
interface UserInfoResponse {
  code: number
  msg: string
  data: UserInfo
}

// Token 和用户信息存储键
const TOKEN_KEY = 'auth-token'
const USER_INFO_KEY = 'user-info'

// Store 实例
let authStore: Awaited<ReturnType<typeof load>> | null = null

// 全局状态（模块级别，所有组件共享）
const token = ref<string | null>(null)
const userInfo = ref<UserInfo | null>(null)
const isLoading = ref(false)
const isInitialized = ref(false)

// 计算属性：是否已登录
const isLoggedIn = computed(() => !!token.value)

/**
 * 初始化 Store
 */
async function getStore() {
  if (!authStore) {
    authStore = await load('auth.json')
  }
  return authStore
}

/**
 * 获取带 Authorization header 的请求头
 */
function getAuthHeaders(): Record<string, string> {
  if (token.value) {
    return { Authorization: `Bearer ${token.value}` }
  }
  return {}
}

/**
 * 认证管理 composable
 */
export function useAuth() {
  /**
   * 初始化认证状态（从 Store 加载）
   */
  const initAuth = async (): Promise<boolean> => {
    // 避免重复初始化
    if (isInitialized.value && token.value) {
      return true
    }

    try {
      const store = await getStore()

      // 从 store 读取 token 和用户信息
      const savedToken = await store.get<string>(TOKEN_KEY)
      const savedUserInfo = await store.get<UserInfo>(USER_INFO_KEY)

      if (savedToken) {
        token.value = savedToken

        // 如果有保存的用户信息，先恢复
        if (savedUserInfo) {
          userInfo.value = savedUserInfo
        }

        // 验证 token 有效性并更新用户信息
        const valid = await validateToken()
        if (!valid) {
          await logout()
          return false
        }

        isInitialized.value = true
        return true
      }

      return false
    } catch (error) {
      console.error('初始化认证失败:', error)
      return false
    }
  }

  /**
   * 登录
   */
  const login = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    isLoading.value = true

    try {
      // 确保 HTTP 客户端已初始化
      if (!http.getBaseUrl()) {
        await http.init()
      }

      // 发送登录请求
      const response = await http.post<LoginResponse>('/login/login', {
        username,
        password: password,
      })

      if (response.success && response.data?.code === 0 && response.data?.data?.token) {
        const store = await getStore()

        // 保存 token
        token.value = response.data.data.token
        await store.set(TOKEN_KEY, token.value)

        // 获取并保存用户信息
        await fetchUserInfo()

        isInitialized.value = true
        return { success: true, message: '登录成功' }
      } else {
        const msg = response.data?.msg || response.error || '登录失败'
        return { success: false, message: msg }
      }
    } catch (error) {
      console.error('登录错误:', error)
      return { success: false, message: '网络错误，请检查后端连接' }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 获取用户信息
   */
  const fetchUserInfo = async (): Promise<boolean> => {
    if (!token.value) return false

    try {
      // 使用 Authorization header 获取用户信息
      const response = await http.get<UserInfoResponse>('/login/info', getAuthHeaders())

      if (response.success && response.data?.code === 0) {
        userInfo.value = response.data.data

        // 保存到 store
        const store = await getStore()
        await store.set(USER_INFO_KEY, userInfo.value)

        return true
      }
      return false
    } catch (error) {
      console.error('获取用户信息失败:', error)
      return false
    }
  }

  /**
   * 验证 token 有效性
   */
  const validateToken = async (): Promise<boolean> => {
    if (!token.value) return false

    try {
      // 确保 HTTP 客户端已初始化
      if (!http.getBaseUrl()) {
        await http.init()
      }

      // 使用 Authorization header 验证 token
      const response = await http.get<UserInfoResponse>('/login/info', getAuthHeaders())

      if (response.success && response.data?.code === 0) {
        userInfo.value = response.data.data

        // 更新 store 中的用户信息
        const store = await getStore()
        await store.set(USER_INFO_KEY, userInfo.value)

        return true
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * 登出
   */
  const logout = async (): Promise<void> => {
    try {
      // 调用后端登出接口
      if (token.value) {
        await http.get('/login/logout', getAuthHeaders())
      }
    } catch (error) {
      console.warn('登出请求失败:', error)
    } finally {
      // 清除本地状态
      token.value = null
      userInfo.value = null
      isInitialized.value = false

      // 清除 store
      try {
        const store = await getStore()
        await store.delete(TOKEN_KEY)
        await store.delete(USER_INFO_KEY)
      } catch (error) {
        console.warn('清除 store 失败:', error)
      }
    }
  }

  /**
   * 获取 token（用于请求头）
   */
  const getToken = (): string | null => {
    return token.value
  }

  return {
    token: readonly(token),
    userInfo: readonly(userInfo),
    isLoggedIn,
    isLoading: readonly(isLoading),
    isInitialized: readonly(isInitialized),
    initAuth,
    login,
    logout,
    fetchUserInfo,
    validateToken,
    getToken,
    getAuthHeaders,
  }
}
