<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ElDialog, ElMessage, ElMessageBox } from 'element-plus'
import EquipmentPackage from './equipment-package.vue'
import { useAuth } from '@/composables/useAuth'
import {
  createSimulatedWellDownholeWork,
  getSimulatedWellDownholeWorkDetail,
  deleteSimulatedWellDownholeWork,
  listSimulatedWellDownholeWorks,
  updateSimulatedWellDownholeWork,
  buildSimulatedWellDownholeWorkPayload,
  formatSimulatedWellEnvironment,
  formatSimulatedWellInterval,
  type SimulatedWellDownholeWorkItem
} from '@/services/simulated-well-downhole-api'

defineProps<{
  todayScheduledOrders: any[]
  downholeDevices: any[]
}>()

const { initAuth, getAuthHeaders } = useAuth()
const loading = ref(false)
const list = ref<SimulatedWellDownholeWorkItem[]>([])
const keyword = ref('')
const createMode = ref(false)
const editMode = ref(false)
const editSaving = ref(false)
const editingRow = ref<SimulatedWellDownholeWorkItem | null>(null)
const editOrders = ref<any[]>([])
const editDevices = ref<any[]>([])
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailRow = ref<SimulatedWellDownholeWorkItem | null>(null)

const fetchList = async () => {
  loading.value = true
  try {
    await initAuth()
    const res = await listSimulatedWellDownholeWorks(
      { page: 1, pageSize: 2000, keyword: keyword.value.trim() || undefined },
      getAuthHeaders()
    )
    if (!res.success) {
      ElMessage.error(res.error || '获取下井作业失败')
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '获取下井作业失败')
      return
    }
    list.value = res.data.data?.list || []
  } finally {
    loading.value = false
  }
}

const handleSave = async (payload: any) => {
  try {
    await initAuth()
    const body = buildSimulatedWellDownholeWorkPayload(payload, {
      status: 0,
      reportCount: payload?.reportCount ?? payload?.report_count
    })
    const res = await createSimulatedWellDownholeWork(body, getAuthHeaders())
    if (!res.success) {
      ElMessage.error(res.error || '新增下井作业失败')
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '新增下井作业失败')
      return
    }
    ElMessage.success('已新增下井作业')
    createMode.value = false
    await fetchList()
  } catch (e) {
    ElMessage.error('新增下井作业失败')
    throw e
  }
}

const handleDelete = async (row: SimulatedWellDownholeWorkItem) => {
  try {
    await ElMessageBox.confirm(`确认删除作业「${row.work_no}」吗？`, '确认删除', { type: 'warning' })
  } catch {
    return
  }
  await initAuth()
  const res = await deleteSimulatedWellDownholeWork(row.id, getAuthHeaders())
  if (!res.success) {
    ElMessage.error(res.error || '删除失败')
    return
  }
  if (res.data?.code !== 0) {
    ElMessage.error(res.data?.msg || '删除失败')
    return
  }
  ElMessage.success('已删除')
  await fetchList()
}

const getStatusLabel = (row: SimulatedWellDownholeWorkItem) => {
  return row.status_text || (row.status === 2 ? '已完成' : row.status === 1 ? '进行中' : '已创建')
}

const getStatusClass = (row: SimulatedWellDownholeWorkItem) => {
  if (row.status === 2) return 'status-pill done'
  if (row.status === 1) return 'status-pill running'
  return 'status-pill created'
}

const formatReportCount = (n: any) => {
  const v = typeof n === 'number' ? n : Number(n || 0)
  if (!Number.isFinite(v)) return '0份报告'
  return `${v}份报告`
}

const canDelete = (row: SimulatedWellDownholeWorkItem) => {
  const n = row.report_count ?? 0
  return Number(n || 0) <= 0
}

