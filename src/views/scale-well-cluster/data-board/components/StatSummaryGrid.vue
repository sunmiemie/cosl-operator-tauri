<script setup lang="ts">
import type { StatSummaryItem } from "../types"
import StatSummaryCard from "./StatSummaryCard.vue"

defineProps<{
  items: StatSummaryItem[]
}>()
</script>

<template>
  <section class="summary-grid">
    <StatSummaryCard v-for="item in items" :key="item.key" :item="item" />
  </section>
</template>

<style scoped lang="scss">
@import "../styles/dashboard.scss";
</style>
