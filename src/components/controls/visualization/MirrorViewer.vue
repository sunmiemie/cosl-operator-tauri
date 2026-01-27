<script setup lang="ts">
/**
 * Mirror Viewer Component
 * Displays Plotly chart output from blocks
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { VisualizationProps, PlotlyFigure } from '@/types'
import { PlotlyChart } from '@/components/plotly'

const props = defineProps<VisualizationProps & {
  figure?: PlotlyFigure | null
  theme?: 'light' | 'dark'
}>()

const hasFigure = computed(() => {
  return props.figure?.data && props.figure.data.length > 0
})
</script>

<template>
  <div class="mirror-viewer" :class="{ selected }">
    <Handle type="target" :position="Position.Left" class="handle" />

    <!-- Header -->
    <div class="header">
      <label class="widget-label">
        {{ data.label || data.blockOutput }}
      </label>
    </div>

    <!-- Content -->
    <div class="chart-container">
      <PlotlyChart
        v-if="hasFigure && figure"
        :data="figure.data"
        :layout="figure.layout"
        :theme="theme || 'light'"
        :is-thumbnail="true"
        class="chart"
      />

      <div v-else class="empty-state">
        等待数据...
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="handle" />
  </div>
</template>

<style scoped>
.mirror-viewer {
  min-width: 280px;
  max-width: 400px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.mirror-viewer.selected {
  box-shadow: 0 0 0 2px var(--primary);
}

.handle {
  width: 12px !important;
  height: 12px !important;
  background: var(--primary, #3b82f6) !important;
  border: 2px solid var(--background, white) !important;
}

.header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--muted);
  opacity: 0.3;
}

.widget-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.chart-container {
  padding: 8px;
  min-height: 200px;
}

.chart {
  width: 100%;
  height: 100%;
}

.empty-state {
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground);
  font-size: 14px;
}
</style>
