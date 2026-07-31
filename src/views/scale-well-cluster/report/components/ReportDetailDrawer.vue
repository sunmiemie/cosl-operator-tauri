<script setup lang="ts">
import { ref, watch } from "vue"
import { APPENDIX_TABS } from "../constants/options"
import type { CalibrationReport, ReportAppendixTab } from "../types"
import { isReportEditable } from "../types"
import ReportAppendixA from "./ReportAppendixA.vue"
import ReportAppendixB from "./ReportAppendixB.vue"
import ReportAppendixC from "./ReportAppendixC.vue"

const visible = defineModel<boolean>("visible", { default: false })

const props = defineProps<{
  report: CalibrationReport | null
  statusLabel: string
  statusType: "success" | "warning" | "danger" | "info"
}>()

const emit = defineEmits<{
  edit: [report: CalibrationReport]
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
          {{ report.id }} · {{ report.submittedAt ? `提交于 ${report.submittedAt}` : "尚未提交" }}
        </span>
      </div>

      <el-alert
        v-if="report.status === 'rejected' && report.reviewRemark"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 14px"
        :title="`驳回原因：${report.reviewRemark}`"
      />

      <el-tabs v-model="activeTab">
        <el-tab-pane v-for="tab in APPENDIX_TABS" :key="tab.key" :label="tab.label" :name="tab.key" />
      </el-tabs>

      <ReportAppendixA v-if="activeTab === 'appA'" :report="report" />
      <ReportAppendixB v-else-if="activeTab === 'appB'" :report="report" />
      <ReportAppendixC v-else :report="report" />

      <div class="report-drawer-footer">
        <el-button @click="visible = false">关闭</el-button>
        <el-button v-if="isReportEditable(report.status)" type="primary" @click="emit('edit', report)">
          编辑报告
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
