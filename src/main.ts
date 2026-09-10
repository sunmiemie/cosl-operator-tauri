import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initializeConfig } from './composables/useConfig'
import { initializeOfflineIcons } from './utils/iconify-offline'
import { http } from './services/http'
import { invoke } from '@tauri-apps/api/core'

// 导入 Element Plus 及其样式
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

// 导入 Tailwind CSS
import './styles/tailwind.css'

// 应用初始化
async function bootstrap() {
  // 1. 初始化离线图标（同步，无需网络）
  initializeOfflineIcons()

  // 2. 先挂载应用，避免 Tauri Store 或 API 初始化阻塞导致白屏
  const app = createApp(App)
  app.use(ElementPlus)
  app.use(router)
  app.mount('#app')

  // 3. 后台初始化配置与 API，失败时仍可进入登录页或设置页处理
  try {
    console.log('正在初始化配置...')
    const config = await initializeConfig()
    console.log('配置初始化完成:', config)

    try {
      await invoke('configure_file_receiver', {
        config: {
          enabled: config.fileReceiverEnabled,
          port: config.fileReceiverPort,
          directory: config.fileReceiverDirectory,
          tokenHash: config.fileReceiverTokenHash,
        },
      })
    } catch (error) {
      console.error('文件接收服务启动失败:', error)
    }

    console.log('正在初始化 API 服务...')
    await http.init()
    console.log('API 服务初始化完成')
    console.log('应用启动完成')
  } catch (error) {
    console.error('应用初始化失败:', error)
  }
}

// 启动应用
bootstrap()
