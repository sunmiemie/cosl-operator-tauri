<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import {
  createSimulatedWellReport,
  deleteSimulatedWellReport,
  listSimulatedWellReports,
  type SimulatedWellReportItem
} from '@/services/simulated-well-report-api'
import {
  getSimulatedWellReportTemplateDetail,
  listSimulatedWellReportTemplates,
  type SimulatedWellReportTemplateDetail,
  type SimulatedWellReportTemplateListItem
} from '@/services/simulated-well-report-template-api'
import {
  listSimulatedWellDownholeWorks,
  updateSimulatedWellDownholeWork,
  type SimulatedWellDownholeWorkItem
} from '@/services/simulated-well-downhole-api'
import extractedFields from './extracted_fields.json'

defineProps<{
  selectedOrders: any[]
  selectedDevices: any[]
}>()

const emit = defineEmits<{
  back: []
}>()

type Mode = 'list' | 'select-operation' | 'add-report'

type ReportMeta = Record<string, any>
type ReportOperationDevice = {
  id: string
  orderId: string
  customer: string
  deviceName: string
  sn: string
  template: string
}

const COMPOUND_TYPES = ['depth-group', 'range-radio', 'multi-input-row', 'sampling-group', 'card-group']
const REPORT_STATUS_MAP: Record<number, string> = {
  0: '待审核',
  1: '已审核通过',
  2: '审核未通过'
}

const mode = ref<Mode>('list')
const loading = ref(false)
const operationLoading = ref(false)
const templateLoading = ref(false)
const saving = ref(false)
const reportKeyword = ref('')
const reports = ref<SimulatedWellReportItem[]>([])
const operations = ref<SimulatedWellDownholeWorkItem[]>([])
const selectedOperation = ref<SimulatedWellDownholeWorkItem | null>(null)
const selectedDevice = ref<ReportOperationDevice | null>(null)
const selectedTemplate = ref<SimulatedWellReportTemplateDetail | null>(null)
const templateCatalog = ref<SimulatedWellReportTemplateListItem[]>([])
const templateMessage = ref('')
const previewReport = ref<(SimulatedWellReportItem & { meta: ReportMeta }) | null>(null)

const operationDate = ref(new Date().toISOString().slice(0, 10))
const evaluator = ref('')
const conclusion = ref<'qualified' | 'unqualified'>('qualified')
const note = ref('')
const pdfFiles = ref<File[]>([])
const rawFiles = ref<File[]>([])
const testItemValues = reactive<Record<string, any>>({})
const evaluationValues = reactive<Record<string, any>>({})

const { initAuth, getAuthHeaders, userInfo } = useAuth()

function normalizeCode(value: unknown) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function reportDeviceKey(workNo: unknown, sn: unknown) {
  const w = normalizeCode(workNo)
  const s = normalizeCode(sn)
  if (!w || !s) return ''
  return `${w}::${s}`
}

function statusText(value: number | undefined, fallback?: string) {
  return fallback || REPORT_STATUS_MAP[value ?? 0] || '待审核'
}

function safeParseRemark(remark: unknown): ReportMeta {
  if (!remark || typeof remark !== 'string') return {}
  try {
    const parsed = JSON.parse(remark)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return { rawRemark: remark }
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 19)
}

function getCurrentUserName() {
  return userInfo.value?.nickName || userInfo.value?.username || '当前操作人'
}

function getFieldLabel(field: any, fallback: string) {
  return field?.nameCN || field?.name || field?.label || field?.zh || field?.title || field?.code || fallback
}

function getFieldLabelEn(field: any) {
  return field?.nameEN || field?.en || field?.titleEN || ''
}

function getFieldType(field: any) {
  return field?.type || 'radio'
}

function fieldKey(prefix: string, index: number, suffix = '') {
  return `${prefix}_${index}${suffix ? `_${suffix}` : ''}`
}

function clearReactiveMap(target: Record<string, any>) {
  Object.keys(target).forEach((key) => delete target[key])
}

function resetReportForm() {
  operationDate.value = new Date().toISOString().slice(0, 10)
  evaluator.value = ''
  conclusion.value = 'qualified'
  note.value = ''
  pdfFiles.value = []
  rawFiles.value = []
  clearReactiveMap(testItemValues)
  clearReactiveMap(evaluationValues)
}

function resetSelection() {
  selectedOperation.value = null
  selectedDevice.value = null
  selectedTemplate.value = null
  templateMessage.value = ''
  resetReportForm()
}

function buildOperationDevices(work: SimulatedWellDownholeWorkItem | null): ReportOperationDevice[] {
  const devices = Array.isArray(work?.devices) ? work!.devices : []
  return devices.map((device: any, index: number) => ({
    id: `${work?.work_no || 'work'}_${device?.sn || device?.code || index + 1}`,
    orderId: String(device?.orderId || device?.order_id || ''),
    customer: String(device?.customer || ''),
    deviceName: String(device?.deviceName || device?.device_name || device?.name || '-'),
    sn: String(device?.sn || device?.code || device?.device_number || ''),
    template: String(device?.template || '')
  }))
}

