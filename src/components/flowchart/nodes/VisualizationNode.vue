<script setup lang="ts">
/**
 * 可视化节点组件
 * 用于图表、显示等可视化 blocks
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
    result?: unknown
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
  <div class="visualization-node" :class="{ selected, [`status-${data.status}`]: data.status }">
    <!-- 输入连接点 -->
    <Handle
      v-for="(input, index) in data.inputs || [{ name: 'input', type: 'any' }]"
      :key="`input-${index}`"
      :id="`input-${index}`"
      type="target"
      :position="Position.Left"
      :style="{ top: `${((index + 1) / ((data.inputs?.length || 1) + 1)) * 100}%` }"
    />
    
    <div class="node-header">
      <Icon icon="mdi:chart-line" class="node-icon" />
      <div class="node-label">{{ data.label }}</div>
      <Icon v-if="statusIcon" :icon="statusIcon" class="status-icon" :class="{ spinning: data.status === 'running' }" />
    </div>
    
    <!-- 预览区域（有结果时显示） -->
    <div v-if="data.result" class="preview-area">
      <div class="preview-placeholder">
        <Icon icon="mdi:image" />
        <span>Result Preview</span>
      </div>
    </div>
    
    <!-- 输出连接点（可选） -->
    <Handle
      v-for="(output, index) in data.outputs || []"
      :key="`output-${index}`"
      :id="`output-${index}`"
      type="source"
      :position="Position.Right"
      :style="{ top: `${((index + 1) / ((data.outputs?.length || 0) + 1)) * 100}%` }"
    />
  </div>
</template>

<style scoped>
.visualization-node {
  min-width: 180px;
  background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
  border: 2px solid #8b5cf6;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(139, 92, 246, 0.2);
  overflow: hidden;
}

.visualization-node:hover {
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
}

.visualization-node.selected {
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.5);
}

.visualization-node.status-running { border-color: #f59e0b; }
.visualization-node.status-success { border-color: #22c55e; }
.visualization-node.status-error { border-color: #ef4444; }

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
}

.node-icon {
  font-size: 20px;
  color: #7c3aed;
}

.node-label {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #5b21b6;
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

.preview-area {
  padding: 8px;
  background: rgba(255, 255, 255, 0.6);
  border-top: 1px solid rgba(139, 92, 246, 0.2);
}

.preview-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 60px;
  color: #7c3aed;
  font-size: 12px;
}

:deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  background: #8b5cf6;
  border: 2px solid #fff;
}
</style>
