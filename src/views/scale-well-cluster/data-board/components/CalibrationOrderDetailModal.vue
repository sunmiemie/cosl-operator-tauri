<script setup lang="ts">
import type { CalibrationWorkOrder } from "../../shared/types"

defineProps<{
  visible: boolean
  loading: boolean
  order: CalibrationWorkOrder | null
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-dialog">
      <div class="modal-header">
        <div>
          <h3 class="modal-title">工单详情</h3>
          <div class="modal-subtitle">{{ order?.id || "—" }}</div>
        </div>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="loading-wrap">加载中...</div>
        <div v-else-if="order" class="detail-grid">
          <div class="detail-item">
            <div class="detail-label">工单号</div>
            <div class="detail-value">{{ order.id }}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">状态</div>
            <div class="detail-value">{{ order.statusText || order.status }}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">仪器型号</div>
            <div class="detail-value">{{ order.modelName }}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">仪器 SN</div>
            <div class="detail-value">{{ order.serialNumber }}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">测试人员</div>
            <div class="detail-value">{{ order.engineer }}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">测试地点</div>
            <div class="detail-value">{{ order.location }}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">刻度设备</div>
            <div class="detail-value">{{ order.calibrationDevice }}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">计划日期</div>
            <div class="detail-value">{{ order.planDate || "—" }}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">高刻井</div>
            <div class="detail-value">{{ order.hiWell }} (API {{ order.hiApi }})</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">低刻井</div>
            <div class="detail-value">{{ order.loWell }} (API {{ order.loApi }})</div>
          </div>
          <div class="detail-item detail-item--full">
            <div class="detail-label">备注</div>
            <div class="detail-value">{{ order.remark || "—" }}</div>
          </div>
        </div>
        <div v-else class="loading-wrap">未找到工单信息</div>
      </div>

      <div class="modal-footer">
        <button class="btn-close" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  padding: 16px;
  backdrop-filter: blur(4px);
}

.modal-dialog {
  width: 720px;
  max-width: 94vw;
  max-height: 88vh;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.modal-subtitle {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.modal-body {
  flex: 1;
  overflow: auto;
  padding: 16px 18px;
}

.modal-footer {
  padding: 12px 18px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
}

.loading-wrap {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.detail-item--full {
  grid-column: 1 / -1;
}

.detail-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.detail-value {
  font-size: 14px;
  color: var(--color-text-primary);
  font-weight: 500;
  word-break: break-all;
}

.btn-close {
  border: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
}
</style>
