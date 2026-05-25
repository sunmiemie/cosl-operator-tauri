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

const displayValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

const multilineItems = (value?: string) => {
  if (!value?.trim()) return []
  return value
    .split(/\r?\n|[；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const instrumentStatus = (completed?: boolean) => completed ? '已完成' : '待排程'
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
            <div class="detail-section">
              <div class="detail-section-title">基础信息</div>
              <div class="detail-grid">
                <div class="info-item"><div class="info-key">任务编号</div><div class="info-val">{{ order.no }}</div></div>
                <div class="info-item"><div class="info-key">工单状态</div><div class="info-val">{{ order.status }}</div></div>
                <div class="info-item"><div class="info-key">测试台</div><div class="info-val">{{ order.applicantUnit }}</div></div>
                <div class="info-item"><div class="info-key">使用设备</div><div class="info-val">{{ order.type }}</div></div>
                <div class="info-item"><div class="info-key">测试日期</div><div class="info-val">{{ order.applyDate }}</div></div>
                <div class="info-item"><div class="info-key">计划时间</div><div class="info-val">{{ displayValue(order.plannedTime) }}</div></div>
              </div>
            </div>

            <div class="detail-section">
              <div class="detail-section-title">申请与项目</div>
              <div class="detail-grid">
                <div class="info-item"><div class="info-key">申请人</div><div class="info-val">{{ order.applicant }}</div></div>
                <div class="info-item"><div class="info-key">申请人电话</div><div class="info-val">{{ displayValue(order.applicantPhone) }}</div></div>
                <div class="info-item"><div class="info-key">申请单位</div><div class="info-val">{{ displayValue(order.applicantUnit) }}</div></div>
                <div class="info-item"><div class="info-key">单位负责人</div><div class="info-val">{{ displayValue(order.applicantUnitManager) }}</div></div>
                <div class="info-item"><div class="info-key">申请日期</div><div class="info-val">{{ displayValue(order.applicationDate) }}</div></div>
                <div class="info-item"><div class="info-key">委托人</div><div class="info-val">{{ displayValue(order.client) }}</div></div>
                <div class="info-item"><div class="info-key">科研编号</div><div class="info-val">{{ displayValue(order.researchNumber) }}</div></div>
                <div class="info-item"><div class="info-key">预算编号</div><div class="info-val">{{ displayValue(order.projectBudgetNumber) }}</div></div>
                <div class="info-item wide"><div class="info-key">项目名称</div><div class="info-val">{{ displayValue(order.projectName) }}</div></div>
                <div class="info-item wide"><div class="info-key">项目成员</div><div class="info-val">{{ displayValue(order.projectMembers) }}</div></div>
              </div>
            </div>

            <div class="detail-section">
              <div class="detail-section-title">试验参数</div>
              <div class="detail-grid">
                <div class="info-item"><div class="info-key">测试类型</div><div class="info-val">{{ displayValue(order.testType) }}</div></div>
                <div class="info-item"><div class="info-key">目标温度</div><div class="info-val">{{ order.targetTemp }}</div></div>
                <div class="info-item"><div class="info-key">目标压力</div><div class="info-val">{{ order.targetPressure }}</div></div>
                <div class="info-item"><div class="info-key">保温保压时间</div><div class="info-val">{{ order.keepCondition }}</div></div>
                <div class="info-item"><div class="info-key">最大直径</div><div class="info-val">{{ displayValue(order.maxDiameter) }}</div></div>
                <div class="info-item"><div class="info-key">接收/设备编号</div><div class="info-val">{{ displayValue(order.receivingNo) }}</div></div>
              </div>
            </div>

            <div class="detail-section">
              <div class="detail-section-title">测试方案与风险</div>
              <div class="detail-text-block">
                <div class="detail-text-title">测试步骤</div>
                <ol v-if="multilineItems(order.testSteps).length" class="detail-list">
                  <li v-for="(item, idx) in multilineItems(order.testSteps)" :key="idx">{{ item }}</li>
                </ol>
                <div v-else class="text-muted">暂无测试步骤</div>
              </div>
              <div class="detail-text-block">
                <div class="detail-text-title">安全风险及预防措施</div>
                <ol v-if="multilineItems(order.safetyRisks).length" class="detail-list">
                  <li v-for="(item, idx) in multilineItems(order.safetyRisks)" :key="idx">{{ item }}</li>
                </ol>
                <div v-else class="text-muted">暂无安全风险说明</div>
              </div>
              <div class="detail-text-block">
                <div class="detail-text-title">备注</div>
                <div>{{ displayValue(order.remark) }}</div>
              </div>
            </div>

            <div class="detail-section">
              <div class="detail-section-title">设备与仪器</div>
              <div class="detail-grid compact">
                <div class="info-item wide"><div class="info-key">设备清单</div><div class="info-val">{{ displayValue(order.equipmentList) }}</div></div>
                <div class="info-item wide"><div class="info-key">仪器串组合</div><div class="info-val">{{ displayValue(order.instrumentCombination) }}</div></div>
              </div>
              <table class="data-table htp-mini-table">
                <thead>
                  <tr>
                    <th>仪器</th>
                    <th>SN号</th>
                    <th>测试类型</th>
                    <th>数量</th>
                    <th>长度</th>
                    <th>最大直径</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="i in (order.items || [])" :key="i.id">
                    <td>{{ i.label }}</td>
                    <td class="text-muted">{{ i.sn }}</td>
                    <td>{{ displayValue(i.testType) }}</td>
                    <td>{{ displayValue(i.quantity) }}</td>
                    <td>{{ displayValue(i.instrumentLength) }}</td>
                    <td>{{ displayValue(i.maxDiameter) }}</td>
                    <td>
                      <span class="status-tag" :class="i.completed ? 'status-done' : 'status-pending'">
                        {{ instrumentStatus(i.completed) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
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
  width: 960px;
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
  padding: 9px 10px;
}

.detail-section {
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border);
}

.detail-section:first-child {
  padding-top: 0;
}

.detail-section:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.detail-section-title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.detail-grid.compact {
  margin-bottom: 12px;
}

.info-item.wide {
  grid-column: 1 / -1;
}

.detail-text-block {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-primary);
}

.detail-text-block + .detail-text-block {
  margin-top: 10px;
}

.detail-text-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.detail-list {
  margin: 0;
  padding-left: 18px;
  color: var(--color-text-primary);
  line-height: 1.7;
}

.status-done {
  color: #059669;
  background: rgba(16, 185, 129, 0.12);
}

@media (max-width: 860px) {
  .detail-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
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
