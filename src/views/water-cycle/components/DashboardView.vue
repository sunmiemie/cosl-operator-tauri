<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'

// 跳出一层目录 (../) 找到逻辑层
import { useSchedule } from '../composables/useSchedule'
import { currentView, selectedOrder } from '../composables/useTestStore'

// 引入同级组件
import StartupCheckModal from './StartupCheckModal.vue'

// 引入抽象出的排程逻辑
const {
  searchKeyword, scheduledOrders, selectedScheduledOrderIds, currentWeekDays, weekLabel, timeSlots, calBase,
  unscheduledOrders, getOrderById, selectedScheduledOrders, fmtDate, prevWeek, nextWeek, loadPresetSchedule, getCellKey, getMonday,
  handleDragStart, handleDragEnd, handleDragOver, handleDragEnter, handleDragLeave, handleDrop, handleUnschedule, selectScheduledOrder
} = useSchedule()

// 控制开机自检弹窗的显隐
const showStartupCheck = ref(false)

// 原生日历控件改变日期时的回调
function gotoDate(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (val) calBase.value = getMonday(new Date(val))
}

// 点击开始实验按钮
function handleStartTest() {
  if (selectedScheduledOrders.value.length > 0) {
    // 将当前选中打算测试的工单存入全局状态，供后续页面使用
    selectedOrder.value = selectedScheduledOrders.value[0]
    showStartupCheck.value = true
  }
}

// 开机检查完毕，切换视图
function onStartupComplete() {
  showStartupCheck.value = false
  currentView.value = 'testing'
}
</script>

<template>
  <div class="layout-container">
    <div class="sidebar">
      <div class="panel-header">
        <div class="header-title"><Icon icon="mdi:format-list-bulleted" class="header-icon" /><span>待测试工单</span></div>
        <span class="count-badge">{{ unscheduledOrders.length }}</span>
      </div>
      
      <div class="search-box">
        <Icon icon="mdi:magnify" class="search-icon" />
        <input v-model="searchKeyword" type="text" placeholder="搜索工单号/设备..." />
        <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''"><Icon icon="mdi:close" /></button>
      </div>
      
      <div class="table-content">
        <div v-if="unscheduledOrders.length === 0" class="empty-state"><p>无待排程工单</p></div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>工单号</th><th>设备</th><th>申请人</th><th>类型</th><th>优先级</th></tr></thead>
            <tbody>
              <tr v-for="order in unscheduledOrders" :key="order.id" draggable="true" 
                  @dragstart="handleDragStart($event, order)" 
                  @dragend="handleDragEnd">
                <td class="cell-id">{{ order.taskNumber }}</td>
                <td class="cell-device" :title="order.deviceName">{{ order.deviceName }}</td>
                <td>{{ order.applicant }}</td><td>{{ order.type }}</td>
                <td><span class="priority-tag" :class="order.priority === '紧急' ? 'urgent' : 'normal'">{{ order.priority }}</span></td>
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
          <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="gotoDate" />
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
            <div class="day-name">周{{ day.dayName.replace('周', '') }}</div>
          </div>
        </div>
        
        <div class="grid-body">
          <div v-for="slot in timeSlots" :key="slot.key" class="grid-row" :class="{ 'is-half': slot.isHalf }">
            <div class="time-label" :class="{ 'is-half': slot.isHalf }">{{ slot.label }}</div>
            
            <div v-for="day in currentWeekDays" :key="getCellKey(day.dateStr, slot.key)" 
                 class="grid-cell" 
                 :class="{ 'is-weekend': day.isWeekend, 'is-half-cell': slot.isHalf, 'is-past': day.isPast }" 
                 @dragover="handleDragOver($event, day.isPast)" 
                 @dragenter="handleDragEnter" 
                 @dragleave="handleDragLeave" 
                 @drop="handleDrop($event, day.dateStr, slot.key, day.isPast)">
              
              <div v-if="scheduledOrders[getCellKey(day.dateStr, slot.key)]?.length" style="display:flex;flex-direction:column;gap:4px;width:100%">
                <div v-for="oid in scheduledOrders[getCellKey(day.dateStr, slot.key)]" :key="oid" 
                     class="scheduled-item" 
                     :class="{ 'is-selected': selectedScheduledOrderIds.includes(oid) }" 
                     @click="selectScheduledOrder(oid)">
                  <div class="scheduled-content">
                    <span class="device-name">{{ getOrderById(oid)?.taskNumber }}</span>
                    <button class="remove-btn" @click.stop="handleUnschedule(getCellKey(day.dateStr, slot.key), oid)"><Icon icon="mdi:close" /></button>
                  </div>
                  <div class="scheduled-tag">{{ getOrderById(oid)?.deviceName }}</div>
                </div>
              </div>
              <div v-else class="empty-slot-hint"></div>
            </div>
            
          </div>
        </div>
      </div>
      
      <div class="control-center">
        <div class="control-center-left">
          <template v-if="selectedScheduledOrders.length">
            <div class="selected-order">
              <Icon icon="mdi:check" class="selected-icon" />
              <span class="selected-label">已选中工单: {{ selectedScheduledOrders.length }} 个</span>
            </div>
            <span class="selected-divider">|</span>
            <span class="selected-device" v-for="o in selectedScheduledOrders" :key="o.id">{{ o.taskNumber }} · {{ o.deviceName }}</span>
          </template>
          <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
        </div>
        <button class="primary-btn" :disabled="!selectedScheduledOrders.length" @click="handleStartTest"><Icon icon="mdi:play" class="start-icon" /> 开始实验</button>
      </div>
    </div>
  </div>
  
  <StartupCheckModal v-if="showStartupCheck" @cancel="showStartupCheck = false" @complete="onStartupComplete" />
