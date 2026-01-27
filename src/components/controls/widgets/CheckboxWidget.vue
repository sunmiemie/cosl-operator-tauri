<script setup lang="ts">
/**
 * Checkbox Widget Component
 * A boolean toggle checkbox
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

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement
  checked.value = target.checked
}
</script>

<template>
  <div class="checkbox-widget" :class="{ selected }">
    <Handle type="target" :position="Position.Left" class="handle" />

    <div class="content">
      <label class="checkbox-label">
        <input
          type="checkbox"
          :checked="checked"
          class="checkbox-input"
          @change="handleChange"
        />
        <span class="checkbox-box">
          <svg v-if="checked" viewBox="0 0 24 24" class="check-icon">
            <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        </span>
        <span class="label-text">{{ data.label || data.blockParameter }}</span>
      </label>
    </div>

    <Handle type="source" :position="Position.Right" class="handle" />
  </div>
</template>

<style scoped>
.checkbox-widget {
  min-width: 120px;
  padding: 16px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.checkbox-widget.selected {
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
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.checkbox-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.checkbox-box {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--background);
  transition: all 0.2s;
}

.checkbox-input:checked + .checkbox-box {
  background: var(--primary, #3b82f6);
  border-color: var(--primary, #3b82f6);
}

.check-icon {
  width: 14px;
  height: 14px;
  color: white;
}

.label-text {
  font-size: 14px;
  font-weight: 500;
}
</style>
