<script setup lang="ts">
import type { InstrumentKcConfig } from "../types"
import InstrumentKcChart from "./InstrumentKcChart.vue"

defineProps<{
  configs: InstrumentKcConfig[]
}>()
</script>

<template>
  <section>
    <h3 class="section-heading">仪器 Kc 趋势</h3>
    <div class="kc-grid">
      <InstrumentKcChart v-for="config in configs" :key="config.model" :config="config" />
    </div>
  </section>
</template>

<style scoped lang="scss">
@import "../styles/dashboard.scss";
</style>
