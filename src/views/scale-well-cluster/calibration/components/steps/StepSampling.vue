<script setup lang="ts">
import { computed, onMounted } from "vue"
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue"
import type { CalibrationDraft, CalibrationWorkOrder } from "../../../shared/types"
import { getOrderQualification } from "../../../shared/utils/qualification"
import SamplingParamBar from "../sampling/SamplingParamBar.vue"
import CommVerifyPanel from "../sampling/CommVerifyPanel.vue"
import Pretest100Panel from "../sampling/Pretest100Panel.vue"
import FormalSamplingPanel from "../sampling/FormalSamplingPanel.vue"

const props = defineProps<{
  phase: "hi" | "lo"
  order: CalibrationWorkOrder
  draft: CalibrationDraft
  toolDisplayName: string
  isDualSensor: boolean
  canNext: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
  init: []
  commPretest: []
  readSingle: [field: "count" | "cps" | "gr"]
  formalSample: []
  toggleSeries: [idx: 0 | 1]
  copyExcel: []
  manualCalc: []
  toggleDebug: [on: boolean]
}>()

onMounted(() => emit("init"))

const isHi = computed(() => props.phase === "hi")
const phaseState = computed(() => (isHi.value ? props.draft.hiPhase : props.draft.loPhase))
const stats = computed(() => (isHi.value ? props.draft.hiStats : props.draft.loStats))

const qualification = computed(() => getOrderQualification(props.order))
const refRange = computed(() =>
  isHi.value
    ? ([qualification.value.hiRefMin, qualification.value.hiRefMax] as const)
    : ([qualification.value.loRefMin, qualification.value.loRefMax] as const)
)
const well = computed(() => (isHi.value ? props.order.hiWell : props.order.loWell))
const refWell = computed(() => (isHi.value ? props.order.loWell : props.order.hiWell))
const api = computed(() => (isHi.value ? props.order.hiApi : props.order.loApi))
const refApi = computed(() => (isHi.value ? props.order.loApi : props.order.hiApi))
const total = computed(() => (isHi.value ? props.draft.hiCount : props.draft.loCount))

const statusText = computed(() => {
  if (phaseState.value.done) {
    return isHi.value ? "✓ 高刻采样完成，可进入低刻采样" : "✓ 低刻采样完成，可继续结果校验"
  }
  return isHi.value ? "请启动高刻采样" : "请启动低刻采样"
})
</script>

<template>
  <div class="sampling-step" :class="isHi ? 'is-hi' : 'is-lo'">
    <SamplingParamBar
      :phase="phase"
      :order="order"
      :draft="draft"
      :tool-display-name="toolDisplayName"
      :stats="stats"
    />

    <div class="sampling-grid">
      <CommVerifyPanel
        :phase-state="phaseState"
        :dual-sensor="isDualSensor"
        @start="emit('commPretest')"
        @read="emit('readSingle', $event)"
      />
      <Pretest100Panel
        :phase="phase"
        :phase-state="phaseState"
        :well="well"
        :api="api"
        :ref-range="refRange"
        :dual-sensor="isDualSensor"
        :total="total"
      />
      <FormalSamplingPanel
        :phase="phase"
        :phase-state="phaseState"
        :cur-well="well"
        :ref-well="refWell"
        :cur-api="api"
        :ref-api="refApi"
        :total="total"
        :dual-sensor="isDualSensor"
        @sample="emit('formalSample')"
        @toggle-series="emit('toggleSeries', $event)"
        @copy="emit('copyExcel')"
        @calculate="emit('manualCalc')"
        @debug="emit('toggleDebug', $event)"
      />
    </div>

    <div class="sampling-footer">
      <el-button size="small" @click="emit('prev')">
        <el-icon class="el-icon--left"><ArrowLeft /></el-icon>
        上一步
      </el-button>
      <el-text type="info" size="small">{{ statusText }}</el-text>
      <el-button type="success" size="small" :disabled="!canNext" @click="emit('next')">
        {{ isHi ? "下一步：低刻采样" : "下一步：结果校验" }}
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../../styles/sampling.scss";
</style>
