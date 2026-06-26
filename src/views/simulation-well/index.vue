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
import { listSimulatedWellOrders, type SimulatedWellOrderDTO } from '@/services/simulated-well-api'
import { useAuth } from '@/composables/useAuth'
import {
  createSimulatedWellDownholeWork,
  listSimulatedWellDownholeWorks,
  type SimulatedWellDownholeWorkItem
} from '@/services/simulated-well-downhole-api'

const currentView = ref<SimulationWellView>('dashboard')
const schedule = useSimulationWellSchedule()
const route = useRoute()
const router = useRouter()
const { initAuth, validateToken, getAuthHeaders } = useAuth()

const sanxinDetailVisible = ref(false)
const sanxinDetailLoading = ref(false)
const sanxinDetailOrder = ref<SimulatedWellOrderDTO | null>(null)
const productPickerVisible = ref(false)
const selectedProductIds = ref<string[]>([])
const activeTestOperation = ref<SimulatedWellDownholeWorkItem | null>(null)
const activeTestPayload = ref<any>(null)
const activeTestPaused = ref(false)
const activeTestOrdersSnapshot = ref<WorkOrder[]>([])
const activeStartDevicesSnapshot = ref<DownholeDevice[]>([])
const activeTestHydrating = ref(false)

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
        testPurpose: order?.testPurpose || '',
        testSteps: order?.testSteps || '',
        safetyRisks: order?.safetyRisks || '',
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
  activeStartDevicesSnapshot.value = selectedDevicesFromSchedule.value.map((device) => ({ ...device }))
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
  if (v === 'downhole-work' || v === 'equipment-package' || v === 'active-test' || v === 'test-report') return v
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
  () => schedule.selectedStartEventIds.value.length,
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

const activeTestDevices = computed(() => {
  const savedDevices = Array.isArray(activeTestOperation.value?.devices) ? activeTestOperation.value!.devices : []
  if (savedDevices.length) return savedDevices

  const payloadDevices = Array.isArray(activeTestPayload.value?.devices) ? activeTestPayload.value.devices : []
  if (payloadDevices.length) return payloadDevices

  if (activeStartDevicesSnapshot.value.length) return activeStartDevicesSnapshot.value
  if (startSelectedDevices.value.length) return startSelectedDevices.value

  return activeTestOrders.value.flatMap((order) =>
    (order.deviceList || []).map((device) => ({
      ...device,
      orderId: order.id,
      customer: order.customer,
      deviceName: device.name,
      templateName: device.template,
    })),
  )
})

const activeTestOrders = computed(() => {
  if (activeTestOrdersSnapshot.value.length) return activeTestOrdersSnapshot.value
  const ids = Array.isArray(activeTestOperation.value?.order_ids) ? activeTestOperation.value!.order_ids : []
  return ids.map((id: any) => schedule.getWorkOrderById(String(id))).filter(Boolean) as WorkOrder[]
})

function textValue(value: unknown) {
  return String(value ?? '').trim()
}

function readOrderField(order: any, camelKey: string, snakeKey: string) {
  return textValue(order?.[camelKey] || order?.[snakeKey])
}

function mapDtoToWorkOrder(dto: SimulatedWellOrderDTO): WorkOrder {
  return {
    id: textValue(dto.task_number),
    dbId: dto.id,
    customer: textValue(dto.customer_unit || dto.test_unit) || '-',
    devices: Array.isArray(dto.devices) ? dto.devices.length : Number(dto.device_count || dto.quantity || 0),
    status: textValue(dto.status_text || dto.status),
    createTime: textValue(dto.created_at).slice(0, 10),
    planTime: textValue(dto.plan_date || dto.application_date).slice(0, 10),
    taskDesc: textValue(dto.project_name || dto.task_desc),
    testPurpose: textValue(dto.test_purpose),
    testSteps: textValue(dto.test_steps),
    safetyRisks: textValue(dto.safety_risks),
    deviceList: (dto.devices || []).map((device) => ({
      id: `${dto.task_number}::${device.device_number}`,
      dbId: device.id,
      name: textValue(device.device_name) || '-',
      sn: textValue(device.device_number),
      code: textValue(device.device_number),
      template: textValue(device.device_number),
      scheduledStartAt: device.scheduled_start_at || null,
      scheduledEndAt: device.scheduled_end_at || null
    })),
    supportingTools: []
  }
}

const activeTestMainOrder = computed(() =>
  activeTestOrders.value.find((order: any) =>
    readOrderField(order, 'testPurpose', 'test_purpose') ||
    readOrderField(order, 'testSteps', 'test_steps') ||
    readOrderField(order, 'safetyRisks', 'safety_risks')
  ) || activeTestOrders.value[0] || null
)

const activeTestTaskNo = computed(() => textValue(activeTestMainOrder.value?.id))

