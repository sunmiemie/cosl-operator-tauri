<script setup lang="ts">
/**
 * 默认节点组件
 * 通用的流程图节点
 * 对齐 Flojoy Studio 格式
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Icon } from '@iconify/vue'

interface IOPort {
  name: string
  id: string
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
    // Studio 格式的 inputs/outputs 带有 id 字段
    inputs?: IOPort[]
    outputs?: IOPort[]
  }
  selected?: boolean
}

const props = defineProps<Props>()

// 处理 inputs，确保有默认值和正确的 ID
const normalizedInputs = computed(() => {
  if (!props.data.inputs || props.data.inputs.length === 0) {
    return [{ name: 'default', id: 'default', type: 'Any' }]
  }
  return props.data.inputs.map((input, idx) => ({
    name: input.name || 'default',
    // 优先使用 Studio 的 id，否则使用 name
    id: input.id || input.name || `input-${idx}`,
    type: input.type || 'Any',
  }))
})

// 处理 outputs，确保有默认值和正确的 ID
const normalizedOutputs = computed(() => {
  if (!props.data.outputs || props.data.outputs.length === 0) {
    return [{ name: 'default', id: 'default', type: 'Any' }]
  }
  return props.data.outputs.map((output, idx) => ({
    name: output.name || 'default',
    // 优先使用 Studio 的 id，否则使用 name
    id: output.id || output.name || `output-${idx}`,
    type: output.type || 'Any',
  }))
})

// 状态图标
const statusIcon = computed(() => {
  switch (props.data.status) {
    case 'running':
      return 'mdi:loading'
    case 'success':
      return 'mdi:check-circle'
    case 'error':
      return 'mdi:alert-circle'
    default:
      return null
  }
})

// 状态颜色
const statusClass = computed(() => {
  switch (props.data.status) {
    case 'running':
      return 'status-running'
    case 'success':
      return 'status-success'
    case 'error':
      return 'status-error'
    default:
      return ''
  }
})
</script>

<template>
  <!-- 直接渲染节点内容，不添加额外包装层 -->
  <!-- 输入连接点 - 使用 Studio 的 id 作为 handle ID -->
  <Handle
    v-for="(input, index) in normalizedInputs"
    :key="input.id"
    :id="input.id"
    type="target"
    :position="Position.Left"
    class="node-handle input-handle"
    :style="{ top: `${((index + 1) / (normalizedInputs.length + 1)) * 100}%` }"
    :title="`${input.name} (${input.type})`"
  />
  
  <!-- 节点主体 -->
  <div class="node-body" :class="[statusClass, { 'is-selected': selected }]">
    <!-- 状态图标 -->
    <Icon
      v-if="statusIcon"
      :icon="statusIcon"
      class="status-icon"
      :class="{ spinning: data.status === 'running' }"
    />
    
    <!-- 节点标签 -->
    <div class="node-label">{{ data.label }}</div>
    
    <!-- 函数名（如果与 label 不同） -->
    <div v-if="data.func && data.func !== data.label" class="block-key">
      {{ data.func }}
    </div>
  </div>
  
  <!-- 输出连接点 - 使用 Studio 的 id 作为 handle ID -->
  <Handle
    v-for="(output, index) in normalizedOutputs"
    :key="output.id"
    :id="output.id"
    type="source"
    :position="Position.Right"
    class="node-handle output-handle"
    :style="{ top: `${((index + 1) / (normalizedOutputs.length + 1)) * 100}%` }"
    :title="`${output.name} (${output.type})`"
  />
</template>

<style scoped>
/* 节点主体样式 - 对齐 Studio DefaultBlock */
/* Studio 节点尺寸：小节点约 150x120，大节点约 216x233 */
.node-body {
  /* 使用 Studio 典型的最小尺寸 */
  min-width: 150px;
  min-height: 80px;
  max-width: 250px;
  padding: 16px 20px;
  background: var(--color-bg-2, #fff);
  border: 2px solid var(--color-primary, #3b82f6);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  position: relative;
  transition: box-shadow 0.2s ease;
  box-sizing: border-box;
}

.node-body.is-selected {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
  border-color: #2563eb;
}

.node-body.status-running {
  border-color: var(--color-warning, #f59e0b);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
}

.node-body.status-success {
  border-color: var(--color-success, #22c55e);
}

.node-body.status-error {
  border-color: var(--color-danger, #ef4444);
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
}

.status-icon {
  position: absolute;
  top: -10px;
  right: -10px;
  font-size: 20px;
  background: #fff;
  border-radius: 50%;
  padding: 2px;
}

.status-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.node-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-1, #1e293b);
  text-align: center;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 允许最多 2 行 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  word-break: break-word;
}

.block-key {
  font-size: 10px;
  color: var(--color-text-3, #94a3b8);
  font-family: monospace;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Handle 样式 - 与 Studio 对齐 */
.node-handle {
  width: 12px !important;
  height: 12px !important;
  background: var(--color-primary, #3b82f6) !important;
  border: 2px solid #fff !important;
  border-radius: 50% !important;
  /* 确保 handle 定位正确 */
  position: absolute !important;
}

.node-handle:hover {
  background: var(--color-primary-dark, #2563eb) !important;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);
  /* 不使用 transform，避免位移问题 */
}

.input-handle {
  left: -6px !important;
}

.output-handle {
  right: -6px !important;
}
</style>
