<script setup lang="ts">
/**
 * Seven Segment Display Component
 * Displays numeric values in a digital LED style
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { VisualizationProps } from '@/types'

const props = defineProps<VisualizationProps & {
  value?: number | string | null
}>()

// Segment patterns for digits 0-9 and some special characters
const SEGMENTS: Record<string, boolean[]> = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
  '-': [false, false, false, false, false, false, true],
  '.': [false, false, false, false, false, false, false], // Handled separately
  ' ': [false, false, false, false, false, false, false],
}

const displayValue = computed(() => {
  if (props.value === null || props.value === undefined) return '---'
  const val = typeof props.value === 'number' ? props.value.toFixed(2) : String(props.value)
  return val.slice(0, 6) // Max 6 characters
})

const digits = computed(() => {
  return displayValue.value.split('').map((char, index) => ({
    char,
    segments: SEGMENTS[char] || SEGMENTS[' '],
    hasDot: displayValue.value[index + 1] === '.',
  })).filter(d => d.char !== '.')
})
</script>

<template>
  <div class="seven-segment-display" :class="{ selected }">
    <Handle type="target" :position="Position.Left" class="handle" />

    <div class="content">
      <label class="widget-label">
        {{ data.label || data.blockOutput }}
      </label>

      <!-- Display -->
      <div class="display-container">
        <div
          v-for="(digit, index) in digits"
          :key="index"
          class="digit"
        >
          <!-- Segment A (top) -->
          <div
            class="segment segment-h segment-top"
            :class="{ active: digit.segments[0] }"
          />
          <!-- Segment B (top-right) -->
          <div
            class="segment segment-v segment-top-right"
            :class="{ active: digit.segments[1] }"
          />
          <!-- Segment C (bottom-right) -->
          <div
            class="segment segment-v segment-bottom-right"
            :class="{ active: digit.segments[2] }"
          />
          <!-- Segment D (bottom) -->
          <div
            class="segment segment-h segment-bottom"
            :class="{ active: digit.segments[3] }"
          />
          <!-- Segment E (bottom-left) -->
          <div
            class="segment segment-v segment-bottom-left"
            :class="{ active: digit.segments[4] }"
          />
          <!-- Segment F (top-left) -->
          <div
            class="segment segment-v segment-top-left"
            :class="{ active: digit.segments[5] }"
          />
          <!-- Segment G (middle) -->
          <div
            class="segment segment-h segment-middle"
            :class="{ active: digit.segments[6] }"
          />
          <!-- Decimal point -->
          <div
            v-if="digit.hasDot"
            class="decimal-point"
          />
        </div>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="handle" />
  </div>
</template>

<style scoped>
.seven-segment-display {
  min-width: 180px;
  padding: 16px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.seven-segment-display.selected {
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

.display-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px;
  background: #1a1a2e;
  border-radius: 6px;
}

.digit {
  position: relative;
  width: 24px;
  height: 40px;
}

.segment {
  position: absolute;
  background: rgba(255, 0, 0, 0.1);
  transition: background 0.1s;
}

.segment.active {
  background: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
}

.segment-h {
  width: 14px;
  height: 3px;
  border-radius: 1px;
}

.segment-v {
  width: 3px;
  height: 14px;
  border-radius: 1px;
}

.segment-top {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
}

.segment-top-right {
  top: 4px;
  right: 0;
}

.segment-bottom-right {
  bottom: 4px;
  right: 0;
}

.segment-bottom {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.segment-bottom-left {
  bottom: 4px;
  left: 0;
}

.segment-top-left {
  top: 4px;
  left: 0;
}

.segment-middle {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.decimal-point {
  position: absolute;
  bottom: 0;
  right: -4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}
</style>