const reportRows = computed(() =>
  reports.value
    .map((report) => {
      const meta = safeParseRemark(report.remark)
      return {
        ...report,
        meta,
        reportName: meta.report_name || meta.template_code || report.report_no,
        deviceName: meta.device_name || '-',
        operatorName: report.tester || '-',
        evaluatorName: meta.evaluator || '-',
        statusLabel: statusText(report.status, report.status_text),
        statusClass: report.status === 1 ? 'approved' : report.status === 2 ? 'rejected' : 'pending'
      }
    })
    .filter((row) => {
      const kw = reportKeyword.value.trim()
      if (!kw) return true
      return [row.report_no, row.reportName, row.task_number, row.deviceName, row.operatorName, row.evaluatorName]
        .join(' ')
        .includes(kw)
    })
)

const selectableOperations = computed(() =>
  operations.value.filter((item) => Number(item.device_count || 0) > 0 && Array.isArray(item.devices) && item.devices.length > 0)
)

const reportedDeviceKeys = computed(() => {
  const set = new Set<string>()
  reports.value.forEach((report) => {
    const meta = safeParseRemark((report as any).remark)
    const workNo = (report as any).task_number || meta?.downhole_work_no || meta?.task_number || meta?.work_no
    const sn =
      meta?.device_sn ||
      meta?.deviceSn ||
      meta?.device_number ||
      meta?.deviceNo ||
      meta?.sn ||
      meta?.code
    const key = reportDeviceKey(workNo, sn)
    if (key) set.add(key)
  })
  return set
})

const selectedOperationDevices = computed(() => {
  const workNo = selectedOperation.value?.work_no
  const list = buildOperationDevices(selectedOperation.value)
  if (!workNo) return list
  return list.filter((device) => {
    if (!device.sn) return true
    const key = reportDeviceKey(workNo, device.sn)
    return !key || !reportedDeviceKeys.value.has(key)
  })
})
const reportTitle = computed(
  () => selectedTemplate.value?.report_name || selectedDevice.value?.template || '井下测试综合报告'
)
const templateCode = computed(
  () => selectedTemplate.value?.report_no || selectedDevice.value?.template || '-'
)

async function fetchReports() {
  loading.value = true
  try {
    await initAuth()
    const res = await listSimulatedWellReports({ page: 1, pageSize: 2000 }, getAuthHeaders())
    if (!res.success) {
      ElMessage.error(res.error || '获取测试报告失败')
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '获取测试报告失败')
      return
    }
    reports.value = res.data.data?.list || []
  } finally {
    loading.value = false
  }
}

