<script setup lang="ts">
import { computed } from "vue"
import type { CalibrationDraft, CalibrationWorkOrder, SampleStats } from "../../../shared/types"

const props = defineProps<{
  phase: "hi" | "lo"
  order: CalibrationWorkOrder
  draft: CalibrationDraft
  toolDisplayName: string
  stats: SampleStats
}>()

const isHi = computed(() => props.phase === "hi")
const well = computed(() => (isHi.value ? props.order.hiWell : props.order.loWell))
const api = computed(() => (isHi.value ? props.order.hiApi : props.order.loApi))
const hole = computed(() => (isHi.value ? props.draft.hiHole : props.draft.loHole))
const interval = computed(() => (isHi.value ? props.draft.hiInterval : props.draft.loInterval))
const count = computed(() => (isHi.value ? props.draft.hiCount : props.draft.loCount))

const fmt = (v: number | null) => (v == null ? "—" : String(v))
</script>

<template>
  <div class="sampling-param-bar">
    <span class="sampling-param-bar__label">参数</span>
    <span class="sampling-param-bar__item"><span>型号</span> <b>{{ toolDisplayName }}</b></span>
    <span class="sampling-param-bar__item"><span>SN</span> <b>{{ order.serialNumber || "—" }}</b></span>
    <span class="sampling-param-bar__item"><span>工程师</span> <b>{{ order.engineer || "—" }}</b></span>
    <span class="sampling-param-bar__item"><span>地点</span> <b>{{ order.location || "—" }}</b></span>
    <span class="sampling-param-bar__item"><span>设备</span> <b>{{ order.calibrationDevice || "—" }}</b></span>
    <span class="sampling-param-bar__sep">│</span>
    <span class="sampling-param-bar__item"><span>刻度井</span> <b>{{ well }}</b></span>
    <span class="sampling-param-bar__item"><span>API</span> <b>{{ api }}</b></span>
    <span class="sampling-param-bar__item"><span>井径</span> <b>{{ hole }} mm</b></span>
    <span class="sampling-param-bar__item"><span>间隔</span> <b>{{ interval }} s</b></span>
    <span class="sampling-param-bar__item"><span>点数</span> <b>{{ count }} 点</b></span>
    <span class="sampling-param-bar__sep">│</span>
    <span class="sampling-param-bar__item is-stat"><span>均值</span> <b>{{ fmt(stats.mean) }}</b></span>
    <span class="sampling-param-bar__item is-stat"><span>σ</span> <b>{{ fmt(stats.std) }}</b></span>
    <span class="sampling-param-bar__item is-stat"><span>最大</span> <b>{{ fmt(stats.max) }}</b></span>
    <span class="sampling-param-bar__item is-stat"><span>最小</span> <b>{{ fmt(stats.min) }}</b></span>
    <span class="sampling-param-bar__phase-chip" :class="isHi ? 'is-hi' : 'is-lo'">
      {{ isHi ? "HIGH CAL" : "LOW CAL" }}
    </span>
  </div>
</template>

<style scoped lang="scss">
@import "../../styles/sampling.scss";
</style>
