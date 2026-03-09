<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import EquipmentPackage from './equipment-package.vue'

const userName = ref('Operator')
const currentView = ref('dashboard')
const searchKeyword = ref('')
const workOrders = ref([
  {
    id: 'WO-2024-001',
    customer: '中海油渤海分公司',
    devices: 3,
    status: 'approved',
    createTime: '2026-03-01',
    planTime: '2026-03-07',
    taskDesc: '15℃×EFDL道氧压陀螺机规代',
    deviceList: [
      { id: 'DST-2024-001', name: 'CBMT61XA井底磁定位测井仪' },
      { id: 'DST-2024-002', name: 'ERTT71XA遥传短节' },
      { id: 'DST-2024-003', name: 'HCAL61XA井径测井仪' },
    ],
  },
  {
    id: 'WO-2024-002',
    customer: '中石化华北石油局',
    devices: 5,
    status: 'inprogress',
    createTime: '2026-03-01',
    planTime: '2026-03-09',
    taskDesc: '科能井常规测试',
    deviceList: [
      { id: 'DST-2024-004', name: 'EZDT71XA岩性密度测井仪' },
      { id: 'DST-2024-005', name: 'ECNT73XA补偿中子测井仪' },
    ],
  },
  {
    id: 'WO-2024-003',
    customer: '中石油西部钻探',
    devices: 2,
    status: 'pending',
    createTime: '2026-03-01',
    planTime: '2026-03-09',
    taskDesc: '燕郊1井测试',
    deviceList: [
      { id: 'DST-2024-009', name: 'EDAT72XA方位密度测井仪' },
      { id: 'DST-2024-010', name: 'EAIL61XA阵列感应测井仪' },
    ],
  },
  {
    id: 'WO-2024-004',
    customer: '中海油南海东部公司',
    devices: 4,
    status: 'inprogress',
    createTime: '2026-03-01',
    planTime: '2026-03-10',
    taskDesc: '深水测井作业',
    deviceList: [
      { id: 'DST-2024-011', name: 'EMSF71XA多臂井径测井仪' },
    ],
  },
  {
    id: 'WO-2024-005',
    customer: '中石化胜利油田',
    devices: 6,
    status: 'approved',
    createTime: '2026-03-01',
    planTime: '2026-03-06',
    taskDesc: '油装井中心综合测试',
    deviceList: [
      { id: 'DST-2024-015', name: 'ECCL61XA磁定位测井仪' },
    ],
  },
  {
    id: 'WO-2024-006',
    customer: '中石油大庆油田',
    devices: 3,
    status: 'completed',
    createTime: '2023-12-28',
    planTime: '2026-03-05',
    taskDesc: '科索1井作业',
    deviceList: [
      { id: 'DST-2023-098', name: 'ERMI61XA微电阻率扫描成像测井仪' },
    ],
  },
  {
    id: 'WO-2024-007',
    customer: '中海油深圳分公司',
    devices: 8,
    status: 'approved',
    createTime: '2024-01-12',
    planTime: '2026-03-06',
    taskDesc: 'EFDT地层测试仪钻井中途油气层测试',
    deviceList: [
      { id: 'EFDT-001', name: 'EFDT PA电源短节', sn: 'EFDT-PA-001', template: 'EFDT_REPORT' },
      { id: 'EFDT-002', name: 'EFDT EA电子线路短节', sn: 'EFDT-EA-001', template: 'EFDT_REPORT' },
      { id: 'EFDT-003', name: 'EFDT DA液压短节', sn: 'EFDT-DA-001', template: 'EFDT_REPORT' },
      { id: 'EFDT-004', name: 'EFDT MA Packer短节', sn: 'EFDT-MA-001', template: 'EFDT_REPORT' },
      { id: 'EFDT-005', name: 'EFDT AA流体分析短节', sn: 'EFDT-AA-001', template: 'EFDT_REPORT' },
      { id: 'EFDT-006', name: 'EFDT SA泵抽短节', sn: 'EFDT-SA-001', template: 'EFDT_REPORT' },
      { id: 'EFDT-007', name: 'EFDT VA PVT短节', sn: 'EFDT-VA-001', template: 'EFDT_REPORT' },
      { id: 'EFDT-008', name: 'EFDT LA大样桶短节', sn: 'EFDT-LA-001', template: 'EFDT_REPORT' },
    ],
  },
])
const orderStatusMap = {
  pending: { text: '待处理', class: 'badge-warning' },
  approved: { text: '已审核', class: 'badge-primary' },
  inprogress: { text: '进行中', class: 'badge-success' },
  completed: { text: '已完成', class: 'badge' },
}
function getInitialCalendarDate() {
  const validPlanDates = workOrders.value
    .map(o => o.planTime)
    .filter(Boolean)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .map(d => new Date(`${d}T00:00:00`))
    .sort((a, b) => a.getTime() - b.getTime())

  return validPlanDates.length ? validPlanDates[0] : new Date()
}

