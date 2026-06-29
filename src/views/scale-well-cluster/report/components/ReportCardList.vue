<script setup lang="ts">
import type { CalibrationReport } from "../types"
import ReportCard from "./ReportCard.vue"

defineProps<{
  reports: CalibrationReport[]
  getStatusLabel: (status: CalibrationReport["status"]) => string
  getStatusType: (status: CalibrationReport["status"]) => "success" | "warning" | "danger"
}>()

const emit = defineEmits<{
  open: [report: CalibrationReport]
  approve: [report: CalibrationReport]
  reject: [report: CalibrationReport]
}>()
</script>

<template>
  <div v-if="reports.length" class="report-card-list">
    <ReportCard
      v-for="report in reports"
      :key="report.id"
      :report="report"
      :status-label="getStatusLabel(report.status)"
      :status-type="getStatusType(report.status)"
      @open="emit('open', $event)"
      @approve="emit('approve', $event)"
      @reject="emit('reject', $event)"
    />
  </div>
  <el-empty v-else description="暂无刻度报告" />
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
