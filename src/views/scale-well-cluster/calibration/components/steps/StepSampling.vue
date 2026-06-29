<script setup lang="ts">
import { computed } from "vue"
import { ArrowLeft, ArrowRight, VideoPlay } from "@element-plus/icons-vue"
import CalibrationStepLayout from "../CalibrationStepLayout.vue"
import type { CalibrationDraft, CalibrationWorkOrder } from "../../../shared/types"

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
  pretest: []
  sample: []
}>()

const isHi = computed(() => props.phase === "hi")
const well = computed(() => (isHi.value ? props.order.hiWell : props.order.loWell))
const api = computed(() => (isHi.value ? props.order.hiApi : props.order.loApi))
const hole = computed(() => (isHi.value ? props.draft.hiHole : props.draft.loHole))
const interval = computed(() => (isHi.value ? props.draft.hiInterval : props.draft.loInterval))
const count = computed(() => (isHi.value ? props.draft.hiCount : props.draft.loCount))
const pretestDone = computed(() => (isHi.value ? props.draft.hiPretestDone : props.draft.loPretestDone))
const progress = computed(() => (isHi.value ? props.draft.hiSampleProgress : props.draft.loSampleProgress))
const samplingDone = computed(() => (isHi.value ? props.draft.hiSamplingDone : props.draft.loSamplingDone))
const stats = computed(() => (isHi.value ? props.draft.hiStats : props.draft.loStats))
const otherWell = computed(() => (isHi.value ? props.order.loWell : props.order.hiWell))
const otherApi = computed(() => (isHi.value ? props.order.loApi : props.order.hiApi))
const sampleCurrent = computed(() => Math.round((progress.value / 100) * count.value))

const fmt = (v: number | null) => (v == null ? "—" : String(v))
const phaseTitle = computed(() => (isHi.value ? "高刻采样" : "低刻采样"))
const statusText = computed(() =>
  samplingDone.value
    ? `✓ ${phaseTitle.value}完成，可进入下一步`
    : `请启动${phaseTitle.value}`
)
</script>