const calBase = ref(new Date())
function getMonday(d: Date) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  dt.setDate(diff)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function addDays(d: Date, days: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

function fmtDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
calBase.value = getMonday(new Date())
const currentWeekDays = computed(() => {
  const days: any[] = []
  const todayStr = fmtDate(new Date())
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < 7; i++) {
    const d = addDays(calBase.value, i)
    const dateStr = fmtDate(d)
    const dObj = new Date(d)
    dObj.setHours(0, 0, 0, 0)

    days.push({
      dateStr,
      dayName: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()],
      dayNum: d.getDate(),
      month: d.getMonth() + 1,
      isToday: dateStr === todayStr,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isPast: dObj < today,
    })
  }
  return days
})

const weekLabel = computed(() => {
  const s = currentWeekDays.value[0]
  const e = currentWeekDays.value[6]
  //return `${s.month}月${s.dayNum}日 ～ ${e.month}月${e.dayNum}日`
})

const timeSlots = computed(() => {
  const slots: any[] = []
  for (let h = 8; h < 18; h++) {
    slots.push({
      key: `${String(h).padStart(2, '0')}00`,
      label: `${String(h).padStart(2, '0')}:00`,
      isHalf: false,
    })
    slots.push({
      key: `${String(h).padStart(2, '0')}30`,
      label: `${String(h).padStart(2, '0')}:30`,
      isHalf: true,
    })
  }
  slots.push({ key: '1800', label: '18:00', isHalf: false })
  return slots
})
function getCellKey(dateStr: string, timeKey: string) {
  return `${dateStr}_${timeKey}`
}
const draggedOrder = ref<any>(null)
const scheduledOrders = ref<Record<string, string[]>>({})
const selectedScheduledOrderIds = ref<string[]>([])

const todayDateStr = computed(() => fmtDate(new Date()))

const todayScheduledOrderIds = computed(() => {
  const ids = new Set<string>()
  Object.entries(scheduledOrders.value).forEach(([cellKey, orderIds]) => {
    const dateStr = cellKey.split('_')[0]
    if (dateStr === todayDateStr.value) {
      orderIds.forEach(id => ids.add(id))
    }
  })
  return Array.from(ids)
})

const todayScheduledOrders = computed(() => {
  return todayScheduledOrderIds.value
    .map(id => workOrders.value.find(o => o.id === id))
    .filter(Boolean) as any[]
})

const unscheduledOrders = computed(() => {
  const scheduledIds = new Set(Object.values(scheduledOrders.value).flat())
  const kw = searchKeyword.value.trim()
  return workOrders.value.filter(o => {
    if (scheduledIds.has(o.id)) return false
    if (o.status === 'completed') return false
    if (!kw) return true
    const deviceNames = (o.deviceList || []).map(d => d.name).join(' ')
    return (
      o.id.includes(kw) ||
      o.customer.includes(kw) ||
      deviceNames.includes(kw) ||
      (o.taskDesc || '').includes(kw)
    )
  })
})

function prevWeek() {
  calBase.value = addDays(calBase.value, -7)
}

function nextWeek() {
  calBase.value = addDays(calBase.value, 7)
}

function gotoDate(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (!val) return
  calBase.value = getMonday(new Date(val))
}

function loadPresetSchedule() {
  const base = calBase.value
  const presets = [
    { d: 0, t: '0800', id: 'WO-2024-001' },
    { d: 0, t: '1000', id: 'WO-2024-002' },
    { d: 1, t: '1400', id: 'WO-2024-003' },
  ]

  presets.forEach(p => {
    const d = addDays(base, p.d)
    const cellKey = getCellKey(fmtDate(d), p.t)
    const cur = scheduledOrders.value[cellKey] || []
    if (!cur.includes(p.id)) {
      scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...cur, p.id] }
    }
  })
}

function initializeScheduleFromPlanTime() {
  const timeKeys = ['0800', '0900', '1000', '1100', '1300', '1400', '1500', '1600']
  let idx = 0

  workOrders.value.forEach(order => {
    if (order.status === 'completed' || !order.planTime) return

    const dateStr = order.planTime.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return

    const alreadyScheduled = Object.values(scheduledOrders.value).some(ids => ids.includes(order.id))
    if (alreadyScheduled) return

    const preferred = timeKeys[idx % timeKeys.length]
    idx += 1

    const candidateKeys = [preferred, ...timeKeys.filter(t => t !== preferred)]
    const targetTime = candidateKeys.find(t => (scheduledOrders.value[getCellKey(dateStr, t)] || []).length === 0)
    if (!targetTime) return

    const cellKey = getCellKey(dateStr, targetTime)
    const cur = scheduledOrders.value[cellKey] || []
    scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...cur, order.id] }
  })
}

