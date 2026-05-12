<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import DownholeWork from './downhole-work.vue'
import EquipmentPackage from './equipment-package.vue'
import SimulationWellDashboard from './components/SimulationWellDashboard.vue'
import TestReport from './test-report.vue'
import { useSimulationWellSchedule } from './composables/useSimulationWellScheduleV2'
import { useRoute, useRouter } from 'vue-router'
import type { DownholeDevice, SimulationWellView, WorkOrder } from './types'
import SanxinOrderDetailModal from './components/SanxinOrderDetailModal.vue'
import type { SimulatedWellOrderDTO } from '@/services/simulated-well-api'
import { useAuth } from '@/composables/useAuth'
import { createSimulatedWellDownholeWork } from '@/services/simulated-well-downhole-api'

const currentView = ref<SimulationWellView>('dashboard')
const schedule = useSimulationWellSchedule()
const route = useRoute()
const router = useRouter()
const { initAuth, getAuthHeaders } = useAuth()

const sanxinDetailVisible = ref(false)
const sanxinDetailLoading = ref(false)
const sanxinDetailOrder = ref<SimulatedWellOrderDTO | null>(null)
const productPickerVisible = ref(false)
const selectedProductIds = ref<string[]>([])

const selectedOrdersFromSchedule = computed<WorkOrder[]>(() => schedule.selectedStartOrders.value)

const productPickerRows = computed(() => {
  return selectedOrdersFromSchedule.value.flatMap((order) =>
    (order.deviceList || []).map((device) => ({
      id: device.id,
      orderId: order.id,
      customer: order.customer,
      name: device.name,
      sn: device.code || device.sn || '',
      template: device.template || device.code || device.sn || 'DEFAULT_DOWNHOLE_REPORT'
    }))
  )
})

const selectedDevicesFromSchedule = computed<DownholeDevice[]>(() => {
  const selected = new Set(selectedProductIds.value)
  return productPickerRows.value
    .filter((row) => selected.has(row.id))
    .map((row) => ({
      orderId: row.orderId,
      customer: row.customer,
      deviceName: row.name,
      sn: row.sn,
      template: row.template
    }))
})

const selectedDevicesFromRoute = computed<DownholeDevice[]>(() => {
  const raw = route.query.startDevices
  const jsonText = Array.isArray(raw) ? raw[0] : raw
  if (!jsonText) return []
  try {
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(Boolean).map((item: any) => ({
      orderId: String(item.orderId || ''),
      customer: String(item.customer || ''),
      deviceName: String(item.deviceName || ''),
      sn: String(item.sn || ''),
      template: String(item.template || 'DEFAULT_DOWNHOLE_REPORT')
    }))
  } catch {
    return []
  }
})

const startSelectedDevices = computed<DownholeDevice[]>(() => {
  if (selectedDevicesFromSchedule.value.length) return selectedDevicesFromSchedule.value
  return selectedDevicesFromRoute.value
})

const startSelectedOrders = computed<WorkOrder[]>(() => {
  const map = new Map<string, WorkOrder>()
  startSelectedDevices.value.forEach((device, index) => {
    const order = schedule.getWorkOrderById(device.orderId)
    if (!map.has(device.orderId)) {
      map.set(device.orderId, {
        id: device.orderId,
        dbId: order?.dbId,
        customer: device.customer || order?.customer || '-',
        devices: 0,
        status: order?.status || '',
        createTime: order?.createTime || '',
        planTime: order?.planTime || '',
        taskDesc: order?.taskDesc || '',
        deviceList: [],
        supportingTools: order?.supportingTools || []
      })
    }
    const wo = map.get(device.orderId)!
    wo.deviceList.push({
      id: `${device.orderId}::${device.sn || index + 1}`,
      name: device.deviceName,
      sn: device.sn,
      code: device.sn,
      template: device.template || device.sn || 'DEFAULT_DOWNHOLE_REPORT'
    })
    wo.devices = wo.deviceList.length
  })
  return Array.from(map.values())
})

const startDevicesForSave = computed(() => {
  return startSelectedDevices.value
    .map((device) => `${device.orderId}::${device.sn}`)
    .filter(Boolean)
})

watch(
  () => productPickerRows.value.map((row) => row.id).join('|'),
  () => {
    const validIds = new Set(productPickerRows.value.map((row) => row.id))
    selectedProductIds.value = selectedProductIds.value.filter((id) => validIds.has(id))
  }
)

function toggleProductSelection(deviceId: string, checked: boolean) {
  const set = new Set(selectedProductIds.value)
  if (checked) set.add(deviceId)
  else set.delete(deviceId)
  selectedProductIds.value = Array.from(set)
}

