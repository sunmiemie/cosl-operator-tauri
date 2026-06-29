<script setup lang="ts">
import { computed } from "vue"
import { DataAnalysis } from "@element-plus/icons-vue"
import CommpontentEcharts from "@/components/Echarts/echarts.vue"
import type { InstrumentKcConfig } from "../types"
import { buildInstrumentKcOption } from "../composables/use-dashboard-charts"
import DashboardPanel from "./DashboardPanel.vue"

const props = defineProps<{
  config: InstrumentKcConfig
}>()

const chartOption = computed(() => buildInstrumentKcOption(props.config))
</script>

<template>
  <DashboardPanel
    :title="config.title"
    :subtitle="`合格区间 Kc [${config.kcMin}, ${config.kcMax}]`"
    :icon="DataAnalysis"
  >
    <CommpontentEcharts :width="'100%'" :height="'200px'" :option="chartOption as any" />
  </DashboardPanel>
</template>
