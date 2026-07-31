<script setup lang="ts">
import { computed, ref } from "vue"
import { Compass, Lock, VideoPlay } from "@element-plus/icons-vue"
import type { PhaseSamplingState } from "../../../shared/types"
import { getCalImagePath } from "../../composables/sampling-utils"
import SampleCurveChart from "./SampleCurveChart.vue"
import SampleLogPanel from "./SampleLogPanel.vue"
import SampleDataTable from "./SampleDataTable.vue"

const props = defineProps<{
  phase: "hi" | "lo"
  phaseState: PhaseSamplingState
  curWell: string
  refWell: string
  curApi: number
  refApi: number
  total: number
  dualSensor: boolean
}>()

const emit = defineEmits<{
  sample: []
  toggleSeries: [idx: 0 | 1]
  copy: []
  calculate: []
  debug: [on: boolean]
}>()

const isHi = computed(() => props.phase === "hi")
const imgVisible = ref(true)
const imgSrc = computed(() => getCalImagePath(props.phase, props.dualSensor))

const onImgError = () => {
  imgVisible.value = false
}

const cpsLabel = computed(() =>
  props.dualSensor ? "CPSB · 传感器 B" : "CPS · 计数/秒"
)

const unlockLabel = computed(() =>
  props.phaseState.samplingUnlocked ? "已解锁" : "待解锁"
)
</script>

<template>
  <div
    class="sampling-col formal-col"
    :class="[
      isHi ? 'is-hi' : 'is-lo',
      { 'is-done': phaseState.done }
    ]"
  >
    <header class="formal-col__header">
      <div class="pretest-col__title-group">
        <span class="pretest-col__icon" :class="isHi ? 'is-hi' : 'is-lo'">
          <el-icon><Compass /></el-icon>
        </span>
        <div>
          <h4 class="pretest-col__title">{{ isHi ? "高" : "低" }}刻正式采样</h4>
          <p class="pretest-col__subtitle">入井后逐点采集 · {{ curWell }} 井</p>
        </div>
      </div>
      <span
        class="formal-col__lock-badge"
        :class="phaseState.samplingUnlocked ? 'is-open' : 'is-closed'"
      >
        <el-icon v-if="!phaseState.samplingUnlocked"><Lock /></el-icon>
        {{ unlockLabel }}
      </span>
    </header>

    <div v-if="imgVisible" class="formal-ref-img">
      <img :src="imgSrc" alt="入井参考图" @error="onImgError" />
      <span class="formal-ref-img__caption">入井位置参考</span>
    </div>

    <div class="formal-well-pair">
      <div class="formal-well-card is-active">
        <span class="formal-well-card__tag">当前</span>
        <span class="formal-well-card__name">{{ curWell }}</span>
        <span class="formal-well-card__meta">{{ isHi ? "高刻井" : "低刻井" }} · API {{ curApi }}</span>
      </div>
      <div class="formal-well-card is-standby">
        <span class="formal-well-card__tag">待用</span>
        <span class="formal-well-card__name">{{ refWell }}</span>
        <span class="formal-well-card__meta">{{ isHi ? "低刻井" : "高刻井" }} · API {{ refApi }}</span>
      </div>
    </div>

    <div class="formal-live-block">
      <div class="formal-live-top">
        <div class="formal-live-main">
          <span class="formal-live-main__label">{{ cpsLabel }}</span>
          <span class="formal-live-main__value">{{ phaseState.liveCps ?? "—" }}</span>
          <template v-if="dualSensor">
            <span class="formal-live-main__sub-label">CPSA · 传感器 A</span>
            <span class="formal-live-main__sub-value">{{ phaseState.liveCpsA ?? "—" }}</span>
          </template>
        </div>
        <div class="pretest-counter">
          <span class="pretest-counter__cur">{{ phaseState.currentPoint }}</span>
          <span class="pretest-counter__sep">/</span>
          <span class="pretest-counter__total">{{ total }}</span>
          <span class="formal-live-counter__lbl">采样点</span>
        </div>
      </div>
      <div class="pretest-track">
        <div
          class="pretest-track__fill"
          :class="{ 'is-complete': phaseState.done }"
          :style="{ width: `${phaseState.progress}%` }"
        />
      </div>
    </div>

    <button
      type="button"
      class="formal-sample-btn"
      :class="{ 'is-running': phaseState.samplingRunning, 'is-done': phaseState.done }"
      :disabled="!phaseState.samplingUnlocked || phaseState.samplingRunning || phaseState.done"
      @click="emit('sample')"
    >
      <span v-if="phaseState.samplingRunning" class="pretest-start-btn__spinner" />
      <el-icon v-else-if="!phaseState.done" class="formal-sample-btn__icon"><VideoPlay /></el-icon>
      {{ phaseState.sampleButtonLabel }}
    </button>

    <div class="formal-workspace">
      <div class="sample-tab-row formal-tab-row">
        <button
          type="button"
          class="sample-tab"
          :class="{ active: phaseState.mainTab === 'curve' }"
          @click="phaseState.mainTab = 'curve'"
        >
          实时曲线
        </button>
        <button
          type="button"
          class="sample-tab"
          :class="{ active: phaseState.mainTab === 'table' }"
          @click="phaseState.mainTab = 'table'"
        >
          数据表格
        </button>
      </div>

      <div class="sample-tab-body formal-tab-body">
        <template v-if="phaseState.mainTab === 'curve'">
          <SampleCurveChart
            :phase="phase"
            :cps-data="phaseState.chartCps"
            :count-data="phaseState.chartCount"
            :series-visible="phaseState.chartSeriesVisible"
            @toggle="emit('toggleSeries', $event)"
          />
          <SampleLogPanel :logs="phaseState.logs" />
        </template>
        <SampleDataTable
          v-else
          :phase="phase"
          :phase-state="phaseState"
          :dual-sensor="dualSensor"
          @copy="emit('copy')"
          @calculate="emit('calculate')"
          @debug="emit('debug', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../../styles/sampling.scss";
</style>
