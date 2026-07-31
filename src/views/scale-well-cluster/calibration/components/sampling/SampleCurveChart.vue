<script setup lang="ts">
import { computed } from "vue"
import type { EChartsOption } from "echarts"
import CommpontentEcharts from "@/components/Echarts/echarts.vue"

const props = defineProps<{
  phase: "hi" | "lo"
  cpsData: number[]
  countData: number[]
  seriesVisible: [boolean, boolean]
}>()

const emit = defineEmits<{
  toggle: [idx: 0 | 1]
}>()

const cpsColor = computed(() => (props.phase === "hi" ? "#e07a5f" : "#5b9fd4"))
const countColor = "#d97706"

const xLabels = computed(() => {
  const len = Math.max(props.cpsData.length, props.countData.length, 1)
  return Array.from({ length: len }, (_, i) => String(i + 1))
})

const option = computed<EChartsOption>(() => ({
  animation: false,
  backgroundColor: "transparent",
  grid: { top: 28, right: 44, bottom: 28, left: 48, containLabel: true },
  tooltip: { trigger: "axis" },
  xAxis: {
    type: "category",
    data: xLabels.value,
    boundaryGap: false,
    axisLabel: { fontSize: 9, color: "#94a3b8" },
    axisLine: { lineStyle: { color: "rgba(148,163,184,0.35)" } },
    splitLine: { show: true, lineStyle: { color: "rgba(148,163,184,0.08)" } }
  },
  yAxis: [
    {
      type: "value",
      name: "CPS",
      show: props.seriesVisible[0],
      axisLabel: { fontSize: 9, color: "#94a3b8" },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.12)" } }
    },
    {
      type: "value",
      name: "Count",
      show: props.seriesVisible[1],
      axisLabel: { fontSize: 9, color: "#94a3b8" },
      splitLine: { show: false }
    }
  ],
  series: [
    {
      name: "CPS",
      type: "line",
      data: props.seriesVisible[0] ? props.cpsData : [],
      showSymbol: false,
      lineStyle: { color: cpsColor.value, width: 1.5 },
      itemStyle: { color: cpsColor.value },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `${cpsColor.value}22` },
            { offset: 1, color: "transparent" }
          ]
        }
      }
    },
    {
      name: "Count",
      type: "line",
      yAxisIndex: 1,
      data: props.seriesVisible[1] ? props.countData : [],
      showSymbol: false,
      lineStyle: { color: countColor, width: 1.5 },
      itemStyle: { color: countColor }
    }
  ]
}))
</script>

<template>
  <div class="formal-chart-panel">
    <div class="chart-legend-row">
      <span class="chart-legend-row__label">显示</span>
      <button
        type="button"
        class="leg-btn"
        :class="{ inactive: !seriesVisible[0] }"
        :style="{ color: cpsColor }"
        @click="emit('toggle', 0)"
      >
        <span class="dot" :style="{ background: cpsColor }" />CPS
      </button>
      <button
        type="button"
        class="leg-btn"
        :class="{ inactive: !seriesVisible[1] }"
        :style="{ color: countColor }"
        @click="emit('toggle', 1)"
      >
        <span class="dot" :style="{ background: countColor }" />Count
      </button>
    </div>
    <div class="formal-chart-canvas">
      <CommpontentEcharts class="formal-chart-echarts" :option="option" height="100%" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../../styles/sampling.scss";
</style>