</template>

<style scoped>
.layout-container { display:flex; flex:1; min-height:0; gap:16px; overflow:hidden; }
.sidebar { width:320px; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; }
.main-content { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; }
.panel-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 18px; border-bottom:1px solid var(--color-border); font-size:15px; font-weight:600; color:var(--color-text-primary); background:var(--color-bg-secondary); flex-shrink:0; }
.sidebar .panel-header .header-title { display:flex; align-items:center; gap:8px; font-size:.875rem; font-weight:500; }
.count-badge { padding:4px 10px; border-radius:9999px; font-size:12px; font-weight:500; background:rgba(59,130,246,.15); color:rgb(96,165,250); }
.search-box { display:flex; align-items:center; gap:8px; padding:12px 18px; border-bottom:1px solid var(--color-border); background:var(--color-bg-secondary); }
.search-icon { font-size:18px; color:var(--color-text-tertiary); }
.search-box input { flex:1; border:none; background:transparent; font-size:14px; color:var(--color-text-primary); outline:none; }
.clear-btn { display:flex; align-items:center; justify-content:center; width:20px; height:20px; border:none; background:var(--color-bg-tertiary); color:var(--color-text-secondary); border-radius:50%; cursor:pointer; transition:all .2s; }
.clear-btn:hover { background:var(--color-error); color:#fff; }
.table-content { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--color-bg-secondary); }
.table-wrapper { flex:1; overflow:auto; }
.data-table { width:100%; border-collapse:collapse; font-size:13px; }
.data-table thead { position:sticky; top:0; z-index:1; }
.data-table th { padding:12px 16px; text-align:left; font-weight:600; color:var(--color-text-secondary); background:var(--color-bg-secondary); border-bottom:1px solid var(--color-border); white-space:nowrap; }
.data-table td { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,.04); vertical-align:middle; }
.cell-id { font-weight:600; color:var(--color-accent-blue); }
.cell-device,.cell-applicant,.cell-type { color:var(--color-text-secondary); }
.priority-tag { display:inline-flex; align-items:center; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; white-space:nowrap; }
.priority-tag.normal { background:rgba(59,130,246,.12); color:var(--color-accent-blue); }
.priority-tag.urgent { background:rgba(239,68,68,.12); color:#ef4444; }
.week-cal-toolbar { display:flex; align-items:center; gap:8px; flex:1; }
.week-cal-label { font-size:13px; font-weight:600; flex:1; text-align:center; white-space:nowrap; }
.week-cal-nav { padding:5px 10px; border:1px solid var(--color-border); border-radius:6px; background:var(--color-bg-primary); cursor:pointer; font-size:12px; color:var(--color-text-primary); transition:all .2s; }
.week-cal-nav:hover { background:var(--color-bg-hover); }
.week-cal-date-input { padding:5px 8px; border:1px solid var(--color-border); border-radius:6px; font-size:12px; background:var(--color-bg-primary); color:var(--color-text-primary); width:130px; }
.legend { display:flex; gap:16px; margin-left:auto; }
.legend-item { display:flex; align-items:center; font-size:13px; color:var(--color-text-secondary); }
.dot { width:8px; height:8px; border-radius:50%; margin-right:6px; }
.dot.pending { background:var(--color-border); }
.dot.occupied { background:var(--color-accent-blue); }
.calendar-grid { flex:1; display:flex; flex-direction:column; border-top:1px solid var(--color-border); border-bottom:1px solid var(--color-border); background:var(--color-bg-primary); overflow:hidden; }
.grid-header-row { display:grid; grid-template-columns:60px repeat(7,1fr); border-bottom:1px solid var(--color-border); background:var(--color-bg-tertiary); }
.time-column-header { padding:12px; text-align:center; border-right:1px solid var(--color-border); font-weight:600; font-size:12px; color:var(--color-text-secondary); }
.day-header { padding:8px; text-align:center; border-right:1px solid var(--color-border); }
.day-header:last-child { border-right:none; }
.day-header.is-today { background:rgba(88,166,255,.1); }
.day-num { font-size:16px; font-weight:700; color:var(--color-accent-blue); }
.day-num.is-weekend { color:#ef4444; }
.day-name { font-size:11px; color:var(--color-text-secondary); margin-top:2px; }
.grid-body { flex:1; overflow-y:auto; }
.grid-row { display:grid; grid-template-columns:60px repeat(7,1fr); border-bottom:1px solid var(--color-border); min-height:44px; }
.grid-row.is-half { border-bottom:1px dashed var(--color-border); }
.time-label { display:flex; align-items:center; justify-content:center; border-right:1px solid var(--color-border); font-size:11px; color:var(--color-text-tertiary); background:var(--color-bg-tertiary); font-family:monospace; }
.time-label.is-half { font-size:11px; color:var(--color-text-secondary); }
.grid-cell { border-right:1px solid var(--color-border); position:relative; transition:background .2s; background:var(--color-bg-primary); padding:3px; }
.grid-cell.is-weekend { background:rgba(0,0,0,.012); }
.grid-cell.is-half-cell { border-top:1px dashed rgba(0,0,0,.05); }
.grid-cell:hover:not(.is-past) { background:var(--color-bg-hover); }
.grid-cell.is-past { background:repeating-linear-gradient(45deg,var(--color-bg-tertiary),var(--color-bg-tertiary) 10px,var(--color-bg-secondary) 10px,var(--color-bg-secondary) 20px); opacity:.7; cursor:not-allowed; }
.grid-cell.drag-over { background:rgba(88,166,255,.1)!important; outline:2px dashed var(--color-accent-blue); outline-offset:-2px; }
.empty-slot-hint { position:absolute; inset:0; pointer-events:none; opacity:0; color:var(--color-text-tertiary); font-size:20px; display:flex; align-items:center; justify-content:center; }
.grid-cell:hover .empty-slot-hint { opacity:.5; }
.scheduled-item { height:100%; padding:4px 6px; background:linear-gradient(135deg,var(--color-accent-blue),var(--color-accent-cyan)); border-radius:4px; color:#fff; display:flex; flex-direction:column; justify-content:center; cursor:pointer; user-select:none; transition:all .2s ease; }
.scheduled-item:hover { transform:scale(1.02); box-shadow:0 2px 6px rgba(0,0,0,.12); }
.scheduled-item.is-selected { outline:2px solid rgba(255,255,255,.95); box-shadow:0 0 0 3px rgba(37,99,235,.35); transform:scale(1.04); z-index:2; position:relative; }
.scheduled-content { display:flex; justify-content:space-between; align-items:flex-start; }
.device-name { font-size:11px; font-weight:700; color:#fff; line-height:1.2; }
.scheduled-tag { font-size:9px; color:rgba(255,255,255,.9); font-weight:500; margin-top:2px; }
.remove-btn { background:none; border:none; color:rgba(255,255,255,.7); cursor:pointer; padding:0; border-radius:4px; opacity:.8; transition:all .2s; display:flex; }
.remove-btn:hover { color:#fff; opacity:1; }
.control-center { padding:16px; background:var(--color-bg-secondary); display:flex; align-items:center; justify-content:space-between; gap:16px; }
.control-center-left { display:flex; align-items:center; gap:12px; min-width:0; flex:1; font-size:14px; }
.selected-order { display:flex; align-items:center; gap:8px; color:var(--color-accent-blue); font-weight:600; }
.selected-icon { font-size:18px; }
.selected-divider { color:var(--color-border); }
.selected-device { color:var(--color-text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
.selected-placeholder { color:#94a3b8; font-style:italic; }
.primary-btn { display:flex; align-items:center; gap:8px; padding:12px 24px; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; transition:all .2s ease; background:var(--color-primary); color:white; }
.primary-btn:hover:not(:disabled) { opacity:.9; transform:translateY(-1px); }
.primary-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.start-icon { font-size:20px; }
</style>