const normalizeTextList = (value: any): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    } catch {}
    return text
      .split(/[\n,，;；]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const normalizeArray = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

const normalizeOrderType = (value: unknown): 0 | 1 => (Number(value) === 1 ? 1 : 0)

const normalizeDeviceTools = (device: any) => {
  const tools = normalizeArray(
    device?.selectedSupportingTools ?? device?.selected_supporting_tools ?? device?.supportingTools ?? device?.support_tools,
  )
  return tools
    .map((item: any) => {
      if (typeof item === 'string') {
        return {
          code: '',
          zh: item.trim(),
          en: '',
          internalInstrumentId: undefined,
          internalInstrumentSn: '',
          internalInstrumentName: '',
          externalInstrumentModel: '',
          modelNumber: '',
          usedCount: undefined,
          remainCount: undefined
        }
      }
      return {
        code: String(item?.templateInstrumentCode || item?.code || item?.modelNumber || '').trim(),
        zh: String(item?.templateInstrumentName || item?.zh || item?.nameCN || item?.name || '').trim(),
        en: String(item?.en || item?.nameEN || '').trim(),
        internalInstrumentId: item?.internalInstrumentId,
        internalInstrumentSn: String(item?.internalInstrumentSn || '').trim(),
        internalInstrumentName: String(item?.internalInstrumentName || '').trim(),
        externalInstrumentModel: String(item?.externalInstrumentModel || item?.externalInstrument_model || '').trim(),
        modelNumber: String(item?.modelNumber || item?.model_number || item?.code || '').trim(),
        usedCount: item?.usedCount ?? item?.used_count,
        remainCount: item?.remainCount ?? item?.remain_count
      }
    })
    .filter((item: any) => item.code || item.zh || item.en || item.internalInstrumentSn || item.externalInstrumentModel)
}

const formatDetailTool = (tool: any) => {
  const templateText = [tool.code, tool.zh || tool.en].filter(Boolean).join(' ')
  const internalText = [tool.internalInstrumentSn, tool.internalInstrumentName].filter(Boolean).join(' ')
  const remainText =
    tool.remainCount !== undefined && tool.remainCount !== null && `${tool.remainCount}` !== ''
      ? `剩余 ${tool.remainCount} 次`
      : ''
  const externalText = tool.externalInstrumentModel ? `外部型号 ${tool.externalInstrumentModel}` : ''
  return [templateText, internalText ? `SN ${internalText}` : '', externalText, remainText].filter(Boolean).join(' / ')
}

const detailOrderList = computed(() => normalizeTextList(detailRow.value?.order_ids))
const detailDeviceList = computed(() => normalizeArray(detailRow.value?.devices))
const getDeviceName = (device: any) => device?.deviceName || device?.name || device?.label || '-'
const getDeviceSn = (device: any) => device?.sn || device?.code || device?.device_number || '-'

const buildEditOrdersAndDevices = (row: SimulatedWellDownholeWorkItem) => {
  const orders = new Map<string, any>()
  const orderIds = normalizeTextList(row.order_ids)
  const allSupportingTools = normalizeArray(row.supportingTools ?? row.supporting_tools)
  orderIds.forEach((orderId) => {
    orders.set(orderId, {
      id: orderId,
      customer: '-',
      orderType: normalizeOrderType((row as any).orderType ?? row.order_type),
      devices: 0,
      status: '',
      createTime: '',
      planTime: '',
      taskDesc: '',
      deviceList: [],
    })
  })
  const devices = normalizeArray(row.devices).map((device: any, index: number) => {
    const orderId = String(device?.orderId || device?.order_id || orderIds[0] || '')
    const customer = String(device?.customer || '')
    const orderType = normalizeOrderType(device?.orderType ?? device?.order_type ?? (row as any).orderType ?? row.order_type)
    if (orderId && !orders.has(orderId)) {
      orders.set(orderId, {
        id: orderId,
        customer: customer || '-',
        orderType,
        devices: 0,
        status: '',
        createTime: '',
        planTime: '',
        taskDesc: '',
        deviceList: []
      })
    }
    const globalTools = allSupportingTools.filter((tool: any) => {
      const toolOrderId = String(tool?.orderId || tool?.order_id || '')
      const sourceName = String(tool?.sourceDeviceName || tool?.source_device_name || '')
      return toolOrderId === orderId && (!sourceName || sourceName === getDeviceName(device))
    })
    const selectedTools = normalizeDeviceTools(device).length ? normalizeDeviceTools(device) : globalTools
    const availableTools = normalizeArray(device?.availableSupportingTools ?? device?.available_supporting_tools)
    const normalizedAvailableTools = availableTools.length ? availableTools : selectedTools
    const normalizedDevice = {
      id: device?.id || `${orderId}::${getDeviceSn(device) || index + 1}`,
      orderId,
      orderDbId: device?.orderDbId ?? device?.order_db_id,
      deviceDbId: device?.deviceDbId ?? device?.device_db_id,
      customer,
      deviceName: getDeviceName(device),
      name: getDeviceName(device),
      sn: getDeviceSn(device),
      code: device?.code || device?.sn || '',
      template: device?.template || '',
      templateName: device?.templateName || device?.template_name || '',
      orderType,
      supportingTools: selectedTools,
      selectedSupportingTools: selectedTools,
      availableSupportingTools: normalizedAvailableTools,
    }
    const order = orders.get(orderId)
    if (order) {
      order.orderType = orderType
      order.orderDbId = normalizedDevice.orderDbId
      if (customer) order.customer = customer
      order.deviceList.push({
        id: normalizedDevice.id,
        dbId: normalizedDevice.deviceDbId,
        name: normalizedDevice.name,
        sn: normalizedDevice.sn,
        code: normalizedDevice.code,
        template: normalizedDevice.template
      })
      order.devices = order.deviceList.length
    }
    return normalizedDevice
  })
  return { orders: Array.from(orders.values()), devices }
}

const handleView = async (row: SimulatedWellDownholeWorkItem) => {
  detailVisible.value = true
  detailLoading.value = true
  detailRow.value = null
  try {
    await initAuth()
    const res = await getSimulatedWellDownholeWorkDetail(row.id, getAuthHeaders())
    if (!res.success) {
      ElMessage.error(res.error || '获取下井作业详情失败')
      detailVisible.value = false
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '获取下井作业详情失败')
      detailVisible.value = false
      return
    }
    detailRow.value = res.data.data || null
  } finally {
    detailLoading.value = false
  }
}

