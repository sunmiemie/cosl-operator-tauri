<script setup lang="ts">
import type { CalibrationWorkOrder } from "../../shared/types"

defineProps<{
  orders: CalibrationWorkOrder[]
  weekDays: string[]
  weekLabel: string
  timeSlots: string[]
  selectedOrderIds: string[]
  getToolDisplayName: (type: string) => string
  isCellSelected: (date: string, timeSlot: string) => boolean
}>()

const emit = defineEmits<{
  toggleOrder: [id: string]
  selectCell: [date: string, timeSlot: string]
  prevWeek: []
  nextWeek: []
  loadThisWeek: []
  goToDate: [value: string]
  startTask: []
}>()

const statusLabel: Record<string, string> = {
  pending: "待测",
  in_progress: "进行中",
  completed: "已完成"
}
</script>

<template>
  <div class="sched-board">
    <div class="sched-wo-panel">
      <div class="sched-wo-hd">伽马刻度可进行测试工单</div>
      <div class="sched-wo-scroll">
        <el-table :data="orders.filter((o) => o.status !== 'completed')" size="small" stripe>
          <el-table-column width="44">
            <template #default="{ row }">
              <el-checkbox
                :model-value="selectedOrderIds.includes(row.id)"
                @change="emit('toggleOrder', row.id)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="toolType" label="仪器型号" min-width="100">
            <template #default="{ row }">{{ getToolDisplayName(row.toolType) }}</template>
          </el-table-column>
          <el-table-column prop="id" label="工单编号" min-width="120" />
          <el-table-column prop="calibrationDevice" label="测试设备" width="90" />
          <el-table-column prop="engineer" label="测试人员" width="80" />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">{{ statusLabel[row.status] ?? row.status }}</template>
          </el-table-column>
        </el-table>
      </div>
      <div class="sched-wo-foot">
        <p class="sched-hint">勾选工单并在右侧日历选择时间段，再点击进入刻度流程</p>
        <el-button type="primary" :disabled="!selectedOrderIds.length" @click="emit('startTask')">
          进入刻度流程 →
        </el-button>
      </div>
    </div>

    <div class="sched-cal-panel">
      <div class="sched-cal-nav">
        <el-button size="small" @click="emit('prevWeek')">‹ 上一周</el-button>
        <el-date-picker
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          size="small"
          @change="(v: string) => emit('goToDate', v)"
        />
        <span class="sc-range">{{ weekLabel }}</span>
        <el-button size="small" @click="emit('nextWeek')">下一周 ›</el-button>
        <el-button size="small" @click="emit('loadThisWeek')">读取本周排程</el-button>
      </div>
      <div class="sched-cal-grid">
        <div class="sched-cal-head">
          <div class="sched-cal-time-col" />
          <div v-for="day in weekDays" :key="day" class="sched-cal-day-col">{{ day.slice(5) }}</div>
        </div>
        <div v-for="slot in timeSlots" :key="slot" class="sched-cal-row">
          <div class="sched-cal-time-col">{{ slot }}</div>
          <div
            v-for="day in weekDays"
            :key="`${day}-${slot}`"
            class="sched-cal-cell"
            :class="{ 'is-selected': isCellSelected(day, slot) }"
            @click="emit('selectCell', day, slot)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../styles/schedule-board.scss";
</style>
