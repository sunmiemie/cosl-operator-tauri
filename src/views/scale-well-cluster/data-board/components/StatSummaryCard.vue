<script setup lang="ts">
import { computed } from "vue"
import type { StatSummaryItem } from "../types"

const props = defineProps<{
  item: StatSummaryItem
}>()

const trendClass = computed(() => {
  const map = {
    up: "is-up",
    down: "is-down",
    neutral: "is-neutral"
  } as const
  return map[props.item.trendType]
})

const displayValue = computed(() => {
  if (props.item.key === "pass-rate") {
    return props.item.value.toFixed(1)
  }
  return String(props.item.value)
})
</script>

<template>
  <el-card shadow="never" class="summary-card">
    <div class="summary-card__icon">
      <img :src="item.icon" :alt="item.label" />
    </div>
    <div class="summary-card__content">
      <div class="summary-card__label">{{ item.label }}</div>
      <div class="summary-card__value">
        {{ displayValue }}<span class="summary-card__unit">{{ item.unit }}</span>
      </div>
      <div class="summary-card__trend" :class="trendClass">{{ item.trendText }}</div>
    </div>
  </el-card>
</template>

<style scoped lang="scss">
@import "../styles/dashboard.scss";
</style>
