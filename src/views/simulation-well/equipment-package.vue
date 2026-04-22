<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  todayScheduledOrders: any[]
  downholeDevices: any[]
}>()

const emit = defineEmits(['back', 'save'])

// 辅助：生成设备唯一标识
const getDevKey = (orderId: string, device: any, index: number) => {
  return `${orderId}_${device.code || device.sn || 'SN-' + (index + 1)}`
}

// --- 表单状态 ---
const selectedWellName = ref('')
const customWellName = ref('') // 联动：试验井名-其他

const selectedTestingDevice = ref('')
const customTestingDevice = ref('') // 联动：测试设备-其他

const selectedTestObjective = ref('')
const customTestObjective = ref('') // 联动：测试目的-其他

const selectedTestType = ref('first_test')
const testCount = ref('2')
const repairOrderNumber = ref('')

const wellDepth = ref('')
const wellTemperature = ref('')
const wellPressure = ref('')

const mainIntervalFrom = ref('')
const mainIntervalTo = ref('')
const repeatIntervalFrom = ref('')
const repeatIntervalTo = ref('')

function saveDownholeOperation() {
  const payload = {
    orderIds: props.todayScheduledOrders.map(o => o.id),
    devices: props.downholeDevices,
    supportingTools: props.todayScheduledOrders.flatMap(o => (o.supportingTools || [])),
    wellName: selectedWellName.value === 'other' ? customWellName.value : selectedWellName.value,
    testingDevice: selectedTestingDevice.value === 'other' ? customTestingDevice.value : selectedTestingDevice.value,
    testObjective: selectedTestObjective.value === 'other' ? customTestObjective.value : selectedTestObjective.value,
    testType: selectedTestType.value,
    testCount: testCount.value,
    repairOrderNumber: repairOrderNumber.value,
    testEnvironment: { wellDepth: wellDepth.value, wellTemperature: wellTemperature.value, wellPressure: wellPressure.value },
    testInterval: { mainFrom: mainIntervalFrom.value, mainTo: mainIntervalTo.value, repeatFrom: repeatIntervalFrom.value, repeatTo: repeatIntervalTo.value }
  }
  emit('save', payload)
}
</script>

