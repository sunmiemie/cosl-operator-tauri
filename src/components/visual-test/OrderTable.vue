<script setup lang="ts">
/**
 * 工单表格组件
 * 显示待测试工单列表（仅展示，不可点击进入测试）
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { TestUnit } from '@/services/order'
import { OrderStatus } from '@/services/order'

// Props
const props = withDefaults(defineProps<{
  orders: TestUnit[]
  loading?: boolean
  allowedTypes?: string[]
  title?: string
  showCount?: boolean
}>(), {
  loading: false,
  allowedTypes: () => ['2D留存', '3D检测', '弓曲度测试', 'X-Ray测试'],
  title: '待测试工单',
  showCount: true
})

// 过滤后的工单列表
const filteredOrders = computed(() => {
  if (!props.allowedTypes || props.allowedTypes.length === 0) {
    return props.orders
  }
  return props.orders.filter(item => 
    item.process_type && props.allowedTypes.includes(item.process_type)
  )
})

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

function getStatusClass(status?: number): string {
  switch (status) {
    case OrderStatus.New: return 'status-new'
    case OrderStatus.Testing: return 'status-continue'
    case OrderStatus.Feedback: return 'status-redo'
    case OrderStatus.Question: return 'status-question'
    default: return 'status-unknown'
  }
}

function getStatusText(status?: number): string {
  switch (status) {
    case OrderStatus.New: return '新工单'
    case OrderStatus.Testing: return '待继续'
    case OrderStatus.Feedback: return '待重做'
    case OrderStatus.Question: return '疑问'
    default: return '未知'
  }
}

// 获取测试类型的样式
function getTypeClass(type?: string): string {
  switch (type) {
    case '3D检测': return 'type-3d'
    case '2D留存': return 'type-2d'
    case '弓曲度测试': return 'type-plane'
    case 'X-Ray测试': return 'type-xray'
    default: return ''
  }
}

function getTestTypeClass(type?: string): string {
  switch (type) {
    case '临时': return 'type-temp'
    case '正式': return 'type-formal'
    default: return ''
  }
}
</script>

<template>
  <div class="order-table-card">
    <!-- 表头 -->
    <div class="table-header">
      <div class="header-title">
        <Icon icon="mdi:format-list-bulleted" class="header-icon" />
        <span>{{ title }}</span>
      </div>
      <span v-if="showCount" class="count-badge">{{ filteredOrders.length }}</span>
    </div>

    <!-- 表格内容 -->
    <div class="table-content">
      <!-- 加载中 -->
      <div v-if="loading" class="empty-state">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="filteredOrders.length === 0" class="empty-state">
        <Icon icon="mdi:inbox-outline" class="empty-icon" />
        <span>暂无待测试工单</span>
      </div>
      
      <!-- 表格 -->
      <div v-else class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>型号</th>
              <th>序列号</th>
              <th>测试类型</th>
              <th>状态</th>
              <th>类型</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredOrders" :key="item.testunit_id || item.dev_testunit_id">
              <td class="cell-time">
                {{ formatDateTime(item.testunit_starttime || item.dev_testunit_starttime) }}
              </td>
              <td class="cell-model" :title="item.boardmodel">
                {{ item.boardmodel || '-' }}
              </td>
              <td class="cell-serial">{{ item.serial || '-' }}</td>
              <td>
                <span class="type-tag" :class="getTypeClass(item.process_type)">
                  {{ item.process_type }}
                </span>
              </td>
              <td>
                <span 
                  class="status-tag"
                  :class="getStatusClass(item.testunit_status || item.dev_testunit_status)"
                >
                  {{ getStatusText(item.dev_testunit_id || item.dev_testunit_status) }}
                </span>
              </td>
              <td>
                <span class="type-tag" :class="getTestTypeClass(item.dev_testunit_id ? '临时' : '正式')">
                  {{ item.dev_testunit_id ? '临时' : '正式' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 卡片容器 */
.order-table-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

/* 表头 */
.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.02);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.header-icon {
  color: var(--color-text-secondary);
}

.count-badge {
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

/* 表格内容区域 */
.table-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--color-text-secondary);
  padding: 2rem;
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.3;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: rgb(96, 165, 250);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 表格包装器 */
.table-wrapper {
  flex: 1;
  overflow: auto;
}

/* 数据表格 */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.data-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.data-table tbody tr {
  transition: background-color 0.15s;
}

.data-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

/* 单元格样式 */
.cell-time {
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.cell-model {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.cell-serial {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

/* 测试类型标签 */
.type-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

.type-3d {
  background: rgba(139, 92, 246, 0.15);
  color: rgb(167, 139, 250);
}

.type-2d {
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

.type-plane {
  background: rgba(236, 72, 153, 0.15);
  color: rgb(244, 114, 182);
}

.type-xray {
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
}

/* 状态标签 */
.status-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

.status-new {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

.status-continue {
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

.status-redo {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

.status-question {
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
}

.status-unknown {
  background: rgba(107, 114, 128, 0.15);
  color: rgb(156, 163, 175);
}

.type-temp {
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
}

.type-formal {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}
</style>
