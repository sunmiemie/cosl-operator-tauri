<script setup lang="ts">
/**
 * Number Input Widget Component
 * A numeric input for precise value entry
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Icon } from '@iconify/vue'
import type { WidgetProps, NumberInputConfig } from '@/types'
import { useWidgetValue } from '@/composables/useControl'

const props = defineProps<WidgetProps<NumberInputConfig>>()

const config = computed(() => props.data.config || {
  type: 'number input' as const,
  min: undefined,
  max: undefined,
  step: 1,
})

const { value } = useWidgetValue(
  props.data.blockId,
  props.data.blockParameter,
  0
)

const numericValue = computed({
  get: () => (value.value as number) ?? 0,
  set: (val) => {
    let newVal = val
    if (config.value.min !== undefined && newVal < config.value.min) {
      newVal = config.value.min
    }
    if (config.value.max !== undefined && newVal > config.value.max) {
      newVal = config.value.max
    }
    value.value = newVal
  },
})

function increment() {
  numericValue.value += (config.value.step ?? 1)
}

function decrement() {
  numericValue.value -= (config.value.step ?? 1)
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  const parsed = parseFloat(target.value)
  if (!isNaN(parsed)) {
    numericValue.value = parsed
  }
}
</script>

<template>
  <div
    class="number-input-widget"
    :class="{ selected }"
  >
    <Handle
      type="target"
      :position="Position.Left"
      class="handle"
    />

    <div class="content">
      <label class="widget-label">
        {{ data.label || data.blockParameter }}
      </label>

      <div class="input-group">
        <button class="step-btn" @click="decrement">
          <Icon icon="mdi:minus" />
        </button>

        <input
          type="number"
          :value="numericValue"
          :min="config.min"
          :max="config.max"
          :step="config.step"
          class="number-input"
          @input="handleInput"
        />

        <button class="step-btn" @click="increment">
          <Icon icon="mdi:plus" />
        </button>
      </div>
    </div>

    <Handle
      type="source"
      :position="Position.Right"
      class="handle"
    />
  </div>
</template>

<style scoped>
.number-input-widget {
  min-width: 160px;
  padding: 16px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.number-input-widget.selected {
  ring: 2px solid var(--primary);
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

.input-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.step-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.step-btn:hover {
  background: var(--muted);
}

.number-input {
  flex: 1;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  text-align: center;
  font-family: monospace;
  font-size: 14px;
  background: var(--background);
}

.number-input:focus {
  outline: none;
  border-color: var(--primary);
}

/* Hide spinner buttons */
.number-input::-webkit-outer-spin-button,
.number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.number-input[type=number] {
  -moz-appearance: textfield;
}
</style>
