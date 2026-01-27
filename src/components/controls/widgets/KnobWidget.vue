<script setup lang="ts">
/**
 * Knob Widget Component
 * A rotary dial for numeric input
 */
import { ref, computed, onUnmounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { WidgetProps, KnobConfig } from '@/types'
import { useWidgetValue } from '@/composables/useControl'

const props = defineProps<WidgetProps<KnobConfig>>()

const config = computed(() => props.data.config || {
  type: 'knob' as const,
  min: 0,
  max: 100,
  step: 1,
})

const { value } = useWidgetValue(
  props.data.blockId,
  props.data.blockParameter,
  config.value.min
)

const knobRef = ref<HTMLDivElement | null>(null)
const isDragging = ref(false)
const startY = ref(0)
const startValue = ref(0)

const numericValue = computed(() => (value.value as number) ?? config.value.min)

const rotation = computed(() => {
  const range = config.value.max - config.value.min
  const normalized = (numericValue.value - config.value.min) / range
  // Map to -135 to +135 degrees (270 degree range)
  return -135 + normalized * 270
})

const displayValue = computed(() => {
  return config.value.floating
    ? numericValue.value.toFixed(2)
    : Math.round(numericValue.value)
})

function handleMouseDown(e: MouseEvent) {
  isDragging.value = true
  startY.value = e.clientY
  startValue.value = numericValue.value
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value) return

  const deltaY = startY.value - e.clientY
  const range = config.value.max - config.value.min
  const sensitivity = range / 200 // 200px drag = full range

  let newValue = startValue.value + deltaY * sensitivity
  newValue = Math.round(newValue / config.value.step) * config.value.step
  newValue = Math.max(config.value.min, Math.min(config.value.max, newValue))

  value.value = newValue
}

function handleMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -config.value.step : config.value.step
  let newValue = numericValue.value + delta
  newValue = Math.max(config.value.min, Math.min(config.value.max, newValue))
  value.value = newValue
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})
</script>

<template>
  <div class="knob-widget" :class="{ selected }">
    <Handle type="target" :position="Position.Left" class="handle" />

    <div class="content">
      <label class="widget-label">
        {{ data.label || data.blockParameter }}
      </label>

      <!-- Knob -->
      <div
        ref="knobRef"
        class="knob-dial"
        :class="{ dragging: isDragging }"
        @mousedown="handleMouseDown"
        @wheel="handleWheel"
      >
        <!-- Indicator -->
        <div class="knob-inner">
          <div
            class="knob-indicator"
            :style="{
              transform: `translate(-50%, -100%) rotate(${rotation}deg)`,
            }"
          />
        </div>

        <!-- Center dot -->
        <div class="knob-center">
          <div class="knob-dot" />
        </div>
      </div>

      <!-- Value display -->
      <span class="value-display">
        {{ displayValue }}
      </span>
    </div>

    <Handle type="source" :position="Position.Right" class="handle" />
  </div>
</template>

<style scoped>
.knob-widget {
  min-width: 100px;
  padding: 16px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.knob-widget.selected {
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
  align-items: center;
  gap: 12px;
}

.widget-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.knob-dial {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--muted);
  border: 2px solid var(--border);
  cursor: pointer;
  user-select: none;
  transition: border-color 0.2s;
}

.knob-dial.dragging {
  border-color: var(--primary, #3b82f6);
}

.knob-inner {
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: var(--card);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.knob-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 24px;
  background: var(--primary, #3b82f6);
  border-radius: 2px;
  transform-origin: bottom center;
}

.knob-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.knob-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted-foreground);
}

.value-display {
  font-size: 14px;
  font-family: monospace;
  font-weight: 500;
}
</style>
