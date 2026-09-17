import { readonly, ref } from 'vue'

export const simulationWellNavigationMessage = '模拟井测试进行中，请先结束或中止测试'
const lockedPath = ref('')
let allowedPath: string | null = null
export const simulationWellLockedPath = readonly(lockedPath)

// 暂停和连接异常不会解除测试页面的导航限制。
export function syncSimulationWellNavigationLock(fullPath: string, testing: boolean) {
  lockedPath.value = testing ? fullPath : ''
  allowedPath = null
}
export function clearSimulationWellNavigationLock() {
  lockedPath.value = ''
  allowedPath = null
}
export function canNavigateSimulationWell(fullPath: string) {
  return !lockedPath.value || fullPath === lockedPath.value
}
export function checkSimulationWellNavigation(fullPath: string) {
  if (canNavigateSimulationWell(fullPath)) return true
  if (allowedPath === fullPath) {
    allowedPath = null
    return true
  }
  return false
}
// 放行绑定确切目标；导航失败时同样清除，不能复用于其他目的地。
export async function allowSimulationWellNavigation<T>(fullPath: string, navigate: () => Promise<T>) {
  allowedPath = fullPath
  try {
    return await navigate()
  } finally {
    if (allowedPath === fullPath) allowedPath = null
  }
}
