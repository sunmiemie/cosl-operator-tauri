<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Icon } from '@iconify/vue'
import { useTheme } from '@/composables/useTheme'
import { useConfig } from '@/composables/useConfig'
import { useConnection } from '@/composables/useConnection'
import { http } from '@/services/http'

const { initTheme } = useTheme()
const { initConfig, setConfigItem, config } = useConfig()
const { connectionStatus: connStatus, startChecking, getStatusText, checkConnection } = useConnection()

// 获取当前窗口
const appWindow = getCurrentWindow()
const isMaximized = ref(false)

// 连接状态显示
const statusText = computed(() => getStatusText())
const statusClass = computed(() => {
  switch (connStatus.value) {
    case 'online': return 'online'
    case 'offline': return 'offline'
    case 'checking': return 'checking'
    default: return 'offline'
  }
})

// 连接设置
const showSettingsDialog = ref(false)
const backendUrl = ref('http://localhost:8080')
const isSaving = ref(false)
const saveSuccess = ref(false)
const isTestingConnection = ref(false)
const testConnectionStatus = ref<'idle' | 'success' | 'error'>('idle')

// 密码验证
const ADMIN_PASSWORD = '123456coslX$'  // 管理员密码
const showPasswordDialog = ref(false)
const passwordInput = ref('')
const passwordError = ref('')
const pendingAction = ref<(() => void) | null>(null)

// 初始化
onMounted(async () => {
  await initTheme()
  await initConfig()
  isMaximized.value = await appWindow.isMaximized()
  
  // 加载后端地址配置
  backendUrl.value = config.value.backendUrl || 'http://localhost:8080'
  
  // 启动连接状态检测
  startChecking()
})

// 监听窗口大小变化
appWindow.onResized(async () => {
  isMaximized.value = await appWindow.isMaximized()
})

// 窗口控制方法
async function minimizeWindow() {
  await appWindow.minimize()
}

async function toggleMaximize() {
  await appWindow.toggleMaximize()
  isMaximized.value = await appWindow.isMaximized()
}

async function closeWindow() {
  await appWindow.close()
}

// 打开设置对话框（需要密码）
function openSettingsDialog() {
  requirePassword(() => {
    backendUrl.value = config.value.backendUrl || 'http://localhost:8080'
    showSettingsDialog.value = true
  })
}

// 请求密码验证
function requirePassword(action: () => void) {
  pendingAction.value = action
  passwordInput.value = ''
  passwordError.value = ''
  showPasswordDialog.value = true
}

// 验证密码
function verifyPassword() {
  if (passwordInput.value === ADMIN_PASSWORD) {
    showPasswordDialog.value = false
    if (pendingAction.value) {
      pendingAction.value()
      pendingAction.value = null
    }
  } else {
    passwordError.value = '密码错误'
  }
}

// 取消密码验证
function cancelPasswordDialog() {
  showPasswordDialog.value = false
  passwordInput.value = ''
  passwordError.value = ''
  pendingAction.value = null
}

// 保存后端地址
async function saveBackendUrl() {
  isSaving.value = true
  saveSuccess.value = false
  
  try {
    await setConfigItem('backendUrl', backendUrl.value)
    http.setBaseUrl(backendUrl.value)
    saveSuccess.value = true
    setTimeout(() => {
      saveSuccess.value = false
    }, 2000)
  } catch (error) {
    console.error('保存后端地址失败:', error)
  } finally {
    isSaving.value = false
  }
}

// 测试连接（对话框内）
async function testConnectionInDialog() {
  isTestingConnection.value = true
  testConnectionStatus.value = 'idle'
  
  try {
    http.setBaseUrl(backendUrl.value)
    const result = await http.testConnection()
    testConnectionStatus.value = result.success ? 'success' : 'error'
  } catch {
    testConnectionStatus.value = 'error'
  } finally {
    isTestingConnection.value = false
    setTimeout(() => {
      testConnectionStatus.value = 'idle'
    }, 3000)
  }
}

// 手动刷新连接状态
async function refreshConnection() {
  await checkConnection()
}
</script>