initializeScheduleFromPlanTime()
function handleDragStart(e: DragEvent, order: any) {
  draggedOrder.value = order
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function handleDragEnd() {
  draggedOrder.value = null
}

function handleDragOver(e: DragEvent, isPast: boolean) {
  if (isPast) return
  e.preventDefault()
}

function handleDragLeave() {
  // no-op
}

function handleDrop(e: DragEvent, dateStr: string, timeKey: string, isPast: boolean) {
  if (isPast) return
  const order = draggedOrder.value
  if (!order) return
  const cellKey = getCellKey(dateStr, timeKey)
  const scheduledIds = new Set(Object.values(scheduledOrders.value).flat())
  if (scheduledIds.has(order.id)) return
  const cur = scheduledOrders.value[cellKey] || []
  if (cur.includes(order.id)) return
  scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: [...cur, order.id] }
}

function handleUnschedule(cellKey: string, oid: string) {
  const cur = (scheduledOrders.value[cellKey] || []).filter(x => x !== oid)
  scheduledOrders.value = { ...scheduledOrders.value, [cellKey]: cur }
  selectedScheduledOrderIds.value = selectedScheduledOrderIds.value.filter(x => x !== oid)
}

function handleSelectScheduledOrder(oid: string) {
  const set = new Set(selectedScheduledOrderIds.value)
  if (set.has(oid)) set.delete(oid)
  else set.add(oid)
  selectedScheduledOrderIds.value = Array.from(set)
}

const downholeDevices = computed(() => {
  return todayScheduledOrders.value.flatMap(order => {
    const list = order.deviceList || []
    return list.map((device: any, index: number) => ({
      orderId: order.id,
      customer: order.customer,
      deviceName: device.name,
      sn: device.sn || `SN-${index + 1}`,
      template: device.template || 'CBMT61XA_REPORT',
    }))
  })
})

function handleStartScheduledTest() {
  if (!todayScheduledOrderIds.value.length) return
  currentView.value = 'downhole-operation'
}

function backToDashboard() {
  currentView.value = 'dashboard'
}

function handleSaveDownhole(payload: any) {
  console.log('downhole-operation payload', payload)
}
</script>

