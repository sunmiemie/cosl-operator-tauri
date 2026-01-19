import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initializeConfig } from './composables/useConfig'
import { initializeOfflineIcons } from './utils/iconify-offline'
import { api } from './services/api'

// 导入 Element Plus 样式（用于 ElMessageBox、ElMessage 等组件）
import 'element-plus/dist/index.css'

// 导入 Tailwind CSS
import './styles/tailwind.css'

// 应用初始化
async function bootstrap() {
  try {
    // 1. 初始化离线图标（同步，无需网络）
    initializeOfflineIcons()

    // 2. 初始化配置（确保配置文件存在）
    console.log('正在初始化配置...')
    const config = await initializeConfig()
    console.log('配置初始化完成:', config)

    // 3. 初始化 API 服务（使用配置中的后端地址）
    console.log('正在初始化 API 服务...')
    await api.init()
    console.log('API 服务初始化完成')

    // 4. 创建 Vue 应用实例
    const app = createApp(App)
    app.use(router)
    app.mount('#app')

    console.log('应用启动完成')
  } catch (error) {
    console.error('应用初始化失败:', error)
    
    // 即使初始化失败，也尝试启动应用（用户可以在设置中修复配置）
    const app = createApp(App)
    app.use(router)
    app.mount('#app')
  }
}

// 启动应用
bootstrap()
