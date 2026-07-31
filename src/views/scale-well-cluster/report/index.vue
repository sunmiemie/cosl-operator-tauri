<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import ReportHeader from "./components/ReportHeader.vue"
import ReportToolbar from "./components/ReportToolbar.vue"
import ReportCardList from "./components/ReportCardList.vue"
import ReportDetailDrawer from "./components/ReportDetailDrawer.vue"
import { useMyCalibrationReports } from "./composables/use-my-calibration-reports"
import type { CalibrationReport } from "./types"

const router = useRouter()
const {
  loading,
  filter,
  filteredReports,
  pendingCount,
  draftCount,
  fetchReports,
  resetFilter,
  getStatusLabel,
  getStatusType
} = useMyCalibrationReports()

const drawerVisible = ref(false)
const currentReport = ref<CalibrationReport | null>(null)

const openReport = (report: CalibrationReport) => {
  currentReport.value = report
  drawerVisible.value = true
}

const editReport = (report: CalibrationReport) => {
  drawerVisible.value = false
  router.push(`/scale-well-cluster/report/${report.dbId}`)
}
</script>

<template>
  <div class="scale-well-page report-page">
    <ReportHeader :pending-count="pendingCount" :draft-count="draftCount" />

    <div class="sw-content-panel report-panel">
      <ReportToolbar
        v-model:filter="filter"
        :loading="loading"
        @search="fetchReports"
        @reset="resetFilter"
      />

      <ReportCardList
        :reports="filteredReports"
        :get-status-label="getStatusLabel"
        :get-status-type="getStatusType"
        @open="openReport"
        @edit="editReport"
      />
    </div>

    <ReportDetailDrawer
      v-model:visible="drawerVisible"
      :report="currentReport"
      :status-label="currentReport ? getStatusLabel(currentReport.status) : ''"
      :status-type="currentReport ? getStatusType(currentReport.status) : 'info'"
      @edit="editReport"
    />
  </div>
</template>

<style scoped lang="scss">
@import "../shared/styles/scale-well-theme.scss";
@import "./styles/report.scss";

.report-panel {
  flex: 1;
  min-height: 0;
  padding: 16px 18px 18px;
  overflow: auto;
}
</style>
