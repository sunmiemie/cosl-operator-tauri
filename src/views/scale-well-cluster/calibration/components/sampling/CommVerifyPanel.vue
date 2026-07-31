<script setup lang="ts">
import { computed } from "vue"
import { Connection, VideoPlay } from "@element-plus/icons-vue"
import type { PhaseSamplingState } from "../../../shared/types"

const props = defineProps<{
  phaseState: PhaseSamplingState
  dualSensor: boolean
}>()

const emit = defineEmits<{
  start: []
  read: [field: "count" | "cps" | "gr"]
}>()

const standbyRef = computed(() => (props.dualSensor ? "70–80 mA" : "250–700 mA"))

const commStatus = computed(() => {
  if (!props.phaseState.pretest.commVisible) return "idle"
  return props.phaseState.pretest.commOk ? "ok" : "warn"
})

const readRows = computed(() => [
  { key: "count" as const, label: "Count", threshold: "", value: props.phaseState.pretest.count },
  { key: "cps" as const, label: "CPS", threshold: "< 50", value: props.phaseState.pretest.cps },
  { key: "gr" as const, label: "GR", threshold: "< 200", value: props.phaseState.pretest.gr }
])
</script>

<template>
  <div class="sampling-col pretest-col pretest-col--comm">
    <header class="pretest-col__header">
      <div class="pretest-col__title-group">
        <span class="pretest-col__icon pretest-col__icon--comm">
          <el-icon><Connection /></el-icon>
        </span>
        <div>
          <h4 class="pretest-col__title">常温检查 · 通信验证</h4>
          <p class="pretest-col__subtitle">STANDBY → Operation → 单点读取</p>
        </div>
      </div>
      <span class="pretest-col__badge">刻度前预检</span>
    </header>

    <div class="comm-body">
      <!-- STANDBY -->
      <section class="comm-section">
        <div class="comm-section__label">
          <span class="comm-section__step">1</span>
          STANDBY 模式
        </div>
        <div class="comm-metrics">
          <div class="comm-metric">
            <span class="comm-metric__key">上电电流</span>
            <span class="comm-metric__ref">参考 {{ standbyRef }}</span>
            <span class="comm-metric__val">{{ phaseState.pretest.standbyCur }}</span>
          </div>
          <div class="comm-metric">
            <span class="comm-metric__key">CGR 时间</span>
            <span class="comm-metric__val">{{ phaseState.pretest.cgrTime }}</span>
          </div>
          <div class="comm-metric">
            <span class="comm-metric__key">固件版本</span>
            <span class="comm-metric__val">{{ phaseState.pretest.firmware }}</span>
          </div>
          <div class="comm-metric">
            <span class="comm-metric__key">FLASH 擦除</span>
            <span class="comm-metric__val">{{ phaseState.pretest.flashErase }}</span>
          </div>
        </div>
      </section>

      <!-- Operation -->
      <section class="comm-section comm-section--grow">
        <div class="comm-section__label">
          <span class="comm-section__step">2</span>
          Operation · 通信验证
        </div>
        <div class="comm-metrics comm-metrics--compact">
          <div class="comm-metric">
            <span class="comm-metric__key">仪器 SN</span>
            <span class="comm-metric__val">{{ phaseState.pretest.sn }}</span>
          </div>
          <div class="comm-metric">
            <span class="comm-metric__key">时间同步</span>
            <span class="comm-metric__val">{{ phaseState.pretest.sync }}</span>
          </div>
          <div class="comm-metric comm-metric--wide">
            <span class="comm-metric__key">仪器状态</span>
            <span class="comm-metric__val">{{ phaseState.pretest.status }}</span>
          </div>
        </div>

        <div class="comm-section__label comm-section__label--sub">
          <span class="comm-section__step comm-section__step--sm">3</span>
          单点读取
        </div>
        <div class="comm-read-list">
          <div v-for="row in readRows" :key="row.key" class="comm-read-row">
            <div class="comm-read-row__info">
              <span class="comm-read-row__label">{{ row.label }}</span>
              <span v-if="row.threshold" class="comm-read-row__threshold">{{ row.threshold }}</span>
              <span class="comm-read-row__value">{{ row.value }}</span>
            </div>
            <button type="button" class="comm-read-btn" @click="emit('read', row.key)">Read</button>
          </div>
        </div>
      </section>
    </div>

    <div
      v-if="phaseState.pretest.commVisible"
      class="comm-result"
      :class="`is-${commStatus}`"
    >
      <span class="comm-result__icon">{{ commStatus === 'ok' ? '✓' : '!' }}</span>
      <span class="comm-result__text">{{ phaseState.pretest.commMessage }}</span>
    </div>

    <footer class="pretest-col__footer">
      <button
        type="button"
        class="pretest-start-btn"
        :class="{ 'is-done': phaseState.pretestDone && phaseState.pretestResultOk }"
        :disabled="phaseState.pretest.running || (phaseState.pretestDone && phaseState.pretestResultOk)"
        @click="emit('start')"
      >
        <el-icon v-if="!phaseState.pretest.running" class="pretest-start-btn__icon"><VideoPlay /></el-icon>
        <span v-if="phaseState.pretest.running" class="pretest-start-btn__spinner" />
        {{ phaseState.pretest.buttonLabel }}
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
@import "../../styles/sampling.scss";
</style>
