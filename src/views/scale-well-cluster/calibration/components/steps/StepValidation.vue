<script setup lang="ts">
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue"
import CalibrationStepLayout from "../CalibrationStepLayout.vue"

defineProps<{
  results: {
    ka: number
    kb: number
    kc: number
    ba: number
    bb: number
    bc: number
    kcOk: boolean
    bOk: boolean
    allOk: boolean
  }
  kcMin: number
  kcMax: number
}>()

const emit = defineEmits<{
  prev: []
  next: []
}>()

const kpiItems = (results: {
  ka: number
  kb: number
  kc: number
  ba: number
  bb: number
  bc: number
  kcOk: boolean
  bOk: boolean
}) => [
  { key: "Ka", value: results.ka, ok: true },
  { key: "Kb", value: results.kb, ok: results.kcOk },
  { key: "Kc", value: results.kc, ok: results.kcOk },
  { key: "Ba", value: results.ba, ok: true },
  { key: "Bb", value: results.bb, ok: results.bOk },
  { key: "Bc", value: results.bc, ok: results.bOk }
]
</script>

<template>
  <CalibrationStepLayout title="刻度结果校验" description="核对 Kc / B 参数是否在合格范围内">
    <el-alert
      :type="results.allOk ? 'success' : 'warning'"
      :closable="false"
      show-icon
      :title="results.allOk ? '刻度结果在校验范围内，可以写入仪器' : '部分参数超出合格范围，请检查采样数据'"
      :description="`Kc 合格范围 [${kcMin}, ${kcMax}]`"
      class="step-alert"
    />

    <el-row :gutter="12">
      <el-col v-for="item in kpiItems(results)" :key="item.key" :xs="12" :sm="8" :lg="4">
        <el-card shadow="never" class="kpi-card" :class="item.ok ? 'is-ok' : 'is-bad'">
          <el-statistic :title="item.key" :value="item.value" :precision="2" />
          <el-tag :type="item.ok ? 'success' : 'danger'" size="small" effect="plain">
            {{ item.ok ? "合格" : "超限" }}
          </el-tag>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="step-card compare-card">
      <template #header>本次 vs 上次刻度数据对比</template>
      <el-table
        :data="[
          { param: 'Kc', last: '—', current: results.kc, delta: '—', status: results.kcOk ? '正常' : '异常', ok: results.kcOk },
          { param: 'Bb', last: '—', current: results.bb, delta: '—', status: results.bOk ? '正常' : '异常', ok: results.bOk }
        ]"
        size="small"
        stripe
      >
        <el-table-column prop="param" label="参数" width="80" />
        <el-table-column prop="last" label="上次刻度" width="100" />
        <el-table-column prop="current" label="本次刻度" width="100" />
        <el-table-column prop="delta" label="变化" width="80" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.ok ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <template #footer>
      <el-button @click="emit('prev')">
        <el-icon class="el-icon--left"><ArrowLeft /></el-icon>
        上一步
      </el-button>
      <el-button type="primary" :disabled="!results.allOk" @click="emit('next')">
        写入仪器
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
    </template>
  </CalibrationStepLayout>
</template>

<style scoped lang="scss">
.step-alert {
  margin-bottom: 16px;
}

.kpi-card {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  text-align: center;
  margin-bottom: 12px;

  &.is-ok {
    border-color: color-mix(in srgb, var(--color-success) 45%, transparent);
  }

  &.is-bad {
    border-color: color-mix(in srgb, var(--color-danger) 45%, transparent);
  }

  :deep(.el-statistic__number) {
    font-size: 22px;
    font-weight: 700;
  }
}

.step-card {
  border: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  margin-top: 4px;
}

.compare-card :deep(.el-table) {
  margin-bottom: 8px;
}
</style>
