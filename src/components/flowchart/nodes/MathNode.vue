<script setup lang="ts">
/**
 * Math Node Component
 * 使用 SVG 三角形形状，对齐 Flojoy Studio
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Icon } from '@iconify/vue'
import TriangleSvg from './TriangleSvg.vue'

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

// 计算节点尺寸 - 对齐 Studio
const nodeSize = computed(() => {
  const maxIO = Math.max(normalizedInputs.value.length, normalizedOutputs.value.length)
  const size = Math.max(96, maxIO * 58 + 38)
  return size
})

// 从 func 或 label 中提取运算符
const operator = computed(() => {
  // 优先使用 func（如 ADD, SUBTRACT 等）
  if (props.data.func) {
    return props.data.func
  }
  // 其次使用 label
  return props.data.label || 'f'
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
  <div
    class="math-node"
    :class="[statusClass, { 'is-selected': selected }]"
    :style="{ width: nodeSize + 'px', height: nodeSize + 'px' }"
  >
    <!-- 输入 Handle - 位于三角形左侧 -->
    <Handle
      v-for="(input, index) in normalizedInputs"
      :key="input.id"
      :id="input.id"
      type="target"
      :position="Position.Left"
      class="handle-left"
      :style="{ top: getHandleTop(index, normalizedInputs.length) }"
      :title="`${input.name} (${input.type})`"
    />

    <!-- SVG 三角形 -->
    <TriangleSvg
      :width="nodeSize"
      :height="nodeSize"
      :operator="operator"
      stroke-color="#f59e0b"
      fill-color="rgba(245, 158, 11, 0.1)"
      :selected="selected"
    />

    <!-- 状态图标 -->
    <Icon
      v-if="statusIcon"
      :icon="statusIcon"
      class="status-icon"
      :class="{ spinning: data.status === 'running' }"
    />

    <!-- 节点标签（显示在三角形下方） -->
    <div class="node-label">{{ data.label }}</div>

    <!-- 输出 Handle - 位于三角形右侧尖端 -->
    <Handle
      v-for="(output, index) in normalizedOutputs"
      :key="output.id"
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
.math-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.math-node.is-selected {
  filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.6));
}

.math-node.status-running {
  filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.8));
}

.math-node.status-success :deep(path) {
  stroke: #22c55e;
}

.math-node.status-error :deep(path) {
  stroke: #ef4444;
}

.status-icon {
  position: absolute;
  top: -8px;
  right: 20%;
  font-size: 18px;
  background: #fff;
  border-radius: 50%;
  padding: 2px;
  color: #333;
  z-index: 10;
}

.status-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.node-label {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 600;
  color: #92400e;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Handle 样式 */
.handle-left,
.handle-right {
  width: 12px !important;
  height: 12px !important;
  background: #fcd34d !important;
  border: 2px solid #fff !important;
  border-radius: 50% !important;
}

.handle-left {
  left: -2px !important;
  transform: translateY(-50%) !important;
}

.handle-right {
  right: -2px !important;
  transform: translateY(-50%) !important;
}

.handle-left:hover,
.handle-right:hover {
  background: #fde68a !important;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.8);
}
</style>