<template>
  <div class="auth-layout">
    <!-- 标题栏 -->
    <header class="auth-header" data-tauri-drag-region>
      <div class="header-spacer"></div>
      
      <!-- 窗口控制按钮 -->
      <div class="window-controls">
        <button class="control-btn minimize" @click="minimizeWindow" title="最小化">
          <Icon icon="mdi:minus" />
        </button>
        <button class="control-btn maximize" @click="toggleMaximize" :title="isMaximized ? '还原' : '最大化'">
          <Icon :icon="isMaximized ? 'mdi:window-restore' : 'mdi:window-maximize'" />
        </button>
        <button class="control-btn close" @click="closeWindow" title="关闭">
          <Icon icon="mdi:close" />
        </button>
      </div>
    </header>

    <!-- 内容区域 -->
    <main class="auth-content">
      <slot />
    </main>

    <!-- 底部栏 -->
    <footer class="auth-footer">
      <!-- 连接状态 -->
      <div 
        class="status-indicator" 
        :class="statusClass"
        @click="refreshConnection"
        title="点击刷新连接状态"
      >
        <span class="status-dot" :class="statusClass">
          <Icon v-if="connStatus === 'checking'" icon="mdi:loading" class="spin" />
        </span>
        <span class="status-text">{{ statusText }}</span>
      </div>
      
      <!-- 连接设置按钮 -->
      <button class="settings-btn" @click="openSettingsDialog" title="连接设置">
        <Icon icon="mdi:cog" />
        <span>连接设置</span>
      </button>
    </footer>

    <!-- 连接设置对话框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showSettingsDialog" class="dialog-overlay" @click="showSettingsDialog = false">
          <div class="settings-dialog" @click.stop>
            <div class="dialog-header">
              <span>连接设置</span>
              <button class="close-btn" @click="showSettingsDialog = false">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div class="dialog-content">
              <div class="setting-item">
                <label>后端地址</label>
                <div class="backend-config">
                  <input 
                    v-model="backendUrl" 
                    type="text" 
                    class="backend-input"
                    placeholder="http://localhost:8080"
                  />
                  <button 
                    class="action-btn test-btn" 
                    :class="{ 
                      testing: isTestingConnection, 
                      success: testConnectionStatus === 'success',
                      error: testConnectionStatus === 'error'
                    }"
                    @click="testConnectionInDialog"
                    :disabled="isTestingConnection"
                    title="测试连接"
                  >
                    <Icon v-if="testConnectionStatus === 'success'" icon="mdi:check" />
                    <Icon v-else-if="testConnectionStatus === 'error'" icon="mdi:close" />
                    <Icon v-else-if="isTestingConnection" icon="mdi:loading" class="spin" />
                    <Icon v-else icon="mdi:lan-connect" />
                  </button>
                  <button 
                    class="action-btn save-btn" 
                    :class="{ saving: isSaving, success: saveSuccess }"
                    @click="saveBackendUrl"
                    :disabled="isSaving"
                  >
                    <Icon v-if="saveSuccess" icon="mdi:check" />
                    <Icon v-else-if="isSaving" icon="mdi:loading" class="spin" />
                    <span v-else>保存</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 密码验证对话框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPasswordDialog" class="dialog-overlay password-overlay" @click="cancelPasswordDialog">
          <div class="password-dialog" @click.stop>
            <div class="password-header">
              <Icon icon="mdi:lock" class="lock-icon" />
              <span>需要管理员密码</span>
            </div>
            <div class="password-content">
              <input
                v-model="passwordInput"
                type="password"
                class="password-input"
                placeholder="请输入管理员密码"
                @keyup.enter="verifyPassword"
                autofocus
              />
              <p v-if="passwordError" class="password-error">{{ passwordError }}</p>
            </div>
            <div class="password-actions">
              <button class="cancel-btn" @click="cancelPasswordDialog">取消</button>
              <button class="confirm-btn" @click="verifyPassword">确认</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.auth-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  overflow: hidden;
}

/* 标题栏 */
.auth-header {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  -webkit-app-region: drag;
  flex-shrink: 0;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
}

.header-spacer {
  flex: 1;
}

/* 窗口控制按钮 */
.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 48px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  font-size: 14px;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-primary);
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}

/* 内容区域 */
.auth-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 底部栏 */
.auth-footer {
  position: absolute;
  bottom: 16px;
  left: 16px;
  right: 16px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 状态指示器 */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  transition: all 0.2s ease;
  font-size: 13px;
}

.status-indicator:hover {
  background: rgba(255, 255, 255, 0.15);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.status-dot.online {
  background: var(--color-accent-green);
  box-shadow: 0 0 8px var(--color-accent-green);
  animation: pulse 2s ease-in-out infinite;
}

.status-dot.offline {
  background: var(--color-accent-red);
  box-shadow: 0 0 8px var(--color-accent-red);
}

.status-dot.checking {
  background: var(--color-accent-orange);
  width: 14px;
  height: 14px;
  font-size: 10px;
}

.status-dot.checking .spin {
  color: white;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.status-text {
  font-weight: 500;
  transition: color 0.3s ease;
}

.status-indicator.online .status-text {
  color: var(--color-accent-green);
}

.status-indicator.offline .status-text {
  color: var(--color-accent-red);
}

.status-indicator.checking .status-text {
  color: var(--color-accent-orange);
}

.settings-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: var(--color-text-primary);
}

/* 对话框遮罩 */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

/* 设置对话框 */
.settings-dialog {
  background: var(--color-bg-secondary);
  border-radius: 12px;
  width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  font-size: 15px;
  font-weight: 500;
}

.dialog-header .close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.dialog-header .close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-primary);
}

.dialog-content {
  padding: 20px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-item label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.backend-config {
  display: flex;
  gap: 8px;
}

.backend-input {
  flex: 1;
  padding: 10px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.backend-input:focus {
  border-color: var(--color-accent-red);
}

.action-btn {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.test-btn {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.test-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.test-btn.success {
  background: #22c55e;
  border-color: #22c55e;
  color: white;
}

.test-btn.error {
  background: #ef4444;
  border-color: #ef4444;
  color: white;
}

.save-btn {
  background: var(--color-accent-red);
  border: none;
  color: white;
  min-width: 70px;
}

.save-btn:hover {
  background: #dc2626;
}

.save-btn.success {
  background: #22c55e;
}

/* 密码对话框 */
.password-overlay {
  z-index: 10001;
}

.password-dialog {
  background: var(--color-bg-secondary);
  border-radius: 12px;
  padding: 24px;
  width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.password-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  font-size: 16px;
  font-weight: 500;
}

.lock-icon {
  font-size: 20px;
  color: var(--color-accent-red);
}

.password-content {
  margin-bottom: 20px;
}

.password-input {
  width: 100%;
  padding: 12px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.password-input:focus {
  border-color: var(--color-accent-red);
}

.password-error {
  color: #ef4444;
  font-size: 12px;
  margin-top: 8px;
  margin-bottom: 0;
}

.password-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.password-actions button {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.cancel-btn:hover {
  background: var(--color-bg-hover);
}

.confirm-btn {
  background: var(--color-accent-red);
  border: none;
  color: white;
}

.confirm-btn:hover {
  background: #dc2626;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 旋转动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
