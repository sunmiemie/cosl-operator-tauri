<script setup lang="ts">
import type { CalibrationReport } from "../types"

defineProps<{
  report: CalibrationReport
}>()

const formatData = (value: number | null) => (value == null ? "—" : String(value))
</script>

<template>
  <div class="report-doc">
    <div class="report-doc__header">
      <div class="report-doc__header-co">COSL · Oil Field Technology Division · Well Tech</div>
      <div class="report-doc__header-title">附录A · 伽马刻度工单</div>
      <div class="report-doc__header-ref">WT3-GR/ZZ-Appendix-A · 工单号：{{ report.workOrderId }}</div>
    </div>

    <div class="report-info-box">
      <div class="report-info-row">
        <div class="report-info-cell">
          <div class="report-info-cell__label">仪器系列号</div>
          <div class="report-info-cell__value">{{ report.appendixA.serialNumber }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">测试日期</div>
          <div class="report-info-cell__value">{{ report.appendixA.testDate }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">测试人员</div>
          <div class="report-info-cell__value">{{ report.appendixA.engineer }}</div>
        </div>
      </div>
      <div class="report-info-row">
        <div class="report-info-cell">
          <div class="report-info-cell__label">软件版本号</div>
          <div class="report-info-cell__value">{{ report.appendixA.softVer }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">累计循环时间</div>
          <div class="report-info-cell__value">{{ report.appendixA.cycleHours }} 小时</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">基地</div>
          <div class="report-info-cell__value">{{ report.appendixA.location }}</div>
        </div>
      </div>
      <div class="report-info-row">
        <div class="report-info-cell">
          <div class="report-info-cell__label">刻度类型</div>
          <div class="report-info-cell__value">
            <el-tag v-if="report.appendixA.useWell" size="small" type="primary">刻度井</el-tag>
            <el-tag v-if="report.appendixA.useJig" size="small" type="info" style="margin-left: 6px">刻度架</el-tag>
          </div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">高/低刻井</div>
          <div class="report-info-cell__value">{{ report.hiWell }} / {{ report.loWell }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">API（高/低）</div>
          <div class="report-info-cell__value">{{ report.hiApi }} / {{ report.loApi }}</div>
        </div>
      </div>
    </div>

    <div class="report-note">
      475仪器：Ka=0，Kb=Kc∈[3.5, 5.5] &emsp; 675仪器：Ka=0，Kb=Kc∈[5.5, 7.5] &emsp; 800仪器：Ka=0，Kb=Kc∈[5.5, 7.5]
    </div>

    <div class="report-section-title">三、数据记录</div>
    <el-table :data="[report.appendixA.beforeData, report.appendixA.currentData]" stripe size="small">
      <el-table-column label="类型" width="120">
        <template #default="{ $index }">{{ $index === 0 ? "刻度前数据" : "本次刻度数据" }}</template>
      </el-table-column>
      <el-table-column label="Ka" align="center">
        <template #default="{ row }">{{ formatData(row.ka) }}</template>
      </el-table-column>
      <el-table-column label="Kb" align="center">
        <template #default="{ row }">{{ formatData(row.kb) }}</template>
      </el-table-column>
      <el-table-column label="Kc" align="center">
        <template #default="{ row }">{{ formatData(row.kc) }}</template>
      </el-table-column>
      <el-table-column label="Ba" align="center">
        <template #default="{ row }">{{ formatData(row.ba) }}</template>
      </el-table-column>
      <el-table-column label="Bb" align="center">
        <template #default="{ row }">{{ formatData(row.bb) }}</template>
      </el-table-column>
      <el-table-column label="Bc" align="center">
        <template #default="{ row }">{{ formatData(row.bc) }}</template>
      </el-table-column>
    </el-table>

    <div v-if="report.appendixA.remark" class="report-section-title">四、备注</div>
    <div v-if="report.appendixA.remark" class="report-note">{{ report.appendixA.remark }}</div>
  </div>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
