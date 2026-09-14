export type ActiveSafeExitReason = 'application-close'

export type ActiveSafeExitHandler = (
  reason: ActiveSafeExitReason,
) => Promise<boolean | null>

let activeSafeExitHandler: ActiveSafeExitHandler | null = null

/**
 * 注册当前业务页的安全退出处理器。
 *
 * 返回 true 表示业务收尾完成，可以关闭应用；false 表示用户取消或收尾失败；
 * null 表示当前页面没有进行中的业务，由应用继续显示普通退出确认。
 */
export function registerActiveSafeExitHandler(
  handler: ActiveSafeExitHandler,
): () => void {
  activeSafeExitHandler = handler
  return () => {
    if (activeSafeExitHandler === handler) {
      activeSafeExitHandler = null
    }
  }
}

export async function requestActiveSafeExit(
  reason: ActiveSafeExitReason,
): Promise<boolean | null> {
  if (!activeSafeExitHandler) return null
  return activeSafeExitHandler(reason)
}
