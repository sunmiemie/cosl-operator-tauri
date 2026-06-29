<script setup lang="ts">
import type { CalibrationReport } from "../types"

defineProps<{
  report: CalibrationReport
}>()
</script>

<template>
  <div class="report-doc">
    <div class="report-doc__header">
      <div class="report-doc__header-co">COSL - QHSE 管理体系记录表单</div>
      <div class="report-doc__header-title">DWPR 伽马刻度井记录表</div>
      <div class="report-doc__header-ref">
        表格编号: WT3-LW/ZZ-06-R10 · 版本号: 1.0 · 记录编号: {{ report.appendixC.recordNo }}
      </div>
    </div>

    <div class="report-info-box">
      <div class="report-info-row">
        <div class="report-info-cell">
          <div class="report-info-cell__label">仪器 SN</div>
          <div class="report-info-cell__value">{{ report.appendixC.serialNumber }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">测试人员</div>
          <div class="report-info-cell__value">{{ report.appendixC.engineer }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">测试日期</div>
          <div class="report-info-cell__value">{{ report.appendixC.testDate }}</div>
        </div>
      </div>
      <div class="report-info-row">
        <div class="report-info-cell">
          <div class="report-info-cell__label">高刻井</div>
          <div class="report-info-cell__value">{{ report.appendixC.hiWell }}（API {{ report.appendixC.hiApi }}）</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">低刻井</div>
          <div class="report-info-cell__value">{{ report.appendixC.loWell }}（API {{ report.appendixC.loApi }}）</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">关联工单</div>
          <div class="report-info-cell__value">{{ report.workOrderId }}</div>
        </div>
      </div>
    </div>

    <div class="report-section-title">刻度井使用记录</div>
    <div class="report-data-grid">
      <div class="report-data-item">
        <span>高刻井号</span>
        <b>{{ report.appendixC.hiWell }}</b>
      </div>
      <div class="report-data-item">
        <span>低刻井号</span>
        <b>{{ report.appendixC.loWell }}</b>
      </div>
      <div class="report-data-item">
        <span>高刻 API</span>
        <b>{{ report.appendixC.hiApi }}</b>
      </div>
      <div class="report-data-item">
        <span>低刻 API</span>
        <b>{{ report.appendixC.loApi }}</b>
      </div>
      <div class="report-data-item">
        <span>测试地点</span>
        <b>{{ report.location }}</b>
      </div>
      <div class="report-data-item">
        <span>刻度结果 Kc</span>
        <b>{{ report.kc ?? "—" }}</b>
      </div>
    </div>

    <div v-if="report.appendixC.remark" class="report-section-title">备注</div>
    <div v-if="report.appendixC.remark" class="report-note">{{ report.appendixC.remark }}</div>
  </div>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
