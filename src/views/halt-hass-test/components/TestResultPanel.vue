<script setup lang="ts">
/**
 * 测试结果面板组件
 * 显示测试结果概览和详细信息
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { HaltHassReportJson } from '../types'
import { TEST_RESULT } from '../types'

// Props
const props = defineProps<{
  report: HaltHassReportJson | null
  testResult: number
  remark: string
}>()

// Emits
const emit = defineEmits<{
  'update:testResult': [result: number]
  'update:remark': [remark: string]
}>()

// 计算属性
const hasReport = computed(() => props.report !== null)

const duration = computed(() => {
  if (!props.report) return '00:00'
  const secs = props.report.duration
  const mins = Math.floor(secs / 60)
  const remainingSecs = secs % 60
  return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`
})

const summary = computed(() => {
  if (!props.report) return null
  const { flowchartResult } = props.report
  return {
    total: flowchartResult.totalNodes,
    success: flowchartResult.successNodes,
    failed: flowchartResult.failedNodes,
    successRate: flowchartResult.totalNodes > 0
      ? Math.round((flowchartResult.successNodes / flowchartResult.totalNodes) * 100)
      : 0,
  }
})

const resultOptions = [
  { value: TEST_RESULT.NORMAL, label: '正常', color: 'success', icon: 'mdi:check-circle' },
  { value: TEST_RESULT.ABNORMAL, label: '异常', color: 'error', icon: 'mdi:alert-circle' },
  { value: TEST_RESULT.QUESTION, label: '疑问', color: 'warning', icon: 'mdi:help-circle' },
]
</script>

<template>
  <div class="test-result-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <Icon icon="mdi:clipboard-check-outline" class="header-icon" />
      <div class="header-text">
        <h3>测试结果</h3>
        <p v-if="report">工单: {{ report.orderNo }}</p>
      </div>
    </div>

    <template v-if="hasReport && report">
      <!-- 结果概览卡片 -->
      <div class="overview-cards">
        <div class="overview-card">
          <Icon icon="mdi:timer-outline" class="card-icon" />
          <div class="card-content">
            <span class="card-label">测试时长</span>
            <span class="card-value">{{ duration }}</span>
          </div>
        </div>

        <div class="overview-card">
          <Icon icon="mdi:chip" class="card-icon" />
          <div class="card-content">
            <span class="card-label">电路板数</span>
            <span class="card-value">{{ report.boards.length }} 块</span>
          </div>
        </div>

        <div class="overview-card success">
          <Icon icon="mdi:check-circle-outline" class="card-icon" />
          <div class="card-content">
            <span class="card-label">成功节点</span>
            <span class="card-value">{{ summary?.success ?? 0 }}</span>
          </div>
        </div>

        <div class="overview-card" :class="{ error: (summary?.failed ?? 0) > 0 }">
          <Icon icon="mdi:close-circle-outline" class="card-icon" />
          <div class="card-content">
            <span class="card-label">失败节点</span>
            <span class="card-value">{{ summary?.failed ?? 0 }}</span>
          </div>
        </div>
      </div>

      <!-- 成功率 -->
      <div class="success-rate">
        <div class="rate-header">
          <span class="rate-label">节点通过率</span>
          <span class="rate-value" :class="{ high: (summary?.successRate ?? 0) >= 80 }">
            {{ summary?.successRate ?? 0 }}%
          </span>
        </div>
        <div class="rate-bar">
          <div
            class="rate-fill"
            :class="{ high: (summary?.successRate ?? 0) >= 80 }"
            :style="{ width: `${summary?.successRate ?? 0}%` }"
          ></div>
        </div>
      </div>

      <!-- 测试结论选择 -->
      <div class="result-section">
        <div class="section-header">
          <Icon icon="mdi:file-document-edit-outline" />
          <span>测试结论</span>
        </div>
        <div class="result-options">
          <button
            v-for="option in resultOptions"
            :key="option.value"
            class="result-option"
            :class="[option.color, { active: testResult === option.value }]"
            @click="emit('update:testResult', option.value)"
          >
            <Icon :icon="option.icon" />
            <span>{{ option.label }}</span>
          </button>
        </div>
      </div>

      <!-- 备注 -->
      <div class="remark-section">
        <div class="section-header">
          <Icon icon="mdi:comment-text-outline" />
          <span>备注说明</span>
        </div>
        <textarea
          class="remark-input"
          :value="remark"
          placeholder="请输入备注说明（可选）..."
          rows="3"
          @input="emit('update:remark', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </div>

      <!-- 电路板列表 -->
      <div class="boards-section">
        <div class="section-header">
          <Icon icon="mdi:view-list" />
          <span>电路板列表</span>
          <span class="section-count">{{ report.boards.length }} 块</span>
        </div>
        <div class="boards-list">
          <div
            v-for="(board, index) in report.boards"
            :key="board.serial"
            class="board-item"
          >
            <span class="board-index">{{ index + 1 }}</span>
            <span class="board-serial">{{ board.serial }}</span>
            <span v-if="board.boardModelName" class="board-model">{{ board.boardModelName }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <Icon icon="mdi:clipboard-text-off-outline" class="empty-icon" />
      <p>暂无测试结果</p>
    </div>
  </div>
</template>

<style scoped>
.test-result-panel {
  padding: 1.5rem;
  background: var(--color-bg-secondary, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 1rem;
}

/* 头部 */
.panel-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.header-icon {
  font-size: 1.5rem;
  color: var(--color-primary, #3b82f6);
}

.header-text h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
  margin: 0;
}

