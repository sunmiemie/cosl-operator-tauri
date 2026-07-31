<script setup lang="ts">
import { computed } from "vue"
import { DataAnalysis, TrendCharts } from "@element-plus/icons-vue"
import type { PhaseSamplingState } from "../../../shared/types"
import { formatRefRange } from "../../../shared/constants/tool-params"

const props = defineProps<{
  phase: "hi" | "lo"
  phaseState: PhaseSamplingState
  well: string
  api: number
  refRange: readonly [number, number]
  dualSensor: boolean
  total: number
}>()

const isHi = computed(() => props.phase === "hi")
const progressPct = computed(() => props.phaseState.pretestProgress)
const rowCount = computed(() => props.phaseState.pretestRows.length)

const tableHeaders = computed(() =>
  props.dualSensor
    ? ["记录点", "CPSA", "CPSB", "状态"]
    : ["记录点", "CPSB", "状态"]
)

const resultState = computed(() => {
  if (!props.phaseState.pretestResultVisible) return null
  return props.phaseState.pretestResultOk ? "ok" : "warn"
})
</script>

<template>
  <div
    class="sampling-col pretest-col pretest-col--100"
    :class="[isHi ? 'is-hi' : 'is-lo', dualSensor ? 'is-dual' : 'is-single']"
  >
    <header class="pretest-col__header">
      <div class="pretest-col__title-group">
        <span class="pretest-col__icon" :class="isHi ? 'is-hi' : 'is-lo'">
          <el-icon><TrendCharts /></el-icon>
        </span>
        <div>
          <h4 class="pretest-col__title">100 点预测试</h4>
          <p class="pretest-col__subtitle">{{ isHi ? "高刻井" : "低刻井" }}常温采样验证</p>
        </div>
      </div>
      <span class="pretest-well-chip" :class="isHi ? 'is-hi' : 'is-lo'">{{ well }}</span>
    </header>

    <!-- 井参数条 -->
    <div class="pretest-well-bar">
      <div class="pretest-well-bar__item">
        <span class="k">API</span>
        <span class="v">{{ api }}</span>
      </div>
      <div class="pretest-well-bar__divider" />
      <div class="pretest-well-bar__item">
        <span class="k">CPS 参考</span>
        <span class="v">{{ formatRefRange(refRange) }}</span>
      </div>
      <div class="pretest-well-bar__divider" />
      <div class="pretest-well-bar__item">
        <span class="k">目标点数</span>
        <span class="v">{{ total }}</span>
      </div>
    </div>

    <!-- 进度 + 实时 CPS -->
    <div class="pretest-progress-block">
      <div class="pretest-progress-top">
        <div class="pretest-live">
          <span class="pretest-live__label">当前 CPS</span>
          <span class="pretest-live__value">{{ phaseState.pretestLiveCps ?? "—" }}</span>
        </div>
        <div class="pretest-counter">
          <span class="pretest-counter__cur">{{ rowCount }}</span>
          <span class="pretest-counter__sep">/</span>
          <span class="pretest-counter__total">{{ total }}</span>
        </div>
      </div>
      <div class="pretest-track">
        <div class="pretest-track__fill" :style="{ width: `${progressPct}%` }" />
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="pretest-table-wrap">
      <div class="pretest-table-head">
        <span v-for="h in tableHeaders" :key="h">{{ h }}</span>
      </div>
      <div class="pretest-table-body">
        <div v-if="!phaseState.pretestRows.length" class="pretest-table-empty">
          <el-icon :size="28"><DataAnalysis /></el-icon>
          <span>启动常温检查后将逐点写入预测试数据</span>
        </div>
        <div
          v-for="row in phaseState.pretestRows"
          :key="row.index"
          class="pretest-table-row"
          :class="{ 'is-ok': row.ok, 'is-bad': !row.ok }"
        >
          <span class="c-idx">{{ row.index }}</span>
          <span v-if="dualSensor" class="c-val">{{ row.cpsA ?? "—" }}</span>
          <span class="c-val c-val--main">{{ row.cpsB }}</span>
          <span class="c-status">
            <span class="status-dot" />{{ row.ok ? "正常" : "异常" }}
          </span>
        </div>
      </div>
    </div>

    <!-- 元数据 -->
    <div class="pretest-meta-grid">
      <div class="pretest-meta-cell">
        <span class="k">开始</span>
        <span class="v">{{ phaseState.pretestStart }}</span>
      </div>
      <div class="pretest-meta-cell">
        <span class="k">结束</span>
        <span class="v">{{ phaseState.pretestEnd }}</span>
      </div>
      <div class="pretest-meta-cell">
        <span class="k">均值 CPS</span>
        <span class="v">{{ phaseState.pretestMean ?? "—" }}</span>
      </div>
      <div class="pretest-meta-cell pretest-meta-cell--file">
        <span class="k">数据文件</span>
        <span class="v" :title="phaseState.pretestFilename">{{ phaseState.pretestFilename || "—" }}</span>
      </div>
    </div>

    <div v-if="resultState" class="pretest-result" :class="`is-${resultState}`">
      <span class="pretest-result__icon">{{ resultState === 'ok' ? '✓' : '!' }}</span>
      <span class="pretest-result__text">{{ phaseState.pretestResultMessage }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../../styles/sampling.scss";
</style>
