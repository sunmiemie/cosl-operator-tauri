<script setup lang="ts">
import { computed } from "vue"
import { DataAnalysis, RefreshLeft } from "@element-plus/icons-vue"
import type { CalCoefficients, CalibrationResults } from "../../composables/calibration-results"
import {
  buildCompareRows,
  buildKpiItems,
  buildSummaryText
} from "../../composables/calibration-results"
import type { QualificationThresholds } from "../../../shared/types"

const props = defineProps<{
  results: CalibrationResults
  lastCal: CalCoefficients | null
  qualification: QualificationThresholds
  dualSensor: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
  restart: []
}>()

const kpiItems = computed(() =>
  buildKpiItems(props.results, props.dualSensor, props.qualification)
)

const compareRows = computed(() =>
  buildCompareRows(props.results, props.lastCal, props.dualSensor, props.qualification)
)

const summaryDetail = computed(() => buildSummaryText(props.results, props.dualSensor, props.qualification))
</script>

<template>
  <div class="cal-result-step">
    <div class="cal-result-card">
      <header class="cal-result-card__head">
        <span class="cal-result-card__icon">
          <el-icon><DataAnalysis /></el-icon>
        </span>
        <div>
          <h3 class="cal-result-card__title">刻度结果校验</h3>
          <p class="cal-result-card__desc">
            Ka/Kb、Ba/Bb 按刻度井配置校验 · Kc/Bc 为客户端自动计算
          </p>
        </div>
      </header>

      <div class="cal-result-card__body">
        <div
          class="cal-ibox"
          :class="results.allOk ? 'cal-ibox--success' : 'cal-ibox--warn'"
        >
          <b>{{ results.allOk ? "✅ 刻度结果合格！" : "⚠️ 刻度结果超出范围！" }}</b>
          {{ summaryDetail }}
        </div>

        <div class="cal-kpi-grid">
          <div
            v-for="item in kpiItems"
            :key="item.key"
            class="cal-kpi-card"
            :class="item.ok ? 'is-ok' : 'is-bad'"
          >
            <div class="cal-kpi-card__key">{{ item.key }}</div>
            <div class="cal-kpi-card__val">{{ item.value }}</div>
            <div class="cal-kpi-card__range">{{ item.range }}</div>
          </div>
        </div>

        <div class="cal-mean-strip">
          <span class="cal-mean-strip__item">
            <span class="k">高刻均值 CPS</span>
            <span class="v">{{ results.hiMean }}</span>
          </span>
          <span class="cal-mean-strip__divider" />
          <span class="cal-mean-strip__item">
            <span class="k">低刻均值 CPS</span>
            <span class="v">{{ results.loMean }}</span>
          </span>
        </div>

        <div class="cal-section-divider" />

        <h4 class="cal-section-title">本次 vs 上次刻度数据对比</h4>

        <div class="cal-cmp-table">
          <div class="cal-cmp-table__head">
            <span>参数</span>
            <span>上次刻度</span>
            <span>本次刻度</span>
            <span>变化</span>
            <span>状态</span>
          </div>
          <div v-for="row in compareRows" :key="row.param" class="cal-cmp-table__row">
            <span class="param">{{ row.param }}</span>
            <span>{{ row.last ?? "—" }}</span>
            <span :class="row.ok ? 'cur-ok' : 'cur-bad'">{{ row.current }}</span>
            <span :class="row.delta != null && row.delta > 0 ? 'delta-up' : row.delta != null && row.delta < 0 ? 'delta-down' : ''">
              {{ row.deltaStr }}
            </span>
            <span>
              <span class="cal-status-tag" :class="row.ok ? 'is-ok' : 'is-bad'">
                {{ row.ok ? "合格" : "异常" }}
              </span>
            </span>
          </div>
        </div>
      </div>

      <footer class="cal-result-card__foot">
        <button type="button" class="cal-result-btn cal-result-btn--ghost" @click="emit('prev')">
          ← 上一步
        </button>
        <div class="cal-result-card__foot-actions">
          <button
            v-if="!results.allOk"
            type="button"
            class="cal-result-btn cal-result-btn--warn"
            @click="emit('restart')"
          >
            <el-icon><RefreshLeft /></el-icon>
            重新采样
          </button>
          <button
            type="button"
            class="cal-result-btn cal-result-btn--primary"
            :disabled="!results.allOk"
            @click="emit('next')"
          >
            写入仪器 →
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../../styles/validation-write.scss";

.cal-mean-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-bg-tertiary) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
  flex-shrink: 0;

  &__item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 0 12px;

    .k {
      font-size: 9px;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--color-text-secondary);
    }

    .v {
      font-family: var(--cal-mono);
      font-size: 13px;
      font-weight: 700;
      color: var(--color-text-primary);
    }
  }

  &__divider {
    width: 1px;
    height: 16px;
    background: color-mix(in srgb, var(--color-border) 70%, transparent);
  }
}

.cal-result-card__foot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
