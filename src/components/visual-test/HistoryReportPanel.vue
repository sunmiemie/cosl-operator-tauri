<script setup lang="ts">
/**
 * 历史报告面板组件
 * 可折叠的历史测试报告显示
 */
import { Icon } from '@iconify/vue'
import type { TestReport } from '@/services/report'

// Props
withDefaults(defineProps<{
  reports: TestReport[]
  loading?: boolean
  expanded?: boolean
  title?: string
}>(), {
  loading: false,
  expanded: false,
  title: '历史报告'
})

// Emits
const emit = defineEmits<{
  'update:expanded': [value: boolean]
  view: [report: TestReport]
}>()

// 工具函数
function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

function getResultClass(result?: string | number): string {
  if (result === 1 || result === '合格') {
    return 'result-pass'
  }
  if (result === 0 || result === '不合格') {
    return 'result-fail'
  }
  return ''
}

function getResultText(result?: string | number): string {
  if (result === 1 || result === '合格') return '合格'
  if (result === 0 || result === '不合格') return '不合格'
  return '未知'
}
</script>

<template>
  <div class="panel">
    <button 
      class="panel-header" 
      @click="emit('update:expanded', !expanded)"
    >
      <Icon icon="mdi:history" />
      <span>{{ title }}</span>
      <span class="badge">{{ reports.length }}</span>
      <Icon 
        :icon="expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
        class="ml-auto"
      />
    </button>
    
    <Transition name="expand">
      <div v-if="expanded" class="panel-body">
        <div v-if="loading" class="empty-state">
          <Icon icon="mdi:loading" class="animate-spin" />
          加载中...
        </div>
        <div v-else-if="reports.length === 0" class="empty-state">
          <span class="opacity-60">暂无历史报告</span>
        </div>
        <div v-else class="report-list">
          <div 
            v-for="(report, index) in reports" 
            :key="report.report_id || index"
            class="report-item"
            @click="emit('view', report)"
          >
            <div class="report-info">
              <div class="report-model truncate" :title="report.boardmodel">
                {{ report.boardmodel || '未知型号' }}
              </div>
              <div class="report-serial font-mono text-sm">
                {{ report.serial || '-' }}
              </div>
              <div class="report-time text-xs">
                {{ formatDateTime(report.report_time || report.reportTime) }}
              </div>
            </div>
            <div class="report-result">
              <span 
                class="result-badge"
                :class="getResultClass(report.report_result || report.result)"
              >
                {{ getResultText(report.report_result || report.result) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.panel {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.panel-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.15s;
}

.panel-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.badge {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.1);
}

.panel-body {
  border-top: 1px solid var(--color-border);
  max-height: 250px;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  color: var(--color-text-secondary);
}

.report-list {
  padding: 0.5rem;
}

.report-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.report-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.report-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
}

.report-model {
  font-weight: 500;
}

.report-serial {
  color: var(--color-text-secondary);
}

.report-time {
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.result-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.result-pass {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(74, 222, 128);
}

.result-fail {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(248, 113, 113);
}

/* 展开/折叠动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 250px;
  opacity: 1;
}
</style>
