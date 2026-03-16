<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { ScheduledSelection, TimeSlotItem, WeekDayItem, WorkOrder } from '../types'

defineProps<{
  unscheduledOrders: WorkOrder[]
  searchKeyword: string
  calBase: Date
  weekLabel: string
  currentWeekDays: WeekDayItem[]
  timeSlots: TimeSlotItem[]
  scheduledOrders: Record<string, string[]>
  selectedScheduledOrderIds: string[]
  selectedScheduledOrders: ScheduledSelection[]
  fmtDate: (d: Date) => string
  getCellKey: (dateStr: string, timeKey: string) => string
  getInstrumentById: (id: string) => { id: string; label: string; sn: string } | null
  getOrderByInstrumentId: (id: string) => WorkOrder | undefined
}>()

const emit = defineEmits<{
  'update:searchKeyword': [value: string]
  'instrument-drag-start': [event: DragEvent, instrument: { id: string; label: string; sn: string }]
  'drag-end': [event: DragEvent]
  'prev-week': []
  'next-week': []
  'goto-date': [event: Event]
  'load-preset-schedule': []
  'drag-over': [event: DragEvent, isPast: boolean]
  'drag-leave': [event: DragEvent]
  'drop': [event: DragEvent, dateStr: string, timeKey: string, isPast: boolean]
  'select-scheduled-order': [orderId: string]
  unschedule: [cellKey: string, orderId: string]
  'start-scheduled-test': []
}>()
</script>

<template>
  <div class="panel active">
    <div class="schedule-wrap">
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
            placeholder="搜索工单号/设备/申请人"
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
                  <th>器皿类型</th>
                  <th>申请人</th>
                  <th>状态</th>
                  <th>展开</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="order in unscheduledOrders" :key="order.id">
                  <tr @click="order.expanded = !order.expanded">
                    <td class="cell-id">{{ order.no }}</td>
                    <td class="cell-type" :title="order.type">{{ order.type }}</td>
                    <td class="cell-applicant">{{ order.applicant }}</td>
                    <td><span class="status-tag status-pending">待排程</span></td>
                    <td class="cell-expand">
                      <Icon :icon="order.expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
                    </td>
                  </tr>
                  <tr v-if="order.expanded" :key="order.id + '-expanded'">
                    <td class="expanded-cell" colspan="5">
                      <div class="instrument-list">
                        <div
                          v-for="item in order.items"
                          :key="item.id"
                          class="instrument-item"
                          draggable="true"
                          @dragstart="emit('instrument-drag-start', $event, item)"
                          @dragend="emit('drag-end', $event)"
                        >
                          <span>{{ item.label }}</span>
                          <span class="instrument-sn">{{ item.sn }}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="main-content">
        <div class="panel-header">
          <div class="week-cal-toolbar">
            <button class="week-cal-nav" @click="emit('prev-week')">‹ 上一周</button>
            <input
              type="date"
              class="week-cal-date-input"
              :value="fmtDate(calBase)"
              @change="emit('goto-date', $event)"
              title="跳转到指定日期所在周"
            />
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
                @dragleave="emit('drag-leave', $event)"
                @drop.capture="emit('drop', $event, day.dateStr, slot.key, day.isPast)"
              >
                <div
                  v-if="scheduledOrders[getCellKey(day.dateStr, slot.key)]?.length"
                  style="display: flex; flex-direction: column; gap: 4px; width: 100%"
                >
                  <div
                    v-for="oid in scheduledOrders[getCellKey(day.dateStr, slot.key)]"
                    :key="oid"
                    class="scheduled-item"
                    :class="{ 'is-selected': selectedScheduledOrderIds.includes(oid) }"
                    @click.stop="emit('select-scheduled-order', oid)"
                  >
                    <div class="scheduled-content">
                      <span class="device-name">{{ getInstrumentById(oid)?.label }}</span>
                      <button class="remove-btn" @click.stop="emit('unschedule', getCellKey(day.dateStr, slot.key), oid)">
                        <Icon icon="mdi:close" />
                      </button>
                    </div>
                    <div class="scheduled-tag">{{ getInstrumentById(oid)?.sn }} · {{ getOrderByInstrumentId(oid)?.no }}</div>
                  </div>
                </div>
                <div v-else class="empty-slot-hint">+</div>
              </div>
            </div>
          </div>
        </div>

        <div class="control-center">
          <div class="control-center-left">
            <template v-if="selectedScheduledOrders.length > 0">
              <div class="selected-order">
                <Icon icon="mdi:check" class="selected-icon" />
                <span class="selected-label">已选中工单: {{ selectedScheduledOrders.length }} 个</span>
              </div>
              <span class="selected-divider">|</span>
              <span v-for="o in selectedScheduledOrders" :key="o.instrument.id" class="selected-device">
                {{ o.order.no }} · {{ o.instrument.label }}
              </span>
            </template>
            <span v-else class="selected-placeholder">请在日历中选择已排程的工单</span>
          </div>

          <button class="primary-btn" :disabled="selectedScheduledOrders.length === 0" @click="emit('start-scheduled-test')">
            <Icon icon="mdi:play" class="start-icon" />
            开始实验
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
