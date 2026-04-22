<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { http } from '@/services/http'
import type { SimulatedWellOrderDTO } from '@/services/simulated-well-api'

const props = defineProps<{
  visible: boolean
  loading: boolean
  order: SimulatedWellOrderDTO | null
}>()

const emit = defineEmits<{
  close: []
}>()

const applicantItems = [
  '申请测试仪器是否为新研制仪器首次下井测试。',
  '申请测试仪器是否为全新组合方式下井测试。',
  '申请测试仪器是否为外观及结构进行重大改造后首次下井测试。',
  '申请测试仪器是否为设备改造后首次下井测试。',
  '申请测试仪器是否为作业工艺首次应用测试。'
]

const testerItems = ['被测产品是否为首次下井测试。', '组合方式是否为首次下井测试。']

const confirmDate = computed(() => (props.order?.sanxin_confirm_date || '').trim() || '--')
const item1 = computed(() => (props.order?.sanxin_tester_item_1 || '').trim().toLowerCase())
const item2 = computed(() => (props.order?.sanxin_tester_item_2 || '').trim().toLowerCase())
const testerResults = computed(() => [
  item1.value === 'yes' || item1.value === 'no' ? item1.value : '',
  item2.value === 'yes' || item2.value === 'no' ? item2.value : ''
])

const isSanxin = computed(() => {
  const raw = props.order?.sanxin_is_sanxin
  const flag = raw === true || raw === 1 || String(raw || '').toLowerCase() === 'true'
  return flag || testerResults.value.some((v) => v === 'yes')
})

const adminSignatureUrl = computed(() => {
  const raw = (props.order?.admin_signature_url || '').trim()
  if (!raw) return ''
  return raw.startsWith('/') ? `${http.getBaseUrl()}${raw}` : raw
})

const deviceSummary = computed(() => {
  const list = Array.isArray(props.order?.devices) ? props.order?.devices || [] : []
  if (!list.length) return '--'
  const names = list.map((d) => (d.device_name || '').trim()).filter(Boolean)
  if (!names.length) return '--'
  return names.join('、')
})
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-dialog">
      <div class="modal-header">
        <div>
          <h3 class="modal-title">工单分配 · "三新"测试确认单</h3>
          <div class="modal-subtitle">WT3-TC/ZZ-01-R04 | 测试方确认项由管理员填写</div>
        </div>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="loading-wrap">加载中...</div>
        <div v-else class="sanxin-dispatch-layout">
          <div>
            <div class="sanxin-wo-box">
              <div class="wo-box-head">工单信息</div>
              <div class="sanxin-wo-grid">
                <div>
                  <div class="wo-box-title">任务单编号</div>
                  <div class="wo-box-val">{{ order?.task_number || '--' }}</div>
                </div>
                <div>
                  <div class="wo-box-title">申请单位</div>
                  <div class="wo-box-val">{{ order?.customer_unit || '--' }}</div>
                </div>
                <div>
                  <div class="wo-box-title">待测仪器</div>
                  <div class="wo-box-val wo-box-val-accent">{{ deviceSummary }}</div>
                </div>
                <div>
                  <div class="wo-box-title">测试类型</div>
                  <div class="wo-box-val">模拟井</div>
                </div>
              </div>
            </div>

            <div class="sanxin-applicant-items">
              <div class="sanxin-applicant-head">申请方确认项（序号 1–5）· 只读回显</div>
              <div v-for="(text, idx) in applicantItems" :key="idx" class="sanxin-applicant-row">
                <div class="sanxin-row-no">{{ idx + 1 }}</div>
                <div class="sanxin-row-content">{{ text }}</div>
                <span class="sanxin-result-badge no">否</span>
              </div>
            </div>
          </div>

          <div>
            <div class="sanxin-progress-wrap">
              <div class="sanxin-progress-lbl">
                <span>测试方填写进度</span>
                <span>2/2 已填写</span>
              </div>
              <div class="sanxin-pbar-wrap">
                <div class="sanxin-pbar" style="width: 100%"></div>
              </div>
            </div>

            <div class="sanxin-info-bar">
              <strong>申请方汇总：</strong>序号 1–5 全部为「否」<br />
              申请方签字：--
            </div>

            <div v-for="(title, idx) in testerItems" :key="idx" class="sanxin-item-card">
              <div class="sanxin-item-title">
                <span class="sanxin-item-num">{{ idx + 1 }}</span>{{ title }}
              </div>
              <div class="sanxin-view-row">
                <div class="sanxin-row-content">结果</div>
                <span
                  v-if="testerResults[idx] === 'no'"
                  class="sanxin-result-badge no"
                >
                  否
                </span>
                <span
                  v-else-if="testerResults[idx] === 'yes'"
                  class="sanxin-result-badge yes"
                >
                  是
                </span>
                <span v-else class="sanxin-result-badge na">—</span>
              </div>
            </div>

            <div class="sanxin-risk-alert" :class="{ show: isSanxin }">
              ⚠ 存在「是」选项，本次将被标记为 "三新"测试，请遵守相关安全规程。
            </div>

            <div class="sanxin-item-card">
              <div class="sanxin-item-title">
                <span class="sanxin-item-num"><Icon icon="mdi:signature-freehand" /></span>管理员电子签名
              </div>
              <div class="sig-box">
                <img v-if="adminSignatureUrl" :src="adminSignatureUrl" class="sig-img" alt="管理员签名" />
                <div v-else class="sig-empty">未上传</div>
              </div>
            </div>

            <div class="sanxin-item-card">
              <div class="sanxin-item-title">
                <span class="sanxin-item-num"><Icon icon="mdi:calendar" /></span>确认日期
              </div>
              <div class="date-val">{{ confirmDate }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-primary" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  padding: 16px;
  backdrop-filter: blur(4px);
}

