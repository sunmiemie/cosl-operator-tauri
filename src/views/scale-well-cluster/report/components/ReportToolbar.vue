<script setup lang="ts">
import { Refresh, Search } from "@element-plus/icons-vue"
import { REPORT_STATUS_OPTIONS } from "../constants/mock-data"
import type { ReportFilter } from "../types"

const filter = defineModel<ReportFilter>("filter", { required: true })

defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  search: []
  reset: []
}>()
</script>

<template>
  <div class="report-toolbar">
    <el-form :inline="true" :model="filter" class="report-filter" @submit.prevent="emit('search')">
      <el-form-item label="关键词">
        <el-input
          v-model="filter.keyword"
          placeholder="报告编号 / 工单号 / SN / 人员"
          clearable
          style="width: 240px"
          @keyup.enter="emit('search')"
        />
      </el-form-item>
      <el-form-item label="审核状态">
        <el-select v-model="filter.status" placeholder="全部" clearable style="width: 130px">
          <el-option v-for="item in REPORT_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" :loading="loading" @click="emit('search')">查询</el-button>
        <el-button :icon="Refresh" @click="emit('reset')">重置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped lang="scss">
@import "../styles/report.scss";
</style>