async function handleDeleteReport(row: SimulatedWellReportItem) {
  try {
    await ElMessageBox.confirm(
      `确认删除测试报告「${row.report_no}」吗？`,
      '确认删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await initAuth()
  const res = await deleteSimulatedWellReport(row.id, getAuthHeaders())
  if (!res.success) {
    ElMessage.error(res.error || '删除失败')
    return
  }
  if (res.data?.code !== 0) {
    ElMessage.error(res.data?.msg || '删除失败')
    return
  }
  const workNo = String((row as any).task_number || (row as any).meta?.downhole_work_no || '').trim()
  if (workNo) {
    await fetchOperations()
    const target = operations.value.find((item) => String((item as any).work_no || '').trim() === workNo)
    if (target?.id) {
      const nextCount = Math.max(0, Number((target as any).report_count || 0) - 1)
      const updateRes = await updateSimulatedWellDownholeWork(target.id, { report_count: nextCount }, getAuthHeaders())
      if (updateRes.success && updateRes.data?.code === 0) {
        ;(target as any).report_count = nextCount
      }
    }
  }
  ElMessage.success('已删除')
  await fetchReports()
}

async function fetchOperations() {
  operationLoading.value = true
  try {
    await initAuth()
    const res = await listSimulatedWellDownholeWorks({ page: 1, pageSize: 2000 }, getAuthHeaders())
    if (!res.success) {
      ElMessage.error(res.error || '获取下井作业失败')
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '获取下井作业失败')
      return
    }
    operations.value = res.data.data?.list || []
  } finally {
    operationLoading.value = false
  }
}

async function ensureTemplateCatalog() {
  if (templateCatalog.value.length > 0) return
  await initAuth()
  const res = await listSimulatedWellReportTemplates(
    { currentPage: 1, pageSize: 500 },
    getAuthHeaders()
  )
  if (!res.success || res.data?.code !== 0) return
  templateCatalog.value = res.data.data?.list || []
}

function getFallbackTemplate(templateCodeValue: string): SimulatedWellReportTemplateDetail | null {
  const normalized = normalizeCode(templateCodeValue)
  const item = (extractedFields as any[]).find((entry) => {
    const refNo = normalizeCode(entry?.tableRefNo)
    const fileName = normalizeCode(entry?.fileName)
    return refNo === normalized || fileName.includes(normalized)
  })
  if (!item) return null
  return {
    id: 0,
    report_no: item.tableRefNo || templateCodeValue,
    report_name: item.fileName?.replace(/\.docx$/i, '') || templateCodeValue,
    test_products: item.testProducts || [],
    match_instruments: item.supportingTools || [],
    test_items: item.testItems || [],
    evaluation_standards: item.evaluations || [],
    updated_at: ''
  }
}

async function loadTemplate(templateCodeValue: string) {
  selectedTemplate.value = null
  templateMessage.value = ''
  if (!templateCodeValue) {
    templateMessage.value = '当前设备未关联报告模板，将使用基础报告表单。'
    return
  }

  templateLoading.value = true
  try {
    await ensureTemplateCatalog()
    const normalized = normalizeCode(templateCodeValue)
    const match = templateCatalog.value.find(
      (item) =>
        normalizeCode(item.report_no) === normalized ||
        normalizeCode(item.report_name).includes(normalized)
    )
    if (match) {
      const detailRes = await getSimulatedWellReportTemplateDetail(match.id, getAuthHeaders())
      if (detailRes.success && detailRes.data?.code === 0) {
        selectedTemplate.value = detailRes.data.data
        return
      }
    }

    const fallback = getFallbackTemplate(templateCodeValue)
    if (fallback) {
      selectedTemplate.value = fallback
      templateMessage.value = '模板详情未在后台配置，已使用本地解析数据回显。'
      return
    }

    templateMessage.value = '未找到对应模板，将使用基础报告表单。'
  } finally {
    templateLoading.value = false
  }
}

async function openCreateFlow() {
  mode.value = 'select-operation'
  resetSelection()
  await Promise.all([fetchOperations(), fetchReports()])
}

function backStep() {
  if (mode.value === 'add-report') {
    mode.value = 'select-operation'
    return
  }
  mode.value = 'list'
}

function pickOperation(work: SimulatedWellDownholeWorkItem) {
  selectedOperation.value = work
  selectedDevice.value = null
  selectedTemplate.value = null
  templateMessage.value = ''
  resetReportForm()
}

async function pickDevice(device: ReportOperationDevice) {
  selectedDevice.value = device
  resetReportForm()
  await loadTemplate(device.template)
  mode.value = 'add-report'
}

function handleFileChange(event: Event, bucket: 'pdf' | 'raw') {
  const files = Array.from((event.target as HTMLInputElement)?.files || [])
  if (bucket === 'pdf') pdfFiles.value = files
  else rawFiles.value = files
}

function buildReportNo() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const random = Math.floor(Math.random() * 90 + 10)
  return `RPT-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${random}`
}

function collectMeta(section: Record<string, any>) {
  return JSON.parse(JSON.stringify(section))
}

async function saveReport() {
  if (!selectedOperation.value || !selectedDevice.value) {
    ElMessage.warning('请先选择下井作业和测试设备')
    return
  }

  saving.value = true
  try {
    await initAuth()
    const reportNo = buildReportNo()
    const payload = {
      report_no: reportNo,
      task_number: selectedOperation.value.work_no,
      test_date: operationDate.value,
      tester: getCurrentUserName(),
      status: 0,
      remark: JSON.stringify({
        report_name: reportTitle.value,
        template_code: templateCode.value,
        template_name: selectedTemplate.value?.report_name || '',
        downhole_work_no: selectedOperation.value.work_no,
        well_name: selectedOperation.value.well_name,
        env_text: selectedOperation.value.env_text,
        interval_text: selectedOperation.value.interval_text,
        device_name: selectedDevice.value.deviceName,
        device_sn: selectedDevice.value.sn,
        evaluator: evaluator.value.trim(),
        conclusion: conclusion.value,
        test_items: collectMeta(testItemValues),
        evaluation_standards: collectMeta(evaluationValues),
        pdf_files: pdfFiles.value.map((file) => file.name),
        raw_files: rawFiles.value.map((file) => file.name),
        note: note.value.trim()
      })
    }

    const res = await createSimulatedWellReport(payload, getAuthHeaders())
    if (!res.success) {
      ElMessage.error(res.error || '保存测试报告失败')
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '保存测试报告失败')
      return
    }

    if (selectedOperation.value.id) {
      await updateSimulatedWellDownholeWork(
        selectedOperation.value.id,
        { report_count: Number(selectedOperation.value.report_count || 0) + 1 },
        getAuthHeaders()
      )
    }

    ElMessage.success('测试报告已保存')
    await Promise.all([fetchReports(), fetchOperations()])
    mode.value = 'list'
    resetSelection()
  } finally {
    saving.value = false
  }
}

function openPreview(report: SimulatedWellReportItem & { meta: ReportMeta }) {
  previewReport.value = report
}