.modal-dialog {
  width: 920px;
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
  background: var(--color-bg-secondary);
}

.modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.modal-subtitle {
  font-size: 11px;
  color: var(--color-text-tertiary, #94a3b8);
  margin-top: 3px;
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
  background: var(--color-bg-secondary);
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: var(--color-accent-blue);
  color: #fff;
}

.loading-wrap {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.sanxin-dispatch-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.sanxin-wo-box {
  background: #0f172a;
  color: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
}

.wo-box-head {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  font-weight: 600;
  letter-spacing: 0.5px;
}

.sanxin-wo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.wo-box-title {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 2px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.wo-box-val {
  font-size: 14px;
  font-weight: 700;
}

.wo-box-val-accent {
  color: #69b1ff;
}

.sanxin-applicant-items {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.sanxin-applicant-head {
  padding: 10px 14px;
  background: rgba(59, 130, 246, 0.08);
  border-bottom: 1px solid var(--color-border);
  font-size: 11px;
  font-weight: 700;
  color: var(--color-accent-blue);
}

.sanxin-applicant-row,
.sanxin-view-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
}

.sanxin-applicant-row:last-child,
.sanxin-view-row:last-child {
  border-bottom: none;
}

.sanxin-row-no {
  width: 18px;
  font-weight: 700;
  flex-shrink: 0;
  color: var(--color-text-tertiary, #94a3b8);
  padding-top: 1px;
}

.sanxin-row-content {
  flex: 1;
  line-height: 1.5;
  color: var(--color-text-primary);
}

.sanxin-result-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.sanxin-result-badge.no {
  background: rgba(34, 197, 94, 0.12);
  color: rgba(34, 197, 94, 1);
  border: 1px solid rgba(34, 197, 94, 0.35);
}

.sanxin-result-badge.yes {
  background: rgba(239, 68, 68, 0.12);
  color: rgba(239, 68, 68, 1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.sanxin-result-badge.na {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.sanxin-progress-wrap {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.sanxin-progress-lbl {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
  color: var(--color-text-secondary);
}

.sanxin-pbar-wrap {
  background: var(--color-border);
  border-radius: 9999px;
  height: 6px;
  overflow: hidden;
}

.sanxin-pbar {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, var(--color-accent-blue), rgba(96, 165, 250, 1));
}

.sanxin-info-bar {
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.16);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 11px;
  color: var(--color-accent-blue);
  line-height: 1.7;
  margin-bottom: 12px;
}

.sanxin-item-card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
}

.sanxin-item-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 9999px;
  background: rgba(123, 31, 162, 0.12);
  color: #7b1fa2;
  font-size: 11px;
  font-weight: 800;
  margin-right: 6px;
  vertical-align: middle;
}

.sanxin-item-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 10px;
  line-height: 1.5;
}

.sanxin-risk-alert {
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 11px;
  color: rgba(239, 68, 68, 1);
  display: none;
  margin-bottom: 10px;
}

.sanxin-risk-alert.show {
  display: block;
}

.sig-box {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 74px;
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-tertiary);
}

.sig-img {
  max-height: 60px;
  max-width: 260px;
  object-fit: contain;
}

.sig-empty {
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
}

.date-val {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
}
</style>

