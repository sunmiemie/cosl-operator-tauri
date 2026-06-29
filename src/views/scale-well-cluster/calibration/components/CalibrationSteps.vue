<script setup lang="ts">
import {
  Cpu,
  DocumentChecked,
  EditPen,
  Link,
  Setting,
  Upload
} from "@element-plus/icons-vue"

defineProps<{
  active: number
  steps: readonly string[]
}>()

const stepIcons = [EditPen, Link, Setting, Cpu, Cpu, DocumentChecked, Upload]
</script>

<template>
  <div class="cal-steps-wrap">
    <el-steps :active="active" finish-status="success" align-center process-status="process">
      <el-step
        v-for="(title, i) in steps"
        :key="title"
        :title="title"
        :icon="stepIcons[i]"
      />
    </el-steps>
  </div>
</template>

<style scoped lang="scss">
.cal-steps-wrap {
  flex-shrink: 0;
  padding: 16px 20px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;

  :deep(.el-step__title) {
    font-size: 12px;
    line-height: 1.3;
  }

  :deep(.el-step__title.is-process),
  :deep(.el-step__title.is-finish) {
    color: var(--color-text-primary);
    font-weight: 600;
  }

  :deep(.el-step__title.is-wait) {
    color: var(--color-text-secondary);
  }

  :deep(.el-step__head.is-process) {
    color: var(--color-accent-blue);
    border-color: var(--color-accent-blue);
  }

  :deep(.el-step__head.is-finish) {
    color: var(--color-success);
    border-color: var(--color-success);
  }

  :deep(.el-step__line) {
    background: var(--color-border);
  }

  :deep(.el-step.is-horizontal .el-step__line) {
    top: 15px;
  }
}
</style>