const activeTestWorkNo = computed(() => {
  return (
    textValue(activeTestOperation.value?.work_no) ||
    textValue((activeTestOperation.value as any)?.workNo) ||
    textValue(route.query.workNo) ||
    textValue(route.query.work_no) ||
    activeTestTaskNo.value
  )
})

const activeTestProjectTitle = computed(() => {
  const titles = activeTestOrders.value
    .map((order) => textValue(order.taskDesc))
    .filter(Boolean)
  return Array.from(new Set(titles)).join(' + ')
})

const activeTestPurpose = computed(() => readOrderField(activeTestMainOrder.value, 'testPurpose', 'test_purpose'))

const activeTestSteps = computed(() => {
  return readOrderField(activeTestMainOrder.value, 'testSteps', 'test_steps')
})

const activeTestSafetyRisks = computed(() => {
  return readOrderField(activeTestMainOrder.value, 'safetyRisks', 'safety_risks')
})

function splitLines(value: string) {
  return String(value || '')
    .split(/[\n；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function selectedSupportTools(device: any) {
  const selected = Array.isArray(device?.selectedSupportingTools) ? device.selectedSupportingTools : []
  if (selected.length) return selected
  const supporting = Array.isArray(device?.supportingTools) ? device.supportingTools : []
  return supporting
}

function formatDeviceSn(device: any) {
  return textValue(device?.sn || device?.deviceNumber || device?.device_number || device?.code)
}

function formatToolSn(tool: any) {
  return textValue(tool?.internalInstrumentSn || tool?.sn || tool?.instrument_sn || tool?.externalInstrumentModel)
}

function activeTestParamRows() {
  const rows: { label: string; value: string }[] = []
  const add = (label: string, value: unknown, unit = '') => {
    const text = textValue(value)
    if (!text) return
    rows.push({ label, value: unit && !text.includes(unit) ? `${text} ${unit}` : text })
  }

  activeTestDevices.value.forEach((device: any) => {
    ;[device, ...selectedSupportTools(device)].forEach((item: any) => {
      add('仪器重量', item?.weight || item?.instrument_weight)
      add('仪器长度', item?.length || item?.instrument_length)
      add('最大外径', item?.maxDiameter || item?.max_diameter)
      add('最大承载', item?.maxLoad || item?.max_load || item?.load)
    })
  })

  return rows.filter((row, index, arr) => arr.findIndex((item) => item.label === row.label && item.value === row.value) === index)
}

function finishActiveTestToReportPrep() {
  activeTestPaused.value = false
  router.replace({ path: '/simulation-well', query: { view: 'test-report' } })
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

async function hydrateActiveTestFromDatabase() {
  if (currentView.value !== 'active-test' || activeTestHydrating.value) return

  const knownIds = new Set<string>()
  const addId = (value: unknown) => {
    const text = textValue(value)
    if (text) knownIds.add(text)
  }

  ;(activeTestPayload.value?.orderIds || []).forEach(addId)
  ;(Array.isArray(activeTestOperation.value?.order_ids) ? activeTestOperation.value?.order_ids : []).forEach(addId)
  activeStartDevicesSnapshot.value.forEach((device) => addId(device.orderId))
  startSelectedDevices.value.forEach((device) => addId(device.orderId))

  activeTestHydrating.value = true
  try {
    await initAuth()
    const headers = getAuthHeaders()
    const workNo = textValue(route.query.workNo || route.query.work_no)

    if (!activeTestOperation.value && workNo) {
      const workRes = await listSimulatedWellDownholeWorks({ page: 1, pageSize: 2000, keyword: workNo }, headers)
      if (workRes.success && workRes.data?.code === 0) {
        const rows = workRes.data.data?.list || []
        const found = rows.find((row) => textValue(row.work_no) === workNo) || rows[0]
        if (found) {
          activeTestOperation.value = found
          ;(Array.isArray(found.order_ids) ? found.order_ids : []).forEach(addId)
          if (!activeStartDevicesSnapshot.value.length && Array.isArray(found.devices)) {
            activeStartDevicesSnapshot.value = found.devices.map((device: any) => ({
              orderId: textValue(device.orderId || device.order_id),
              customer: textValue(device.customer),
              deviceName: textValue(device.deviceName || device.name),
              sn: textValue(device.sn || device.code || device.device_number),
              template: textValue(device.template || device.templateName || device.template_name) || 'DEFAULT_DOWNHOLE_REPORT'
            }))
          }
        }
      }
    }

    if (!knownIds.size) return

    const orders: WorkOrder[] = []
    for (const orderId of knownIds) {
      const res = await listSimulatedWellOrders({ page: 1, pageSize: 20, taskNumber: orderId, includeDevices: true }, headers)
      if (!res.success || res.data?.code !== 0) continue
      const dto = (res.data.data?.list || []).find((item) => textValue(item.task_number) === orderId) || res.data.data?.list?.[0]
      if (dto) orders.push(mapDtoToWorkOrder(dto))
    }

    if (orders.length) {
      activeTestOrdersSnapshot.value = orders
    }
  } finally {
    activeTestHydrating.value = false
  }
}

watch(
  () => [currentView.value, route.query.workNo, route.query.work_no, route.query.startDevices],
  () => {
    void hydrateActiveTestFromDatabase()
  },
  { immediate: true }
)

async function handleSaveDownhole(payload: any) {
  try {
    const authOk = await initAuth()
    const tokenOk = authOk && await validateToken()
    if (!tokenOk) {
      ElMessage.error('登录状态已过期，请重新登录后再保存作业')
      router.replace({ path: '/login', query: { redirect: route.fullPath } })
      return
    }
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
    activeTestOperation.value = res.data.data
    activeTestPayload.value = payload
    activeStartDevicesSnapshot.value = startSelectedDevices.value.map((device) => ({ ...device }))
    activeTestOrdersSnapshot.value = startSelectedOrders.value.map((order) => ({
      ...order,
      deviceList: [...order.deviceList],
    }))
    activeTestPaused.value = false
    schedule.consumeDevices(startDevicesForSave.value)
    await schedule.refreshWorkOrders()
    ElMessage.success('下井作业已保存')
    router.replace({
      path: '/simulation-well',
      query: {
        view: 'test-report',
        autoCreate: '1',
        workNo: res.data.data?.work_no || '',
      },
    })
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
      :resizing-event-id="schedule.resizingEventId.value"
      :is-resizing="schedule.isResizing.value"
      :selected-scheduled-event-ids="schedule.selectedScheduledEventIds.value"
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
      @select-scheduled-event="schedule.handleSelectScheduledEvent"
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

    <div v-else-if="currentView === 'active-test'" class="active-test-view">
      <div class="page-header">
        <div class="header-left">
          <div class="header-icon"><Icon icon="mdi:chart-timeline-variant" /></div>
          <div>
            <h1 class="header-title">进行中的测试 Active Test</h1>
            <p class="header-subtitle">{{ activeTestWorkNo || '已保存下井作业' }}</p>
          </div>
        </div>
        <div class="header-right">
          <button class="week-cal-nav" @click="router.replace({ path: '/simulation-well', query: { view: 'downhole-work' } })">返回作业列表</button>
        </div>
      </div>

      <div class="active-test-grid">
        <div class="active-card">
          <div class="active-card-header">
            <div>
              <div class="active-card-title">仪器组合</div>
              <div class="active-card-subtitle">Instrument Combination</div>
            </div>
            <span class="active-count">{{ activeTestDevices.length }} 个产品</span>
          </div>
          <div v-if="!activeTestDevices.length" class="empty-state"><p>暂无测试产品</p></div>
          <div v-for="device in activeTestDevices" :key="device?.id || device?.sn || device?.deviceName" class="combo-box">
            <div class="combo-head">
              <span class="combo-template">{{ device?.template || 'DEFAULT' }}</span>
              <span>{{ device?.templateName || device?.deviceName || device?.name || '-' }}</span>
            </div>
            <div class="combo-line ok">
              <span>✓ {{ device?.deviceName || device?.name || '-' }}</span>
              <span>{{ formatDeviceSn(device) || '-' }}</span>
            </div>
            <div
              v-for="tool in selectedSupportTools(device)"
              :key="`${tool?.templateInstrumentCode || tool?.code}-${tool?.internalInstrumentSn || tool?.externalInstrumentModel}`"
              class="combo-line support"
            >
              <span>◎ {{ tool?.templateInstrumentName || tool?.zh || tool?.internalInstrumentName || tool?.code || '-' }}</span>
              <span>{{ formatToolSn(tool) || '-' }}</span>
            </div>
          </div>
        </div>

        <div class="active-card">
          <div class="active-card-header">
            <div class="active-order-head">
              <span class="active-order-title">工单号：{{ activeTestWorkNo || '-' }}</span>
              <span v-if="activeTestProjectTitle" class="active-order-subtitle">{{ activeTestProjectTitle }}</span>
            </div>
            <span :class="['active-status', activeTestPaused ? 'paused' : 'running']">
              {{ activeTestPaused ? '测试已暂停' : '测试进行中' }}
            </span>
          </div>
          <div class="active-section">
            <div class="active-label">测试目的</div>
            <div class="active-text">{{ activeTestPurpose || '-' }}</div>
          </div>
          <div class="active-section">
            <div class="active-label">测试步骤</div>
            <ol class="active-list">
              <li v-for="(item, idx) in splitLines(activeTestSteps)" :key="idx">{{ item }}</li>
            </ol>
            <div v-if="!splitLines(activeTestSteps).length" class="active-text">-</div>
          </div>
          <div class="active-section">
            <div class="active-label warning">安全风险</div>
            <div class="risk-box">{{ activeTestSafetyRisks || '-' }}</div>
          </div>
          <div v-if="activeTestParamRows().length" class="active-section">
            <div class="active-label">测试数据（预设参数）</div>
            <div class="active-params">
              <div v-for="row in activeTestParamRows()" :key="`${row.label}-${row.value}`" class="param-chip">
                <span>{{ row.label }}</span>
                <strong>{{ row.value }}</strong>
              </div>
            </div>
          </div>
          <div class="active-params">
            <div class="param-chip inline">测试环境：{{ activeTestOperation?.env_text || '-' }}</div>
            <div class="param-chip inline">测试井段：{{ activeTestOperation?.interval_text || '-' }}</div>
          </div>
        </div>
      </div>

      <div class="active-actions-bar">
        <button class="active-action-btn warning" @click="activeTestPaused = !activeTestPaused">
          <Icon :icon="activeTestPaused ? 'mdi:play-outline' : 'mdi:pause'" />
          {{ activeTestPaused ? '继续测试' : '测试暂停' }}
        </button>
        <button class="active-action-btn danger" @click="router.replace({ path: '/simulation-well', query: { view: 'downhole-work' } })">
          <Icon icon="mdi:stop-circle-outline" />
          测试中止
        </button>
        <button class="active-action-btn primary" @click="finishActiveTestToReportPrep">
          <Icon icon="mdi:check-circle-outline" />
          测试完成，前往报告准备
          <Icon icon="mdi:arrow-right" />
        </button>
      </div>
    </div>

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
      :auto-create-report="route.query.autoCreate === '1'"
      :auto-work-no="String(route.query.workNo || route.query.work_no || '')"
      @back="backToDashboard"
    />
  </div>
</template>

<style scoped src="./components/simulation-well.shared.css"></style>
<style scoped>
.active-test-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.active-test-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.active-card {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}

.active-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
}

.active-card-title {
  color: var(--color-text-primary);
  font-size: 15px;
  font-weight: 700;
}

.active-card-subtitle {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.active-count {
  padding: 4px 10px;
  border: 1px solid rgba(59, 130, 246, 0.24);
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.08);
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.combo-box {
  overflow: hidden;
  margin-bottom: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
}

.combo-head {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.86);
  color: var(--color-text-secondary);
  font-size: 13px;
  border-bottom: 1px solid var(--color-border);
}

.combo-template {
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
  font-size: 12px;
  font-weight: 700;
}

.combo-line {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 12px;
  color: var(--color-text-primary);
  font-size: 13px;
}

.combo-line.ok {
  color: #047857;
}

.combo-line.support {
  border-top: 1px dashed var(--color-border);
  color: var(--color-text-secondary);
}

.active-status {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.active-status.running {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.active-status.paused {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.active-order-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.active-task-tag {
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.active-order-title {
  color: #0f172a;
  font-weight: 700;
}

.active-order-subtitle {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.active-section {
  padding: 12px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.72);
}

.active-section:last-of-type {
  border-bottom: none;
}

.active-label {
  margin-bottom: 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.active-label.warning {
  color: #b45309;
}

.active-text,
.active-list {
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.8;
}

.active-list {
  padding-left: 20px;
  margin: 0;
}

.risk-box {
  padding: 10px 12px;
  border-left: 3px solid #f59e0b;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.08);
  color: #b45309;
  font-size: 13px;
}

.active-params {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.param-chip {
  display: flex;
  min-width: 120px;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: 12px;
}

.param-chip strong {
  color: var(--color-text-primary);
  font-size: 13px;
}

.param-chip.inline {
  min-width: 0;
  flex-direction: row;
}

.active-actions-bar {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.active-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}

.active-action-btn:hover {
  border-color: #93c5fd;
  color: #2563eb;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.12);
}

.active-action-btn.warning {
  border-color: rgba(245, 158, 11, 0.35);
  color: #b45309;
}

.active-action-btn.warning:hover {
  border-color: #f59e0b;
  color: #92400e;
}

.active-action-btn.danger {
  border-color: rgba(244, 63, 94, 0.3);
  color: #e11d48;
}

.active-action-btn.danger:hover {
  border-color: #fb7185;
  color: #be123c;
}

.active-action-btn.primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
  min-width: 220px;
}

.active-action-btn.primary:hover {
  border-color: #1d4ed8;
  background: #1d4ed8;
  color: #fff;
}

@media (max-width: 980px) {
  .active-test-grid {
    grid-template-columns: 1fr;
  }

  .active-actions-bar {
    flex-wrap: wrap;
  }
}
</style>