.header-text p {
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
  margin: 0.125rem 0 0;
}

/* 概览卡片 */
.overview-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.overview-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem;
  background: var(--color-bg-tertiary, #f8fafc);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border, #e2e8f0);
}

.overview-card .card-icon {
  font-size: 1.5rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.overview-card.success .card-icon {
  color: rgb(22, 163, 74);
}

.overview-card.error .card-icon {
  color: rgb(220, 38, 38);
}

.card-content {
  display: flex;
  flex-direction: column;
}

.card-label {
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.card-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
}

/* 成功率 */
.success-rate {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--color-bg-tertiary, #f8fafc);
  border-radius: 0.75rem;
}

.rate-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.rate-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #64748b);
}

.rate-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: rgb(220, 38, 38);
}

.rate-value.high {
  color: rgb(22, 163, 74);
}

.rate-bar {
  height: 8px;
  background: var(--color-bg-secondary, #fff);
  border-radius: 4px;
  overflow: hidden;
}

.rate-fill {
  height: 100%;
  background: rgb(239, 68, 68);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.rate-fill.high {
  background: rgb(34, 197, 94);
}

/* 测试结论 */
.result-section,
.remark-section,
.boards-section {
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary, #1e293b);
}

.section-header :deep(svg) {
  font-size: 1rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.section-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.result-options {
  display: flex;
  gap: 0.75rem;
}

.result-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  background: var(--color-bg-tertiary, #f8fafc);
  color: var(--color-text-secondary, #64748b);
}

.result-option:hover {
  background: var(--color-bg-hover, #f1f5f9);
}

.result-option.success.active {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgb(34, 197, 94);
  color: rgb(22, 163, 74);
}

.result-option.error.active {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgb(239, 68, 68);
  color: rgb(220, 38, 38);
}

.result-option.warning.active {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgb(245, 158, 11);
  color: rgb(180, 83, 9);
}

/* 备注 */
.remark-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  resize: none;
  background: var(--color-bg-tertiary, #f8fafc);
  color: var(--color-text-primary, #1e293b);
}

.remark-input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
}

.remark-input::placeholder {
  color: var(--color-text-tertiary, #94a3b8);
}

/* 电路板列表 */
.boards-list {
  max-height: 160px;
  overflow-y: auto;
}

.board-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  background: var(--color-bg-tertiary, #f8fafc);
  border-radius: 0.5rem;
  margin-bottom: 0.5rem;
}

.board-index {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-primary, #3b82f6);
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
}

.board-serial {
  font-size: 0.875rem;
  font-family: monospace;
  color: var(--color-text-primary, #1e293b);
}

.board-model {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: 0.875rem;
}
</style>