const handleEdit = async (row: SimulatedWellDownholeWorkItem) => {
  await initAuth()
  const res = await getSimulatedWellDownholeWorkDetail(row.id, getAuthHeaders())
  if (!res.success || res.data?.code !== 0 || !res.data.data) {
    ElMessage.error(res.error || res.data?.msg || '获取下井作业详情失败')
    return
  }
  editingRow.value = res.data.data
  const built = buildEditOrdersAndDevices(res.data.data)
  editOrders.value = built.orders
  editDevices.value = built.devices
  editMode.value = true
}

const handleEditSaveV3 = async (payload: any) => {
  if (!editingRow.value || editSaving.value) return
  editSaving.value = true
  try {
    await initAuth()
    const editedId = editingRow.value.id
    const editedWorkNo = editingRow.value.work_no
    const body = buildSimulatedWellDownholeWorkPayload(payload, {
      status: editingRow.value.status,
      reportCount: payload?.reportCount ?? editingRow.value.report_count
    })
    const res = await updateSimulatedWellDownholeWork(editedId, body, getAuthHeaders())
    if (!res.success || res.data?.code !== 0) {
      ElMessage.error(res.error || res.data?.msg || '编辑下井作业失败')
      return
    }
    const returnedId = res.data?.data?.id
    if (returnedId !== undefined && Number(returnedId) !== Number(editedId)) {
      ElMessage.error('编辑保存返回了新的下井作业记录，已拦截为异常结果，请继续检查后端更新接口')
      return
    }
    await fetchList()
    const duplicateRows = list.value.filter((item) => item.work_no === editedWorkNo && Number(item.id) !== Number(editedId))
    const removableDuplicates = duplicateRows.filter((item) => canDelete(item))
    for (const row of removableDuplicates) {
      await deleteSimulatedWellDownholeWork(row.id, getAuthHeaders())
    }
    if (removableDuplicates.length > 0) {
      await fetchList()
    }
    if (duplicateRows.length > removableDuplicates.length) {
      ElMessage.warning('编辑已完成，但发现部分重复作业无法自动清理，请继续检查后端更新逻辑')
      return
    }
    ElMessage.success(removableDuplicates.length > 0 ? '下井作业已更新，已清理重复记录' : '下井作业已更新')
    editMode.value = false
    editingRow.value = null
  } finally {
    editSaving.value = false
  }
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <EquipmentPackage
    v-if="createMode"
    :today-scheduled-orders="todayScheduledOrders"
    :downhole-devices="downholeDevices"
    @back="createMode = false"
    @save="handleSave"
  />

  <EquipmentPackage
    v-else-if="editMode"
    mode="edit"
    :initial-work="editingRow"
    :today-scheduled-orders="editOrders"
    :downhole-devices="editDevices"
    @back="editMode = false"
    @save="handleEditSaveV3"
  />

  <div v-else class="downhole-view">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:oil" /></div>
        <div>
          <h1 class="header-title">下井作业</h1>
          <p class="header-subtitle">下井作业记录列表</p>
        </div>
      </div>
    </div>

    <div class="downhole-content">
      <div class="downhole-card">
        <div class="section-header-row list-toolbar">
          <div class="search-box inline downhole-search">
            <Icon icon="mdi:magnify" class="search-icon" />
            <input
              :value="keyword"
              placeholder="搜索作业ID/井名称"
              @input="keyword = ($event.target as HTMLInputElement).value"
            />
            <button class="week-cal-nav primary search-action" @click="fetchList">查询</button>
          </div>
        </div>

        <div v-if="loading" class="empty-state"><p>加载中...</p></div>
        <div v-else class="table-wrapper">
          <table class="data-table downhole-work-table">
            <colgroup>
              <col class="col-work-id" />
              <col class="col-well-name" />
              <col class="col-environment" />
              <col class="col-interval" />
              <col class="col-device-count" />
              <col class="col-status" />
              <col class="col-report-count" />
              <col class="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>作业ID</th>
                <th>井名称</th>
                <th>测试环境</th>
                <th>测试井段</th>
                <th>设备数量</th>
                <th>状态</th>
                <th>报告数量</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!list.length">
                <td colspan="8">
                  <div class="empty-state"><p>暂无下井作业</p></div>
                </td>
              </tr>
              <tr v-for="row in list" :key="row.id">
                <td class="cell-id">{{ row.work_no }}</td>
                <td>{{ row.well_name || '-' }}</td>
                <td>{{ formatSimulatedWellEnvironment((row as any).env_text ?? (row as any).test_environment) }}</td>
                <td>{{ formatSimulatedWellInterval((row as any).interval_text ?? (row as any).test_interval) }}</td>
                <td style="text-align: center">{{ row.device_count || 0 }}</td>
                <td style="text-align: center">
                  <span :class="getStatusClass(row)">{{ getStatusLabel(row) }}</span>
                </td>
                <td style="text-align: center">{{ formatReportCount(row.report_count) }}</td>
                <td style="text-align: center">
                  <div class="op-actions">
                    <button class="op-btn view" @click="handleView(row)">查看</button>
                    <button class="op-btn edit" @click="handleEdit(row)">编辑</button>
                    <button class="op-btn delete" :disabled="!canDelete(row)" @click="handleDelete(row)">
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <ElDialog v-model="detailVisible" title="下井作业详情" width="980px" destroy-on-close>
      <div v-loading="detailLoading" class="downhole-detail">
        <template v-if="detailRow">
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">作业ID</span>
              <span class="detail-value">{{ detailRow.work_no || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">井名称</span>
              <span class="detail-value">{{ detailRow.well_name || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">测试设备</span>
              <span class="detail-value">{{ detailRow.testing_device || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">测试目的</span>
              <span class="detail-value">{{ detailRow.test_objective || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">测试类型</span>
              <span class="detail-value">{{ detailRow.test_type || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">测试次数</span>
              <span class="detail-value">{{ detailRow.test_count || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">维修工单编号</span>
              <span class="detail-value">{{ detailRow.repair_order_number || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">测试环境</span>
              <span class="detail-value">{{ formatSimulatedWellEnvironment((detailRow as any).env_text ?? (detailRow as any).test_environment) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">测试井段</span>
              <span class="detail-value">{{ formatSimulatedWellInterval((detailRow as any).interval_text ?? (detailRow as any).test_interval) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">状态</span>
              <span class="detail-value">{{ getStatusLabel(detailRow) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">报告数量</span>
              <span class="detail-value">{{ formatReportCount(detailRow.report_count) }}</span>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">关联工单</div>
            <div v-if="detailOrderList.length" class="detail-chip-list">
              <span v-for="orderId in detailOrderList" :key="orderId" class="detail-chip">{{ orderId }}</span>
            </div>
            <div v-else class="detail-empty">暂无关联工单</div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">测试产品</div>
            <div v-if="detailDeviceList.length" class="detail-device-list">
              <div v-for="(device, index) in detailDeviceList" :key="device?.id || `${device?.name}-${index}`" class="detail-device-card">
                <div class="detail-device-head">
                  <div class="detail-device-title">{{ getDeviceName(device) }}</div>
                  <div class="detail-device-sn">{{ getDeviceSn(device) }}</div>
                </div>
                <div class="detail-device-meta">
                  <span>模板编号：{{ device?.template || '-' }}</span>
                  <span>模板名称：{{ device?.templateName || device?.template_name || '-' }}</span>
                </div>
                <div class="detail-device-tools">
                  <span class="detail-sub-label">配接仪器</span>
                  <div v-if="normalizeDeviceTools(device).length" class="detail-chip-list">
                    <span
                      v-for="tool in normalizeDeviceTools(device)"
                      :key="`${tool.code}-${tool.zh}-${tool.en}-${tool.internalInstrumentSn}`"
                      class="detail-chip"
                    >
                      {{ formatDetailTool(tool) }}
                    </span>
                  </div>
                  <div v-else class="detail-empty">暂无配接仪器</div>
                </div>
              </div>
            </div>
            <div v-else class="detail-empty">暂无测试产品</div>
          </div>
        </template>
        <div v-else class="detail-empty">暂无详情数据</div>
      </div>
    </ElDialog>
  </div>
</template>

<style scoped src="./components/simulation-well.shared.css"></style>
<style scoped>
.downhole-view .table-wrapper {
  overflow-x: auto;
}

.downhole-work-table {
  min-width: 1180px;
  table-layout: fixed;
}

.downhole-work-table .col-work-id,
.downhole-work-table .col-well-name {
  width: 7%;
}

.downhole-work-table .col-environment {
  width: 17%;
}

.downhole-work-table .col-interval {
  width: 26%;
}

.downhole-work-table .col-device-count {
  width: 7%;
}

.downhole-work-table .col-status {
  width: 9%;
}

.downhole-work-table .col-report-count {
  width: 10%;
}

.downhole-work-table .col-actions {
  width: 17%;
}

.downhole-detail {
  min-height: 220px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
  margin-bottom: 18px;
}

.detail-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
}

.detail-label {
  min-width: 72px;
  color: #64748b;
}

.detail-value {
  color: #0f172a;
  word-break: break-all;
}

.detail-section {
  margin-top: 18px;
}

.detail-section-title {
  margin-bottom: 10px;
  font-weight: 600;
  color: #0f172a;
}

.detail-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
}

.detail-device-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-device-card {
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.detail-device-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.detail-device-title {
  font-weight: 600;
  color: #0f172a;
}

.detail-device-sn {
  color: #64748b;
  font-size: 12px;
}

.detail-device-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 10px;
  color: #475569;
  font-size: 13px;
}

.detail-device-tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-sub-label {
  color: #64748b;
  font-size: 13px;
}

.detail-empty {
  color: #94a3b8;
  font-size: 13px;
}
</style>
