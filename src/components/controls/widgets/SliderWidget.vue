<script setup lang="ts">
/**
 * Slider Widget Component
 * A numeric slider for controlling block parameters
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { WidgetProps, SliderConfig } from '@/types'
import { useWidgetValue } from '@/composables/useControl'

const props = defineProps<WidgetProps<SliderConfig>>()

const config = computed(() => props.data.config || {
  type: 'slider' as const,
  min: 0,
  max: 100,
  step: 1,
})

const { value } = useWidgetValue(
  props.data.blockId,
  props.data.blockParameter,
  config.value.min
)

const displayValue = computed(() => {
  const val = value.value as number ?? config.value.min
  return config.value.floating ? val.toFixed(2) : Math.round(val)
})

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  value.value = parseFloat(target.value)
}
</script>

<template>
  <div class="slider-widget" :class="{ selected }">
    <Handle type="target" :position="Position.Left" class="handle" />

    <div class="content">
      <div class="header">
        <label class="widget-label">{{ data.label || data.blockParameter }}</label>
        <span class="value-display">{{ displayValue }}</span>
      </div>

      <input
        type="range"
        class="slider"
        :value="(value as number) ?? config.min"
        :min="config.min"
        :max="config.max"
        :step="config.step"
        @input="handleInput"
      />

      <div class="range-labels">
        <span>{{ config.min }}</span>
        <span>{{ config.max }}</span>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="handle" />
  </div>
</template>

<style scoped>
.slider-widget {
  min-width: 200px;
  padding: 16px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.slider-widget.selected {
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

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.widget-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.value-display {
  font-size: 14px;
  font-family: monospace;
  font-weight: 500;
}

.slider {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--muted);
  border-radius: 3px;
  outline: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--primary, #3b82f6);
  border-radius: 50%;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--primary, #3b82f6);
  border-radius: 50%;
  border: none;
  cursor: pointer;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted-foreground);
}
</style>
