<script setup lang="ts">
/**
 * 默认节点组件
 * 通用的流程图节点
 * 对齐 Flojoy Studio 格式
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Icon } from '@iconify/vue'

// 禁用自动属性继承，避免 fragment 警告
defineOptions({
  inheritAttrs: false,
})

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

// 计算每个 handle 的 top 位置（百分比）
// 使用 space-evenly 逻辑：(index + 1) / (count + 1) * 100%
function getHandleTop(index: number, total: number): string {
  return `${((index + 1) / (total + 1)) * 100}%`
}

// 计算节点高度 - 对齐 Studio: maxInputOutput * 58 + 38
const nodeHeight = computed(() => {
  const maxIO = Math.max(normalizedInputs.value.length, normalizedOutputs.value.length)
  // 最小高度 96px，每个 IO 端口 58px，基础 padding 38px
  return Math.max(96, maxIO * 58 + 38)
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
  <!-- 节点容器 -->
  <div
    class="default-node"
    :class="[statusClass, { 'is-selected': selected }]"
    :style="{ minHeight: nodeHeight + 'px' }"
  >
    <!-- 输入连接点 - 使用 Studio 的 id 作为 handle ID -->
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

    <!-- 节点内容 -->
    <div class="node-content">
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
/* 节点主体样式 */
.default-node {
  min-width: 150px;
  max-width: 250px;
  padding: 16px 24px;
  background: var(--color-bg-2, #fff);
  border: 2px solid var(--color-primary, #3b82f6);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: box-shadow 0.2s ease;
  box-sizing: border-box;
}

.default-node.is-selected {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
  border-color: #2563eb;
}

.default-node.status-running {
  border-color: var(--color-warning, #f59e0b);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
}

.default-node.status-success {
  border-color: var(--color-success, #22c55e);
}

.default-node.status-error {
  border-color: var(--color-danger, #ef4444);
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
}

/* 节点内容 */
.node-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
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

/* Handle 样式 - 覆盖 Vue Flow 默认样式 */
.handle-left,
.handle-right {
  width: 12px !important;
  height: 12px !important;
  background: var(--color-primary, #3b82f6) !important;
  border: 2px solid #fff !important;
  border-radius: 50% !important;
}

/* 左侧 Handle - 需要覆盖 Vue Flow 的默认 left 定位 */
.handle-left {
  left: -6px !important;
  /* 覆盖 Vue Flow 的 translateY(-50%) */
  transform: translateY(-50%) !important;
}

/* 右侧 Handle - 需要覆盖 Vue Flow 的默认 right 定位 */
.handle-right {
  right: -6px !important;
  /* 覆盖 Vue Flow 的 translateY(-50%) */
  transform: translateY(-50%) !important;
}

.handle-left:hover,
.handle-right:hover {
  background: var(--color-primary-dark, #2563eb) !important;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);
}
</style>
