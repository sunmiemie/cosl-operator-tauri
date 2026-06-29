<script setup lang="ts">
import { computed } from "vue"
import { TrendCharts } from "@element-plus/icons-vue"
import CommpontentEcharts from "@/components/Echarts/echarts.vue"
import { buildDailyCalibrationOption } from "../composables/use-dashboard-charts"
import DashboardPanel from "./DashboardPanel.vue"

const props = defineProps<{
  counts: number[]
}>()

const chartOption = computed(() => buildDailyCalibrationOption(props.counts))
</script>

<template>
  <DashboardPanel title="本月每日刻度次数" :icon="TrendCharts">
    <CommpontentEcharts :width="'100%'" :height="'300px'" :option="chartOption as any" />
  </DashboardPanel>
</template>
