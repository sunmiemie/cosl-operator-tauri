<script setup lang="ts">
/**
 * AI/ML Node Component
 * For artificial intelligence and machine learning blocks
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Icon } from '@iconify/vue'

defineOptions({ inheritAttrs: false })

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
    status?: 'pending' | 'running' | 'success' | 'error'
    inputs?: IOPort[]
    outputs?: IOPort[]
  }
  selected?: boolean
}

const props = defineProps<Props>()

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

// 计算 handle 位置 - 对齐 Studio
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

const statusClass = computed(() => {
  switch (props.data.status) {
    case 'running': return 'status-running'
    case 'success': return 'status-success'
    case 'error': return 'status-error'
    default: return ''
  }
})
</script>

<template>
  <div class="node-wrapper" :style="{ minHeight: nodeHeight + 'px' }">
    <Handle
      v-for="(input, index) in normalizedInputs"
      :key="input.id"
      :id="input.id"
      type="target"
      :position="Position.Left"
      class="node-handle input-handle"
      :style="{ top: getHandleTop(index, normalizedInputs.length) }"
      :title="`${input.name} (${input.type})`"
    />

    <div class="node-body" :class="[statusClass, { 'is-selected': selected }]" :style="{ minHeight: nodeHeight + 'px' }">
      <div class="node-icon">
        <Icon icon="mdi:brain" />
      </div>
      <Icon
        v-if="statusIcon"
        :icon="statusIcon"
        class="status-icon"
        :class="{ spinning: data.status === 'running' }"
      />
      <div class="node-label">{{ data.label }}</div>
      <div v-if="data.func && data.func !== data.label" class="block-key">
        {{ data.func }}
      </div>
    </div>

    <Handle
      v-for="(output, index) in normalizedOutputs"
      :key="output.id"
      :id="output.id"
      type="source"
      :position="Position.Right"
      class="node-handle output-handle"
      :style="{ top: getHandleTop(index, normalizedOutputs.length) }"
      :title="`${output.name} (${output.type})`"
    />
  </div>
</template>

<style scoped>
.node-wrapper { position: relative; }

.node-body {
  min-width: 150px;
  min-height: 80px;
  max-width: 250px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
  border: 2px solid #7c3aed;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  position: relative;
  transition: all 0.2s ease;
  color: white;
}

.node-body.is-selected {
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.4);
  border-color: #5b21b6;
}

.node-body.status-running {
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.6);
}

.node-body.status-success { border-color: #22c55e; }
.node-body.status-error { border-color: #ef4444; box-shadow: 0 0 12px rgba(239, 68, 68, 0.4); }

.node-icon {
  font-size: 24px;
  opacity: 0.9;
  margin-bottom: 4px;
}

.status-icon {
  position: absolute;
  top: -10px;
  right: -10px;
  font-size: 20px;
  background: #fff;
  border-radius: 50%;
  padding: 2px;
  color: #333;
}

.status-icon.spinning { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.node-label {
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.block-key {
  font-size: 10px;
  opacity: 0.7;
  font-family: monospace;
}

.node-handle {
  width: 12px !important;
  height: 12px !important;
  background: #a78bfa !important;
  border: 2px solid #fff !important;
  border-radius: 50% !important;
  position: absolute !important;
}

.node-handle:hover {
  background: #c4b5fd !important;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.8);
}

.input-handle {
  left: -6px !important;
  transform: translateY(-50%) !important;
}
.output-handle {
  right: -6px !important;
  transform: translateY(-50%) !important;
}
</style>
