<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { StartupCheckItem, TimeSlot, WeekDay, WorkOrder } from '../types'

defineProps<{
  showStartupCheck: boolean
  checkItems: StartupCheckItem[]
  allChecked: boolean
  unscheduledOrders: WorkOrder[]
  searchKeyword: string
  currentWeekDays: WeekDay[]
  timeSlots: TimeSlot[]
  calBase: Date
  weekLabel: string
  scheduledOrders: Record<string, string[]>
  selectedScheduledOrderIds: string[]
  selectedScheduledOrders: WorkOrder[]
  fmtDate: (d: Date) => string
  getCellKey: (dateStr: string, timeKey: string) => string
  getOrderById: (id: string) => WorkOrder | undefined
}>()

const emit = defineEmits<{
  'update:showStartupCheck': [value: boolean]
  'update:searchKeyword': [value: string]
  'toggle-check': [id: number]
  'startup-check-complete': []
  'drag-start': [event: DragEvent, order: WorkOrder]
  'drag-end': [event: DragEvent]
  'prev-week': []
  'next-week': []
  'goto-date': [event: Event]
  'load-preset-schedule': []
  'drag-over': [event: DragEvent, isPast: boolean]
  'drop': [event: DragEvent, dateStr: string, timeKey: string, isPast: boolean]
  'select-scheduled-order': [orderId: string]
  'unschedule': [cellKey: string, orderId: string]
  'start-experiment': []
}>()
</script>

<template>
  <div class="layout-container">
    <div v-if="showStartupCheck" class="modal-overlay">
      <div class="startup-check-modal">
        <h2 class="modal-title">开机检查</h2>
        <div class="check-list-container">
          <div class="check-list">
            <label
              v-for="item in checkItems"
              :key="item.id"
              class="check-item"
              :class="{ 'is-checked': item.checked }"
            >
              <div class="checkbox-wrapper">
                <input type="checkbox" :checked="item.checked" @change="emit('toggle-check', item.id)" />
                <div class="custom-checkbox">
                  <Icon v-if="item.checked" icon="mdi:check" />
                </div>
              </div>
              <span class="check-text">{{ item.text }}</span>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="emit('update:showStartupCheck', false)">取消</button>
          <button class="next-btn" :disabled="!allChecked" @click="emit('startup-check-complete')">
            下一步
          </button>
        </div>
      </div>
    </div>

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
          placeholder="搜索工单号/申请人/设备/类型"
          @input="emit('update:searchKeyword', ($event.target as HTMLInputElement).value)"
        />
        <button v-if="searchKeyword" class="clear-btn" @click="emit('update:searchKeyword', '')">
          <Icon icon="mdi:close" />
        </button>
      </div>

      <div class="table-content">
        <div v-if="unscheduledOrders.length === 0" class="empty-state">
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
                <th>类型</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in unscheduledOrders"
                :key="order.id"
                draggable="true"
                @dragstart="emit('drag-start', $event, order)"
                @dragend="emit('drag-end', $event)"
              >
                <td class="cell-id">{{ order.id }}</td>
                <td class="cell-device" :title="order.device">{{ order.device }}</td>
                <td class="cell-applicant">{{ order.applicant }}</td>
                <td class="cell-param">{{ order.level }} / {{ order.duration }}分</td>
                <td class="cell-type">
                  <span class="type-tag" :class="order.type === '模拟实验' ? 'sim' : 'formal'">
                    {{ order.type }}
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
          <button class="week-cal-nav" @click="emit('prev-week')">‹ 上一周</button>
          <input type="date" class="week-cal-date-input" :value="fmtDate(calBase)" @change="emit('goto-date', $event)" title="跳转到指定日期所在周">
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
          <div
            v-for="day in currentWeekDays"
            :key="day.dateStr"
            class="day-header"
            :class="{ 'is-today': day.isToday }"
          >
            <div class="day-num" :class="{ 'is-weekend': day.isWeekend }">{{ day.month }}/{{ day.dayNum }}</div>
            <div class="day-name">周{{ day.dayName.replace('周', '') }}</div>
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
              @dragover="emit('drag-over', $event, day.isPast)"
              @drop="emit('drop', $event, day.dateStr, slot.key, day.isPast)"
            >
              <div v-if="scheduledOrders[getCellKey(day.dateStr, slot.key)]?.length">
                <div
                  v-for="oid in scheduledOrders[getCellKey(day.dateStr, slot.key)]"
                  :key="oid"
                  class="scheduled-item"
                  :class="[{ 'is-selected': selectedScheduledOrderIds.includes(oid) }, (getOrderById(oid)?.type === '模拟实验' ? 'type-sim' : 'type-formal')]"
                  @click="emit('select-scheduled-order', oid)"
                >
                  <div class="scheduled-content">
                    <span class="device-name">{{ oid }}</span>
                    <button class="remove-btn" @click.stop="emit('unschedule', getCellKey(day.dateStr, slot.key), oid)">
                      <Icon icon="mdi:close" />
                    </button>
                  </div>
                  <div class="scheduled-tag">
                    <template v-if="getOrderById(oid)">
                      {{ getOrderById(oid)?.device }}
                    </template>
                  </div>
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
            <span class="selected-device" v-for="o in selectedScheduledOrders" :key="o.id">{{ o.id }} · {{ o.device }}</span>
          </template>
          <span v-else class="selected-placeholder">请在日历中选择一个已排程的工单</span>
        </div>

        <button class="primary-btn" :disabled="!selectedScheduledOrders.length" @click="emit('start-experiment')">
          <Icon icon="mdi:play" class="start-icon" />
          开始实验
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./vibration.shared.css"></style>