function selectAllProducts() {
  selectedProductIds.value = productPickerRows.value.map((row) => row.id)
}

function clearProductSelection() {
  selectedProductIds.value = []
}

function confirmProductSelection() {
  if (selectedDevicesFromSchedule.value.length === 0) {
    ElMessage.warning('请先选择要开始实验的测试产品')
    return
  }
  productPickerVisible.value = false
  router.replace({
    path: '/simulation-well',
    query: {
      view: 'equipment-package',
      startDevices: JSON.stringify(selectedDevicesFromSchedule.value)
    }
  })
}

const normalizeView = (v: unknown): SimulationWellView => {
  if (v === 'downhole-work' || v === 'equipment-package' || v === 'test-report') return v
  return 'dashboard'
}

const syncViewFromRoute = () => {
  const next = normalizeView(route.query.view)
  if (next === 'dashboard') {
    currentView.value = 'dashboard'
    return
  }
  currentView.value = next
}

watch(
  () => route.query.view,
  () => syncViewFromRoute(),
  { immediate: true }
)

watch(
  () => schedule.selectedStartDeviceIds.value.length,
  () => syncViewFromRoute()
)

function handleStartScheduledTest() {
  if (selectedOrdersFromSchedule.value.length === 0) {
    ElMessage.warning('请先在日历中点击选择要开始实验的工单')
    return
  }
  if (selectedProductIds.value.length === 0) selectAllProducts()
  productPickerVisible.value = true
}

function backToDashboard() {
  router.replace({ path: '/simulation-well' })
}

async function handleViewOrderDetail(orderId: string) {
  const order = schedule.getWorkOrderById(orderId)
  const dbId = order?.dbId
  if (!dbId) {
    ElMessage.error('未找到工单ID')
    return
  }
  sanxinDetailVisible.value = true
  sanxinDetailLoading.value = true
  sanxinDetailOrder.value = null
  try {
    const dto = await schedule.fetchOrderDetail(dbId)
    if (!dto) {
      ElMessage.error('获取详情失败')
      return
    }
    sanxinDetailOrder.value = dto
  } finally {
    sanxinDetailLoading.value = false
  }
}

