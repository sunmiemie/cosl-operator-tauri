<script setup lang="ts">
/**
 * 流程图控制栏
 * 提供运行、停止、保存等操作按钮
 * 使用原生样式，不依赖 Element Plus
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

// Props
interface Props {
  // 是否正在运行
  isRunning?: boolean
  // 是否可以运行（后端已连接）
  canRun?: boolean
  // 是否只读模式
  readonly?: boolean
  // 服务器状态
  serverStatus?: string
  // 是否连接
  isConnected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isRunning: false,
  canRun: false,
  readonly: false,
  serverStatus: '',
  isConnected: false,
})

// Emits
const emit = defineEmits<{
  (e: 'run'): void
  (e: 'stop'): void
  (e: 'save'): void
  (e: 'load'): void
  (e: 'clear'): void
  (e: 'fitView'): void
  (e: 'export'): void
}>()

// 运行按钮文本
const runButtonText = computed(() => {
  if (props.isRunning) return '运行中...'
  return '运行'
})

// 状态指示器
const statusIndicator = computed(() => {
  if (props.isRunning) {
    return { icon: 'mdi:play-circle', color: 'var(--color-warning)', text: '运行中' }
  }
  if (props.isConnected) {
    return { icon: 'mdi:check-circle', color: 'var(--color-success)', text: '已连接' }
  }
  return { icon: 'mdi:circle-outline', color: 'var(--color-text-secondary)', text: '未连接' }
})
</script>

<template>
  <div class="control-bar">
    <!-- 左侧：运行控制 -->
    <div class="control-group">
      <button
        class="ctrl-btn"
        :class="{ 'btn-primary': !isRunning, 'btn-warning': isRunning, loading: isRunning }"
        :disabled="!canRun || readonly"
        :title="'运行流程图 (F5)'"
        @click="isRunning ? emit('stop') : emit('run')"
      >
        <Icon v-if="isRunning" icon="mdi:loading" class="spinning" />
        <Icon v-else :icon="isRunning ? 'mdi:stop' : 'mdi:play'" />
        <span>{{ runButtonText }}</span>
      </button>
      
      <button
        v-if="isRunning"
        class="ctrl-btn btn-danger"
        title="停止运行"
        @click="emit('stop')"
      >
        <Icon icon="mdi:stop" />
      </button>
    </div>
    
    <div class="divider-v" />
    
    <!-- 中间：文件操作 -->
    <div v-if="!readonly" class="control-group">
      <button class="ctrl-btn" title="保存 (Ctrl+S)" @click="emit('save')">
        <Icon icon="mdi:content-save" />
      </button>
      
      <button class="ctrl-btn" title="加载" @click="emit('load')">
        <Icon icon="mdi:folder-open" />
      </button>
      
      <button class="ctrl-btn" title="导出" @click="emit('export')">
        <Icon icon="mdi:download" />
      </button>
    </div>
    
    <div class="spacer" />
    
    <!-- 状态指示器 -->
    <div class="status-indicator">
      <Icon
        :icon="statusIndicator.icon"
        :style="{ color: statusIndicator.color }"
        class="status-icon"
        :class="{ spinning: isRunning }"
      />
      <span class="status-text" :style="{ color: statusIndicator.color }">
        {{ statusIndicator.text }}
      </span>
      <span v-if="serverStatus" class="server-status">
        {{ serverStatus }}
      </span>
    </div>
    
    <div class="divider-v" />
    
    <!-- 右侧：视图控制 -->
    <div class="control-group">
      <button class="ctrl-btn" title="适应视图" @click="emit('fitView')">
        <Icon icon="mdi:fit-to-screen" />
      </button>
      
      <button
        v-if="!readonly"
        class="ctrl-btn btn-danger-outline"
        title="清空画布"
        @click="emit('clear')"
      >
        <Icon icon="mdi:delete" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.control-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.control-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.spacer {
  flex: 1;
}

/* 垂直分隔线 */
.divider-v {
  width: 1px;
  height: 24px;
  background: var(--color-border);
  margin: 0 8px;
}

/* 按钮基础样式 */
.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.ctrl-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
}

.ctrl-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ctrl-btn .iconify {
  font-size: 18px;
}

/* 主色按钮 */
.ctrl-btn.btn-primary {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
  color: #fff;
}

.ctrl-btn.btn-primary:hover:not(:disabled) {
  background: #4a94e8;
  border-color: #4a94e8;
}

/* 警告按钮 */
.ctrl-btn.btn-warning {
  background: var(--color-warning);
  border-color: var(--color-warning);
  color: #fff;
}

.ctrl-btn.btn-warning:hover:not(:disabled) {
  opacity: 0.9;
}

/* 危险按钮 */
.ctrl-btn.btn-danger {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
}

.ctrl-btn.btn-danger:hover:not(:disabled) {
  opacity: 0.9;
}

/* 危险按钮（边框样式） */
.ctrl-btn.btn-danger-outline {
  background: transparent;
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.ctrl-btn.btn-danger-outline:hover:not(:disabled) {
  background: rgba(248, 81, 73, 0.1);
}

/* 加载状态 */
.ctrl-btn.loading {
  pointer-events: none;
}

/* 状态指示器 */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  font-size: 13px;
}

.status-icon {
  font-size: 16px;
}

.status-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 1s linear infinite;
}

.status-text {
  font-weight: 500;
}

.server-status {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-left: 4px;
}
</style>
