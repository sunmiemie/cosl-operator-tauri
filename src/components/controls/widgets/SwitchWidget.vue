<script setup lang="ts">
/**
 * Switch Widget Component
 * A boolean toggle switch
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { WidgetProps } from '@/types'
import { useWidgetValue } from '@/composables/useControl'

const props = defineProps<WidgetProps<undefined>>()

const { value } = useWidgetValue(
  props.data.blockId,
  props.data.blockParameter,
  false
)

const checked = computed({
  get: () => !!value.value,
  set: (val) => {
    value.value = val
  },
})

function toggle() {
  checked.value = !checked.value
}
</script>

<template>
  <div class="switch-widget" :class="{ selected }">
    <Handle type="target" :position="Position.Left" class="handle" />

    <div class="content">
      <label class="widget-label">{{ data.label || data.blockParameter }}</label>
      <button
        class="toggle-switch"
        :class="{ active: checked }"
        @click="toggle"
      >
        <span class="toggle-thumb" />
      </button>
    </div>

    <Handle type="source" :position="Position.Right" class="handle" />
  </div>
</template>

<style scoped>
.switch-widget {
  min-width: 140px;
  padding: 16px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.switch-widget.selected {
  box-shadow: 0 0 0 2px var(--primary);
}

.handle {
  width: 12px !important;
  height: 12px !important;
  background: var(--primary, #3b82f6) !important;
  border: 2px solid var(--background, white) !important;
}

.content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.widget-label {
  font-size: 14px;
  font-weight: 500;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  padding: 2px;
  border: none;
  background: var(--muted, #e2e8f0);
  border-radius: 9999px;
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
}

.toggle-switch.active {
  background: var(--primary, #3b82f6);
}

.toggle-thumb {
  display: block;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-switch.active .toggle-thumb {
  transform: translateX(20px);
}
</style>
