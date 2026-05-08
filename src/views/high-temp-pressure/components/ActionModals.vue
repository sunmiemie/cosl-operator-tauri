<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { HighTempPressureModal, ScheduledSelection } from '../types'

defineProps<{
  activeModal: HighTempPressureModal
  currentSelected: ScheduledSelection | null
}>()

const emit = defineEmits<{
  close: []
  'confirm-start': []
  'confirm-end': []
  'confirm-stop': []
}>()
</script>

<template>
  <div class="modal-overlay" v-if="activeModal" @click.self="emit('close')">
    <div class="startup-check-modal" v-if="activeModal === 'confirm-start'">
      <h2 class="modal-title">启动前确认</h2>
      <div class="two-col">
        <div>
          <div class="alert alert-warning">
            <div style="display:flex;gap:8px;align-items:flex-start">
              <Icon icon="mdi:alert" class="alert-icon" />
              <div class="alert-text">
                <div style="font-weight:800;margin-bottom:6px">重要安全提示</div>
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
              <div class="info-item" style="grid-column: 1 / -1">
                <div class="info-key">待测仪器列表</div>
                <div class="info-val">
                  <div v-for="i in (currentSelected.order.items || [])" :key="i.id" style="display:flex;justify-content:space-between;gap:8px;font-size:12px;">
                    <span>{{ i.label }}</span>
                    <span style="color:var(--text-secondary)">{{ i.sn }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="text-muted">未选择排程仪器</div>
          </div>
        </div>
      </div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="cancel-btn" @click="emit('close')">取消</button>
        <button class="next-btn" @click="emit('confirm-start')">确认启动</button>
      </div>
    </div>

    <div class="modal" v-if="activeModal === 'end-test'">
      <div class="modal-header modal-header-row">
        <Icon icon="mdi:check-circle-outline" />
        <span>确认测试已完成？</span>
      </div>
      <div class="modal-body">
        <p class="text-muted">系统将会停止数据记录并生成报告。</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" @click="emit('close')">取消</button>
        <button class="btn btn-primary" @click="emit('confirm-end')">确认</button>
      </div>
    </div>

    <div class="modal" v-if="activeModal === 'stop-test'">
      <div class="modal-header modal-header-row">
        <Icon icon="mdi:alert-octagon-outline" />
        <span>确定要中止测试吗？</span>
      </div>
      <div class="modal-body">
        <p class="text-danger">此操作不可恢复！所有数据将会丢失。</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" @click="emit('close')">取消</button>
        <button class="btn btn-danger" @click="emit('confirm-stop')">确认中止</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
