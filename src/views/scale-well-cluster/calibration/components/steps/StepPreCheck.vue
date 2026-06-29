<script setup lang="ts">
import { ArrowRight } from "@element-plus/icons-vue"
import CalibrationStepLayout from "../CalibrationStepLayout.vue"

defineProps<{
  labels: readonly string[]
  preChecks: boolean[]
  preCheckCount: number
  canNext: boolean
}>()

const emit = defineEmits<{
  toggle: [index: number]
  next: []
}>()
</script>

<template>
  <CalibrationStepLayout
    title="通电前检查"
    description="所有项目确认完成后方可进行系统连接与上电操作"
  >
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="安全提示"
      description="请逐项核对后再进入系统连接步骤，未完成检查禁止上电。"
      class="step-alert"
    />

    <el-card shadow="never" class="step-card">
      <el-checkbox
        v-for="(label, i) in labels"
        :key="i"
        :model-value="preChecks[i]"
        class="precheck-item"
        @change="emit('toggle', i)"
      >
        <span class="precheck-index">{{ i + 1 }}.</span>{{ label }}
      </el-checkbox>
    </el-card>

    <template #footer>
      <el-text type="info" size="small">已完成 {{ preCheckCount }} / {{ labels.length }} 项</el-text>
      <el-button type="primary" :disabled="!canNext" @click="emit('next')">
        下一步：系统连接
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
    </template>
  </CalibrationStepLayout>
</template>

<style scoped lang="scss">
.step-alert {
  margin-bottom: 16px;
}

.step-card {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.precheck-item {
  display: flex;
  width: 100%;
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  transition: background 0.15s;

  &:hover {
    background: var(--color-bg-hover);
  }

  & + & {
    margin-top: 4px;
  }
}

.precheck-index {
  display: inline-block;
  width: 1.25rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}
</style>
