<script setup lang="ts">
import { computed } from "vue"
import { List } from "@element-plus/icons-vue"
import type { CalibrationWorkOrder } from "../types"
import { getToolDisplayName } from "../constants/tool-params"
import DashboardPanel from "./DashboardPanel.vue"

const props = defineProps<{
  orders: CalibrationWorkOrder[]
  limit?: number
}>()

const displayOrders = computed(() => props.orders.slice(0, props.limit ?? 5))

const statusLabel = (status: CalibrationWorkOrder["status"]) => (status === "completed" ? "已完成" : "待处理")

const statusType = (status: CalibrationWorkOrder["status"]) => (status === "completed" ? "success" : "warning")
</script>

<template>
  <DashboardPanel title="近期工单状态" :icon="List">
    <el-table :data="displayOrders" stripe>
      <el-table-column prop="id" label="工单编号" min-width="130" show-overflow-tooltip />
      <el-table-column label="仪器型号" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          {{ getToolDisplayName(row.type) }}
        </template>
      </el-table-column>
      <el-table-column prop="engineer" label="测试人员" width="100" />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </DashboardPanel>
</template>
