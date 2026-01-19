<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import AuthLayout from '@/layouts/AuthLayout.vue'
import { useAuth } from '@/composables/useAuth'
import { useTheme } from '@/composables/useTheme'

const router = useRouter()
const { login, isLoading, initAuth } = useAuth()
const { initTheme } = useTheme()

// 表单数据
const username = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)

// 错误信息
const errorMessage = ref('')

// 初始化
onMounted(async () => {
  await initTheme()
  
  // 检查是否已登录
  const isLoggedIn = await initAuth()
  if (isLoggedIn) {
    router.replace('/')
  }
  
  // 读取记住的用户名
  const savedUsername = localStorage.getItem('remembered-username')
  if (savedUsername) {
    username.value = savedUsername
    rememberMe.value = true
  }
})

// 登录处理
async function handleLogin() {
  errorMessage.value = ''
  
  if (!username.value.trim()) {
    errorMessage.value = '请输入用户名'
    return
  }
  
  if (!password.value) {
    errorMessage.value = '请输入密码'
    return
  }
  
  const result = await login(username.value, password.value)
  
  if (result.success) {
    // 记住用户名
    if (rememberMe.value) {
      localStorage.setItem('remembered-username', username.value)
    } else {
      localStorage.removeItem('remembered-username')
    }
    
    // 跳转到主页
    router.replace('/')
  } else {
    errorMessage.value = result.message
  }
}

// 按键处理
function handleKeyPress(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    handleLogin()
  }
}
</script>

<template>
  <AuthLayout>
    <div class="login-container">
      <!-- 背景装饰 -->
      <div class="bg-decoration">
        <div class="glow-orb orb-1"></div>
        <div class="glow-orb orb-2"></div>
        <div class="glow-orb orb-3"></div>
      </div>

      <!-- 登录卡片 -->
      <div class="login-card">
        <!-- Logo -->
        <div class="login-header">
          <img src="@/assets/jianwei.png" alt="logo" class="login-logo" />
          <h1 class="login-title">见微-数字化实验室测试台软件</h1>
          <p class="login-subtitle">COSL Test Bench Operator</p>
        </div>

        <!-- 登录表单 -->
        <form class="login-form" @submit.prevent="handleLogin">
          <!-- 用户名 -->
          <div class="form-group">
            <label class="form-label">用户名</label>
            <div class="input-wrapper">
              <Icon icon="mdi:account-outline" class="input-icon" />
              <input
                v-model="username"
                type="text"
                class="form-input"
                placeholder="请输入用户名"
                autocomplete="username"
                @keypress="handleKeyPress"
              />
            </div>
          </div>

          <!-- 密码 -->
          <div class="form-group">
            <label class="form-label">密码</label>
            <div class="input-wrapper">
              <Icon icon="mdi:lock-outline" class="input-icon" />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="form-input"
                placeholder="请输入密码"
                autocomplete="current-password"
                @keypress="handleKeyPress"
              />
              <button
                type="button"
                class="password-toggle"
                @click="showPassword = !showPassword"
              >
                <Icon :icon="showPassword ? 'mdi:eye-off-outline' : 'mdi:eye-outline'" />
              </button>
            </div>
          </div>

          <!-- 记住我 -->
          <div class="form-options">
            <label class="checkbox-label">
              <input type="checkbox" v-model="rememberMe" class="checkbox-input" />
              <span class="checkbox-text">记住用户名</span>
            </label>
          </div>

          <!-- 错误信息 -->
          <div v-if="errorMessage" class="error-message">
            <Icon icon="mdi:alert-circle-outline" />
            <span>{{ errorMessage }}</span>
          </div>

          <!-- 登录按钮 -->
          <button type="submit" class="login-btn" :disabled="isLoading">
            <Icon v-if="isLoading" icon="mdi:loading" class="spin" />
            <span v-else>登 录</span>
          </button>
        </form>

        <!-- 底部信息 -->
        <div class="login-footer">
          <span>Tsinghua University NEVT Lab</span>
        </div>
      </div>
    </div>
  </AuthLayout>
</template>

<style scoped>
.login-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

/* 背景装饰 */
.bg-decoration {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.glow-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
}

.orb-1 {
  width: 400px;
  height: 400px;
  background: var(--color-accent-blue);
  top: -100px;
  left: -100px;
  animation: float 12s ease-in-out infinite;
}

.orb-2 {
  width: 300px;
  height: 300px;
  background: var(--color-accent-purple);
  bottom: -50px;
  right: -50px;
  animation: float 10s ease-in-out infinite reverse;
}

.orb-3 {
  width: 200px;
  height: 200px;
  background: var(--color-accent-green);
  top: 50%;
  right: 20%;
  animation: float 8s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-30px) scale(1.05);
  }
}

/* 登录卡片 */
.login-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

/* 登录头部 */
.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 32px;
}

.login-logo {
  width: 100px;
  height: 100px;
  margin-bottom: 16px;
}

.login-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.login-subtitle {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
  font-family: var(--font-mono);
}

/* 表单 */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  font-size: 18px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.form-input {
  width: 100%;
  padding: 12px 14px 12px 44px;
  font-size: 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-primary);
  transition: all 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
}

.form-input::placeholder {
  color: var(--color-text-muted);
}

.password-toggle {
  position: absolute;
  right: 12px;
  padding: 4px;
  color: var(--color-text-muted);
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
}

.password-toggle:hover {
  color: var(--color-text-primary);
}

/* 选项 */
.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-input {
  width: 16px;
  height: 16px;
  accent-color: var(--color-accent-blue);
}

.checkbox-text {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* 错误信息 */
.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 10px;
  color: var(--color-accent-red);
  font-size: 13px;
}

/* 登录按钮 */
.login-btn {
  width: 100%;
  padding: 14px;
  font-size: 15px;
  font-weight: 600;
  background: var(--color-accent-blue);
  color: white;
  border-radius: 10px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(88, 166, 255, 0.3);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 底部信息 */
.login-footer {
  margin-top: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
