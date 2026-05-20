<script setup lang="ts">
/**
 * Combobox Widget Component
 * A dropdown select for enumerated options
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useWidgetValue } from '@/composables/useControl'

interface ComboboxWidgetData {
  blockId: string
  blockParameter: string
  label?: string
  config?: undefined
  options?: (string | number)[]
}

const props = defineProps<{
  id: string
  data: ComboboxWidgetData
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
    // Try to convert back to number if original options are numbers
    if (options.value.length > 0 && typeof options.value[0] === 'number') {
      value.value = Number(val)
    } else {
      value.value = val
    }
  },
})

function handleChange(event: Event) {
  const target = event.target as HTMLSelectElement
  selectedValue.value = target.value
}
</script>

<template>
  <div class="combobox-widget" :class="{ selected }">
    <Handle type="target" :position="Position.Left" class="handle" />

    <div class="content">
      <label class="widget-label">
        {{ data.label || data.blockParameter }}
      </label>

      <select
        class="select-input"
        :value="selectedValue"
        @change="handleChange"
      >
        <option value="" disabled>选择...</option>
        <option
          v-for="(option, index) in options"
          :key="index"
          :value="String(option)"
        >
          {{ option }}
        </option>
      </select>
    </div>

    <Handle type="source" :position="Position.Right" class="handle" />
  </div>
</template>

<style scoped>
.combobox-widget {
  min-width: 160px;
  padding: 16px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.combobox-widget.selected {
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
  gap: 8px;
}

.widget-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.select-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
  color: var(--foreground);
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s;
}

.select-input:focus {
  border-color: var(--primary, #3b82f6);
}

.select-input:hover {
  border-color: var(--primary, #3b82f6);
}
</style>