<template>
  <div class="downhole-view">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:oil" /></div>
        <div>
          <h1 class="header-title">下井作业设备组合</h1>
          <p class="header-subtitle">仅展示已排程并已选择开始试验的测试产品</p>
        </div>
      </div>
      <div class="header-right">
        <button class="week-cal-nav" @click="$emit('back')">返回</button>
      </div>
    </div>

    <div class="downhole-content">
      <div class="downhole-card">
        <div class="downhole-card-title">工单测试产品 <span class="english-sub">Order Test Products</span></div>
        <div v-if="!todayScheduledOrders.length" class="empty-state"><p>今日暂无排程工单</p></div>
        <div v-for="order in todayScheduledOrders" :key="'table-' + order.id" class="order-table-group">
          <div class="table-group-header">
            <span class="group-order-id">{{ order.id }}</span>
            <span class="group-customer">{{ order.customer }}</span>
            <span class="group-count">{{ order.deviceList?.length || 0 }} 个产品</span>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>测试产品</th>
                  <th>仪器编号</th>
                  <th>关联模板</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(device, idx) in order.deviceList" :key="getDevKey(order.id, device, idx)">
                  <td>{{ device.name }}</td>
                  <td>{{ device.sn || 'SN-' + (idx + 1) }}</td>
                  <td>{{ device.template || device.code || 'CBMT61XA_REPORT' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="downhole-card" v-if="todayScheduledOrders.some(o => o.supportingTools?.length)">
        <div class="downhole-card-title">配接仪器 <span class="english-sub">Supporting Tools</span></div>
        <div v-for="order in todayScheduledOrders.filter(o => o.supportingTools?.length)" :key="'support-' + order.id" class="order-table-group">
          <div class="table-group-header">
            <span class="group-order-id">{{ order.id }}</span>
            <span class="group-customer">{{ order.customer }}</span>
            <span class="group-count">{{ order.supportingTools?.length || 0 }} 个配接仪器</span>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>配接仪器</th>
                  <th>仪器编号</th>
                  <th>关联模板</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(tool, idx) in order.supportingTools" :key="getDevKey(order.id, tool, idx)">
                  <td>{{ tool.name }}</td>
                  <td>{{ tool.sn || 'SN-' + (idx + 1) }}</td>
                  <td>{{ tool.template || tool.code || 'SUPPORT_TOOL_REPORT' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="downhole-card form-card-styled">
        <div class="form-section-container">
          <div class="form-section-header">试验井名 Test well name</div>
          <div class="form-section-body">
            <div class="field-label">选择井名</div>
            <div class="option-grid">
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="cosl1" /> 科索1井 Well COSL 1</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="yanjiao1" /> 燕郊1井 Well Yanjiao 1</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="yanjiao2" /> 燕郊2井 Well Yanjiao 2</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="ren91" /> 任91井 Well Ren 91</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="gugu8" /> 孤古8井 Well Gugu 8</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="other" /> 其他 Other</label>
            </div>
            <div v-if="selectedWellName === 'other'" class="field-sub-input">
              <input v-model="customWellName" class="form-input full-width" placeholder="请输入自定义井名" />
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试设备 Testing device</div>
          <div class="form-section-body">
            <div class="field-label">选择测试设备</div>
            <div class="option-grid">
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="cosl1_skid" /> 科索1井电橇 Well COSL 1 Electrical Skid</label>
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="yanjiao1_skid" /> 燕郊1井电橇 Well Yanjiao 1 Electrical Skid</label>
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="3595_trips" /> 3595测井车 3595 Trips</label>
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="3590_trips" /> 3590测井车 3590 Trips</label>
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="other" /> 其他 Other</label>
            </div>
            <div v-if="selectedTestingDevice === 'other'" class="field-sub-input">
              <input v-model="customTestingDevice" class="form-input full-width" placeholder="请输入自定义测试设备" />
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试目的 Test Objective</div>
          <div class="form-section-body">
            <div class="field-label">选择测试目的</div>
            <div class="option-grid">
              <label class="rect-radio"><input v-model="selectedTestObjective" type="radio" value="new_product" /> 新产品测试 New product test</label>
              <label class="rect-radio"><input v-model="selectedTestObjective" type="radio" value="first_test" /> 首次测试 First test</label>
              <label class="rect-radio"><input v-model="selectedTestObjective" type="radio" value="other" /> 其他 Other</label>
            </div>
            <div v-if="selectedTestObjective === 'other'" class="field-sub-input">
              <input v-model="customTestObjective" class="form-input full-width" placeholder="请输入自定义测试目的" />
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试类型 Test type</div>
          <div class="form-section-body">
            <div class="field-label">选择测试类型</div>
            <div class="vertical-option-list">
              <label class="rect-radio"><input v-model="selectedTestType" type="radio" value="first_test" /> 首次测试 First test</label>
              <label class="rect-radio"><input v-model="selectedTestType" type="radio" value="nth_test" /> 第___次测试 (设备维修工单编号)</label>
            </div>
            
            <div v-if="selectedTestType === 'nth_test'" class="nth-test-layout">
              <div class="nth-input-group">
                <div class="field-label sub">第几次测试</div>
                <div class="input-with-text">
                  <span>第</span>
                  <input v-model="testCount" class="form-input small-inline" />
                  <span>次测试</span>
                </div>
              </div>
              <div class="repair-input-group">
                <div class="field-label sub">设备维修工单编号</div>
                <input v-model="repairOrderNumber" class="form-input full-width" placeholder="请输入设备维修工单编号" />
              </div>
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试环境</div>
          <div class="form-section-body">
            <div class="grid-fields-four">
              <input v-model="wellDepth" class="form-input" placeholder="井深 m" />
              <input v-model="wellTemperature" class="form-input" placeholder="井温 °C" />
              <input v-model="wellPressure" class="form-input" placeholder="井压 ksi" />
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试井段</div>
          <div class="form-section-body">
            <div class="grid-fields-four">
              <input v-model="mainIntervalFrom" class="form-input" placeholder="主测起始深度" />
              <input v-model="mainIntervalTo" class="form-input" placeholder="主测终止深度" />
              <input v-model="repeatIntervalFrom" class="form-input" placeholder="复测起始深度" />
              <input v-model="repeatIntervalTo" class="form-input" placeholder="复测终止深度" />
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="primary-btn" @click="saveDownholeOperation">保存下井作业</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 样式部分完全展开写 */
.downhole-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  font-size: 1.25rem;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.15));
  color: rgb(96, 165, 250);
}

.header-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.header-subtitle {
  font-size: 0.8125rem;
  color: #64748b;
  margin-top: 0.125rem;
  margin-bottom: 0;
}

.week-cal-nav {
  padding: 5px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  color: #1e293b;
}

.downhole-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.downhole-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #3b82f6;
  margin-bottom: 16px;
  padding-bottom: 8px;
}

