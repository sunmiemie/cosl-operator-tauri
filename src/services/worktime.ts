/**
 * 工时统计服务
 * 
 * 复刻旧版 pyapp/timer/timer.py 的工时统计逻辑:
 * - start: 开始计时
 * - stop: 停止计时并上传到后端
 * 
 * 后端接口: POST /data/worktime/update
 * 参数: { user_id: number, second: number }
 */
import { http, type ApiResponse } from './http'

// 工时统计状态
interface WorktimeState {
  isTesting: boolean
  startTime: number | null
  elapsedSeconds: number
}

// 模块级状态（模拟旧版 Timer 类的静态变量）
const state: WorktimeState = {
  isTesting: false,
  startTime: null,
  elapsedSeconds: 0
}

// 计时器 ID
let timerIntervalId: ReturnType<typeof setInterval> | null = null

/**
 * 开始工时计时
 * 对应旧版 start_worktime_counts()
 */
export function startWorktime(): void {
  // 如果已经在计时，先停止
  if (state.isTesting) {
    console.warn('[工时] 已在计时中，忽略重复调用')
    return
  }
  
  state.isTesting = true
  state.startTime = Date.now()
  state.elapsedSeconds = 0
  
  // 启动计时器，每秒更新一次
  timerIntervalId = setInterval(() => {
    if (state.isTesting && state.startTime) {
      state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000)
    }
  }, 1000)
  
  console.log('[工时] 开始计时')
}

/**
 * 停止工时计时并上传
 * 对应旧版 stop_worktime_counts(userId)
 * 
 * @param userId 用户ID
 * @param headers 请求头（包含认证信息）
 */
export async function stopWorktime(
  userId: number,
  headers?: Record<string, string>
): Promise<ApiResponse<unknown>> {
  // 停止计时
  state.isTesting = false
  
  // 清除计时器
  if (timerIntervalId) {
    clearInterval(timerIntervalId)
    timerIntervalId = null
  }
  
  // 计算最终耗时
  if (state.startTime) {
    state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000)
  }
  
  const seconds = state.elapsedSeconds
  
  console.log(`[工时] 停止计时, 用户: ${userId}, 耗时: ${seconds} 秒`)
  
  // 重置状态
  state.startTime = null
  state.elapsedSeconds = 0
  
  // 如果没有有效的工时数据，跳过上传
  if (seconds <= 0) {
    console.log('[工时] 无有效工时，跳过上传')
    return { success: true }
  }
  
  // 上传到后端
  try {
    const result = await http.post<{ code: number; msg: string }>(
      '/data/worktime/update',
      { user_id: userId, second: seconds },
      headers
    )
    
    if (result.success) {
      console.log('[工时] 上传成功')
    } else {
      console.error('[工时] 上传失败:', result.error)
    }
    
    return result
  } catch (err) {
    console.error('[工时] 上传异常:', err)
    return { success: false, error: '工时上传失败' }
  }
}

/**
 * 获取当前计时状态
 */
export function getWorktimeState(): Readonly<WorktimeState> {
  return { ...state }
}

/**
 * 获取当前已计时秒数（实时）
 */
export function getElapsedSeconds(): number {
  if (!state.isTesting || !state.startTime) {
    return state.elapsedSeconds
  }
  return Math.floor((Date.now() - state.startTime) / 1000)
}

/**
 * 检查是否正在计时
 */
export function isTracking(): boolean {
  return state.isTesting
}

// 导出服务对象（便于统一导入）
export const worktimeApi = {
  start: startWorktime,
  stop: stopWorktime,
  getState: getWorktimeState,
  getElapsedSeconds,
  isTracking
}
