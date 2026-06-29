<script setup lang="ts">
import type { CalibrationWorkOrder } from "../../shared/types"

defineProps<{
  orders: CalibrationWorkOrder[]
  getToolDisplayName: (type: string) => string
}>()

const emit = defineEmits<{
  claim: [id: string]
}>()
</script>

<template>
  <div class="tech-wo-panel">
    <div class="tech-wo-panel__head">
      <h3>可领取工单</h3>
      <p>选择工单直接开始刻度测试</p>
    </div>
    <div v-if="orders.length" class="tech-wo-list">
      <div v-for="order in orders" :key="order.id" class="tech-wo-card">
        <div class="tech-wo-card__header">
          <span class="tech-wo-card__id">{{ order.id }}</span>
          <span class="sw-tag is-warn">待测</span>
        </div>
        <div class="tech-wo-card__row">
          <span>仪器型号</span><b>{{ getToolDisplayName(order.toolType) }}</b>
        </div>
        <div class="tech-wo-card__row">
          <span>仪器编号</span><b>{{ order.serialNumber }}</b>
        </div>
        <div class="tech-wo-card__row">
          <span>测试人员</span><b>{{ order.engineer }}</b>
        </div>
        <div class="tech-wo-card__row">
          <span>计划日期</span><b>{{ order.planDate }}</b>
        </div>
        <el-button type="primary" class="tech-wo-card__btn" @click="emit('claim', order.id)">
          ▶ 领取并开始测试
        </el-button>
      </div>
    </div>
    <el-empty v-else description="暂无待测工单" />
  </div>
</template>

<style scoped lang="scss">
@import "../../shared/styles/scale-well-theme.scss";
@import "../styles/schedule-board.scss";
</style>
