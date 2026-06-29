<script setup lang="ts">
import { getToolDisplayName } from "../../shared/constants/tool-params"
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
      <div class="report-doc__header-title">附录B · 测试记录表</div>
      <div class="report-doc__header-ref">WT3-GR/ZZ-Appendix-B</div>
    </div>

    <div class="report-info-box">
      <div class="report-info-row">
        <div class="report-info-cell">
          <div class="report-info-cell__label">仪器型号</div>
          <div class="report-info-cell__value">{{ getToolDisplayName(report.toolType) }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">系列号</div>
          <div class="report-info-cell__value">{{ report.appendixB.serialNumber }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">测试人</div>
          <div class="report-info-cell__value">{{ report.appendixB.engineer }}</div>
        </div>
      </div>
      <div class="report-info-row">
        <div class="report-info-cell">
          <div class="report-info-cell__label">日期</div>
          <div class="report-info-cell__value">{{ report.appendixB.testDate }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">QC工程师</div>
          <div class="report-info-cell__value">{{ report.appendixB.qcEngineer }}</div>
        </div>
        <div class="report-info-cell">
          <div class="report-info-cell__label">QC日期</div>
          <div class="report-info-cell__value">{{ report.appendixB.qcDate }}</div>
        </div>
      </div>
    </div>

    <div class="report-section-title">3、通电检查：Operation 模式</div>
    <el-table :data="[{ well: report.appendixB.loWell, api: report.appendixB.loApi }, { well: report.appendixB.hiWell, api: report.appendixB.hiApi }]" stripe size="small">
      <el-table-column prop="well" label="井别" width="100" />
      <el-table-column prop="api" label="API" width="100" />
      <el-table-column label="CPS参考">
        <template #default="{ $index }">{{ $index === 0 ? "1 to 3" : "20 to 50" }}</template>
      </el-table-column>
      <el-table-column label="记录点" width="100">
        <template #default>20 / 40 / 60 / 80 / 100</template>
      </el-table-column>
    </el-table>

    <div class="report-section-title">计算结果</div>
    <el-table :data="[{ name: 'A' }, { name: 'B' }, { name: 'C' }]" stripe size="small">
      <el-table-column prop="name" label="结果" width="80" />
      <el-table-column label="乘系数 K" align="center">
        <template #default="{ row }">
          {{
            row.name === "A"
              ? formatData(report.appendixB.ka)
              : row.name === "B"
                ? formatData(report.appendixB.kb)
                : formatData(report.appendixB.kc)
          }}
        </template>
      </el-table-column>
      <el-table-column label="加系数 b" align="center">
        <template #default="{ row }">
          {{
            row.name === "A"
              ? formatData(report.appendixB.ba)
              : row.name === "B"
                ? formatData(report.appendixB.bb)
                : formatData(report.appendixB.bc)
          }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
