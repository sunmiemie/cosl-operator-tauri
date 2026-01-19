<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Icon } from '@iconify/vue'
import { useTheme } from '@/composables/useTheme'

const { initTheme } = useTheme()

// 获取当前窗口
const appWindow = getCurrentWindow()
const isMaximized = ref(false)

// 初始化
onMounted(async () => {
  await initTheme()
  isMaximized.value = await appWindow.isMaximized()
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
  width: 40px;
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
</style>
