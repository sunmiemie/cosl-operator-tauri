<script setup lang="ts">
import * as echarts from "echarts"
import { nextTick, onMounted, onUnmounted, ref, watch, withDefaults } from "vue"

type EChartsOption = echarts.EChartsOption

interface Prop {
  width?: number | string
  height?: number | string
  option: EChartsOption
}

const prop = withDefaults(defineProps<Prop>(), {
  width: "100%",
  height: "100%",
  option: () => ({})
})

const RefEchart = ref<HTMLDivElement | null>(null)
let myChart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const initChart = () => {
  if (!RefEchart.value) return
  if (myChart) {
    myChart.dispose()
    myChart = null
  }
  myChart = echarts.init(RefEchart.value)
  myChart.setOption(prop.option, true)
  resizeChart()
}

const applyOption = () => {
  if (!myChart) {
    initChart()
    return
  }
  myChart.setOption(prop.option, { notMerge: false, lazyUpdate: false })
  resizeChart()
}

const resizeChart = () => {
  myChart?.resize()
}

onMounted(async () => {
  await nextTick()
  initChart()
  if (typeof ResizeObserver !== "undefined" && RefEchart.value) {
    resizeObserver = new ResizeObserver(() => resizeChart())
    resizeObserver.observe(RefEchart.value)
  }
  window.addEventListener("resize", resizeChart)
})

watch(() => prop.option, applyOption, { deep: true })

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (myChart) {
    myChart.dispose()
    myChart = null
  }
  window.removeEventListener("resize", resizeChart)
})
</script>

<template>
  <div ref="RefEchart" class="echarts-host" :style="{ width: `${prop.width}`, height: `${prop.height}` }" />
</template>

<style scoped>
.echarts-host {
  min-height: 140px;
}
</style>
