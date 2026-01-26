<script setup lang="ts">
/**
 * 数据节点组件
 * 用于数据相关的 blocks
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Icon } from '@iconify/vue'

interface Props {
  id: string
  data: {
    label: string
    blockKey?: string
    category?: string
    status?: 'pending' | 'running' | 'success' | 'error'
    params?: Record<string, unknown>
    inputs?: Array<{ name: string; type: string }>
    outputs?: Array<{ name: string; type: string }>
  }
  selected?: boolean
}

const props = defineProps<Props>()

const statusIcon = computed(() => {
  switch (props.data.status) {
    case 'running': return 'mdi:loading'
    case 'success': return 'mdi:check-circle'
    case 'error': return 'mdi:alert-circle'
    default: return null
  }
})
</script>

<template>
  <div class="data-node" :class="{ selected, [`status-${data.status}`]: data.status }">
    <!-- 输入连接点 -->
    <Handle
      v-for="(input, index) in data.inputs || []"
      :key="`input-${index}`"
      :id="`input-${index}`"
      type="target"
      :position="Position.Left"
      :style="{ top: `${((index + 1) / ((data.inputs?.length || 0) + 1)) * 100}%` }"
    />
    
    <div class="node-content">
      <Icon icon="mdi:database" class="node-icon" />
      <div class="node-label">{{ data.label }}</div>
      <Icon v-if="statusIcon" :icon="statusIcon" class="status-icon" :class="{ spinning: data.status === 'running' }" />
    </div>
    
    <!-- 输出连接点 -->
    <Handle
      v-for="(output, index) in data.outputs || [{ name: 'output', type: 'any' }]"
      :key="`output-${index}`"
      :id="`output-${index}`"
      type="source"
      :position="Position.Right"
      :style="{ top: `${((index + 1) / ((data.outputs?.length || 1) + 1)) * 100}%` }"
    />
  </div>
</template>

<style scoped>
.data-node {
  min-width: 140px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border: 2px solid #3b82f6;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
}

.data-node:hover {
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.data-node.selected {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
}

.data-node.status-running { border-color: #f59e0b; }
.data-node.status-success { border-color: #22c55e; }
.data-node.status-error { border-color: #ef4444; }

.node-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-icon {
  font-size: 20px;
  color: #3b82f6;
}

.node-label {
  font-size: 13px;
  font-weight: 600;
  color: #1e40af;
}

.status-icon {
  font-size: 16px;
  margin-left: auto;
}

.status-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

:deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  background: #3b82f6;
  border: 2px solid #fff;
}
</style>
