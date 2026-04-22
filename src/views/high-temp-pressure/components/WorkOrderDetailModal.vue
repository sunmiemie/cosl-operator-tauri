<script setup lang="ts">
import { computed } from 'vue'
import type { WorkOrder } from '../types'

const props = defineProps<{
  visible: boolean
  order: WorkOrder | null
}>()

const emit = defineEmits<{
  close: []
}>()

const applicantItems = [
  '被测产品外形尺寸：①250容器：直径>240mm、长度>9m、总重量>4吨；②480容器：直径>420mm、长度>15m、总重量>4吨',
  '①定型被测产品，试压条件是否超出设计指标范围内；②未定型被测产品，经过安全系数计算，理论上会发生变形、泄露甚至是爆裂',
  '被测产品原材料是否未经过检验、不合格',
  '被测产品密封面、壁厚等关键尺寸是否未经过检测、未合格',
  '被测产品是否含有毒有害、腐蚀性、爆炸性或电离辐射等危险品，或强磁性物质',
]

const testerItems = [
  '被测产品其他附件如上下接头、O型圈等是否不合格',
  '密封件未装配、有损伤且未润滑充分',
]

const confirmDate = computed(() => props.order?.sanxinConfirmDate || '--')
const testerResults = computed(() => [props.order?.sanxinTesterItem1 ?? null, props.order?.sanxinTesterItem2 ?? null])
const isSanxin = computed(() => !!props.order?.sanxinIsSanxin || testerResults.value.some((v) => v === 'yes'))
</script>

<template>
  <div class="modal-overlay" v-if="visible" @click.self="emit('close')">
    <div class="modal htp-detail-modal">
      <div class="modal-header">
        <div class="modal-title">工单详情</div>
      </div>
      <div class="modal-body htp-detail-body">
        <div class="card" style="margin-bottom: 12px">
          <div class="card-header">
            <div class="card-title">工单信息</div>
          </div>
          <div class="card-body" v-if="order">
            <div class="info-grid" style="grid-template-columns: 1fr 1fr">
              <div class="info-item"><div class="info-key">申请人</div><div class="info-val">{{ order.applicant }}</div></div>
              <div class="info-item"><div class="info-key">任务编号</div><div class="info-val">{{ order.no }}</div></div>
              <div class="info-item"><div class="info-key">使用设备</div><div class="info-val">{{ order.type }}</div></div>
              <div class="info-item"><div class="info-key">状态</div><div class="info-val">{{ order.status }}</div></div>
              <div class="info-item" style="grid-column: 1 / -1">
                <div class="info-key">仪器明细</div>
                <div class="info-val">
                  <table class="data-table htp-mini-table">
                    <thead>
                      <tr>
                        <th>仪器</th>
                        <th>SN号</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="i in (order.items || [])" :key="i.id">
                        <td>{{ i.label }}</td>
                        <td class="text-muted">{{ i.sn }}</td>
                        <td><span class="status-tag status-pending">待排程</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">“三新”测试确认单</div>
            <span class="badge">WT3-TC/ZZ-01-R04 · v1.0</span>
          </div>
          <div class="card-body">
            <div class="info-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 12px">
              <div class="info-item"><div class="info-key">任务单编号</div><div class="info-val">{{ order?.no || '-' }}</div></div>
              <div class="info-item"><div class="info-key">确认日期</div><div class="info-val">{{ confirmDate }}</div></div>
            </div>
            <div class="alert" :class="isSanxin ? 'alert-warning' : ''">
              {{ isSanxin ? '⚠ 存在“是”选项，本次为“三新”测试，请注意相关安全规程。' : '✓ 全部确认为“否”，非“三新”测试，可按标准流程进行。' }}
            </div>

            <div class="htp-section-title">申请方（序号 1–5）</div>
            <table class="data-table htp-mini-table">
              <thead>
                <tr>
                  <th style="width: 60px">序号</th>
                  <th>确认项</th>
                  <th style="width: 90px">结果</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(text, idx) in applicantItems" :key="idx">
                  <td class="text-muted">{{ idx + 1 }}</td>
                  <td>{{ text }}</td>
                  <td><span class="badge badge-green">否</span></td>
                </tr>
              </tbody>
            </table>

            <div class="htp-section-title" style="margin-top: 12px">测试方（序号 1–2）</div>
            <table class="data-table htp-mini-table">
              <thead>
                <tr>
                  <th style="width: 60px">序号</th>
                  <th>确认项</th>
                  <th style="width: 90px">结果</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(text, idx) in testerItems" :key="idx">
                  <td class="text-muted">{{ idx + 1 }}</td>
                  <td>{{ text }}</td>
                  <td>
                    <span v-if="testerResults[idx] === 'yes'" class="badge badge-danger">是</span>
                    <span v-else-if="testerResults[idx] === 'no'" class="badge badge-green">否</span>
                    <span v-else class="badge">—</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div class="htp-sign-row">
              <div class="htp-sign-col">
                <div class="htp-sign-label">申请方签字</div>
                <div class="htp-sign-name">{{ order?.applicant || '-' }}</div>
              </div>
              <div class="htp-sign-col">
                <div class="htp-sign-label">测试方签字（管理员）</div>
                <img v-if="order?.adminSignatureUrl" class="htp-sign-img" :src="order.adminSignatureUrl" alt="管理员签名" />
                <div v-else class="htp-sign-empty"></div>
                <div class="htp-sign-hint">{{ order?.adminSignatureUrl ? '' : '尚未上传签名' }}</div>
              </div>
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

<style scoped src="./high-temp-pressure.shared.css"></style>
<style scoped>
.htp-detail-modal {
  width: 720px;
  max-width: 92vw;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}

.htp-detail-body {
  flex: 1;
  overflow: auto;
}

.htp-detail-body::-webkit-scrollbar {
  width: 8px;
}

.htp-detail-body::-webkit-scrollbar-track {
  background: transparent;
}

.htp-detail-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 9999px;
}

.htp-detail-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

.htp-mini-table {
  font-size: 12px;
}

.htp-mini-table th,
.htp-mini-table td {
  padding: 10px 12px;
}

.htp-section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 6px 0 10px;
}

.htp-sign-row {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.htp-sign-col {
  text-align: center;
}

.htp-sign-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.htp-sign-name {
  margin-top: 6px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.htp-sign-img {
  max-height: 54px;
  max-width: 160px;
  object-fit: contain;
  display: block;
  margin: 8px auto 0;
}

.htp-sign-empty {
  width: 60px;
  height: 42px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  margin: 8px auto 0;
  background: var(--color-bg-tertiary);
}

.htp-sign-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