.downhole-card-title {
  font-size: 15px;
  font-weight: 600;
}

.english-sub {
  font-size: 12px;
  font-weight: normal;
  color: #64748b;
  margin-left: 8px;
}

.selection-badge {
  background: #4ade80;
  color: #fff;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
}

.order-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.order-status-card {
  position: relative;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.order-status-card.is-active {
  background: #f0fdf4;
  border-color: #4ade80;
}

.check-icon-wrapper {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 20px;
  color: #4ade80;
}

.click-hint {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 11px;
  color: #94a3b8;
}

.card-time { font-size: 13px; color: #64748b; display: flex; align-items: center; gap: 4px; }
.card-order-id { font-size: 14px; font-weight: 700; color: #1e293b; }
.card-customer { font-size: 13px; color: #475569; }
.card-task { font-size: 12px; color: #94a3b8; height: 32px; overflow: hidden; }
.card-footer { font-size: 12px; color: #64748b; margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 8px; }

.order-table-group { margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.table-group-header { background: #f1f5f9; padding: 8px 12px; display: flex; gap: 12px; font-size: 13px; }
.group-order-id { font-weight: 700; color: #3b82f6; }
.group-count { margin-left: auto; color: #64748b; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { padding: 10px; background: #3b82f6; color: #fff; text-align: left; }
.data-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; }

/* 底部表单特定样式 */
.form-card-styled {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  gap: 16px;
}

.form-section-container {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.form-section-header {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #1e40af;
  background: #fff;
  border-bottom: 1px solid #3b82f6;
}

.form-section-body {
  padding: 16px;
}

.field-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 10px;
}

.field-label.sub {
  margin-top: 12px;
  margin-bottom: 4px;
}

.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.vertical-option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rect-radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.rect-radio:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.field-sub-input {
  margin-top: 12px;
}

.nth-test-layout {
  display: flex;
  gap: 20px;
  margin-top: 12px;
  align-items: flex-end;
}

.nth-input-group { width: 160px; }
.repair-input-group { flex: 1; }

.input-with-text {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.form-input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  outline: none;
}

.form-input:focus {
  border-color: #3b82f6;
}

.form-input.full-width { width: 100%; }
.form-input.small-inline { width: 50px; text-align: center; }

.grid-fields-four {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.form-actions {
  display: flex;
  justify-content: center;
  margin-top: 12px;
  padding-bottom: 20px;
}

.primary-btn {
  padding: 12px 24px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.empty-state { text-align: center; padding: 20px; color: grey; }
</style>