async function handleSaveDownhole(payload: any) {
  try {
    await initAuth()
    const envText = [
      payload?.testEnvironment?.wellDepth ? `井深:${payload.testEnvironment.wellDepth}` : '',
      payload?.testEnvironment?.wellTemperature ? `井温:${payload.testEnvironment.wellTemperature}` : '',
      payload?.testEnvironment?.wellPressure ? `井压:${payload.testEnvironment.wellPressure}` : ''
    ]
      .filter(Boolean)
      .join(' ')
    const mainInterval =
      payload?.testInterval?.mainFrom || payload?.testInterval?.mainTo
        ? `主测井段: ${payload?.testInterval?.mainFrom || '-'}~${payload?.testInterval?.mainTo || '-'}`
        : ''
    const repeatInterval =
      payload?.testInterval?.repeatFrom || payload?.testInterval?.repeatTo
        ? `复测井段: ${payload?.testInterval?.repeatFrom || '-'}~${payload?.testInterval?.repeatTo || '-'}`
        : ''
    const intervalText = [mainInterval, repeatInterval].filter(Boolean).join(' / ')
    const body = {
      well_name: payload?.wellName || '',
      env_text: envText,
      interval_text: intervalText,
      order_ids: payload?.orderIds || [],
      devices: payload?.devices || [],
      supportingTools: payload?.supportingTools || [],
      supporting_tools: payload?.supportingTools || [],
      status: 1,
      report_count: Number(payload?.reportCount ?? payload?.report_count ?? 0) || 0
    }

    const res = await createSimulatedWellDownholeWork(body, getAuthHeaders())
    if (!res.success) {
      ElMessage.error(res.error || '保存下井作业失败')
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '保存下井作业失败')
      return
    }
    schedule.consumeDevices(startDevicesForSave.value)
    await schedule.refreshWorkOrders()
    ElMessage.success('下井作业已保存')
    router.replace({ path: '/simulation-well', query: { view: 'downhole-work' } })
  } catch (e) {
    ElMessage.error('保存下井作业失败')
    throw e
  }
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
      <div class="header-right">
        <button class="week-cal-nav" @click="router.replace({ path: '/simulation-well', query: { view: 'test-report' } })">
          测试报告
        </button>
      </div>
    </div>

    <SimulationWellDashboard
      v-if="currentView === 'dashboard'"
      :search-keyword="schedule.searchKeyword.value"
      :unscheduled-orders="schedule.unscheduledOrders.value"
      :cal-base="schedule.calBase.value"
      :week-label="schedule.weekLabel.value"
      :current-week-days="schedule.currentWeekDays.value"
      :time-slots="schedule.timeSlots.value"
      :scheduled-orders="schedule.scheduledOrders.value"
      :scheduled-orders-tentative="schedule.scheduledOrdersTentative.value"
      :scheduled-layout-items="schedule.scheduledLayoutItems.value"
      :max-lane-count="schedule.maxLaneCount.value"
      :slot-height-px="schedule.slotHeightPx"
      :is-dragging="schedule.isDragging.value"
      :resizing-device-id="schedule.resizingDeviceId.value"
      :is-resizing="schedule.isResizing.value"
      :selected-scheduled-device-ids="schedule.selectedScheduledDeviceIds.value"
      :today-scheduled-order-ids="schedule.todayScheduledOrderIds.value"
      :fmt-date="schedule.fmtDate"
      :get-cell-key="schedule.getCellKey"
      :get-work-order-by-id="schedule.getWorkOrderById"
      :get-device-row="schedule.getDeviceRow"
      @update:search-keyword="schedule.searchKeyword.value = $event"
      @device-drag-start="schedule.handleDeviceDragStart"
      @drag-end="schedule.handleDragEnd"
      @prev-week="schedule.prevWeek"
      @next-week="schedule.nextWeek"
      @goto-date="schedule.gotoDate"
      @load-preset-schedule="schedule.loadPresetSchedule"
      @drag-over="schedule.handleDragOver"
      @drag-leave="schedule.handleDragLeave"
      @drop="schedule.handleDrop"
      @unschedule="schedule.handleUnschedule"
      @unschedule-tentative="schedule.handleUnscheduleTentative"
      @select-scheduled-device="schedule.handleSelectScheduledDevice"
      @start-resize="schedule.startResize"
      @start-resize-top="schedule.startResizeTop"
      @start-scheduled-test="handleStartScheduledTest"
      @view-order-detail="handleViewOrderDetail"
    />

    <div v-if="currentView === 'dashboard' && productPickerVisible" class="product-picker-mask">
      <div class="product-picker-dialog">
        <div class="product-picker-header">
          <div>
            <h3>选择测试产品</h3>
            <p>已排程工单确认开始实验后，在这里选择本次实际下井测试的产品。</p>
          </div>
          <button class="product-picker-close" @click="productPickerVisible = false">×</button>
        </div>
        <div class="product-picker-actions">
          <button class="week-cal-nav" @click="selectAllProducts">全选</button>
          <button class="week-cal-nav" @click="clearProductSelection">清空</button>
          <span>已选择 {{ selectedProductIds.length }} / {{ productPickerRows.length }} 个产品</span>
        </div>
        <div class="product-picker-list">
          <label v-for="row in productPickerRows" :key="row.id" class="product-picker-row">
            <input
              type="checkbox"
              :checked="selectedProductIds.includes(row.id)"
              @change="toggleProductSelection(row.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="product-main">{{ row.name }}</span>
            <span class="product-sub">{{ row.sn || '-' }}</span>
            <span class="product-order">{{ row.orderId }} · {{ row.customer }}</span>
          </label>
        </div>
        <div class="product-picker-footer">
          <button class="week-cal-nav" @click="productPickerVisible = false">取消</button>
          <button class="primary-btn" :disabled="selectedProductIds.length === 0" @click="confirmProductSelection">
            确认开始实验
          </button>
        </div>
      </div>
    </div>

    <SanxinOrderDetailModal
      v-if="currentView === 'dashboard'"
      :visible="sanxinDetailVisible"
      :loading="sanxinDetailLoading"
      :order="sanxinDetailOrder"
      @close="sanxinDetailVisible = false"
    />

    <DownholeWork
      v-else-if="currentView === 'downhole-work'"
      :today-scheduled-orders="startSelectedOrders"
      :downhole-devices="startSelectedDevices"
    />

    <EquipmentPackage
      v-else-if="currentView === 'equipment-package'"
      :today-scheduled-orders="startSelectedOrders"
      :downhole-devices="startSelectedDevices"
      @back="backToDashboard"
      @save="handleSaveDownhole"
    />

    <TestReport
      v-else-if="currentView === 'test-report'"
      :selected-orders="startSelectedOrders"
      :selected-devices="startSelectedDevices"
      @back="backToDashboard"
    />
  </div>
</template>

<style scoped src="./components/simulation-well.shared.css"></style>
