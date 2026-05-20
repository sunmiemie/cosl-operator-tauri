<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { HighTempPressureModal, ScheduledSelection } from '../types'

defineProps<{
  activeModal: HighTempPressureModal
  currentSelected: ScheduledSelection | null
  selectedScheduledOrders: ScheduledSelection[]
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
          <div class="card-header">
            <div class="card-title">工单信息</div>
            <span v-if="selectedScheduledOrders.length" class="selected-count">{{ selectedScheduledOrders.length }} 个</span>
          </div>
          <div class="card-body">
            <div v-if="selectedScheduledOrders.length" class="selected-order-list">
              <div v-for="selection in selectedScheduledOrders" :key="selection.instrument.id" class="selected-order-card">
                <div class="selected-order-head">
                  <div>
                    <div class="selected-order-no">{{ selection.order.no }}</div>
                    <div class="selected-order-meta">{{ selection.order.entrustNo || '无委托单号' }} · {{ selection.order.applicant || '-' }}</div>
                  </div>
                  <span class="selected-instrument-sn">{{ selection.instrument.sn }}</span>
                </div>
                <div class="info-grid selected-order-grid">
                  <div class="info-item"><div class="info-key">申请单位</div><div class="info-val">{{ selection.order.applicantUnit || '-' }}</div></div>
                  <div class="info-item"><div class="info-key">申请日期</div><div class="info-val">{{ selection.order.applyDate || '-' }}</div></div>
                  <div class="info-item"><div class="info-key">到检编号</div><div class="info-val">{{ selection.order.receivingNo || '-' }}</div></div>
                  <div class="info-item"><div class="info-key">器皿类型</div><div class="info-val">{{ selection.order.vesselType || '-' }}</div></div>
                  <div class="info-item"><div class="info-key">目标温度</div><div class="info-val" style="color:var(--red-bright)">{{ selection.order.targetTemp || '-' }}</div></div>
                  <div class="info-item"><div class="info-key">目标压力</div><div class="info-val" style="color:var(--cyan)">{{ selection.order.targetPressure || '-' }}</div></div>
                  <div class="info-item"><div class="info-key">保温保压</div><div class="info-val">{{ selection.order.keepCondition || '-' }}</div></div>
                  <div class="info-item"><div class="info-key">本次仪器</div><div class="info-val">{{ selection.instrument.label }} / {{ selection.instrument.sn }}</div></div>
                  <div class="info-item" style="grid-column: 1 / -1">
                    <div class="info-key">工单待测仪器</div>
                    <div class="info-val instrument-lines">
                      <div v-for="i in (selection.order.items || [])" :key="i.id">
                        <span>{{ i.label }}</span>
                        <span>{{ i.sn }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else-if="currentSelected" class="text-muted">已选择 {{ currentSelected.order.no }}，但选中列表为空，请返回日历重新选择。</div>
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
        <div class="alert alert-info">
          系统将会：<br />
          · 停止数据记录<br />
          · 生成测试数据曲线<br />
          · 进入测试报告填写与文件生成流程
        </div>
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
<style scoped>
.selected-count {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.selected-order-list {
  max-height: min(56vh, 520px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.selected-order-card {
  /* 订单增多时保持卡片真实高度，由父级列表滚动，避免内容被压缩裁切。 */
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-primary);
  overflow: hidden;
}

.selected-order-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.selected-order-no {
  color: var(--color-accent-blue);
  font-size: 13px;
  font-weight: 700;
}

.selected-order-meta {
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.selected-instrument-sn {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(88, 166, 255, 0.12);
  color: var(--color-accent-blue);
  font-size: 11px;
  font-weight: 700;
}

.selected-order-grid {
  padding: 10px 12px;
}

.instrument-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.instrument-lines > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.instrument-lines span:last-child {
  color: var(--color-text-secondary);
}

.alert-info {
  background: rgba(88, 166, 255, 0.1);
  border-color: rgba(88, 166, 255, 0.2);
  color: var(--color-text-secondary);
  line-height: 1.7;
}
</style>
