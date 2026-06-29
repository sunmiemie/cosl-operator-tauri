<script setup lang="ts">
import { ref, watch } from "vue"
import { APPENDIX_TABS } from "../constants/mock-data"
import type { CalibrationReport, ReportAppendixTab } from "../types"
import ReportAppendixA from "./ReportAppendixA.vue"
import ReportAppendixB from "./ReportAppendixB.vue"
import ReportAppendixC from "./ReportAppendixC.vue"

const visible = defineModel<boolean>("visible", { default: false })

const props = defineProps<{
  report: CalibrationReport | null
  statusLabel: string
  statusType: "success" | "warning" | "danger"
}>()

const emit = defineEmits<{
  approve: [report: CalibrationReport]
  reject: [report: CalibrationReport]
}>()

const activeTab = ref<ReportAppendixTab>("appA")

watch(
  () => visible.value,
  (open) => {
    if (open) activeTab.value = "appA"
  }
)
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="report ? `${report.serialNumber} 伽马刻度报告` : '刻度报告详情'"
    size="min(920px, 96vw)"
    destroy-on-close
  >
    <template v-if="report">
      <div style="margin-bottom: 14px">
        <el-tag :type="statusType">{{ statusLabel }}</el-tag>
        <span style="margin-left: 12px; color: var(--el-text-color-secondary); font-size: 13px">
          {{ report.id }} · 提交于 {{ report.submittedAt }}
        </span>
      </div>

      <el-tabs v-model="activeTab">
        <el-tab-pane v-for="tab in APPENDIX_TABS" :key="tab.key" :label="tab.label" :name="tab.key" />
      </el-tabs>

      <ReportAppendixA v-if="activeTab === 'appA'" :report="report" />
      <ReportAppendixB v-else-if="activeTab === 'appB'" :report="report" />
      <ReportAppendixC v-else :report="report" />

      <div class="report-drawer-footer">
        <el-button @click="visible = false">关闭</el-button>
        <template v-if="report.status === 'pending'">
          <el-button type="danger" @click="emit('reject', report)">驳回</el-button>
          <el-button type="primary" @click="emit('approve', report)">审核通过</el-button>
        </template>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
