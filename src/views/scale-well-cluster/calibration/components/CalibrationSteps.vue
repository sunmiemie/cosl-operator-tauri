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
@import "../styles/calibration-flow.scss";
</style>
