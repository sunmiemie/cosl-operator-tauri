<script setup lang="ts">
import type { SampleLogLine } from "../../../shared/types"

defineProps<{
  logs: SampleLogLine[]
}>()
</script>

<template>
  <div class="sample-log-panel">
    <div v-for="(line, i) in logs" :key="i" class="logline" :class="line.type">
      <span class="ts">{{ line.ts }}</span>
      <span class="msg">{{ line.msg }}</span>
    </div>
    <div v-if="!logs.length" class="sample-log-panel__empty">启动采样后，实时日志将显示于此</div>
  </div>
</template>

<style scoped lang="scss">
@import "../../styles/sampling.scss";
</style>
