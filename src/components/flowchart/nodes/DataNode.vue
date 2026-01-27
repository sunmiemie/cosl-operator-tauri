<script setup lang="ts">
/**
 * 数据节点组件
 * 用于数据相关的 blocks
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Icon } from '@iconify/vue'

defineOptions({ inheritAttrs: false })

interface IOPort {
  name: string
  id?: string
  type: string
  desc?: string | null
  multiple?: boolean
}

interface Props {
  id: string
  data: {
    label: string
    func?: string
    blockKey?: string
    category?: string
    status?: 'pending' | 'running' | 'success' | 'error'
    params?: Record<string, unknown>
    inputs?: IOPort[]
    outputs?: IOPort[]
  }
  selected?: boolean
}

const props = defineProps<Props>()

// 标准化 inputs - 使用 Studio ID 格式
const normalizedInputs = computed(() => {
  if (!props.data.inputs || props.data.inputs.length === 0) {
    return [{ name: 'default', id: 'default', type: 'Any' }]
  }
  return props.data.inputs.map((input, idx) => ({
    name: input.name || 'default',
    id: input.id || input.name || `input-${idx}`,
    type: input.type || 'Any',
  }))
})

// 标准化 outputs - 使用 Studio ID 格式
const normalizedOutputs = computed(() => {
  if (!props.data.outputs || props.data.outputs.length === 0) {
    return [{ name: 'default', id: 'default', type: 'Any' }]
  }
  return props.data.outputs.map((output, idx) => ({
    name: output.name || 'default',
    id: output.id || output.name || `output-${idx}`,
    type: output.type || 'Any',
  }))
})

// 计算 handle 位置
function getHandleTop(index: number, total: number): string {
  return `${((index + 1) / (total + 1)) * 100}%`
}

// 计算节点高度 - 对齐 Studio: maxIO * 58 + 38
const nodeHeight = computed(() => {
  const maxIO = Math.max(normalizedInputs.value.length, normalizedOutputs.value.length)
  return Math.max(96, maxIO * 58 + 38)
})

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
  <div
    class="data-node"
    :class="{ selected, [`status-${data.status}`]: data.status }"
    :style="{ minHeight: nodeHeight + 'px' }"
  >
    <!-- 输入连接点 -->
    <Handle
      v-for="(input, index) in normalizedInputs"
      :key="'input-' + input.id"
      :id="input.id"
      type="target"
      :position="Position.Left"
      class="handle-left"
      :style="{ top: getHandleTop(index, normalizedInputs.length) }"
      :title="`${input.name} (${input.type})`"
    />

    <div class="node-content">
      <Icon icon="mdi:database" class="node-icon" />
      <div class="node-label">{{ data.label }}</div>
      <Icon v-if="statusIcon" :icon="statusIcon" class="status-icon" :class="{ spinning: data.status === 'running' }" />
    </div>

    <!-- 输出连接点 -->
    <Handle
      v-for="(output, index) in normalizedOutputs"
      :key="'output-' + output.id"
      :id="output.id"
      type="source"
      :position="Position.Right"
      class="handle-right"
      :style="{ top: getHandleTop(index, normalizedOutputs.length) }"
      :title="`${output.name} (${output.type})`"
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
  position: relative;
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

/* Handle 样式 */
.handle-left,
.handle-right {
  width: 12px !important;
  height: 12px !important;
  background: #3b82f6 !important;
  border: 2px solid #fff !important;
  border-radius: 50% !important;
}

.handle-left {
  left: -6px !important;
  transform: translateY(-50%) !important;
}

.handle-right {
  right: -6px !important;
  transform: translateY(-50%) !important;
}

.handle-left:hover,
.handle-right:hover {
  background: #2563eb !important;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);
}
</style>
