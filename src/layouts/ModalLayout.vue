<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Icon } from '@iconify/vue'

// Props
defineProps<{
  title?: string
  icon?: string
}>()

const appWindow = getCurrentWindow()

async function closeWindow() {
  await appWindow.close()
}
</script>

<template>
  <div class="modal-layout">
    <!-- 标题栏 -->
    <header class="modal-header" data-tauri-drag-region>
      <div class="header-title">
        <Icon v-if="icon" :icon="icon" class="header-icon" />
        <span>{{ title || '窗口' }}</span>
      </div>
      
      <!-- 窗口控制按钮 -->
      <div class="window-controls">
        <button class="control-btn close" @click="closeWindow" title="关闭">
          <Icon icon="mdi:close" />
        </button>
      </div>
    </header>

    <!-- 内容区域 -->
    <main class="modal-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.modal-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

/* 标题栏 */
.modal-header {
  height: 32px;
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
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  -webkit-app-region: no-drag;
}

.header-icon {
  font-size: 16px;
  color: var(--color-accent-blue);
}

/* 窗口控制按钮 */
.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 36px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  font-size: 12px;
}

.control-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}

/* 内容区域 */
.modal-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
