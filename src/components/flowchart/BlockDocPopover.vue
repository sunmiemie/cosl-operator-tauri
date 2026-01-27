<script setup lang="ts">
/**
 * Block Documentation Popover
 * Displays block documentation on hover
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { BlockDefinition } from '@/types'

const props = defineProps<{
  block: BlockDefinition
  position?: { x: number; y: number }
}>()

const hasInputs = computed(() => props.block.inputs && props.block.inputs.length > 0)
const hasOutputs = computed(() => props.block.outputs && props.block.outputs.length > 0)
const hasParams = computed(() => props.block.parameters && Object.keys(props.block.parameters).length > 0)
const hasDeps = computed(() => props.block.pip_dependencies && props.block.pip_dependencies.length > 0)

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    Any: 'bg-gray-500',
    Scalar: 'bg-green-500',
    Vector: 'bg-blue-500',
    Matrix: 'bg-purple-500',
    DataFrame: 'bg-cyan-500',
    Image: 'bg-pink-500',
    OrderedPair: 'bg-orange-500',
    Boolean: 'bg-red-500',
    String: 'bg-yellow-500',
  }
  return colors[type] || 'bg-gray-400'
}
</script>

<template>
  <div
    class="block-doc-popover"
    :style="position ? { left: `${position.x}px`, top: `${position.y}px` } : {}"
  >
    <!-- Header -->
    <div class="doc-header">
      <h3 class="doc-title">{{ block.name }}</h3>
      <span class="badge badge-outline">{{ block.type }}</span>
    </div>

    <!-- Block Key -->
    <div class="doc-key">
      <code>{{ block.key }}</code>
    </div>

    <!-- Inputs -->
    <div v-if="hasInputs" class="doc-section">
      <h4 class="section-title">
        <Icon icon="mdi:import" class="section-icon" />
        输入
      </h4>
      <div class="io-list">
        <div
          v-for="input in block.inputs"
          :key="input.id"
          class="io-item"
        >
          <span :class="['io-type-dot', getTypeColor(input.type)]" />
          <span class="io-name">{{ input.name }}</span>
          <span class="io-type">{{ input.type }}</span>
          <span v-if="input.multiple" class="badge badge-secondary badge-sm">多</span>
        </div>
      </div>
    </div>

    <!-- Outputs -->
    <div v-if="hasOutputs" class="doc-section">
      <h4 class="section-title">
        <Icon icon="mdi:export" class="section-icon" />
        输出
      </h4>
      <div class="io-list">
        <div
          v-for="output in block.outputs"
          :key="output.id"
          class="io-item"
        >
          <span :class="['io-type-dot', getTypeColor(output.type)]" />
          <span class="io-name">{{ output.name }}</span>
          <span class="io-type">{{ output.type }}</span>
        </div>
      </div>
    </div>

    <!-- Parameters -->
    <div v-if="hasParams" class="doc-section">
      <h4 class="section-title">
        <Icon icon="mdi:tune" class="section-icon" />
        参数
      </h4>
      <div class="param-list">
        <div
          v-for="(param, name) in block.parameters"
          :key="String(name)"
          class="param-item"
        >
          <span class="param-name">{{ name }}</span>
          <span class="param-type">{{ param.type }}</span>
          <span v-if="param.default !== null && param.default !== undefined" class="param-default">
            = {{ param.default }}
          </span>
        </div>
      </div>
    </div>

    <!-- Dependencies -->
    <div v-if="hasDeps" class="doc-section">
      <h4 class="section-title">
        <Icon icon="mdi:package" class="section-icon" />
        依赖
      </h4>
      <div class="dep-list">
        <span
          v-for="dep in block.pip_dependencies"
          :key="dep.name"
          class="badge badge-secondary"
        >
          {{ dep.name }}{{ dep.v ? `==${dep.v}` : '' }}
        </span>
      </div>
    </div>

    <!-- Drag hint -->
    <div class="doc-hint">
      <Icon icon="mdi:gesture-tap-drag" />
      <span>拖放到画布添加</span>
    </div>
  </div>
</template>

<style scoped>
.block-doc-popover {
  position: fixed;
  z-index: 1000;
  width: 280px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--popover-background, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  padding: 12px;
}

.doc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.doc-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 9999px;
}

.badge-outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted-foreground);
}

.badge-secondary {
  background: var(--muted, #f1f5f9);
  color: var(--muted-foreground, #64748b);
}

.badge-sm {
  padding: 1px 4px;
  font-size: 10px;
}

.doc-key {
  margin-bottom: 12px;
}

.doc-key code {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--muted);
  border-radius: 4px;
  font-family: monospace;
}

.doc-section {
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-foreground);
  text-transform: uppercase;
  margin: 0 0 6px 0;
}

.section-icon {
  font-size: 14px;
}

.io-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.io-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.io-type-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.io-name {
  flex: 1;
  font-weight: 500;
}

.io-type {
  color: var(--muted-foreground);
  font-size: 11px;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.param-name {
  font-weight: 500;
}

.param-type {
  color: var(--muted-foreground);
  font-size: 11px;
}

.param-default {
  color: var(--muted-foreground);
  font-family: monospace;
  font-size: 11px;
}

.dep-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.doc-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  font-size: 11px;
  color: var(--muted-foreground);
}
</style>
