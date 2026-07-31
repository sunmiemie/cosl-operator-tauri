<script setup lang="ts">
import { ArrowLeft, Document } from "@element-plus/icons-vue"
import CalibrationStepLayout from "../CalibrationStepLayout.vue"

defineProps<{
  results: {
    ka: number
    kb: number
    kc: number
    ba: number
    bb: number
    bc: number
  }
  dataWritten: boolean
  writing: boolean
}>()

const emit = defineEmits<{
  prev: []
  confirm: []
  finish: []
}>()

const params = (r: { ka: number; kb: number; kc: number; ba: number; bb: number; bc: number }) => [
  { key: "Ka", value: r.ka },
  { key: "Kb", value: r.kb },
  { key: "Kc", value: r.kc },
  { key: "Ba", value: r.ba },
  { key: "Bb", value: r.bb },
  { key: "Bc", value: r.bc }
]
</script>

<template>
  <CalibrationStepLayout title="刻度数据写入仪器" description="确认参数无误后执行写入，并完成读回验证">
    <template v-if="writing">
      <div class="write-state">
        <el-progress type="circle" :percentage="60" :width="120" />
        <el-text type="primary">正在写入仪器...</el-text>
      </div>
    </template>

    <template v-else-if="!dataWritten">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="写入确认"
        description="即将把以下刻度参数写入仪器，请确认无误后执行写入。"
        class="step-alert"
      />
      <el-row :gutter="12">
        <el-col v-for="item in params(results)" :key="item.key" :xs="12" :sm="8" :lg="4">
          <el-card shadow="never" class="kpi-card is-ok">
            <el-statistic :title="item.key" :value="item.value" :precision="2" />
          </el-card>
        </el-col>
      </el-row>
    </template>

    <template v-else>
      <el-result icon="success" title="刻度数据已成功写入仪器" sub-title="写入参数已通过读回验证，与计算结果一致">
        <template #extra>
          <el-row :gutter="12" class="result-kpi">
            <el-col v-for="item in params(results)" :key="item.key" :xs="12" :sm="8" :lg="4">
              <el-card shadow="never" class="kpi-card is-ok">
                <el-statistic :title="item.key" :value="item.value" :precision="2" />
              </el-card>
            </el-col>
          </el-row>
        </template>
      </el-result>
    </template>

    <template #footer>
      <template v-if="writing">
        <span />
        <span />
      </template>
      <template v-else-if="!dataWritten">
        <el-button @click="emit('prev')">
          <el-icon class="el-icon--left"><ArrowLeft /></el-icon>
          返回
        </el-button>
        <el-button type="success" @click="emit('confirm')">确认写入</el-button>
      </template>
      <template v-else>
        <span />
        <el-button class="step-write-finish-btn" type="primary" @click="emit('finish')">
          <el-icon class="el-icon--left"><Document /></el-icon>
          查看刻度报告
        </el-button>
      </template>
    </template>
  </CalibrationStepLayout>
</template>

<style scoped lang="scss">
.step-alert {
  margin-bottom: 16px;
}

.write-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 0;
}

.kpi-card {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  text-align: center;
  margin-bottom: 12px;

  &.is-ok {
    border-color: color-mix(in srgb, var(--color-success) 45%, transparent);
  }

  :deep(.el-statistic__number) {
    font-size: 22px;
    font-weight: 700;
  }
}

.result-kpi {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}

.step-write-finish-btn {
  min-width: 148px;
  color: #fff;

  :deep(.el-icon) {
    color: inherit;
  }
}
</style>
