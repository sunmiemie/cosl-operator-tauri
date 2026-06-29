<script setup lang="ts">
import { Document } from "@element-plus/icons-vue"
import { getToolDisplayName } from "../../shared/constants/tool-params"
import type { CalibrationReport } from "../types"

defineProps<{
  report: CalibrationReport
  statusLabel: string
  statusType: "success" | "warning" | "danger"
}>()

const emit = defineEmits<{
  open: [report: CalibrationReport]
  approve: [report: CalibrationReport]
  reject: [report: CalibrationReport]
}>()
</script>

<template>
  <article class="report-card" @click="emit('open', report)">
    <div class="report-card__icon">
      <el-icon><Document /></el-icon>
    </div>

    <div class="report-card__body">
      <div class="report-card__title">{{ report.serialNumber }} 伽马刻度报告</div>
      <div class="report-card__meta">
        {{ report.workOrderId }} · {{ getToolDisplayName(report.toolType) }} · {{ report.engineer }} ·
        {{ report.testDate }}
        <template v-if="report.kc != null"> · Kc={{ report.kc }}</template>
      </div>
    </div>

    <div class="report-card__actions" @click.stop>
      <el-tag :type="statusType" size="small">{{ statusLabel }}</el-tag>
      <div class="report-card__ops">
        <el-button link type="primary" @click="emit('open', report)">查看</el-button>
        <template v-if="report.status === 'pending'">
          <el-button link type="success" @click="emit('approve', report)">通过</el-button>
          <el-button link type="danger" @click="emit('reject', report)">驳回</el-button>
        </template>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