<template>
  <CalibrationStepLayout
    :title="phaseTitle"
    :description="`${well} 井 · API ${api} · 间隔 ${interval}s · ${count} 点`"
  >
    <template #extra>
      <el-tag :type="isHi ? 'danger' : 'primary'" effect="dark">
        {{ isHi ? "HIGH CAL" : "LOW CAL" }}
      </el-tag>
    </template>

    <el-descriptions :column="4" border size="small" class="param-desc">
      <el-descriptions-item label="型号">{{ toolDisplayName }}</el-descriptions-item>
      <el-descriptions-item label="SN">{{ order.serialNumber }}</el-descriptions-item>
      <el-descriptions-item label="工程师">{{ order.engineer }}</el-descriptions-item>
      <el-descriptions-item label="地点">{{ order.location }}</el-descriptions-item>
      <el-descriptions-item label="刻度井">{{ well }}</el-descriptions-item>
      <el-descriptions-item label="井径">{{ hole }} mm</el-descriptions-item>
      <el-descriptions-item label="均值">{{ fmt(stats.mean) }}</el-descriptions-item>
      <el-descriptions-item label="σ">{{ fmt(stats.std) }}</el-descriptions-item>
    </el-descriptions>

    <el-row :gutter="12" class="sample-columns">
      <!-- 通信验证 -->
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="step-card sample-card">
          <template #header>
            <div class="card-head">
              <span>通信验证</span>
              <el-tag type="info" size="small">刻度前预检</el-tag>
            </div>
          </template>
          <el-descriptions :column="2" size="small" border class="mini-desc">
            <el-descriptions-item label="上电电流">—</el-descriptions-item>
            <el-descriptions-item label="CGR 时间">—</el-descriptions-item>
            <el-descriptions-item label="固件版本">—</el-descriptions-item>
            <el-descriptions-item label="FLASH">—</el-descriptions-item>
            <el-descriptions-item label="仪器 SN" :span="2">{{ order.serialNumber }}</el-descriptions-item>
            <el-descriptions-item label="时间同步">—</el-descriptions-item>
            <el-descriptions-item label="仪器状态">—</el-descriptions-item>
          </el-descriptions>
          <el-alert
            v-if="pretestDone"
            type="success"
            :closable="false"
            show-icon
            title="常温通信验证通过"
            class="block-alert"
          />
          <el-button
            type="primary"
            class="full-btn"
            :disabled="pretestDone"
            @click="emit('pretest')"
          >
            <el-icon><VideoPlay /></el-icon>
            启动常温检查
          </el-button>
        </el-card>
      </el-col>

      <!-- 100点预测试 -->
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="step-card sample-card">
          <template #header>100 点预测试 · {{ isHi ? "高" : "低" }}刻井</template>
          <div class="well-badge">
            <el-tag :type="isHi ? 'danger' : 'primary'" size="small">{{ well }}</el-tag>
            <el-text type="info" size="small">API = {{ api }}</el-text>
          </div>
          <el-progress
            :percentage="pretestDone ? 100 : 0"
            :status="pretestDone ? 'success' : undefined"
            :stroke-width="8"
          />
          <el-text type="info" size="small">
            进度 {{ pretestDone ? count : 0 }} / {{ count }}
          </el-text>
          <div class="chart-box">
            <el-empty description="预测试数据（mock）" :image-size="56" />
          </div>
        </el-card>
      </el-col>

      <!-- 正式采样 -->
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="step-card sample-card" :class="{ 'is-locked': !pretestDone }">
          <template #header>
            <div class="card-head">
              <span>{{ phaseTitle }} — {{ well }} 井</span>
              <el-text v-if="!pretestDone" type="info" size="small">预检通过后解锁</el-text>
            </div>
          </template>

          <div class="well-compare">
            <el-tag :type="isHi ? 'danger' : 'primary'" size="small">
              {{ well }}（当前）API {{ api }}
            </el-tag>
            <el-text type="info" size="small">{{ otherWell }}（待用）API {{ otherApi }}</el-text>
          </div>

          <el-row :gutter="8" class="cps-row">
            <el-col :span="14">
              <el-statistic title="CPSB（计数/秒）" :value="samplingDone && stats.mean != null ? stats.mean : '—'" />
              <el-statistic
                v-if="isDualSensor"
                title="CPSA（传感器 A）"
                value="—"
                class="cps-secondary"
              />
            </el-col>
            <el-col :span="10">
              <div class="progress-counter">
                <span class="cur">{{ sampleCurrent }}</span>
                <span class="sep">/</span>
                <span class="total">{{ count }}</span>
                <div class="label">采样进度</div>
              </div>
            </el-col>
          </el-row>

          <el-progress
            :percentage="progress"
            :status="samplingDone ? 'success' : undefined"
            :stroke-width="10"
          />

          <el-button
            type="primary"
            class="full-btn"
            :disabled="!pretestDone || samplingDone"
            @click="emit('sample')"
          >
            <el-icon><VideoPlay /></el-icon>
            启动{{ isHi ? "高" : "低" }}刻采样
          </el-button>

          <div class="chart-box chart-box--tall">
            <el-empty description="实时曲线（mock）" :image-size="56" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <template #footer>
      <el-button @click="emit('prev')">
        <el-icon class="el-icon--left"><ArrowLeft /></el-icon>
        上一步
      </el-button>
      <el-text type="info" size="small">{{ statusText }}</el-text>
      <el-button type="success" :disabled="!canNext" @click="emit('next')">
        {{ isHi ? "下一步：低刻采样" : "下一步：结果校验" }}
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
    </template>
  </CalibrationStepLayout>
</template>

<style scoped lang="scss">
.param-desc {
  margin-bottom: 14px;
}

.sample-columns {
  min-height: 420px;
}

.step-card {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sample-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.sample-card.is-locked {
  opacity: 0.55;
  pointer-events: none;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mini-desc {
  margin-bottom: 4px;
}

.block-alert {
  margin-top: auto;
}

.full-btn {
  width: 100%;
  margin-top: auto;
}

.well-badge {
  display: flex;
  align-items: center;
  gap: 8px;
}

.well-compare {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cps-row {
  align-items: center;
}

.cps-secondary {
  margin-top: 8px;

  :deep(.el-statistic__number) {
    font-size: 18px;
    color: #818cf8;
  }
}

.progress-counter {
  text-align: center;

  .cur {
    font-size: 28px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .sep,
  .total {
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  .label {
    font-size: 11px;
    color: var(--color-text-secondary);
    margin-top: 4px;
  }
}

.chart-box {
  flex: 1;
  min-height: 120px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  display: grid;
  place-items: center;

  &--tall {
    min-height: 140px;
  }
}
</style>
