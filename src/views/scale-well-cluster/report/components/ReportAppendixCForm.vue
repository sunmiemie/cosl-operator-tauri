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
      <div class="report-doc__header-title">DWPR 伽马刻度井记录表</div>
      <div class="report-doc__header-ref">WT3-LW/ZZ-06-R10 · 记录号：{{ draft.appendixC.recordNo }}</div>
    </div>
    <el-form label-width="100px" class="report-form">
      <el-row :gutter="16">
        <el-col :span="8"><el-form-item label="系列号"><el-input v-model="draft.appendixC.serialNumber" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="测试人"><el-input v-model="draft.appendixC.engineer" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="测试日期"><el-input v-model="draft.appendixC.testDate" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="高刻井"><el-input v-model="draft.appendixC.hiWell" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="低刻井"><el-input v-model="draft.appendixC.loWell" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="高刻 API"><el-input-number v-model="draft.appendixC.hiApi" :precision="1" style="width:100%" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="低刻 API"><el-input-number v-model="draft.appendixC.loApi" :precision="1" style="width:100%" /></el-form-item></el-col>
        <el-col :span="24">
          <el-form-item label="备注">
            <el-input v-model="draft.appendixC.remark" type="textarea" :rows="3" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </div>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
