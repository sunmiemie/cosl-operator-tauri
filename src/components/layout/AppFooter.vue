<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { invoke } from '@tauri-apps/api/core'
import { useConnection } from '@/composables/useConnection'

const { connectionStatus, startChecking, getStatusText, checkConnection } = useConnection()

// 管理员密码
const ADMIN_PASSWORD = '123456coslX$'

// 当前时间
const currentTime = ref('')

// 密码对话框状态
const showPasswordDialog = ref(false)
const passwordInput = ref('')
const passwordInputRef = ref<HTMLInputElement | null>(null)

// 状态文本
const statusText = computed(() => getStatusText())

// 状态颜色类
const statusClass = computed(() => {
  switch (connectionStatus.value) {
    case 'online':
      return 'online'
    case 'offline':
      return 'offline'
    case 'checking':
      return 'checking'
    default:
      return 'offline'
  }
})

// 更新时间
function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 手动刷新连接状态
async function refreshConnection() {
  await checkConnection()
}

/** 打开密码对话框 */
function openDevTools() {
  passwordInput.value = ''
  showPasswordDialog.value = true
  // 等待 DOM 更新后聚焦输入框
  nextTick(() => {
    passwordInputRef.value?.focus()
  })
}

/** 关闭密码对话框 */
function closePasswordDialog() {
  showPasswordDialog.value = false
  passwordInput.value = ''
}

/** 验证密码并打开开发者工具 */
async function confirmPassword() {
  if (passwordInput.value === ADMIN_PASSWORD) {
    closePasswordDialog()
    try {
      await invoke('open_devtools')
      ElMessage.success('开发者工具已打开')
    } catch (e) {
      ElMessage.error('打开失败: ' + e)
    }
  } else {
    ElMessage.error('密码错误')
  }
}

/** 处理表单提交（回车键） */
function handlePasswordSubmit(e: Event) {
  e.preventDefault()
  confirmPassword()
}

onMounted(() => {
  updateTime()
  setInterval(updateTime, 1000)
  
  // 启动连接状态检测
  startChecking()
})
</script>

<template>
  <footer class="app-footer">
    <!-- 左侧状态信息 -->
    <div class="footer-left">
      <div 
        class="status-indicator" 
        :class="statusClass"
        @click="refreshConnection"
        title="点击刷新连接状态"
      >
        <span class="status-dot" :class="statusClass">
          <Icon v-if="connectionStatus === 'checking'" icon="mdi:loading" class="spin" />
        </span>
        <span class="status-text">{{ statusText }}</span>
      </div>
      <span class="footer-divider">|</span>
      <span class="footer-info">
        <Icon icon="mdi:tag-outline" class="footer-icon" />
        版本 0.1.0
      </span>
    </div>

    <!-- 右侧信息 -->
    <div class="footer-right">
      <!-- 开发者工具按钮 -->
      <button class="devtools-btn" @click="openDevTools" title="开发者工具">
        <Icon icon="mdi:bug-outline" />
      </button>
      <span class="footer-time">
        <Icon icon="mdi:clock-outline" class="footer-icon" />
        {{ currentTime }}
      </span>
    </div>

    <!-- 密码对话框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPasswordDialog" class="password-dialog-overlay" @click.self="closePasswordDialog">
          <div class="password-dialog">
            <div class="password-dialog-header">
              <span class="password-dialog-title">开发者工具</span>
              <button class="password-dialog-close" @click="closePasswordDialog">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <div class="password-dialog-content">
              <p class="password-dialog-label">请输入管理员密码</p>
              <form @submit="handlePasswordSubmit" autocomplete="off">
                <!-- 隐藏的用户名字段（用于可访问性） -->
                <input
                  type="text"
                  name="username"
                  autocomplete="username"
                  style="display: none;"
                  aria-hidden="true"
                />
                <input
                  ref="passwordInputRef"
                  v-model="passwordInput"
                  type="password"
                  name="password"
                  class="password-dialog-input"
                  placeholder="请输入管理员密码"
                  autocomplete="current-password"
                />
              </form>
            </div>
            <div class="password-dialog-footer">
              <button class="password-dialog-btn cancel" @click="closePasswordDialog">取消</button>
              <button class="password-dialog-btn confirm" @click="confirmPassword">确定</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </footer>
</template>

<style scoped>
.app-footer {
  height: 28px;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
  user-select: none;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 状态指示器 */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.status-indicator:hover {
  background: var(--color-bg-hover);
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
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
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

.footer-divider {
  color: var(--color-border);
}

.footer-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
}

.footer-icon {
  font-size: 14px;
}

.footer-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  color: var(--color-text-primary);
  padding: 2px 8px;
  border-radius: 4px;
}

/* 开发者工具按钮 */
.devtools-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
  opacity: 0.5;
}

.devtools-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-accent-purple);
  opacity: 1;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 密码对话框样式 */
.password-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.password-dialog {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  min-width: 400px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.password-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.password-dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.password-dialog-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  border-radius: 4px;
  transition: all 0.2s ease;
}

.password-dialog-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.password-dialog-content {
  padding: 20px;
}

.password-dialog-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
}

.password-dialog-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
  transition: all 0.2s ease;
}

.password-dialog-input:hover {
  border-color: var(--color-text-muted);
}

.password-dialog-input:focus {
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
}

.password-dialog-input::placeholder {
  color: var(--color-text-muted);
}

.password-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}

.password-dialog-btn {
  padding: 8px 20px;
  font-size: 14px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.password-dialog-btn.cancel {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.password-dialog-btn.cancel:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
}

.password-dialog-btn.confirm {
  background: var(--color-accent-blue);
  color: #fff;
}

.password-dialog-btn.confirm:hover {
  background: #4a94e8;
}

/* 对话框过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
