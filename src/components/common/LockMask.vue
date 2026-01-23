<script setup lang="ts">
/**
 * LockMask.vue - 应用锁定遮罩组件
 * 
 * 功能：
 * - 显示锁定状态遮罩
 * - 提供密码输入解锁界面
 * - 参考旧程序 lockMask.vue 实现
 */
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useAppLock } from '@/composables/useAppLock'

const { unlockApp } = useAppLock()

// 解锁密码输入
const password = ref('')
const isUnlocking = ref(false)

/** 尝试解锁 */
async function handleUnlock() {
  if (!password.value.trim()) {
    ElMessage.warning('请输入解锁密码')
    return
  }
  
  isUnlocking.value = true
  
  // 短暂延迟模拟验证过程
  await new Promise(resolve => setTimeout(resolve, 300))
  
  const success = unlockApp(password.value)
  
  if (success) {
    ElMessage.success('解锁成功')
    password.value = ''
  } else {
    ElMessage.error('密码错误')
  }
  
  isUnlocking.value = false
}

/** 处理表单提交 */
function handleSubmit(event: Event) {
  event.preventDefault()
  handleUnlock()
}
</script>

<template>
  <Transition name="fade">
    <div class="lock-mask">
      <div class="lock-content">
        <!-- 锁定图标 -->
        <div class="lock-icon">
          <Icon icon="mdi:lock-outline" />
        </div>
        
        <!-- 锁定提示 -->
        <h2 class="lock-title">应用程序已锁定</h2>
        <p class="lock-desc">请输入密码解锁继续使用</p>
        
        <!-- 密码输入表单 -->
        <form class="password-form" @submit="handleSubmit" autocomplete="off">
          <!-- 隐藏的用户名字段（用于可访问性） -->
          <input
            type="text"
            name="username"
            autocomplete="username"
            style="display: none;"
            aria-hidden="true"
          />
          <div class="password-input-wrapper">
            <input
              v-model="password"
              type="password"
              name="password"
              class="password-input lock-mask-input"
              placeholder="请输入解锁密码"
              :disabled="isUnlocking"
              autocomplete="current-password"
              autofocus
            />
          </div>
          
          <!-- 解锁按钮 -->
          <button
            type="submit"
            class="unlock-btn"
            :disabled="isUnlocking"
          >
            <Icon v-if="isUnlocking" icon="mdi:loading" class="spin" />
            <Icon v-else icon="mdi:lock-open-outline" />
            <span>{{ isUnlocking ? '验证中...' : '解锁应用' }}</span>
          </button>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.lock-mask {
  position: fixed;
  top: var(--header-height, 36px);
  left: 0;
  right: 0;
  bottom: var(--footer-height, 28px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 10, 0.92);
  backdrop-filter: blur(8px);
  z-index: 1000;
}

.lock-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px;
  max-width: 400px;
  width: 90%;
}

.lock-icon {
  font-size: 120px;
  color: var(--color-primary, #409eff);
  margin-bottom: 24px;
  opacity: 0.9;
}

.lock-title {
  font-size: 32px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 12px 0;
  text-align: center;
}

.lock-desc {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 32px 0;
  text-align: center;
}

.password-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.password-input-wrapper {
  width: 100%;
  margin-bottom: 20px;
}

.password-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  outline: none;
  transition: all 0.2s ease;
}

.password-input:focus {
  border-color: var(--color-primary, #409eff);
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.2);
}

.password-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.password-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.unlock-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 24px;
  font-size: 16px;
  font-weight: 500;
  color: #fff;
  background: var(--color-primary, #409eff);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.unlock-btn:hover:not(:disabled) {
  background: var(--color-primary-dark, #337ecc);
  transform: translateY(-1px);
}

.unlock-btn:active:not(:disabled) {
  transform: translateY(0);
}

.unlock-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.unlock-btn .iconify {
  font-size: 20px;
}

/* 加载动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