<template>
  <div class="simulation-well-page">
    <div class="page-header" v-if="currentView === 'dashboard'">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:pipe" /></div>
        <div>
          <h1 class="header-title">模拟井</h1>
          <p class="header-subtitle">模拟井测试系统</p>
        </div>
      </div>
      <div class="header-right"></div>
    </div>

    <div v-if="currentView === 'dashboard'" class="layout-container">
      <div class="sidebar">
        <div class="panel-header">
          <div class="header-title">
            <Icon icon="mdi:format-list-bulleted" class="header-icon" />
            <span>待测试工单</span>
          </div>
          <span class="count-badge">{{ unscheduledOrders.length }}</span>
        </div>
        <div class="search-box">
          <Icon icon="mdi:magnify" class="search-icon" />
          <input v-model="searchKeyword" type="text" placeholder="搜索工单号/客户/设备/描述" />
          <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''"><Icon icon="mdi:close" /></button>
        </div>
        <div class="table-content">
          <div v-if="unscheduledOrders.length === 0" class="empty-state"><p>无待排程工单</p></div>
          <div v-else class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>工单号</th>
                  <th>客户</th>
                  <th>设备数</th>
                  <th>计划时间</th>
                  <th>描述</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="order in unscheduledOrders" :key="order.id" draggable="true" @dragstart="handleDragStart($event, order)" @dragend="handleDragEnd">
                  <td class="cell-id">{{ order.id }}</td>
                  <td class="cell-customer">{{ order.customer }}</td>
                  <td class="cell-devices">{{ order.devices }}</td>
                  <td class="cell-plan">{{ order.planTime }}</td>
                  <td class="cell-desc">{{ order.taskDesc }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="main-content">
        <div class="panel-header">
          <div class="week-cal-toolbar">
            <button class="week-cal-nav" @click="prevWeek">‹ 上一周</button>
            <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="gotoDate" title="跳转到指定日期所在周" />
            <span class="week-cal-label">{{ weekLabel }}</span>
            <button class="week-cal-nav" @click="nextWeek">下一周 ›</button>
            <button class="week-cal-nav" @click="loadPresetSchedule">读取本周排程</button>
          </div>
          <div class="legend">
            <div class="legend-item"><span class="dot pending"></span>空闲</div>
            <div class="legend-item"><span class="dot occupied"></span>已占用</div>
          </div>
        </div>

        <div class="calendar-grid">
          <div class="grid-header-row">
            <div class="time-column-header">时间</div>
            <div v-for="day in currentWeekDays" :key="day.dateStr" class="day-header" :class="{ 'is-today': day.isToday }">
              <div class="day-num" :class="{ 'is-weekend': day.isWeekend }">{{ day.month }}/{{ day.dayNum }}</div>
              <div class="day-name">{{ day.dayName }}</div>
            </div>
          </div>
          <div class="grid-body">
            <div v-for="slot in timeSlots" :key="slot.key" class="grid-row" :class="{ 'is-half': slot.isHalf }">
              <div class="time-label" :class="{ 'is-half': slot.isHalf }">{{ slot.label }}</div>
              <div v-for="day in currentWeekDays" :key="getCellKey(day.dateStr, slot.key)" class="grid-cell" :class="{ 'is-weekend': day.isWeekend, 'is-half-cell': slot.isHalf, 'is-past': day.isPast }" @dragover.capture="handleDragOver($event, day.isPast)" @dragleave="handleDragLeave" @drop.capture="handleDrop($event, day.dateStr, slot.key, day.isPast)">
                <div v-if="scheduledOrders[getCellKey(day.dateStr, slot.key)]?.length" style="display:flex;flex-direction:column;gap:4px;width:100%">
                  <div v-for="oid in scheduledOrders[getCellKey(day.dateStr, slot.key)]" :key="oid" class="scheduled-item">
                    <div class="scheduled-content">
                      <span class="device-name">{{ oid }}</span>
                      <button class="remove-btn" @click.stop="handleUnschedule(getCellKey(day.dateStr, slot.key), oid)"><Icon icon="mdi:close" /></button>
                    </div>
                    <div class="scheduled-tag">{{ workOrders.find(o=>o.id===oid)?.customer }} · {{ workOrders.find(o=>o.id===oid)?.deviceList?.[0]?.name }}</div>
                  </div>
                </div>
                <div v-else class="empty-slot-hint">+</div>
              </div>
            </div>
          </div>
        </div>

        <div class="control-center">
          <div class="control-center-left">
            <template v-if="todayScheduledOrderIds.length">
              <div class="selected-order">
                <Icon icon="mdi:check" class="selected-icon" />
                <span class="selected-label">今日排程工单: {{ todayScheduledOrderIds.length }} 个</span>
              </div>
              <span class="selected-divider">|</span>
              <span class="selected-device" v-for="oid in todayScheduledOrderIds" :key="oid">
                {{ oid }} · {{ workOrders.find(o => o.id === oid)?.customer }}
              </span>
            </template>
            <span v-else class="selected-placeholder">仅支持开始今日排程工单实验</span>
          </div>
          <button class="primary-btn" :disabled="todayScheduledOrderIds.length === 0" @click="handleStartScheduledTest">
            <Icon icon="mdi:play" class="start-icon" />开始实验
          </button>
        </div>
      </div>
    </div>

    <EquipmentPackage
      v-else-if="currentView === 'downhole-operation'"
      :today-scheduled-orders="todayScheduledOrders"
      :downhole-devices="downholeDevices"
      @back="backToDashboard"
      @save="handleSaveDownhole"
    />
  </div>
</template>

<style scoped>
.simulation-well-page {
  height: 100%;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  overflow: hidden;
  /* padding: 16px; */
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

/* 左侧区域 */
.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* header 图标 */
.page-header .header-icon {
  width: 2.5rem;
  height: 2.5rem;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 0.625rem;
  font-size: 1.25rem;

  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.2),
    rgba(37, 99, 235, 0.15)
  );

  color: rgb(96, 165, 250);
}

/* 标题 */
.header-title {
 font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

/* 副标题 */
.header-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);

  margin-top: 0.125rem;
  margin-bottom: 0;
}

/* 右侧区域 */
.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* 整体布局 */
.layout-container {
 flex: 1;
  display: flex;
  gap: 1rem;
  min-height: 0;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}
.panel-header .header-icon {
  font-size: 16px;
  color: var(--color-text-secondary);
}

/* 待测试工单标题字体配置（对齐水循环样式） */
.sidebar .panel-header .header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  font-weight: 500;
}

