<script setup lang="ts">
/**
 * 独立窗口布局组件
 * 适用于报告预览等独立弹出窗口
 * 提供完整的窗口控制：最小化、最大化、关闭、置顶
 */
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useWindowMaximizeState } from '@/composables/useWindowMaximizeState'

// Props
defineProps<{
  title?: string
  icon?: string
}>()

const { appWindow, isMaximized, showMaximizeButton, toggleMaximize } = useWindowMaximizeState()
const isPinned = ref(false)

// 初始化窗口状态
onMounted(async () => {
  isPinned.value = await appWindow.isAlwaysOnTop()
})

// 窗口控制方法
async function minimizeWindow() {
  await appWindow.minimize()
}

async function closeWindow() {
  await appWindow.close()
}

// 切换置顶状态
async function togglePin() {
  isPinned.value = !isPinned.value
  await appWindow.setAlwaysOnTop(isPinned.value)
}
</script>

<template>
  <div class="window-layout">
    <!-- 标题栏 -->
    <header class="window-header" data-tauri-drag-region>
      <div class="header-title">
        <Icon v-if="icon" :icon="icon" class="header-icon" />
        <span>{{ title || '窗口' }}</span>
      </div>
      
      <!-- 窗口控制按钮 -->
      <div class="window-controls">
        <!-- 置顶按钮 -->
        <button 
          class="control-btn pin" 
          :class="{ active: isPinned }"
          @click="togglePin" 
          :title="isPinned ? '取消置顶' : '置顶窗口'"
        >
          <Icon :icon="isPinned ? 'mdi:pin' : 'mdi:pin-outline'" />
        </button>
        
        <!-- 最小化按钮 -->
        <button class="control-btn minimize" @click="minimizeWindow" title="最小化">
          <Icon icon="mdi:minus" />
        </button>
        
        <!-- 最大化/还原按钮 -->
        <button v-if="showMaximizeButton" class="control-btn maximize" @click="toggleMaximize" :title="isMaximized ? '还原' : '最大化'">
          <Icon :icon="isMaximized ? 'mdi:window-restore' : 'mdi:window-maximize'" />
        </button>
        
        <!-- 关闭按钮 -->
        <button class="control-btn close" @click="closeWindow" title="关闭">
          <Icon icon="mdi:close" />
        </button>
      </div>
    </header>

    <!-- 内容区域 -->
    <main class="window-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.window-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

/* 标题栏 */
.window-header {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 0 12px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
  -webkit-app-region: no-drag;
}

.header-icon {
  font-size: 18px;
  color: var(--color-accent-blue);
}

/* 窗口控制按钮 */
.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 42px;
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

/* 置顶按钮 */
.control-btn.pin {
  font-size: 15px;
}

.control-btn.pin.active {
  color: var(--color-accent-blue);
}

.control-btn.pin.active:hover {
  background: rgba(88, 166, 255, 0.15);
}

/* 最小化按钮 */
.control-btn.minimize:hover {
  background: var(--color-bg-hover);
}

/* 最大化按钮 */
.control-btn.maximize:hover {
  background: var(--color-bg-hover);
}

/* 关闭按钮 */
.control-btn.close:hover {
  background: #e81123;
  color: white;
}

/* 内容区域 */
.window-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
