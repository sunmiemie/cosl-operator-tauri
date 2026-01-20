<script setup lang="ts">
/**
 * 报告预览组件
 * 
 * 用于预览测试报告结果:
 * - 显示总体统计
 * - 显示每个步骤的结果
 * - 支持查看详细信息
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

// 步骤结果类型
interface StepResult {
  id: number
  name: string
  pass: 1 | 2 | 3
  save?: string[]
  desc?: string
  error?: {
    url: string[]
    desc: string
  }
  question?: {
    url: string[]
    desc: string
  }
}

// Props
const props = withDefaults(defineProps<{
  // 步骤结果列表
  steps: StepResult[]
  // 标题
  title?: string
  // 强调颜色
  accentColor?: 'green' | 'orange' | 'blue'
}>(), {
  title: '检测结果预览',
  accentColor: 'green',
})

// 统计
const passCount = computed(() => props.steps.filter(s => s.pass === 1).length)
const failCount = computed(() => props.steps.filter(s => s.pass === 2).length)
const questionCount = computed(() => props.steps.filter(s => s.pass === 3).length)

const hasDefect = computed(() => failCount.value > 0)
const hasQuestion = computed(() => questionCount.value > 0)

// 颜色类
const colorClass = computed(() => `accent-${props.accentColor}`)
</script>

<template>
  <div class="report-preview" :class="colorClass">
    <!-- 头部 -->
    <div class="preview-header">
      <Icon icon="mdi:file-document-check" />
      <span>{{ title }}</span>
    </div>
    
    <!-- 统计摘要 -->
    <div class="preview-summary">
      <div class="summary-item" :class="{ highlight: !hasDefect && !hasQuestion }">
        <Icon icon="mdi:check-circle" />
        <span>合格: {{ passCount }}</span>
      </div>
      <div class="summary-item" :class="{ highlight: hasDefect, warn: hasDefect }">
        <Icon icon="mdi:close-circle" />
        <span>缺陷: {{ failCount }}</span>
      </div>
      <div class="summary-item" :class="{ highlight: hasQuestion, info: hasQuestion }">
        <Icon icon="mdi:help-circle" />
        <span>疑问: {{ questionCount }}</span>
      </div>
    </div>

    <!-- 步骤列表 -->
    <div class="preview-list">
      <div 
        v-for="step in steps"
        :key="step.id"
        class="preview-item"
        :class="{
          'is-pass': step.pass === 1,
          'is-fail': step.pass === 2,
          'is-question': step.pass === 3
        }"
      >
        <Icon 
          :icon="step.pass === 1 ? 'mdi:check' : step.pass === 2 ? 'mdi:close' : 'mdi:help'"
          class="item-icon"
        />
        <span class="item-name">{{ step.name }}</span>
        <span v-if="step.save && step.save.length" class="item-photos">
          <Icon icon="mdi:image" />
          {{ step.save.length }}
        </span>
        <span class="item-result">
          {{ step.pass === 1 ? '合格' : step.pass === 2 ? '缺陷' : '疑问' }}
        </span>
      </div>
    </div>

    <!-- 插槽：额外操作 -->
    <div v-if="$slots.actions" class="preview-actions">
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<style scoped>
.report-preview {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

/* 头部 */
.preview-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.875rem;
  font-weight: 500;
}

/* 统计摘要 */
.preview-summary {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.summary-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  font-size: 0.875rem;
}

.summary-item.highlight {
  background: rgba(34, 197, 94, 0.1);
  color: rgb(74, 222, 128);
}

.summary-item.warn {
  background: rgba(239, 68, 68, 0.1);
  color: rgb(248, 113, 113);
}

.summary-item.info {
  background: rgba(249, 115, 22, 0.1);
  color: rgb(251, 146, 60);
}

/* 步骤列表 */
.preview-list {
  flex: 1;
  overflow: auto;
  padding: 0.75rem;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  margin-bottom: 0.375rem;
  font-size: 0.8125rem;
}

.preview-item.is-pass {
  background: rgba(34, 197, 94, 0.06);
}

.preview-item.is-fail {
  background: rgba(239, 68, 68, 0.06);
}

.preview-item.is-question {
  background: rgba(249, 115, 22, 0.06);
}

.item-icon {
  flex-shrink: 0;
}

.preview-item.is-pass .item-icon { color: rgb(74, 222, 128); }
.preview-item.is-fail .item-icon { color: rgb(248, 113, 113); }
.preview-item.is-question .item-icon { color: rgb(251, 146, 60); }

.item-name {
  flex: 1;
}

.item-photos {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
}

.item-result {
  font-size: 0.6875rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

.preview-item.is-pass .item-result {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

.preview-item.is-fail .item-result {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

.preview-item.is-question .item-result {
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
}

/* 操作区域 */
.preview-actions {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