.sidebar {
  width: 320px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.search-icon {
  font-size: 18px;
  color: var(--color-text-tertiary, #94a3b8);
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--color-text-primary, #1e293b);
  outline: none;
}

.search-box input::placeholder {
  color: var(--color-text-tertiary, #94a3b8);
}
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: grey;
  font-size: 13px;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: var(--color-error, #ef4444);
  color: #fff;
}

.count-badge {
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(59, 130, 246, 0.15);
  color: rgb(96, 165, 250);
}

/* 表格区域 */
.table-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.table-wrapper {
  flex: 1;
  overflow: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-table th {
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.data-table tbody tr {
  transition: background-color 0.15s;
}

.data-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

/* 表格字段 */
.cell-id {
  font-weight: 600;
  color: var(--color-accent-blue);
}

.cell-device {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-customer,
.cell-desc {
  color: var(--color-text-secondary);
}
.week-cal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.week-cal-label {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  text-align: center;
  white-space: nowrap;
}

.week-cal-nav {
  padding: 5px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-primary);
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-primary);
  transition: all 0.2s;
}

.week-cal-nav:hover {
  background: var(--color-bg-hover);
}

.week-cal-date-input {
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 12px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  width: 130px;
}

/* 主内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

/* 图例 */
.legend {
  display: flex;
  gap: 16px;
  margin-left: auto;
}

.legend-item {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.dot.pending {
  background: var(--color-border);
}

.dot.occupied {
  background: var(--color-accent-blue);
}

/* 日历网格 */
.calendar-grid {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  overflow: hidden;
}

.grid-header-row {
  display: grid;
  grid-template-columns: 60px repeat(7, 1fr);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.time-column-header {
  padding: 12px;
  text-align: center;
  border-right: 1px solid var(--color-border);
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.day-header {
  padding: 8px;
  text-align: center;
  border-right: 1px solid var(--color-border);
}

.day-header:last-child {
  border-right: none;
}

.day-header.is-today {
  background: rgba(88, 166, 255, 0.1);
}

.day-num {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-accent-blue);
}

.day-num.is-weekend {
  color: #ef4444;
}

.day-name {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

/* 网格主体 */
.grid-body {
  flex: 1;
  overflow-y: auto;
}

.grid-row {
  display: grid;
  grid-template-columns: 60px repeat(7, 1fr);
  border-bottom: 1px solid var(--color-border);
  min-height: 44px;
}

.grid-row.is-half {
  border-bottom: 1px dashed var(--color-border);
}

.time-label {
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
  font-family: monospace;
}

.time-label.is-half {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.grid-cell {
  border-right: 1px solid var(--color-border);
  position: relative;
  transition: background 0.2s;
  background: var(--color-bg-primary);
  padding: 3px;
}

.grid-cell.is-weekend {
  background: rgba(0, 0, 0, 0.012);
}

.grid-cell.is-half-cell {
  border-top: 1px dashed rgba(0, 0, 0, 0.05);
}

.grid-cell:last-child {
  border-right: none;
}

.grid-cell:hover {
  background: var(--color-bg-hover);
}

.grid-cell.is-past {
  background: repeating-linear-gradient(
    45deg,
    var(--color-bg-tertiary),
    var(--color-bg-tertiary) 10px,
    var(--color-bg-secondary) 10px,
    var(--color-bg-secondary) 20px
  );
  opacity: 0.7;
  cursor: not-allowed;
}

.empty-slot-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  color: var(--color-text-tertiary);
  pointer-events: none;
  font-size: 20px;
}

.grid-cell:hover .empty-slot-hint {
  opacity: 0.5;
}
.scheduled-item {
  height: 100%;
  padding: 4px 6px;
  background: linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-cyan, #06b6d4));
  border-radius: 4px;
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
}

.scheduled-item:hover {
  transform: scale(1.02);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}

.scheduled-item.is-selected {
  outline: 2px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35);
  transform: scale(1.04);
  z-index: 2;
  position: relative;
}

.scheduled-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.device-name {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.scheduled-tag {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
  margin-top: 2px;
}

.remove-btn {
  background: none;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  opacity: 0.6;
  transition: all 0.2s;
}

.remove-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  opacity: 1;
}
.control-center {
  padding: 16px;
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.control-center-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
  font-size: 14px;
}

.selected-order {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-accent-blue);
  font-weight: 600;
}

.selected-icon {
  font-size: 18px;
}

.selected-divider {
  color: var(--color-border);
}

.selected-device {
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.selected-placeholder {
  color: #94a3b8;
  font-style: italic;
}
.primary-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--color-primary, #3b82f6);
  color: white;
}

.primary-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.start-icon {
  font-size: 20px;
}

</style>
