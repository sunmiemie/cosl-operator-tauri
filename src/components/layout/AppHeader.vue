<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { Icon } from '@iconify/vue'
import { ElMessageBox } from 'element-plus'
import { useTheme } from '@/composables/useTheme'
import { useAuth } from '@/composables/useAuth'
import { useAppLock } from '@/composables/useAppLock'

const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const { userInfo, logout } = useAuth()
const { isLocked, lockApp } = useAppLock()

// 窗口最大化状态
const isMaximized = ref(false)

// 用户菜单显示状态
const showUserMenu = ref(false)

// 获取当前窗口实例
const appWindow = getCurrentWindow()

// 清理取消监听函数
let unlistenCloseRequested: (() => void) | null = null

// 初始化最大化状态
appWindow.isMaximized().then((maximized) => {
  isMaximized.value = maximized
})

// 监听窗口大小变化，更新最大化状态
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

// 停止 Flojoy 后端
async function stopFlojoyBackend() {
  try {
    await invoke('stop_flojoy_backend')
  } catch (error) {
    console.error('停止 Flojoy 后端失败:', error)
  }
}

// 退出登录并关闭程序（带确认弹窗）
async function confirmLogoutAndClose() {
  try {
    await ElMessageBox.confirm(
      '确定要退出登录并关闭应用程序吗？',
      '退出确认',
      {
        confirmButtonText: '退出登录并关闭',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    // 先清除持久化登录态，再停止本地服务并关闭窗口
    await logout()
    await stopFlojoyBackend()
    await appWindow.destroy()
  } catch {
    // 用户点击取消，不做任何操作
  }
}

async function closeWindow() {
  await confirmLogoutAndClose()
}

// 监听窗口关闭请求事件（Alt+F4 或任务栏关闭）
onMounted(async () => {
  unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
    // 阻止默认关闭行为
    event.preventDefault()

    await confirmLogoutAndClose()
  })
})

// 清理监听器
onUnmounted(() => {
  if (unlistenCloseRequested) {
    unlistenCloseRequested()
  }
})

// 登出处理
async function handleLogout() {
  showUserMenu.value = false
  await logout()
  router.replace('/login')
}

// 点击其他区域关闭菜单
function closeUserMenu() {
  showUserMenu.value = false
}
</script>

<template>
  <header class="app-header">
    <!-- 可拖拽区域 -->
    <div class="header-drag-region" data-tauri-drag-region>
      <!-- Logo区域 -->
      <div class="header-logo">
        <img src="@/assets/jianwei.png" alt="logo" class="logo-icon">
        <span class="logo-text">见微-数字化实验室测试台软件</span>
      </div>
    </div>

    <!-- 右侧工具区域 -->
    <div class="header-actions">
      <!-- 锁定按钮 -->
      <button 
        class="action-btn lock-btn" 
        :class="{ locked: isLocked }"
        @click="lockApp" 
        title="锁定应用"
      >
        <Icon icon="mdi:lock-outline" />
      </button>

      <!-- 主题切换按钮 -->
      <button class="action-btn theme-toggle" @click="toggleTheme" :title="isDark ? '切换到亮色模式' : '切换到暗色模式'">
        <Icon :icon="isDark ? 'mdi:weather-sunny' : 'mdi:weather-night'" />
      </button>

      <!-- 用户信息 -->
      <div class="user-dropdown" v-if="userInfo">
        <button class="user-btn" @click="showUserMenu = !showUserMenu">
          <Icon icon="mdi:account-circle" class="user-avatar" />
          <span class="user-name">{{ userInfo.nickName }}</span>
          <Icon icon="mdi:chevron-down" class="dropdown-icon" :class="{ rotated: showUserMenu }" />
        </button>

        <!-- 下拉菜单 -->
        <Transition name="dropdown">
          <div v-if="showUserMenu" class="dropdown-menu" @click.stop>
            <div class="dropdown-header">
              <Icon icon="mdi:account-circle" class="menu-avatar" />
              <div class="menu-user-info">
                <span class="menu-username">{{ userInfo.nickName }}</span>
                <span class="menu-role">{{ userInfo.username }}</span>
              </div>
            </div>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item logout" @click="handleLogout">
              <Icon icon="mdi:logout" />
              <span>退出登录</span>
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <!-- 遮罩层 -->
    <div v-if="showUserMenu" class="backdrop" @click="closeUserMenu"></div>

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
</template>

<style scoped>
.app-header {
  height: 36px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  user-select: none;
  position: relative;
  z-index: 100;
  flex-shrink: 0;
}

/* 可拖拽区域 */
.header-drag-region {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  padding-left: 12px;
  -webkit-app-region: drag;
}

/* Logo区域 */
.header-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.logo-icon {
  width: 24px;
  height: 24px;
  color: var(--color-accent-blue);
  filter: drop-shadow(0 0 6px rgba(88, 166, 255, 0.3));
}

.logo-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.3px;
}

/* 工具区域 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 4px;
  -webkit-app-region: no-drag;
}

.action-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
  font-size: 16px;
}

.action-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.theme-toggle:hover {
  color: var(--color-accent-orange);
}

.lock-btn:hover {
  color: var(--color-accent-blue);
}

.lock-btn.locked {
  color: var(--color-accent-blue);
  background: var(--color-bg-tertiary);
}

/* 用户下拉菜单 */
.user-dropdown {
  position: relative;
}

.user-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
}

.user-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.user-avatar {
  font-size: 20px;
  color: var(--color-accent-blue);
}

.user-name {
  font-size: 12px;
  font-weight: 500;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-icon {
  font-size: 14px;
  transition: transform 0.2s ease;
}

.dropdown-icon.rotated {
  transform: rotate(180deg);
}

/* 下拉菜单 */
.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: 1000;
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
}

.menu-avatar {
  font-size: 36px;
  color: var(--color-accent-blue);
}

.menu-user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-username {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.menu-role {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.dropdown-divider {
  height: 1px;
  background: var(--color-border);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
}

.dropdown-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.dropdown-item.logout:hover {
  color: var(--color-accent-red);
}

/* 遮罩层 */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
}

/* 下拉动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
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
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}
</style>
