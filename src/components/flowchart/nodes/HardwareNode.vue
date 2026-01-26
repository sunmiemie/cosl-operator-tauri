<script setup lang="ts">
/**
 * 硬件节点组件
 * 用于硬件设备相关的 blocks
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
  <div class="hardware-node" :class="{ selected, [`status-${data.status}`]: data.status }">
    <!-- 输入连接点 -->
    <Handle
      v-for="(input, index) in data.inputs || [{ name: 'input', type: 'any' }]"
      :key="`input-${index}`"
      :id="`input-${index}`"
      type="target"
      :position="Position.Left"
      :style="{ top: `${((index + 1) / ((data.inputs?.length || 1) + 1)) * 100}%` }"
    />
    
    <div class="node-content">
      <Icon icon="mdi:chip" class="node-icon" />
      <div class="node-info">
        <div class="node-label">{{ data.label }}</div>
        <div v-if="data.blockKey" class="block-key">{{ data.blockKey }}</div>
      </div>
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
.hardware-node {
  min-width: 160px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 2px solid #f59e0b;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(245, 158, 11, 0.2);
}

.hardware-node:hover {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.hardware-node.selected {
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.5);
}

.hardware-node.status-running { border-color: #3b82f6; }
.hardware-node.status-success { border-color: #22c55e; }
.hardware-node.status-error { border-color: #ef4444; }

.node-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.node-icon {
  font-size: 24px;
  color: #b45309;
}

.node-info {
  flex: 1;
}

.node-label {
  font-size: 13px;
  font-weight: 600;
  color: #92400e;
}

.block-key {
  font-size: 10px;
  color: #b45309;
  font-family: monospace;
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

:deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  background: #f59e0b;
  border: 2px solid #fff;
}
</style>
