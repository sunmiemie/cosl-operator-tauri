<script setup lang="ts">
import type { ReportDraft } from "../../shared/types"

defineProps<{
  draft: ReportDraft
}>()
</script>

<template>
  <div class="report-doc">
    <div class="report-doc__header">
      <div class="report-doc__header-co">COSL · Oil Field Technology Division · Well Tech</div>
      <div class="report-doc__header-title">附录B · 测试记录表</div>
      <div class="report-doc__header-ref">WT3-GR/ZZ-Appendix-B</div>
    </div>
    <el-form label-width="100px" class="report-form">
      <el-row :gutter="16">
        <el-col :span="8"><el-form-item label="仪器型号"><el-input v-model="draft.appendixB.toolTypeName" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="系列号"><el-input v-model="draft.appendixB.serialNumber" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="测试人"><el-input v-model="draft.appendixB.engineer" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="日期"><el-input v-model="draft.appendixB.testDate" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="QC工程师"><el-input v-model="draft.appendixB.qcEngineer" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="QC日期"><el-input v-model="draft.appendixB.qcDate" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="低刻井"><el-input v-model="draft.appendixB.loWell" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="高刻井"><el-input v-model="draft.appendixB.hiWell" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="低刻 API"><el-input-number v-model="draft.appendixB.loApi" :precision="1" style="width:100%" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="高刻 API"><el-input-number v-model="draft.appendixB.hiApi" :precision="1" style="width:100%" /></el-form-item></el-col>
      </el-row>
      <div class="report-section-title">刻度结果</div>
      <el-row :gutter="12">
        <el-col :span="4"><el-form-item label="KA"><el-input-number v-model="draft.appendixB.ka" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="KB"><el-input-number v-model="draft.appendixB.kb" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="KC"><el-input-number v-model="draft.appendixB.kc" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="BA"><el-input-number v-model="draft.appendixB.ba" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="BB"><el-input-number v-model="draft.appendixB.bb" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="BC"><el-input-number v-model="draft.appendixB.bc" :precision="2" style="width:100%" /></el-form-item></el-col>
      </el-row>
    </el-form>
  </div>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
