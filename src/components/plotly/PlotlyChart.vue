<script setup lang="ts">
/**
 * PlotlyChart Component
 * Vue wrapper for Plotly.js charts
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import Plotly from 'plotly.js-dist-min'
import type { Layout, Config, Data, PlotlyHTMLElement } from 'plotly.js-dist-min'
import type { OverridePlotData } from '@/types'
import { createPlotLayout, createThumbnailLayout, mergeLayouts, MATRIX_SIZE } from './plotlyLayout'
import { formatPlotlyData, isMatrixData, is3DPlot } from './formatPlotlyData'
import type { PlotlyTheme } from './plotlyTheme'

const props = withDefaults(defineProps<{
  data: OverridePlotData
  layout?: Partial<Layout>
  config?: Partial<Config>
  theme?: PlotlyTheme
  isThumbnail?: boolean
  responsive?: boolean
  className?: string
}>(), {
  theme: 'light',
  isThumbnail: false,
  responsive: true,
})

const emit = defineEmits<{
  (e: 'click', data: unknown): void
  (e: 'hover', data: unknown): void
  (e: 'unhover', data: unknown): void
  (e: 'selected', data: unknown): void
  (e: 'relayout', data: unknown): void
}>()

const chartRef = ref<HTMLDivElement | null>(null)
const isInitialized = ref(false)

// Computed layout based on theme and thumbnail mode
const computedLayout = computed(() => {
  const baseLayout = props.isThumbnail
    ? createThumbnailLayout(props.theme)
    : createPlotLayout(props.theme)

  const merged = mergeLayouts(baseLayout, props.layout)

  // Apply matrix size for thumbnail mode
  if (props.isThumbnail && isMatrixData(props.data)) {
    return {
      ...merged,
      width: MATRIX_SIZE.width,
      height: MATRIX_SIZE.height,
    }
  }

  return merged
})

// Computed config
const computedConfig = computed<Partial<Config>>(() => ({
  responsive: props.responsive,
  displayModeBar: !props.isThumbnail,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  displaylogo: false,
  staticPlot: props.isThumbnail && !is3DPlot(props.data),
  ...props.config,
}))

// Format data with theme
const formattedData = computed(() =>
  formatPlotlyData(props.data, props.theme, props.isThumbnail)
)

// Initialize chart
async function initChart() {
  if (!chartRef.value || !props.data?.length) return

  try {
    await Plotly.newPlot(
      chartRef.value,
      formattedData.value as Data[],
      computedLayout.value,
      computedConfig.value
    )

    const chartEl = chartRef.value as PlotlyHTMLElement
    chartEl.on('plotly_click', (data: unknown) => emit('click', data))
    chartEl.on('plotly_hover', (data: unknown) => emit('hover', data))
    chartEl.on('plotly_unhover', (data: unknown) => emit('unhover', data))
    chartEl.on('plotly_selected', (data: unknown) => emit('selected', data))
    chartEl.on('plotly_relayout', (data: unknown) => emit('relayout', data))

    isInitialized.value = true
  } catch (error) {
    console.error('Failed to initialize Plotly chart:', error)
  }
}

// Update chart when data or layout changes
async function updateChart() {
  if (!chartRef.value || !isInitialized.value) return

  try {
    await Plotly.react(
      chartRef.value,
      formattedData.value as Data[],
      computedLayout.value,
      computedConfig.value
    )
  } catch (error) {
    console.error('Failed to update Plotly chart:', error)
  }
}

// Resize chart
async function resize() {
  if (!chartRef.value || !isInitialized.value) return

  try {
    await Plotly.Plots.resize(chartRef.value)
  } catch (error) {
    console.error('Failed to resize Plotly chart:', error)
  }
}

// Cleanup
function cleanup() {
  if (chartRef.value) {
    try {
      Plotly.purge(chartRef.value)
    } catch {
      // Ignore cleanup errors
    }
  }
  isInitialized.value = false
}

// Watch for changes
watch(() => props.data, async () => {
  await nextTick()
  if (isInitialized.value) {
    await updateChart()
  } else {
    await initChart()
  }
}, { deep: true })

watch(() => [props.layout, props.theme, props.isThumbnail], async () => {
  await nextTick()
  await updateChart()
}, { deep: true })

// Lifecycle
onMounted(async () => {
  await nextTick()
  await initChart()

  // Add resize observer
  if (props.responsive && chartRef.value) {
    const resizeObserver = new ResizeObserver(() => {
      resize()
    })
    resizeObserver.observe(chartRef.value.parentElement || chartRef.value)
  }
})

onUnmounted(() => {
  cleanup()
})

// Expose methods
defineExpose({
  resize,
  update: updateChart,
})
</script>

<template>
  <div
    ref="chartRef"
    :class="['plotly-chart', className]"
    :style="{
      width: isThumbnail && isMatrixData(data) ? `${MATRIX_SIZE.width}px` : '100%',
      height: isThumbnail && isMatrixData(data) ? `${MATRIX_SIZE.height}px` : '100%',
    }"
  />
</template>

<style scoped>
.plotly-chart {
  min-height: 200px;
}

.plotly-chart :deep(.modebar) {
  z-index: 10;
}
</style>
