<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineProps<{
  selectedOrders: any[]
  selectedDevices: any[]
}>()

const emit = defineEmits<{
  back: []
}>()
</script>

<template>
  <div class="report-view">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:file-document-outline" /></div>
        <div>
          <h1 class="header-title">测试报告</h1>
          <p class="header-subtitle">仅展示本次开始试验所选测试产品</p>
        </div>
      </div>
      <div class="header-right">
        <button class="week-cal-nav" @click="emit('back')">返回</button>
      </div>
    </div>

    <div class="downhole-content">
      <div class="downhole-card">
        <div class="downhole-card-title">测试产品清单 <span class="english-sub">Selected Products</span></div>

        <div v-if="!selectedDevices.length" class="empty-state"><p>未选择测试产品</p></div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>工单号</th>
                <th>客户</th>
                <th>测试产品</th>
                <th>仪器编号</th>
                <th>关联模板</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, idx) in selectedDevices" :key="(d.orderId || 'order') + '_' + (d.sn || idx)">
                <td>{{ d.orderId }}</td>
                <td>{{ d.customer }}</td>
                <td>{{ d.deviceName }}</td>
                <td>{{ d.sn }}</td>
                <td>{{ d.template }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="downhole-card">
        <div class="downhole-card-title">生成报告 <span class="english-sub">Generate Report</span></div>
        <div class="empty-state"><p>报告生成流程待接入</p></div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./components/simulation-well.shared.css"></style>

