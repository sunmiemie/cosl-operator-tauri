<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { ElMessage } from "element-plus"
import ReportFillHeader from "./components/ReportFillHeader.vue"
import ReportAppendixAForm from "./components/ReportAppendixAForm.vue"
import ReportAppendixBForm from "./components/ReportAppendixBForm.vue"
import ReportAppendixCForm from "./components/ReportAppendixCForm.vue"
import { useScaleWellSession } from "../shared/composables/useScaleWellSession"
import type { ReportAppendixTab } from "../shared/types"

const router = useRouter()
const { reportDraft, initReportDraftIfEmpty, activeWorkOrder } = useScaleWellSession()
const activeTab = ref<ReportAppendixTab>("appA")

onMounted(() => {
  if (!activeWorkOrder.value && !reportDraft.value) {
    ElMessage.info("请先从数据看板开始刻度流程")
    router.replace("/scale-well-cluster/data-board")
    return
  }
  initReportDraftIfEmpty()
})

const saveDraft = () => {
  ElMessage.success("报告草稿已保存（本地 mock）")
}

const exportPlaceholder = () => {
  ElMessage.info("导出 Word/PDF 功能待对接")
}
</script>

<template>
  <div v-if="reportDraft" class="scale-well-page">
    <ReportFillHeader />

    <div class="sw-content-panel report-panel">
      <el-tabs v-model="activeTab" class="report-tabs">
        <el-tab-pane label="附录A · 伽马刻度工单" name="appA">
          <ReportAppendixAForm :draft="reportDraft" />
        </el-tab-pane>
        <el-tab-pane label="附录B · 测试记录表" name="appB">
          <ReportAppendixBForm :draft="reportDraft" />
        </el-tab-pane>
        <el-tab-pane label="附录C · 刻度井记录表" name="appC">
          <ReportAppendixCForm :draft="reportDraft" />
        </el-tab-pane>
      </el-tabs>

      <div class="report-actions">
        <el-button @click="exportPlaceholder">导出 Word</el-button>
        <el-button @click="exportPlaceholder">导出 PDF</el-button>
        <el-button type="primary" @click="saveDraft">保存草稿</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../shared/styles/scale-well-theme.scss";
@import "./styles/report.scss";

.report-panel {
  padding: 16px 18px 18px;
  overflow: auto;
}

.report-tabs {
  :deep(.el-tabs__content) {
    overflow: visible;
  }
}

.report-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}
</style>
