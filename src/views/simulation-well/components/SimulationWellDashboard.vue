<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { CalendarDay, TimeSlot, WorkOrder } from '../types'

defineProps<{
  searchKeyword: string
  unscheduledOrders: WorkOrder[]
  calBase: Date
  weekLabel: string
  currentWeekDays: CalendarDay[]
  timeSlots: TimeSlot[]
  scheduledOrders: Record<string, string[]>
  scheduledOrdersTentative: Record<string, string[]>
  todayScheduledOrderIds: string[]
  fmtDate: (d: Date) => string
  getCellKey: (dateStr: string, timeKey: string) => string
  getWorkOrderById: (id: string) => WorkOrder | undefined
}>()

const emit = defineEmits<{
  'update:searchKeyword': [value: string]
  'drag-start': [event: DragEvent, order: WorkOrder]
  'drag-end': []
  'prev-week': []
  'next-week': []
  'goto-date': [event: Event]
  'load-preset-schedule': []
  'drag-over': [event: DragEvent, isPast: boolean]
  'drag-leave': []
  'drop': [event: DragEvent, dateStr: string, timeKey: string, isPast: boolean]
  unschedule: [cellKey: string, oid: string]
  'unschedule-tentative': [cellKey: string, oid: string]
  'start-scheduled-test': []
}>()
</script>

<template>
  <div class="layout-container">
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
        <input
          :value="searchKeyword"
          type="text"
          placeholder="搜索工单号/客户/设备/描述"
          @input="emit('update:searchKeyword', ($event.target as HTMLInputElement).value)"
        />
        <button v-if="searchKeyword" class="clear-btn" @click="emit('update:searchKeyword', '')">
          <Icon icon="mdi:close" />
        </button>
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
              <tr
                v-for="order in unscheduledOrders"
                :key="order.id"
                draggable="true"
                @dragstart="emit('drag-start', $event, order)"
                @dragend="emit('drag-end')"
              >
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
          <button class="week-cal-nav" @click="emit('prev-week')">‹ 上一周</button>
          <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="emit('goto-date', $event)" title="跳转到指定日期所在周" />
          <span class="week-cal-label">{{ weekLabel }}</span>
          <button class="week-cal-nav" @click="emit('next-week')">下一周 ›</button>
          <button class="week-cal-nav" @click="emit('load-preset-schedule')">读取本周排程</button>
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
            <div
              v-for="day in currentWeekDays"
              :key="getCellKey(day.dateStr, slot.key)"
              class="grid-cell"
              :class="{ 'is-weekend': day.isWeekend, 'is-half-cell': slot.isHalf, 'is-past': day.isPast }"
              @dragover.capture="emit('drag-over', $event, day.isPast)"
              @dragleave="emit('drag-leave')"
              @drop.capture="emit('drop', $event, day.dateStr, slot.key, day.isPast)"
            >
              <div v-if="scheduledOrders[getCellKey(day.dateStr, slot.key)]?.length" style="display:flex;flex-direction:column;gap:4px;width:100%">
                <div v-for="oid in scheduledOrders[getCellKey(day.dateStr, slot.key)]" :key="oid" class="scheduled-item">
                  <div class="scheduled-content">
                    <span class="device-name">{{ oid }}</span>
                    <button class="remove-btn" @click.stop="emit('unschedule', getCellKey(day.dateStr, slot.key), oid)"><Icon icon="mdi:close" /></button>
                  </div>
                  <div class="scheduled-tag">{{ getWorkOrderById(oid)?.customer }} · {{ getWorkOrderById(oid)?.deviceList?.[0]?.name }}</div>
                </div>
              </div>
              <div v-else-if="scheduledOrdersTentative[getCellKey(day.dateStr, slot.key)]?.length" style="display:flex;flex-direction:column;gap:4px;width:100%">
                <div v-for="oid in scheduledOrdersTentative[getCellKey(day.dateStr, slot.key)]" :key="oid" class="scheduled-item">
                  <div class="scheduled-content">
                    <span class="device-name">{{ oid }}</span>
                    <button class="remove-btn" @click.stop="emit('unschedule-tentative', getCellKey(day.dateStr, slot.key), oid)"><Icon icon="mdi:close" /></button>
                  </div>
                  <div class="scheduled-tag">待排程 · {{ getWorkOrderById(oid)?.customer }} · {{ getWorkOrderById(oid)?.deviceList?.[0]?.name }}</div>
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
              {{ oid }} · {{ getWorkOrderById(oid)?.customer }}
            </span>
          </template>
          <span v-else class="selected-placeholder">仅支持开始今日排程工单实验</span>
        </div>
        <button class="primary-btn" :disabled="todayScheduledOrderIds.length === 0" @click="emit('start-scheduled-test')">
          <Icon icon="mdi:play" class="start-icon" />开始实验
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./simulation-well.shared.css"></style>
