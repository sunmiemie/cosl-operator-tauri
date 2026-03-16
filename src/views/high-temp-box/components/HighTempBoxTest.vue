<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { HighTempBoxContext } from '../composables/useHighTempBox'

const props = defineProps<{ ctx: HighTempBoxContext }>()
const {
  searchKeyword,
  activeFilter,
  calBase,
  selectedScheduledOrder,
  scheduledTasks,
  filteredOrders,
  currentWeekDays,
  weekLabel,
  timeSlots,
  fmtDate,
  prevWeek,
  nextWeek,
  gotoDate,
  loadPresetSchedule,
  getCellKey,
  getOrderById,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  removeSchedule,
  selectScheduledTask,
  selectedScheduledOrderInfo,
  startExperiment,
} = props.ctx
</script>

<template>
  <div class="layout-container">
    <div class="sidebar">
      <div class="panel-header">
        <div class="header-title">
          <Icon icon="mdi:format-list-bulleted" class="header-icon" />
          <span>待测试工单</span>
        </div>
        <span class="count-badge">{{ filteredOrders.length }}</span>
      </div>

      <div class="search-box">
        <Icon icon="mdi:magnify" class="search-icon" />
        <input v-model="searchKeyword" type="text" placeholder="搜索工单号/申请人" />
        <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''">
          <Icon icon="mdi:close" />
        </button>
      </div>

      <div class="filter-bar">
        <button
          v-for="f in ['all', 'high', 'pending', 'paused']"
          :key="f"
          class="filter-tag"
          :class="{ active: activeFilter === f }"
          @click="activeFilter = f as any"
        >
          {{ f === 'all' ? '全部' : f === 'high' ? '高优先' : f === 'pending' ? '待测' : '暂停' }}
        </button>
      </div>

      <div class="table-content">
        <div v-if="filteredOrders.length === 0" class="empty-state">
          <p>无待排程工单</p>
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>工单号</th>
                <th>设备</th>
                <th>申请人</th>
                <th>参数</th>
                <th>优先级</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in filteredOrders"
                :key="order.id"
                draggable="true"
                @dragstart="handleDragStart($event, order)"
                @dragend="handleDragEnd"
              >
                <td class="cell-id">{{ order.id }}</td>
                <td class="cell-device" :title="order.deviceName">{{ order.deviceName }}</td>
                <td class="cell-applicant">{{ order.applicant }}</td>
                <td class="cell-param">{{ order.targetTemp }}°C / {{ order.duration }}分</td>
                <td>
                  <span class="priority-tag" :class="order.priority">
                    {{ order.priority === 'high' ? '高' : order.priority === 'normal' ? '中' : '低' }}
                  </span>
                </td>
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
          <div
            v-for="day in currentWeekDays"
            :key="day.dateStr"
            class="day-header"
            :class="{ 'is-today': day.isToday }"
          >
            <div class="day-num" :class="{ 'is-weekend': day.isWeekend }">{{ day.month }}/{{ day.dayNum }}</div>
            <div class="day-name">{{ day.dayName }}</div>
          </div>
        </div>

        <div class="grid-body">
          <div v-for="slot in timeSlots" :key="slot.key" class="grid-row" :class="{ 'is-half': slot.isHalf }">
            <div class="time-label" :class="{ 'is-half': slot.isHalf }">{{ slot.label }}</div>

            <div
              v-for="day in currentWeekDays"
              :key="getCellKey(day.dateStr, slot.key)"
              class="grid-cell"
              :class="{ 'is-weekend': day.isWeekend, 'is-half-cell': slot.isHalf, 'is-past': day.isPast }"
              @dragover="handleDragOver($event, day.isPast)"
              @dragleave="handleDragLeave"
              @drop="handleDrop($event, day.dateStr, slot.key, day.isPast)"
            >
              <template v-if="scheduledTasks[getCellKey(day.dateStr, slot.key)]">
                <div
                  class="scheduled-item"
                  :class="{ 'is-selected': selectedScheduledOrder === scheduledTasks[getCellKey(day.dateStr, slot.key)].orderId }"
                  @click="selectScheduledTask(scheduledTasks[getCellKey(day.dateStr, slot.key)].orderId)"
                >
                  <div class="scheduled-content">
                    <span class="device-name">
                      {{ scheduledTasks[getCellKey(day.dateStr, slot.key)].orderId }}
                    </span>
                    <button class="remove-btn" @click.stop="removeSchedule(getCellKey(day.dateStr, slot.key))">
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">
                    {{ getOrderById(scheduledTasks[getCellKey(day.dateStr, slot.key)].orderId)?.deviceName }}
                  </div>
                </div>
              </template>
              <div v-else class="empty-slot-hint"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="control-center">
        <div class="control-center-left">
          <template v-if="selectedScheduledOrderInfo">
            <div class="selected-order">
              <Icon icon="mdi:check" class="selected-icon" />
              <span class="selected-label">已选中工单: {{ selectedScheduledOrderInfo.id }}</span>
            </div>
            <span class="selected-divider">|</span>
            <span class="selected-device">{{ selectedScheduledOrderInfo.deviceName }}</span>
            <span class="selected-process">{{ selectedScheduledOrderInfo.targetTemp }}°C</span>
          </template>
          <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
        </div>

        <button class="primary-btn" :disabled="!selectedScheduledOrderInfo" @click="startExperiment">
          <Icon icon="mdi:play" class="start-icon" />
          开始实验
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 直接从 index.vue 拆出的 dashboard 样式（不改任何数值），保证视觉一致 */
.layout-container { display:flex; flex:1; gap:16px; overflow:hidden; }
.sidebar { width:320px; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; }
.panel-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 18px; border-bottom:1px solid var(--color-border); font-size:15px; font-weight:600; color:var(--color-text-primary); background:var(--color-bg-secondary); flex-shrink:0; }
.panel-header .header-icon { font-size:16px; color:var(--color-text-secondary); background:none; width:auto; height:auto; border-radius:0; display:inline-flex; }
.sidebar .panel-header .header-title { display:flex; align-items:center; gap:8px; font-size:0.875rem; font-weight:500; }
.search-box { display:flex; align-items:center; gap:8px; padding:12px 18px; border-bottom:1px solid var(--color-border); background:var(--color-bg-secondary); }
.search-icon { font-size:18px; color:#94a3b8; }
.search-box input { flex:1; border:none; background:transparent; font-size:14px; color:#94a3b8; outline:none; }
.search-box input::placeholder { color:#94a3b8; }
.clear-btn { display:flex; align-items:center; justify-content:center; width:20px; height:20px; border:none; background:var(--color-bg-tertiary); color:var(--color-text-secondary); border-radius:50%; cursor:pointer; transition:all 0.2s; }
.clear-btn:hover { background:var(--color-error); color:white; }
.count-badge { padding:4px 10px; border-radius:9999px; font-size:12px; font-weight:500; background:rgba(59,130,246,0.15); color:rgb(96,165,250); }
.table-content { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--color-bg-secondary); }
.table-wrapper { flex:1; overflow:auto; }
.data-table { width:100%; border-collapse:collapse; font-size:13px; }
.data-table thead { position:sticky; top:0; z-index:1; }
.data-table th { padding:12px 16px; text-align:left; font-weight:600; color:var(--color-text-secondary); background:var(--color-bg-secondary); border-bottom:1px solid var(--color-border); white-space:nowrap; }
.data-table tbody tr { transition:background-color 0.15s; }
.data-table tbody tr:hover { background:rgba(255,255,255,0.02); }
.data-table td { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.04); vertical-align:middle; }
.cell-id { font-weight:600; color:var(--color-accent-blue); }
.cell-device { max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cell-applicant, .cell-param { color:var(--color-text-secondary); }
.priority-tag { display:inline-flex; align-items:center; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; white-space:nowrap; }
.priority-tag.high { background:rgba(239,68,68,0.12); color:#ef4444; }
.priority-tag.normal { background:rgba(59,130,246,0.12); color:#3b82f6; }
.priority-tag.low { background:rgba(34,197,94,0.12); color:#22c55e; }
.filter-bar { display:flex; gap:8px; padding:8px 12px; border-bottom:1px solid var(--color-border); background:var(--color-bg-tertiary); }
.filter-tag { border:none; background:transparent; padding:4px 8px; font-size:12px; border-radius:4px; color:var(--color-text-secondary); cursor:pointer; }
.filter-tag.active { background:var(--color-accent-blue); color:white; }
.main-content { flex:1; display:flex; flex-direction:column; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:12px; overflow:hidden; }
.week-cal-toolbar { display:flex; align-items:center; gap:8px; flex:1; }
.week-cal-label { font-size:13px; font-weight:600; flex:1; text-align:center; white-space:nowrap; }
.week-cal-nav { padding:5px 10px; border:1px solid var(--color-border); border-radius:6px; background:var(--color-bg-primary); cursor:pointer; font-size:12px; color:var(--color-text-primary); transition:all 0.2s; }
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
.day-header.is-today { background:rgba(88,166,255,0.1); }
.day-num { font-size:16px; font-weight:700; color:var(--color-accent-blue); }
.day-num.is-weekend { color:var(--color-error); }
.day-name { font-size:11px; color:var(--color-text-secondary); margin-top:2px; }
.grid-body { flex:1; overflow-y:auto; }
.grid-row { display:grid; grid-template-columns:60px repeat(7,1fr); border-bottom:1px solid var(--color-border); min-height:44px; }
.grid-row.is-half { border-bottom:1px dashed var(--color-border); }
.time-label { display:flex; align-items:center; justify-content:center; border-right:1px solid var(--color-border); font-size:11px; color:var(--color-text-tertiary); background:var(--color-bg-tertiary); font-family:monospace; }
.time-label.is-half { font-size:11px; color:var(--color-text-secondary); }
.grid-cell { border-right:1px solid var(--color-border); position:relative; transition:background 0.2s; background:var(--color-bg-primary); padding:3px; }
.grid-cell.is-weekend { background:rgba(0,0,0,0.012); }
.grid-cell.is-half-cell { border-top:1px dashed rgba(0,0,0,0.05); }
.grid-cell:hover:not(.is-past) { background:var(--color-bg-hover); }
.grid-cell.is-past { background:repeating-linear-gradient(45deg,var(--color-bg-tertiary),var(--color-bg-tertiary) 10px,var(--color-bg-secondary) 10px,var(--color-bg-secondary) 20px); opacity:0.7; cursor:not-allowed; }
.grid-cell.drag-over { background:rgba(88,166,255,0.1) !important; outline:2px dashed var(--color-accent-blue); outline-offset:-2px; }
.empty-slot-hint { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; opacity:0; color:var(--color-text-tertiary); pointer-events:none; font-size:20px; }
.grid-cell:hover .empty-slot-hint { opacity:0.5; }
.scheduled-item { height:100%; padding:4px 6px; background:linear-gradient(135deg,var(--color-accent-blue),var(--color-accent-cyan,#06b6d4)); border-radius:4px; color:#fff; display:flex; flex-direction:column; justify-content:center; cursor:pointer; user-select:none; transition:all 0.2s ease; }
.scheduled-item:hover { transform:scale(1.02); box-shadow:0 2px 6px rgba(0,0,0,0.12); }
.scheduled-item.is-selected { outline:2px solid rgba(255,255,255,0.95); box-shadow:0 0 0 3px rgba(37,99,235,0.35); transform:scale(1.04); z-index:2; position:relative; }
.scheduled-content { width:100%; display:flex; justify-content:space-between; align-items:flex-start; }
.device-name { font-size:11px; font-weight:700; color:#fff; }
.scheduled-tag { font-size:9px; color:rgba(255,255,255,0.9); margin-top:2px; }
.remove-btn { background:none; border:none; color:rgba(255,255,255,0.8); cursor:pointer; font-size:10px; }
.remove-btn:hover { color:#fff; }
.control-center { padding:16px; background:var(--color-bg-secondary); display:flex; align-items:center; justify-content:space-between; gap:16px; }
.control-center-left { display:flex; align-items:center; gap:12px; min-width:0; flex:1; font-size:14px; }
.selected-order { display:flex; align-items:center; gap:8px; color:var(--color-accent-blue); font-weight:600; }
.selected-divider, .selected-device { color:var(--color-text-secondary); }
.selected-process { color:var(--color-accent-purple); white-space:nowrap; background:rgba(168,85,247,0.1); padding:2px 8px; border-radius:6px; font-size:12px; }
.selected-placeholder { color:#94a3b8; font-style:italic; }
.primary-btn { display:flex; align-items:center; gap:8px; padding:12px 24px; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; transition:all 0.2s ease; background:var(--color-primary,#3b82f6); color:white; }
.primary-btn:hover:not(:disabled) { opacity:0.9; transform:translateY(-1px); }
.primary-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
</style>