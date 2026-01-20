<script setup lang="ts">
/**
 * 测试步骤显示组件
 * 
 * 用于显示当前测试步骤的信息，包括:
 * - 步骤序号和总数
 * - 步骤名称和描述
 * - 参考图片（如果有）
 * - 反馈/疑问标记
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

// Props
const props = withDefaults(defineProps<{
  // 当前步骤索引（从0开始）
  currentIndex: number
  // 总步骤数
  totalSteps: number
  // 步骤名称
  name?: string
  // 步骤描述
  description?: string
  // 参考图片列表
  refImages?: string[]
  // 阶段标签（如 "总体检查", "分区检查"）
  phaseLabel?: string
  // 是否为反馈项
  isFeedbackItem?: boolean
  // 是否为疑问项
  isQuestionItem?: boolean
  // 强调颜色
  accentColor?: 'green' | 'orange' | 'blue'
}>(), {
  accentColor: 'green',
})

// 步骤文本
const stepText = computed(() => {
  return props.name || `检测项 ${props.currentIndex + 1}`
})

// 描述文本
const descText = computed(() => {
  return props.description || '请检查此项目并记录结果'
})

// 颜色类
const colorClass = computed(() => `accent-${props.accentColor}`)
</script>

<template>
  <div class="step-display" :class="colorClass">
    <!-- 步骤头部 -->
    <div class="step-header">
      <div class="step-indicator">
        <span class="step-num">{{ currentIndex + 1 }}</span>
        <span class="step-total">/ {{ totalSteps }}</span>
      </div>
      <span v-if="phaseLabel" class="step-phase">{{ phaseLabel }}</span>
    </div>
    
    <!-- 步骤内容 -->
    <div class="step-content">
      <h3 class="step-title">{{ stepText }}</h3>
      <p class="step-desc">{{ descText }}</p>
      
      <!-- 反馈标记 -->
      <div v-if="isFeedbackItem" class="alert alert-warning">
        <Icon icon="mdi:alert" />
        <span>此项为反馈待处理项，请重新检查</span>
      </div>
      
      <!-- 疑问标记 -->
      <div v-if="isQuestionItem" class="alert alert-info">
        <Icon icon="mdi:help-circle" />
        <span>此项为疑问待处理项，请确认结果</span>
      </div>
    </div>
    
    <!-- 参考图片 -->
    <div v-if="refImages && refImages.length > 0" class="ref-images">
      <div class="ref-header">
        <Icon icon="mdi:image-area" />
        <span>参考图片</span>
      </div>
      <div class="ref-grid">
        <div 
          v-for="(img, index) in refImages"
          :key="index"
          class="ref-item"
        >
          <img :src="img" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-display {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

/* 步骤头部 */
.step-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.step-indicator {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.step-num {
  font-size: 1.25rem;
  font-weight: 700;
}

.accent-green .step-num { color: rgb(74, 222, 128); }
.accent-orange .step-num { color: rgb(251, 146, 60); }
.accent-blue .step-num { color: rgb(96, 165, 250); }

.step-total {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.step-phase {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

/* 步骤内容 */
.step-content {
  padding: 1rem;
}

.step-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.step-desc {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* 警告标记 */
.alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  margin-top: 1rem;
  font-size: 0.8125rem;
}

.alert-warning {
  background: rgba(249, 115, 22, 0.1);
  color: rgb(251, 146, 60);
}

.alert-info {
  background: rgba(59, 130, 246, 0.1);
  color: rgb(96, 165, 250);
}

/* 参考图片 */
.ref-images {
  border-top: 1px solid var(--color-border);
  padding: 1rem;
}

.ref-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.75rem;
}

.ref-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.ref-item {
  aspect-ratio: 4/3;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.ref-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
