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
      <div class="report-doc__header-title">附录A · 伽马刻度工单</div>
      <div class="report-doc__header-ref">WT3-GR/ZZ-Appendix-A · 工单号：{{ draft.workOrderId }}</div>
    </div>
    <el-form label-width="110px" class="report-form">
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="仪器系列号">
            <el-input v-model="draft.appendixA.serialNumber" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="测试日期">
            <el-input v-model="draft.appendixA.testDate" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="测试人员">
            <el-input v-model="draft.appendixA.engineer" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="软件版本">
            <el-input v-model="draft.appendixA.softVer" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="累计循环时间">
            <el-input v-model="draft.appendixA.cycleHours" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="基地">
            <el-input v-model="draft.appendixA.location" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="刻度类型">
            <el-checkbox v-model="draft.appendixA.useWell">刻度井</el-checkbox>
            <el-checkbox v-model="draft.appendixA.useJig">刻度架</el-checkbox>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="备注">
            <el-input v-model="draft.appendixA.remark" type="textarea" :rows="2" />
          </el-form-item>
        </el-col>
      </el-row>
      <div class="report-section-title">刻度数据（当前）</div>
      <el-row :gutter="12">
        <el-col :span="4"><el-form-item label="KA"><el-input-number v-model="draft.appendixA.currentData.ka" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="KB"><el-input-number v-model="draft.appendixA.currentData.kb" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="KC"><el-input-number v-model="draft.appendixA.currentData.kc" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="BA"><el-input-number v-model="draft.appendixA.currentData.ba" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="BB"><el-input-number v-model="draft.appendixA.currentData.bb" :precision="2" style="width:100%" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="BC"><el-input-number v-model="draft.appendixA.currentData.bc" :precision="2" style="width:100%" /></el-form-item></el-col>
      </el-row>
    </el-form>
  </div>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
