<script setup lang="ts">
import * as echarts from "echarts"
import { onMounted, onUnmounted, ref, watch, withDefaults } from "vue"

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

const initChart = () => {
  if (myChart) {
    myChart.dispose()
  }
  if (RefEchart.value) {
    myChart = echarts.init(RefEchart.value)
    myChart.setOption(prop.option, true)
    window.addEventListener("resize", resizeChart) // 添加窗口大小变化监听
  }
}

const resizeChart = () => {
  if (myChart) {
    myChart.resize() // 更新图表大小
  }
}

onMounted(initChart)

watch(prop.option, initChart, {
  deep: true
})

onUnmounted(() => {
  if (myChart) {
    myChart.dispose() // 组件卸载时清理图表
    window.removeEventListener("resize", resizeChart) // 移除窗口大小变化监听
  }
})
</script>

<template>
  <div ref="RefEchart" :style="{ width: `${prop.width}`, height: `${prop.height}` }" />
</template>
