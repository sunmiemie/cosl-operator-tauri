<script setup lang="ts">
/**
 * 下载进度组件
 * 
 * 显示下载进度条、已下载/总大小、百分比
 * 支持遮罩层模式和内联模式
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

// Props
const props = withDefaults(defineProps<{
  // 已下载字节数
  loaded: number
  // 总字节数
  total: number
  // 是否显示遮罩层
  overlay?: boolean
  // 是否显示
  visible?: boolean
  // 下载描述文字
  text?: string
  // 是否显示详细信息
  showDetail?: boolean
  // 强调颜色 (orange / green / blue)
  accentColor?: 'orange' | 'green' | 'blue'
}>(), {
  overlay: true,
  visible: true,
  text: '正在下载工艺数据...',
  showDetail: true,
  accentColor: 'blue'
})

// 计算属性：进度百分比
const percent = computed(() => {
  if (props.total <= 0) return 0
  return Math.min(100, Math.round((props.loaded / props.total) * 100))
})

// 计算属性：已下载大小 (MB)
const loadedMB = computed(() => {
  return (props.loaded / (1024 * 1024)).toFixed(2)
})

// 计算属性：总大小 (MB)
const totalMB = computed(() => {
  return (props.total / (1024 * 1024)).toFixed(2)
})

// 计算属性：颜色类名
const colorClass = computed(() => {
  return `accent-${props.accentColor}`
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible && overlay" class="download-overlay">
        <div class="download-card" :class="colorClass">
          <!-- 图标 -->
          <div class="download-icon">
            <Icon icon="mdi:cloud-download" class="icon-main" />
            <div class="icon-pulse"></div>
          </div>
          
          <!-- 文字 -->
          <div class="download-text">{{ text }}</div>
          
          <!-- 进度条 -->
          <div class="progress-container">
            <div class="progress-bar">
              <div 
                class="progress-fill"
                :style="{ width: `${percent}%` }"
              ></div>
              <div class="progress-glow" :style="{ left: `${percent}%` }"></div>
            </div>
          </div>
          
          <!-- 详细信息 -->
          <div v-if="showDetail" class="progress-detail">
            <span class="percent">{{ percent }}%</span>
            <span class="size">{{ loadedMB }} / {{ totalMB }} MB</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  
  <!-- 内联模式 -->
  <div v-if="visible && !overlay" class="download-inline" :class="colorClass">
    <div class="inline-header">
      <Icon icon="mdi:cloud-download" class="inline-icon" />
      <span class="inline-text">{{ text }}</span>
    </div>
    <div class="progress-bar inline-bar">
      <div 
        class="progress-fill"
        :style="{ width: `${percent}%` }"
      ></div>
    </div>
    <div v-if="showDetail" class="inline-detail">
      <span>{{ percent }}%</span>
      <span>{{ loadedMB }} / {{ totalMB }} MB</span>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 遮罩层模式 ==================== */

.download-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
}

.download-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2.5rem 3rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  min-width: 320px;
}

/* 图标 */
.download-icon {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.icon-main {
  font-size: 3rem;
  z-index: 1;
}

.icon-pulse {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

/* 颜色变体 */
.accent-blue .icon-main { color: #3b82f6; }
.accent-blue .icon-pulse { background: rgba(59, 130, 246, 0.2); }
.accent-blue .progress-fill { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
.accent-blue .progress-glow { background: #3b82f6; }

.accent-orange .icon-main { color: #f97316; }
.accent-orange .icon-pulse { background: rgba(249, 115, 22, 0.2); }
.accent-orange .progress-fill { background: linear-gradient(90deg, #f97316, #fb923c); }
.accent-orange .progress-glow { background: #f97316; }

.accent-green .icon-main { color: #22c55e; }
.accent-green .icon-pulse { background: rgba(34, 197, 94, 0.2); }
.accent-green .progress-fill { background: linear-gradient(90deg, #22c55e, #4ade80); }
.accent-green .progress-glow { background: #22c55e; }

/* 文字 */
.download-text {
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
}

/* 进度条容器 */
.progress-container {
  width: 100%;
  padding: 0 0.5rem;
}

.progress-bar {
  position: relative;
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-glow {
  position: absolute;
  top: 0;
  width: 20px;
  height: 100%;
  filter: blur(10px);
  opacity: 0.8;
  transform: translateX(-50%);
  transition: left 0.3s ease;
}

/* 详细信息 */
.progress-detail {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 1rem;
  padding: 0 0.5rem;
  font-size: 0.875rem;
}

.percent {
  font-weight: 600;
  color: var(--color-text);
}

.size {
  color: var(--color-text-secondary);
}

/* ==================== 内联模式 ==================== */

.download-inline {
  padding: 1rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.inline-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.inline-icon {
  font-size: 1.25rem;
}

.accent-blue .inline-icon { color: #3b82f6; }
.accent-orange .inline-icon { color: #f97316; }
.accent-green .inline-icon { color: #22c55e; }

.inline-text {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.inline-bar {
  height: 6px;
}

.inline-detail {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

/* ==================== 动画 ==================== */

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.3);
    opacity: 0;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