function closePreview() {
  previewReport.value = null
}

function batchDownload() {
  ElMessage.info('批量下载流程待接入')
}

onMounted(async () => {
  await fetchReports()
})
</script>

<template>
  <div class="report-view">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:file-document-outline" /></div>
        <div>
          <h1 class="header-title">测试报告</h1>
          <p class="header-subtitle">
            {{
              mode === 'list'
                ? '查看报告列表并发起新增测试报告'
                : mode === 'select-operation'
                  ? '先选择下井作业，再选择具体测试设备'
                  : '根据所选下井作业和模板填写测试报告'
            }}
          </p>
        </div>
      </div>
      <div class="header-right">
        <button v-if="mode !== 'list'" class="week-cal-nav" @click="backStep">返回上一步</button>
        <button v-else class="week-cal-nav" @click="emit('back')">返回</button>
      </div>
    </div>

    <div class="downhole-content">
      <div v-if="mode === 'list'" class="downhole-card">
        <div class="section-header-row list-toolbar">
          <div class="search-box inline report-search">
            <Icon icon="mdi:magnify" class="search-icon" />
            <input v-model="reportKeyword" placeholder="搜索报告编号 / 作业号 / 设备 / 人员" />
          </div>
          <div class="header-actions">
            <button class="primary-btn" @click="openCreateFlow">
              <Icon icon="mdi:plus" />
              <span>新增测试报告</span>
            </button>
            <button class="week-cal-nav" @click="batchDownload">批量下载</button>
          </div>
        </div>

        <div v-if="loading" class="empty-state"><p>报告列表加载中...</p></div>
        <div v-else-if="!reportRows.length" class="empty-state"><p>暂无测试报告</p></div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>报告ID</th>
                <th>报告名称</th>
                <th>下井作业</th>
                <th>测试设备</th>
                <th>操作工程师</th>
                <th>资料评价人</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportRows" :key="row.id">
                <td>{{ row.report_no }}</td>
                <td>{{ row.reportName }}</td>
                <td>{{ row.task_number }}</td>
                <td>{{ row.deviceName }}</td>
                <td>{{ row.operatorName }}</td>
                <td>{{ row.evaluatorName }}</td>
                <td><span :class="['status-badge', row.statusClass]">{{ row.statusLabel }}</span></td>
                <td>{{ formatDateTime(row.submit_time) }}</td>
                <td>
                  <div class="action-buttons">
                    <button class="action-btn action-btn-view" @click="openPreview(row)">查看</button>
                    <button class="action-btn action-btn-view" @click="ElMessage.info('下载流程待接入')">下载</button>
                    <button class="action-btn action-btn-danger" @click="handleDeleteReport(row)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <template v-else-if="mode === 'select-operation'">
        <div class="downhole-card">
          <div class="downhole-card-title">步骤 1：选择下井作业 <span class="english-sub">Select Downhole Work</span></div>
          <p class="section-desc">请选择一个已保存的下井作业，再从其测试设备中选择本次要创建报告的对象。</p>

          <div v-if="operationLoading" class="empty-state"><p>下井作业加载中...</p></div>
          <div v-else-if="!selectableOperations.length" class="empty-state"><p>暂无可用于创建报告的下井作业</p></div>
          <div v-else class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>作业ID</th>
                  <th>井名称</th>
                  <th>测试环境</th>
                  <th>测试井段</th>
                  <th>设备数量</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="work in selectableOperations"
                  :key="work.id"
                  :class="{ 'selected-table-row': selectedOperation?.id === work.id }"
                >
                  <td>{{ work.work_no }}</td>
                  <td>{{ work.well_name || '-' }}</td>
                  <td>{{ work.env_text || '-' }}</td>
                  <td>{{ work.interval_text || '-' }}</td>
                  <td>{{ work.device_count || 0 }}台</td>
                  <td>{{ work.status_text || (work.status === 2 ? '已完成' : work.status === 1 ? '进行中' : '已创建') }}</td>
                  <td><button class="action-btn action-btn-view" @click="pickOperation(work)">选择</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="selectedOperation" class="downhole-card">
          <div class="downhole-card-title">步骤 2：选择测试设备 <span class="english-sub">Select Device</span></div>
          <p class="section-desc">
            已选择作业：<strong>{{ selectedOperation.work_no }}</strong> / {{ selectedOperation.well_name || '-' }}
          </p>
          <div v-if="!selectedOperationDevices.length" class="empty-state"><p>该下井作业暂无可选设备</p></div>
          <div v-else class="device-card-grid">
            <button
              v-for="device in selectedOperationDevices"
              :key="device.id"
              class="device-select-card"
              @click="pickDevice(device)"
            >
              <div class="device-name">{{ device.deviceName }}</div>
              <div class="device-meta">工单：{{ device.orderId || '-' }}</div>
              <div class="device-meta">编号：{{ device.sn || '-' }}</div>
              <div class="device-meta">模板：{{ device.template || '未配置' }}</div>
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="downhole-card">
          <div class="section-header-row">
            <div>
              <div class="downhole-card-title">{{ reportTitle }}</div>
              <div class="section-desc">模板编号：{{ templateCode }}</div>
            </div>
            <div v-if="templateLoading" class="tiny-hint">模板加载中...</div>
          </div>
          <div v-if="templateMessage" class="inline-hint">{{ templateMessage }}</div>

          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">下井作业</div>
              <div class="info-value">{{ selectedOperation?.work_no || '-' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">试验井名</div>
              <div class="info-value">{{ selectedOperation?.well_name || '-' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">测试设备</div>
              <div class="info-value">{{ selectedDevice?.deviceName || '-' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">设备编号</div>
              <div class="info-value">{{ selectedDevice?.sn || '-' }}</div>
            </div>
            <div class="info-item wide">
              <div class="info-label">测试环境</div>
              <div class="info-value">{{ selectedOperation?.env_text || '-' }}</div>
            </div>
            <div class="info-item wide">
              <div class="info-label">测试井段</div>
              <div class="info-value">{{ selectedOperation?.interval_text || '-' }}</div>
            </div>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">测试项目 <span class="english-sub">Test Item</span></div>
          <div v-if="!(selectedTemplate?.test_items || []).length" class="empty-state"><p>当前模板未配置测试项目</p></div>
          <div v-else class="field-list">
            <template v-for="(field, index) in selectedTemplate?.test_items || []" :key="fieldKey('test', index)">
              <div v-if="!COMPOUND_TYPES.includes(getFieldType(field))" class="field-row-card">
                <div class="field-row-main">
                  <div class="field-row-title">{{ getFieldLabel(field, `测试项目${index + 1}`) }}</div>
                  <div v-if="getFieldLabelEn(field)" class="field-row-sub">{{ getFieldLabelEn(field) }}</div>
                </div>

                <div v-if="getFieldType(field) === 'textarea'" class="field-row-input">
                  <textarea v-model="testItemValues[fieldKey('test', index)]" class="form-input textarea" rows="2" />
                </div>
                <div v-else-if="getFieldType(field) === 'text' || getFieldType(field) === 'number'" class="field-row-input">
                  <input
                    v-model="testItemValues[fieldKey('test', index)]"
                    class="form-input"
                    :type="getFieldType(field) === 'number' ? 'number' : 'text'"
                  />
                </div>
                <div v-else class="inline-radio-group">
                  <label class="inline-radio">
                    <input v-model="testItemValues[fieldKey('test', index)]" type="radio" :name="fieldKey('test', index)" value="normal" />
                    <span class="radio-label-ok">正常</span>
                  </label>
                  <label class="inline-radio">
                    <input v-model="testItemValues[fieldKey('test', index)]" type="radio" :name="fieldKey('test', index)" value="abnormal" />
                    <span class="radio-label-fail">不正常</span>
                  </label>
                </div>
              </div>

              <div v-else-if="getFieldType(field) === 'depth-group'" class="compound-card">
                <div class="field-row-title">{{ getFieldLabel(field, `测试项目${index + 1}`) }}</div>
                <div class="depth-grid">
                  <div
                    v-for="point in Number(field?.pointCount || 4)"
                    :key="fieldKey('test', index, `p${point}`)"
                    class="mini-card"
                  >
                    <div class="mini-title">第{{ point }}点</div>
                    <input
                      v-model="testItemValues[fieldKey('test', index, `p${point}`)]"
                      type="number"
                      class="form-input"
                      :placeholder="`深度(${field?.unit || 'm'})`"
                    />
                    <div v-if="field?.withJudgment" class="inline-radio-group compact">
                      <label class="inline-radio">
                        <input
                          v-model="testItemValues[fieldKey('test', index, `p${point}_result`)]"
                          type="radio"
                          :name="fieldKey('test', index, `p${point}_result`)"
                          value="normal"
                        />
                        <span class="radio-label-ok">正常</span>
                      </label>
                      <label class="inline-radio">
                        <input
                          v-model="testItemValues[fieldKey('test', index, `p${point}_result`)]"
                          type="radio"
                          :name="fieldKey('test', index, `p${point}_result`)"
                          value="abnormal"
                        />
                        <span class="radio-label-fail">异常</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="getFieldType(field) === 'range-radio'" class="compound-card">
                <div class="field-row-title">{{ getFieldLabel(field, `测试项目${index + 1}`) }}</div>
                <div class="range-row">
                  <input v-model="testItemValues[fieldKey('test', index, 'from')]" type="number" class="form-input" placeholder="起始深度" />
                  <span class="range-sep">~</span>
                  <input v-model="testItemValues[fieldKey('test', index, 'to')]" type="number" class="form-input" placeholder="结束深度" />
                  <div class="inline-radio-group">
                    <label class="inline-radio">
                      <input v-model="testItemValues[fieldKey('test', index, 'result')]" type="radio" :name="fieldKey('test', index, 'result')" value="normal" />
                      <span class="radio-label-ok">正常</span>
                    </label>
                    <label class="inline-radio">
                      <input v-model="testItemValues[fieldKey('test', index, 'result')]" type="radio" :name="fieldKey('test', index, 'result')" value="abnormal" />
                      <span class="radio-label-fail">不正常</span>
                    </label>
                  </div>
                </div>
              </div>

              <div v-else-if="getFieldType(field) === 'multi-input-row'" class="compound-card">
                <div class="field-row-title">{{ getFieldLabel(field, `测试项目${index + 1}`) }}</div>
                <div class="multi-row-list">
                  <div v-for="rowIndex in Number(field?.rowCount || 2)" :key="fieldKey('test', index, `row${rowIndex}`)" class="multi-row-item">
                    <div class="mini-title">第{{ rowIndex }}点</div>
                    <div class="multi-input-grid">
                      <input
                        v-for="(col, colIndex) in field?.columns || []"
                        :key="fieldKey('test', index, `r${rowIndex}c${colIndex}`)"
                        v-model="testItemValues[fieldKey('test', index, `r${rowIndex}c${colIndex}`)]"
                        :type="col?.type || 'number'"
                        class="form-input"
                        :placeholder="col?.label || col?.nameCN || `输入${colIndex + 1}`"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="getFieldType(field) === 'sampling-group'" class="compound-card">
                <div class="field-row-title">{{ getFieldLabel(field, `测试项目${index + 1}`) }}</div>
                <div class="sampling-grid">
                  <div v-for="point in Number(field?.pointCount || 2)" :key="fieldKey('test', index, `sample${point}`)" class="mini-card">
                    <div class="mini-title">第{{ point }}点</div>
                    <div
                      v-for="(item, itemIndex) in field?.items || []"
                      :key="fieldKey('test', index, `p${point}i${itemIndex}`)"
                      class="sampling-item"
                    >
                      <span>{{ getFieldLabel(item, `项目${itemIndex + 1}`) }}</span>
                      <div class="inline-radio-group compact">
                        <label class="inline-radio">
                          <input
                            v-model="testItemValues[fieldKey('test', index, `p${point}i${itemIndex}`)]"
                            type="radio"
                            :name="fieldKey('test', index, `p${point}i${itemIndex}`)"
                            value="normal"
                          />
                          <span class="radio-label-ok">正常</span>
                        </label>
                        <label class="inline-radio">
                          <input
                            v-model="testItemValues[fieldKey('test', index, `p${point}i${itemIndex}`)]"
                            type="radio"
                            :name="fieldKey('test', index, `p${point}i${itemIndex}`)"
                            value="abnormal"
                          />
                          <span class="radio-label-fail">异常</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="getFieldType(field) === 'card-group'" class="compound-card">
                <div class="field-row-title">{{ getFieldLabel(field, `测试项目${index + 1}`) }}</div>
                <div class="card-grid">
                  <div v-for="(card, cardIndex) in field?.cards || []" :key="fieldKey('test', index, `card${cardIndex}`)" class="mini-card">
                    <div class="mini-title">{{ card?.title || `卡片${cardIndex + 1}` }}</div>
                    <input
                      v-for="(subField, subIndex) in card?.fields || []"
                      :key="fieldKey('test', index, `c${cardIndex}f${subIndex}`)"
                      v-model="testItemValues[fieldKey('test', index, `c${cardIndex}f${subIndex}`)]"
                      :type="subField?.type || 'number'"
                      class="form-input"
                      :placeholder="getFieldLabel(subField, `字段${subIndex + 1}`)"
                    />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">资料评价标准值 <span class="english-sub">Data Evaluation Standard Value</span></div>
          <div v-if="!(selectedTemplate?.evaluation_standards || []).length" class="empty-state"><p>当前模板未配置评价标准</p></div>
          <div v-else class="field-list">
            <div v-for="(field, index) in selectedTemplate?.evaluation_standards || []" :key="fieldKey('eval', index)" class="field-row-card">
              <div class="field-row-main">
                <div class="field-row-title">{{ getFieldLabel(field, `评价标准${index + 1}`) }}</div>
                <div v-if="getFieldLabelEn(field)" class="field-row-sub">{{ getFieldLabelEn(field) }}</div>
              </div>
              <div v-if="getFieldType(field) === 'textarea'" class="field-row-input">
                <textarea v-model="evaluationValues[fieldKey('eval', index)]" class="form-input textarea" rows="2" />
              </div>
              <div v-else-if="getFieldType(field) === 'text' || getFieldType(field) === 'number'" class="field-row-input">
                <input
                  v-model="evaluationValues[fieldKey('eval', index)]"
                  class="form-input"
                  :type="getFieldType(field) === 'number' ? 'number' : 'text'"
                />
              </div>
              <div v-else class="inline-radio-group">
                <label class="inline-radio">
                  <input v-model="evaluationValues[fieldKey('eval', index)]" type="radio" :name="fieldKey('eval', index)" value="qualified" />
                  <span class="radio-label-ok">符合</span>
                </label>
                <label class="inline-radio">
                  <input v-model="evaluationValues[fieldKey('eval', index)]" type="radio" :name="fieldKey('eval', index)" value="unqualified" />
                  <span class="radio-label-fail">不符合</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">测试结论 <span class="english-sub">Test Conclusion</span></div>
          <div class="inline-radio-group conclusion-radio-group">
            <label class="rect-radio wide conclusion-radio" :class="{ selected: conclusion === 'qualified' }">
              <input v-model="conclusion" type="radio" value="qualified" />
              <span class="radio-label-ok">所测资料合格</span>
            </label>
            <label class="rect-radio wide conclusion-radio" :class="{ selected: conclusion === 'unqualified' }">
              <input v-model="conclusion" type="radio" value="unqualified" />
              <span class="radio-label-fail">所测资料存在不合格项</span>
            </label>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">操作人员信息 <span class="english-sub">Operator Information</span></div>
          <div class="info-grid two-col">
            <div class="info-item">
              <div class="info-label">操作工程师</div>
              <div class="info-value">{{ getCurrentUserName() }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">操作日期</div>
              <input v-model="operationDate" type="date" class="form-input" />
            </div>
            <div class="info-item">
              <div class="info-label">资料评价人</div>
              <input v-model="evaluator" type="text" class="form-input" placeholder="请输入资料评价人" />
            </div>
            <div class="info-item">
              <div class="info-label">备注</div>
              <textarea v-model="note" class="form-input textarea" rows="2" placeholder="补充说明或备注" />
            </div>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">上传测试文件 <span class="english-sub">Upload Files</span></div>
          <div class="upload-grid">
            <div class="upload-box">
              <div class="upload-title">PDF 报告文件</div>
              <input type="file" accept=".pdf" multiple @change="handleFileChange($event, 'pdf')" />
              <div class="file-list">
                <div v-for="file in pdfFiles" :key="file.name" class="file-row">{{ file.name }}</div>
                <div v-if="!pdfFiles.length" class="tiny-hint">未选择 PDF 文件</div>
              </div>
            </div>
            <div class="upload-box">
              <div class="upload-title">原始数据文件</div>
              <input type="file" multiple @change="handleFileChange($event, 'raw')" />
              <div class="file-list">
                <div v-for="file in rawFiles" :key="file.name" class="file-row">{{ file.name }}</div>
                <div v-if="!rawFiles.length" class="tiny-hint">未选择原始文件</div>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="week-cal-nav" @click="backStep">返回</button>
          <button class="primary-btn" :disabled="saving" @click="saveReport">
            {{ saving ? '保存中...' : '保存报告' }}
          </button>
        </div>
      </template>
    </div>

    <div v-if="previewReport" class="modal-mask" @click.self="closePreview">
      <div class="modal-card">
        <div class="modal-header">
          <h3>测试报告详情</h3>
          <button class="week-cal-nav" @click="closePreview">关闭</button>
        </div>
        <div class="modal-body">
          <div class="info-grid two-col">
            <div class="info-item">
              <div class="info-label">报告编号</div>
              <div class="info-value">{{ previewReport.report_no }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">报告名称</div>
              <div class="info-value">{{ previewReport.meta.report_name || previewReport.report_no }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">下井作业</div>
              <div class="info-value">{{ previewReport.task_number }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">测试设备</div>
              <div class="info-value">{{ previewReport.meta.device_name || '-' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">操作工程师</div>
              <div class="info-value">{{ previewReport.tester }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">资料评价人</div>
              <div class="info-value">{{ previewReport.meta.evaluator || '-' }}</div>
            </div>
            <div class="info-item wide">
              <div class="info-label">测试环境</div>
              <div class="info-value">{{ previewReport.meta.env_text || '-' }}</div>
            </div>
            <div class="info-item wide">
              <div class="info-label">测试井段</div>
              <div class="info-value">{{ previewReport.meta.interval_text || '-' }}</div>
            </div>
            <div class="info-item wide">
              <div class="info-label">测试结论</div>
              <div class="info-value">{{ previewReport.meta.conclusion === 'unqualified' ? '所测资料存在不合格项' : '所测资料合格' }}</div>
            </div>
            <div class="info-item wide" v-if="previewReport.meta.note">
              <div class="info-label">备注</div>
              <div class="info-value">{{ previewReport.meta.note }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-view {
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
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
  margin-bottom: 0;
}

.header-right,
.header-actions,
.section-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-header-row {
  justify-content: space-between;
}

.section-header-row.list-toolbar {
  margin-bottom: 14px;
}

.search-box.inline.report-search {
  max-width: 420px;
}

.header-actions .primary-btn,
.header-actions .week-cal-nav {
  min-width: 120px;
}

.downhole-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.downhole-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
}

.downhole-card-title {
  font-size: 15px;
  font-weight: 600;
}

.english-sub,
.tiny-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.section-desc,
.inline-hint {
  color: var(--color-text-secondary);
  font-size: 13px;
  margin-top: 8px;
}

.inline-hint {
  margin-bottom: 8px;
}

.week-cal-nav,
.action-btn,
.primary-btn {
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.week-cal-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  transition: all 0.2s;
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 0;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  transition: all 0.2s;
}

.primary-btn:hover:not(:disabled),
.week-cal-nav:hover:not(:disabled) {
  filter: brightness(0.98);
}

.primary-btn:disabled {
  background: var(--color-text-tertiary, #94a3b8);
  cursor: not-allowed;
}

.search-box.inline {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: transparent;
}

.search-box.inline input {
  flex: 1;
  outline: none;
  height: 36px;
  padding: 0 16px;
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  box-shadow: none;
  box-sizing: border-box;
  font-size: 14px;
}

.search-icon {
  font-size: 20px;
  color: var(--color-text-primary);
  opacity: 0.9;
}

.search-box.inline input:focus {
  border-color: var(--color-primary, #3b82f6);
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  border-bottom: 1px solid var(--color-border);
  padding: 10px 8px;
  text-align: left;
  vertical-align: middle;
  font-size: 13px;
}

.data-table th {
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 4px 10px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: rgba(59, 130, 246, 0.12);
  color: var(--color-accent-blue);
}

.action-btn-view {
  background: rgba(59, 130, 246, 0.12);
}

.action-btn-danger {
  border-color: rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.12);
  color: var(--color-error, #ef4444);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.status-badge.pending {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.status-badge.approved {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.status-badge.rejected {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.selected-table-row {
  background: rgba(59, 130, 246, 0.12);
}

.device-card-grid,
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.device-select-card,
.mini-card {
  border: 1px solid #dbeafe;
  border-radius: 10px;
  padding: 12px;
  background: #f8fbff;
}

.device-select-card {
  text-align: left;
  cursor: pointer;
}

.device-name,
.mini-title,
.field-row-title {
  font-weight: 600;
  color: #0f172a;
}

.device-meta,
.field-row-sub {
  color: #64748b;
  font-size: 12px;
  margin-top: 4px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.info-grid.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.info-item {
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 10px;
}

.info-item.wide {
  grid-column: span 2;
}

.info-label {
  color: #64748b;
  font-size: 12px;
  margin-bottom: 6px;
}

.info-value {
  color: #0f172a;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.field-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-row-card,
.compound-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
}

.field-row-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.field-row-main {
  flex: 1;
}

.field-row-input {
  width: 280px;
}

.form-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  box-sizing: border-box;
  background: #fff;
}

.form-input.textarea {
  resize: vertical;
}

.inline-radio-group {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.inline-radio-group.compact {
  gap: 10px;
  margin-top: 8px;
}

.inline-radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.rect-radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  transition: all 0.2s ease;
  cursor: pointer;
}

.rect-radio.wide {
  min-width: 220px;
}

.conclusion-radio-group {
  gap: 12px;
  margin-top: 12px;
}

.conclusion-radio {
  min-height: 44px;
  padding: 0 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.conclusion-radio input {
  accent-color: var(--color-primary, #3b82f6);
}

.conclusion-radio:hover {
  border-color: rgba(59, 130, 246, 0.28);
  background: var(--color-bg-hover, rgba(59, 130, 246, 0.06));
}

.conclusion-radio.selected {
  border-color: rgba(59, 130, 246, 0.45);
  background: rgba(59, 130, 246, 0.08);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.12);
}

.radio-label-ok {
  color: var(--color-success, #16a34a);
  font-weight: 600;
}

.radio-label-fail {
  color: var(--color-error, #dc2626);
  font-weight: 600;
}

.depth-grid,
.sampling-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.range-row,
.multi-row-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.range-row {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
}

.range-sep {
  color: #64748b;
}

.multi-row-item {
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 10px;
}

.multi-input-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.sampling-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}

.upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.upload-box {
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
}

.upload-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.file-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-row {
  font-size: 12px;
  color: #334155;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.empty-state {
  padding: 32px 12px;
  text-align: center;
  color: #64748b;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  width: min(880px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: #fff;
  border-radius: 16px;
  padding: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

@media (max-width: 900px) {
  .info-grid,
  .info-grid.two-col,
  .upload-grid {
    grid-template-columns: 1fr;
  }

  .info-item.wide {
    grid-column: span 1;
  }

  .field-row-card {
    flex-direction: column;
    align-items: stretch;
  }

  .field-row-input {
    width: 100%;
  }
}
</style>
