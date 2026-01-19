/**
 * Iconify 离线图标配置
 * 预加载项目中使用的图标集合，避免运行时网络请求
 */
import { addCollection } from '@iconify/vue'

// 导入项目中使用的 MDI 图标集合
// JSON 文件在构建时打包，运行时无需网络请求
import mdiIcons from '@iconify/json/json/mdi.json'

/**
 * 初始化离线图标
 * 在应用启动时调用，注册所有需要的图标集合
 */
export function initializeOfflineIcons(): void {
  // 注册 MDI 图标集合到 Iconify
  addCollection(mdiIcons as Parameters<typeof addCollection>[0])

  console.log('离线图标加载完成:', {
    mdi: Object.keys(mdiIcons.icons).length,
  })
}
