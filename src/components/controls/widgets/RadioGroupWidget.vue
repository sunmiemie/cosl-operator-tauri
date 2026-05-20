<script setup lang="ts">
/**
 * Radio Group Widget Component
 * A radio button group for single selection
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useWidgetValue } from '@/composables/useControl'

interface RadioGroupWidgetData {
  blockId: string
  blockParameter: string
  label?: string
  config?: undefined
  options?: (string | number)[]
}

const props = defineProps<{
  id: string
  data: RadioGroupWidgetData
  selected?: boolean
}>()

const options = computed(() => props.data.options || [])

const { value } = useWidgetValue(
  props.data.blockId,
  props.data.blockParameter,
  options.value[0]
)

const selectedValue = computed({
  get: () => String(value.value ?? ''),
  set: (val) => {
    if (options.value.length > 0 && typeof options.value[0] === 'number') {
      value.value = Number(val)
    } else {
      value.value = val
    }
  },
})

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement
  selectedValue.value = target.value
}
</script>

<template>
  <div class="radio-group-widget" :class="{ selected }">
    <Handle type="target" :position="Position.Left" class="handle" />

    <div class="content">
      <label class="widget-label">
        {{ data.label || data.blockParameter }}
      </label>

      <div class="radio-options">
        <label
          v-for="(option, index) in options"
          :key="index"
          class="radio-option"
        >
          <input
            type="radio"
            :name="`radio-${data.blockId}-${data.blockParameter}`"
            :value="String(option)"
            :checked="selectedValue === String(option)"
            class="radio-input"
            @change="handleChange"
          />
          <span class="radio-circle" />
          <span class="radio-label">{{ option }}</span>
        </label>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="handle" />
  </div>
</template>

<style scoped>
.radio-group-widget {
  min-width: 140px;
  padding: 16px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.radio-group-widget.selected {
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
  flex-direction: column;
  gap: 12px;
}

.widget-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.radio-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.radio-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.radio-circle {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.radio-input:checked + .radio-circle {
  border-color: var(--primary, #3b82f6);
}

.radio-input:checked + .radio-circle::after {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--primary, #3b82f6);
  border-radius: 50%;
}

.radio-label {
  font-size: 14px;
}
</style>
