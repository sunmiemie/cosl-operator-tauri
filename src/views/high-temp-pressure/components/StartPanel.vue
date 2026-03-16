<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { ScheduledSelection } from '../types'

defineProps<{
  currentSelected: ScheduledSelection | null
}>()

const emit = defineEmits<{
  'back-to-startup-check': []
  'open-startup-check': []
}>()
</script>

<template>
  <div class="panel">
    <div class="two-col">
      <div class="start-left">
        <div class="alert alert-warning" style="margin-top:12px">
          <div style="display:flex;gap:8px;align-items:flex-start">
            <Icon icon="mdi:alert" class="alert-icon" />
            <div class="alert-text">
              <div style="font-weight:600;margin-bottom:6px">启动前确认</div>
              <ul style="padding-left:16px;font-size:12px;margin:4px 0">
                <li>请确认测试台已完成运转前检查</li>
                <li>确认仪器容器已正确安装</li>
                <li>检查密封性确认无泄漏</li>
                <li>确认分析仪器已正确连接</li>
                <li>测试程序开始后，请勿随意停止</li>
                <li>如遇紧急情况，立即按紧急停止按钮</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="alert" style="background: rgba(59,130,246,0.08); color: var(--color-accent-blue);">
          <div style="display:flex;gap:8px;align-items:center">
            <Icon icon="mdi:information" class="alert-icon" />
            <div class="alert-text">请在主控计算机上按工单信息设定温度与压力参数，确认无误后点击“开始试验”。</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn btn-outline" @click="emit('back-to-startup-check')" style="flex:1">上一步</button>
          <button class="btn btn-primary btn-lg" @click="emit('open-startup-check')" style="flex:2">开始试验</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">工单信息</div></div>
        <div class="card-body">
          <div v-if="currentSelected" class="info-grid">
            <div class="info-item"><div class="info-key">委托单号</div><div class="info-val">{{ currentSelected.order.entrustNo }}</div></div>
            <div class="info-item"><div class="info-key">工单编号</div><div class="info-val">{{ currentSelected.order.no }}</div></div>
            <div class="info-item"><div class="info-key">申请人</div><div class="info-val">{{ currentSelected.order.applicant }}</div></div>
            <div class="info-item"><div class="info-key">申请单位</div><div class="info-val">{{ currentSelected.order.applicantUnit }}</div></div>
            <div class="info-item"><div class="info-key">申请日期</div><div class="info-val">{{ currentSelected.order.applyDate }}</div></div>
            <div class="info-item"><div class="info-key">到检编号</div><div class="info-val">{{ currentSelected.order.receivingNo }}</div></div>
            <div class="info-item"><div class="info-key">器皿类型</div><div class="info-val">{{ currentSelected.order.vesselType }}</div></div>
            <div class="info-item"><div class="info-key">目标温度</div><div class="info-val" style="color:var(--red-bright)">{{ currentSelected.order.targetTemp }}</div></div>
            <div class="info-item"><div class="info-key">目标压力</div><div class="info-val" style="color:var(--cyan)">{{ currentSelected.order.targetPressure }}</div></div>
            <div class="info-item"><div class="info-key">保温保压</div><div class="info-val">{{ currentSelected.order.keepCondition }}</div></div>
          </div>
          <div v-else class="text-muted">未选择排程仪器</div>
          <div class="alert alert-warning" style="margin-top:12px">请核对参数设置是否与工单一致</div>
          <div class="info-grid" style="margin-top:12px">
            <div class="info-item" style="grid-column: 1 / -1">
              <div class="info-key">待测仪器列表</div>
              <div class="info-val">
                <div v-for="i in (currentSelected?.order.items || []).slice(1)" :key="i.id" style="display:flex;justify-content:space-between;gap:8px;font-size:12px;">
                  <span>{{ i.label }}</span>
                  <span style="color:var(--text-secondary)">{{ i.sn }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
