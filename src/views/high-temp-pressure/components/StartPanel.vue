<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { ScheduledSelection } from '../types'
import WorkOrderDetailModal from './WorkOrderDetailModal.vue'

const props = defineProps<{
  currentSelected: ScheduledSelection | null
  selectedScheduledOrders: ScheduledSelection[]
}>()

const emit = defineEmits<{
  'back-to-startup-check': []
  'confirm-start': []
}>()

const detailModalVisible = ref(false)
const detailModuleCount = 6
const activeSelectionIndex = ref(0)

const previewSelections = computed(() => {
  return props.selectedScheduledOrders.length
    ? props.selectedScheduledOrders
    : props.currentSelected
      ? [props.currentSelected]
      : []
})

const previewSelection = computed(() => {
  return previewSelections.value[Math.min(activeSelectionIndex.value, previewSelections.value.length - 1)] || null
})

watch(
  () => props.selectedScheduledOrders.length,
  (count) => {
    if (activeSelectionIndex.value >= count) {
      activeSelectionIndex.value = Math.max(0, count - 1)
    }
  }
)

const safetyRiskItems = computed(() => {
  const risks = previewSelection.value?.order.safetyRisks?.trim()
  if (!risks) return []
  return risks
    .split(/\r?\n|[；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
})
</script>

<template>
  <div class="panel">
    <div class="two-col start-layout">
      <div class="start-left">
        <div class="start-hero">
          <div class="start-hero__icon">
            <Icon icon="mdi:rocket-launch-outline" />
          </div>
          <div class="start-hero__title">启动前确认</div>
          <div class="start-hero__desc">
            请在正式启动高温高压台前，再次核对测试台状态、工单参数以及待测产品信息。
          </div>
        </div>

        <div class="card start-check-card">
          <div class="card-header">
            <div class="card-title">安全检查项</div>
          </div>
          <div class="card-body">
            <div class="alert alert-warning start-alert">
              <div class="start-alert__head">
                <Icon icon="mdi:alert-circle-outline" class="alert-icon" />
                <span>启动前请逐项确认</span>
              </div>
              <ul v-if="safetyRiskItems.length" class="start-checklist">
                <li v-for="(item, index) in safetyRiskItems" :key="index">{{ item }}</li>
              </ul>
              <div v-else class="start-empty-risk">
                当前工单未填写安全风险及预防措施。
              </div>
            </div>

            <div class="start-tip">
              <Icon icon="mdi:information-outline" class="alert-icon" />
              <div>
                请在主控端完成参数复核后再点击“开始实验”。确认开始后，将进入设备启动前确认与执行流程。
              </div>
            </div>
          </div>
        </div>

        <div class="start-actions">
          <button class="btn btn-outline" @click="emit('back-to-startup-check')">上一步</button>
          <button class="btn btn-primary btn-lg" @click="emit('confirm-start')">开始实验</button>
        </div>
      </div>

      <div class="card start-order-card">
        <div class="card-header">
          <div class="card-title">工单信息</div>
          <div v-if="selectedScheduledOrders.length > 1" class="start-order-switcher">
            <button
              v-for="(_, index) in selectedScheduledOrders"
              :key="index"
              type="button"
              class="start-order-switcher__btn"
              :class="{ active: activeSelectionIndex === index }"
              @click="activeSelectionIndex = index"
            >
              {{ index + 1 }}
            </button>
          </div>
        </div>
        <div class="card-body">
          <template v-if="previewSelection">
            <div class="info-grid start-order-grid">
              <div class="info-item">
                <div class="info-key">委托单号</div>
                <div class="info-val">{{ previewSelection.order.entrustNo }}</div>
              </div>
              <div class="info-item">
                <div class="info-key">工单编号</div>
                <div class="info-val">{{ previewSelection.order.no }}</div>
              </div>
              <div class="info-item">
                <div class="info-key">申请人</div>
                <div class="info-val">{{ previewSelection.order.applicant }}</div>
              </div>
              <div class="info-item">
                <div class="info-key">申请单位</div>
                <div class="info-val">{{ previewSelection.order.applicantUnit }}</div>
              </div>
              <div class="info-item">
                <div class="info-key">申请日期</div>
                <div class="info-val">{{ previewSelection.order.applyDate }}</div>
              </div>
              <div class="info-item">
                <div class="info-key">到检编号</div>
                <div class="info-val">{{ previewSelection.order.receivingNo }}</div>
              </div>
            </div>

            <div class="start-divider"></div>

            <div class="info-grid start-order-grid">
              <div class="info-item">
                <div class="info-key">器皿类型</div>
                <div class="info-val start-blue">{{ previewSelection.order.vesselType }}</div>
              </div>
              <div class="info-item">
                <div class="info-key">目标温度</div>
                <div class="info-val start-red">{{ previewSelection.order.targetTemp }}</div>
              </div>
              <div class="info-item">
                <div class="info-key">目标压力</div>
                <div class="info-val start-cyan">{{ previewSelection.order.targetPressure }}</div>
              </div>
              <div class="info-item">
                <div class="info-key">保温保压</div>
                <div class="info-val">{{ previewSelection.order.keepCondition }}</div>
              </div>
            </div>

            <div class="start-divider"></div>

            <div class="start-products">
              <div class="info-key start-products__title">待测产品列表</div>
              <div class="start-products__list">
                <div
                  v-for="item in previewSelection.order.items || []"
                  :key="item.id"
                  class="start-product-item"
                >
                  <div class="start-product-item__name">{{ item.label }}</div>
                  <div class="start-product-item__meta">SN: {{ item.sn || '未填写' }}</div>
                </div>
              </div>
            </div>

            <div class="start-order-note">
              请核对以上工单参数与当前测试台设置是否一致，确认无误后再开始实验。
            </div>
            <button class="full-order-btn" type="button" @click="detailModalVisible = true">
              <span>查看完整工单详情 · {{ detailModuleCount }} 模块</span>
              <Icon icon="mdi:arrow-right" />
            </button>
          </template>
          <div v-else class="text-muted start-empty">未选择排程工单</div>
        </div>
      </div>
    </div>

    <WorkOrderDetailModal
      :visible="detailModalVisible"
      :order="previewSelection?.order || null"
      @close="detailModalVisible = false"
    />
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
<style scoped>
.start-layout {
  align-items: stretch;
}

.start-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.start-hero {
  background: linear-gradient(135deg, #183b7a 0%, #2957a4 100%);
  border-radius: 14px;
  padding: 24px 22px;
  color: #fff;
  box-shadow: 0 12px 30px rgba(24, 59, 122, 0.18);
}

.start-hero__icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.16);
  font-size: 28px;
  margin-bottom: 16px;
}

.start-hero__title {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.start-hero__desc {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.82);
}

.start-check-card,
.start-order-card {
  background: var(--color-bg-secondary);
}

.start-order-card .card-header {
  gap: 12px;
}

.start-order-switcher {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.start-order-switcher__btn {
  width: 26px;
  height: 26px;
  border: 1px solid rgba(37, 99, 235, 0.2);
  border-radius: 50%;
  background: rgba(37, 99, 235, 0.08);
  color: var(--color-accent-blue);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.start-order-switcher__btn.active,
.start-order-switcher__btn:hover {
  border-color: var(--color-accent-blue);
  background: var(--color-accent-blue);
  color: #fff;
}

.start-alert {
  margin-bottom: 0;
}

.start-alert__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 8px;
}

.start-checklist {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.85;
}

.start-empty-risk {
  color: #b26b00;
  font-size: 13px;
  line-height: 1.8;
}

.start-tip {
  margin-top: 14px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(64, 158, 255, 0.08);
  border: 1px solid rgba(64, 158, 255, 0.16);
  color: var(--color-accent-blue);
  font-size: 13px;
  line-height: 1.8;
}

.start-actions {
  display: flex;
  gap: 10px;
  margin-top: auto;
}

.start-actions .btn {
  flex: 1;
}

.start-actions .btn-primary {
  flex: 1.35;
}

.start-order-grid {
  gap: 14px 16px;
}

.start-divider {
  height: 1px;
  margin: 14px 0;
  background: var(--color-border);
}

.start-products__title {
  margin-bottom: 10px;
}

.start-products__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.start-product-item {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
}

.start-product-item__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.start-product-item__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.start-order-note {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.18);
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.8;
}

.full-order-btn {
  width: 100%;
  margin-top: 13px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 14px;
  background: rgba(37, 99, 235, 0.08);
  color: var(--color-accent-blue);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 42px;
  font-size: 13px;
  font-weight: 800;
  transition: transform 0.16s ease, background 0.16s ease;
}

.full-order-btn:hover {
  background: rgba(37, 99, 235, 0.12);
  transform: translateY(-1px);
}

.start-blue {
  color: var(--color-accent-blue);
}

.start-red {
  color: var(--red-bright);
}

.start-cyan {
  color: var(--cyan);
}

.start-empty {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1200px) {
  .start-layout {
    grid-template-columns: 1fr;
  }

  .start-actions {
    margin-top: 0;
  }
}
</style>
