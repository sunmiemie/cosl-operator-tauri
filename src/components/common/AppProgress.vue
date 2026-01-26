<script setup lang="ts">
/**
 * 自定义进度条组件
 * 替代 Element Plus 的 ElProgress，适配暗黑模式
 */
import { computed } from 'vue'

interface Props {
  percentage: number
  status?: 'success' | 'warning' | 'exception'
  strokeWidth?: number
  textInside?: boolean
  showText?: boolean
  color?: string | string[] | ((percentage: number) => string)
  format?: (percentage: number) => string
}

const props = withDefaults(defineProps<Props>(), {
  percentage: 0,
  strokeWidth: 8,
  textInside: false,
  showText: true,
})

// 根据状态或自定义颜色获取进度条颜色
const barColor = computed(() => {
  if (props.color) {
    if (typeof props.color === 'function') {
      return props.color(props.percentage)
    }
    if (Array.isArray(props.color)) {
      // 根据百分比从颜色数组中选择
      const index = Math.floor((props.percentage / 100) * (props.color.length - 1))
      return props.color[Math.min(index, props.color.length - 1)]
    }
    return props.color
  }
  
  // 根据状态返回颜色
  switch (props.status) {
    case 'success':
      return 'var(--color-success)'
    case 'warning':
      return 'var(--color-warning)'
    case 'exception':
      return 'var(--color-danger)'
    default:
      return 'var(--color-primary)'
  }
})

// 进度条背景色
const trackColor = computed(() => 'var(--color-bg-tertiary)')

// 进度条样式
const barStyle = computed(() => ({
  width: `${Math.min(Math.max(props.percentage, 0), 100)}%`,
  height: `${props.strokeWidth}px`,
  backgroundColor: barColor.value,
  borderRadius: `${props.strokeWidth / 2}px`,
}))

// 轨道样式
const trackStyle = computed(() => ({
  height: `${props.strokeWidth}px`,
  backgroundColor: trackColor.value,
  borderRadius: `${props.strokeWidth / 2}px`,
}))

// 格式化显示文本
const displayText = computed(() => {
  if (props.format) {
    return props.format(props.percentage)
  }
  return `${props.percentage}%`
})

// 文本颜色
const textColorClass = computed(() => {
  if (props.status === 'success') return 'text-success'
  if (props.status === 'warning') return 'text-warning'
  if (props.status === 'exception') return 'text-exception'
  return ''
})
</script>

<template>
  <div class="progress-wrapper">
    <div class="progress-track" :style="trackStyle">
      <div class="progress-bar" :style="barStyle">
        <span v-if="textInside && showText" class="progress-text-inside">
          {{ displayText }}
        </span>
      </div>
    </div>
    <span v-if="!textInside && showText" class="progress-text" :class="textColorClass">
      {{ displayText }}
    </span>
  </div>
</template>

<style scoped>
.progress-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.progress-track {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.progress-bar {
  position: relative;
  transition: width 0.3s ease, background-color 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.progress-text-inside {
  font-size: 12px;
  color: #fff;
  padding-right: 8px;
  white-space: nowrap;
}

.progress-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  min-width: 50px;
  text-align: right;
}

.progress-text.text-success {
  color: var(--color-success);
}

.progress-text.text-warning {
  color: var(--color-warning);
}

.progress-text.text-exception {
  color: var(--color-danger);
}
</style>
