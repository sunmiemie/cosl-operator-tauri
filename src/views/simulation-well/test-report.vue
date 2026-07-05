<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import {
  createSimulatedWellReport,
  createSimulatedWellReportWithFiles,
  deleteSimulatedWellReport,
  listSimulatedWellReports,
  updateSimulatedWellReport,
  type SimulatedWellReportItem
} from '@/services/simulated-well-report-api'
import { http } from '@/services/http'
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

const props = defineProps<{
  selectedOrders: any[]
  selectedDevices: any[]
  autoCreateReport?: boolean
  autoWorkNo?: string
}>()

const emit = defineEmits<{
  back: []
}>()

type Mode = 'list' | 'select-operation' | 'add-report'

type ReportMeta = Record<string, any>
type ReportAttachment = {
  field?: string
  type?: string
  name?: string
  file_name?: string
  file_url?: string
  content_type?: string
  size?: number
}
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
const templateDetails = ref<SimulatedWellReportTemplateDetail[]>([])
const templateMessage = ref('')
const editingReport = ref<(SimulatedWellReportItem & { meta: ReportMeta }) | null>(null)
const previewReport = ref<(SimulatedWellReportItem & { meta: ReportMeta }) | null>(null)
const previewAttachment = ref<{ title: string; url: string; isImage: boolean } | null>(null)

const operationDate = ref(new Date().toISOString().slice(0, 10))
const conclusion = ref<'qualified' | 'unqualified'>('qualified')
const note = ref('')
const curveChartNo = ref('')
const curveFiles = ref<File[]>([])
const reportFiles = ref<File[]>([])
const reportNextStepVisible = ref(false)
const reportNextStepRemaining = ref(0)
const autoStartedWorkNo = ref('')
const testItemValues = reactive<Record<string, any>>({})
const evaluationValues = reactive<Record<string, any>>({})

const { initAuth, getAuthHeaders, userInfo } = useAuth()

function normalizeCode(value: unknown) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeText(value: unknown) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\u4E00-\u9FA5]/g, '')
}

function cleanTemplateText(value: unknown) {
  return String(value || '')
    .replace(/\|+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type TemplateProduct = {
  code: string
  zh: string
  en: string
}

function normalizeTemplateProduct(item: any): TemplateProduct {
  if (typeof item === 'string') {
    const text = cleanTemplateText(item)
    const codeMatches = text.match(/[A-Z]{2,}\d+[A-Z0-9]*/g) || []
    const code = codeMatches[0] || ''
    const nextSameCodeIndex = code ? text.indexOf(code, text.indexOf(code) + code.length) : -1
    if (code && nextSameCodeIndex > code.length) {
      return {
        code,
        zh: text.slice(code.length, nextSameCodeIndex).trim(),
        en: text.slice(nextSameCodeIndex + code.length).trim(),
      }
    }
    const rest = code ? text.slice(text.indexOf(code) + code.length).trim() : text
    const englishStart = rest.search(/[A-Za-z]/)
    return {
      code,
      zh: englishStart >= 0 ? rest.slice(0, englishStart).trim() : rest,
      en: englishStart >= 0 ? rest.slice(englishStart).trim() : '',
    }
  }

  return {
    code: cleanTemplateText(item?.code || ''),
    zh: cleanTemplateText(item?.zh || item?.nameCN || item?.name || ''),
    en: cleanTemplateText(item?.en || item?.nameEN || ''),
  }
}

function mergeTemplateProductLists(...lists: any[][]): TemplateProduct[] {
  const map = new Map<string, TemplateProduct>()
  lists.forEach((list) => {
    ;(Array.isArray(list) ? list : []).forEach((item) => {
      const product = normalizeTemplateProduct(item)
      const key = `${normalizeCode(product.code)}::${normalizeText(product.zh)}::${normalizeText(product.en)}`
      if (!key || key === '::::') return
      const prev = map.get(key)
      map.set(key, {
        code: product.code || prev?.code || '',
        zh: product.zh || prev?.zh || '',
        en: product.en || prev?.en || '',
      })
    })
  })
  return Array.from(map.values())
}

function templateKey(template: { report_no?: string; report_name?: string }) {
  return `${normalizeCode(template.report_no)}::${normalizeText(template.report_name)}`
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

function getReportMeta(report: SimulatedWellReportItem): ReportMeta {
  return {
    ...safeParseRemark(report.remark),
    ...(report.report_json && typeof report.report_json === 'object' ? report.report_json : {}),
  }
}

function getReportAttachments(report: SimulatedWellReportItem | null | undefined): ReportAttachment[] {
  return Array.isArray(report?.attachments) ? report!.attachments as ReportAttachment[] : []
}

function resolveFileUrl(url?: string) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('file://')) return raw
  const base = http.getBaseUrl().replace(/\/+$/, '')
  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`
}

function isImageAttachment(attachment: ReportAttachment) {
  const contentType = String(attachment.content_type || '').toLowerCase()
  const name = String(attachment.name || attachment.file_name || attachment.file_url || '').toLowerCase()
  return contentType.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(name)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 19)
}

function getCurrentUserName() {
  return userInfo.value?.nickName || userInfo.value?.username || '当前操作人'
}

function extractStructuredStringValue(text: string, key: string) {
  const patterns = [
    new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`),
    new RegExp(`${key}\\s*[:：]\\s*([^,}\\]]+)`),
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return cleanTemplateText(match[1])
  }
  return ''
}

function normalizeField(field: any) {
  if (typeof field !== 'string') return field
  const text = field.trim()
  if (!text) return ''

  if (
    (text.startsWith('{') && text.endsWith('}')) ||
    (text.startsWith('[') && text.endsWith(']'))
  ) {
    try {
      return JSON.parse(text)
    } catch {
      try {
        const repaired = text
          .replace(/\bNone\b/g, 'null')
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false')
          .replace(/'/g, '"')
        return JSON.parse(repaired)
      } catch {
        const maybeObject: Record<string, any> = {}
        ;['nameCN', 'name', 'label', 'zh', 'title', 'code', 'nameEN', 'en', 'titleEN', 'type'].forEach((key) => {
          const value = extractStructuredStringValue(text, key)
          if (value) maybeObject[key] = value
        })
        if (Object.keys(maybeObject).length) return maybeObject
      }
    }
  }

  return cleanTemplateText(text)
}

function getFieldLabel(field: any, fallback: string) {
  const normalized = normalizeField(field)
  if (typeof normalized === 'string') return normalized || fallback
  return normalized?.nameCN || normalized?.name || normalized?.label || normalized?.zh || normalized?.title || normalized?.code || fallback
}

function getFieldLabelEn(field: any) {
  const normalized = normalizeField(field)
  if (typeof normalized === 'string') return ''
  return normalized?.nameEN || normalized?.en || normalized?.titleEN || ''
}

function getFieldType(field: any) {
  const normalized = normalizeField(field)
  if (typeof normalized === 'string') return 'radio'
  return normalized?.type || 'radio'
}

function fieldKey(prefix: string, index: number, suffix = '') {
  return `${prefix}_${index}${suffix ? `_${suffix}` : ''}`
}

function clearReactiveMap(target: Record<string, any>) {
  Object.keys(target).forEach((key) => delete target[key])
}

function assignReactiveMap(target: Record<string, any>, source: unknown) {
  clearReactiveMap(target)
  if (!source || typeof source !== 'object') return
  Object.entries(source as Record<string, any>).forEach(([key, value]) => {
    target[key] = value
  })
}

function resetReportForm() {
  operationDate.value = new Date().toISOString().slice(0, 10)
  conclusion.value = 'qualified'
  note.value = ''
  curveChartNo.value = ''
  curveFiles.value = []
  reportFiles.value = []
  clearReactiveMap(testItemValues)
  clearReactiveMap(evaluationValues)
}

function resetSelection() {
  editingReport.value = null
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
      const meta = getReportMeta(report)
      return {
        ...report,
        meta,
        reportName: meta.report_name || meta.template_code || report.report_no,
        deviceName: meta.device_name || '-',
        operatorName: report.tester || '-',
        statusLabel: statusText(report.status, report.status_text),
        statusClass: report.status === 1 ? 'approved' : report.status === 2 ? 'rejected' : 'pending'
      }
    })
    .filter((row) => {
      const kw = reportKeyword.value.trim()
      if (!kw) return true
      return [row.report_no, row.reportName, row.task_number, row.deviceName, row.operatorName]
        .join(' ')
        .includes(kw)
    })
)

const currentAutoWorkNo = computed(() => String(props.autoWorkNo || '').trim())

const selectableOperations = computed(() => {
  const rows = operations.value.filter((item) => Number(item.device_count || 0) > 0 && Array.isArray(item.devices) && item.devices.length > 0)
  if (!props.autoCreateReport || !currentAutoWorkNo.value) return rows
  return rows.filter((item) => String(item.work_no || '').trim() === currentAutoWorkNo.value)
})

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
  if (templateCatalog.value.length > 0 && templateDetails.value.length > 0) return
  await initAuth()
  const res = await listSimulatedWellReportTemplates(
    { currentPage: 1, pageSize: 500 },
    getAuthHeaders()
  )
  if (!res.success || res.data?.code !== 0) return
  templateCatalog.value = res.data.data?.list || []

  const detailResults = await Promise.allSettled(
    templateCatalog.value.map((item) => getSimulatedWellReportTemplateDetail(item.id, getAuthHeaders()))
  )
  templateDetails.value = detailResults
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((res): res is NonNullable<typeof res> => !!res && res.success && res.data?.code === 0)
    .map((res) => res.data!.data)
}

const fallbackTemplateDetails = computed<SimulatedWellReportTemplateDetail[]>(() =>
  ((extractedFields as any[]) || []).map((item, index) => ({
    id: -(index + 1),
    report_no: item.tableRefNo || item.fileName || `LOCAL_TEMPLATE_${index + 1}`,
    report_name: item.fileName?.replace(/\.docx$/i, '') || item.tableRefNo || `本地模板${index + 1}`,
    test_products: item.testProducts || [],
    match_instruments: item.supportingTools || [],
    test_items: item.testItems || [],
    evaluation_standards: item.evaluations || [],
    updated_at: '',
  }))
)

const templateLibrary = computed<SimulatedWellReportTemplateDetail[]>(() => {
  const map = new Map<string, SimulatedWellReportTemplateDetail>()

  templateDetails.value.forEach((item) => {
    map.set(templateKey(item), {
      ...item,
      test_products: mergeTemplateProductLists(item.test_products as any[]),
    })
  })

  fallbackTemplateDetails.value.forEach((item) => {
    const key = templateKey(item)
    const normalizedItem = {
      ...item,
      test_products: mergeTemplateProductLists(item.test_products as any[]),
    }
    if (!map.has(key)) {
      map.set(key, normalizedItem)
      return
    }
    const existing = map.get(key)!
    map.set(key, {
      ...existing,
      report_name: existing.report_name || normalizedItem.report_name,
      test_products: mergeTemplateProductLists(existing.test_products as any[], normalizedItem.test_products as any[]),
      test_items: Array.isArray(existing.test_items) && existing.test_items.length ? existing.test_items : normalizedItem.test_items,
      evaluation_standards:
        Array.isArray(existing.evaluation_standards) && existing.evaluation_standards.length
          ? existing.evaluation_standards
          : normalizedItem.evaluation_standards,
    })
  })

  return Array.from(map.values())
})

function getTemplateMatchScore(deviceName: string, product: any) {
  const normalizedProduct = normalizeTemplateProduct(product)
  const deviceNameNorm = normalizeText(deviceName)
  const deviceCodeNorm = normalizeCode(deviceName)
  const productCodeNorm = normalizeCode(normalizedProduct.code)
  const productZhNorm = normalizeText(normalizedProduct.zh)
  const productEnNorm = normalizeText(normalizedProduct.en)

  let score = 0
  if (productCodeNorm && deviceCodeNorm.includes(productCodeNorm)) score = Math.max(score, 100)
  if (productZhNorm && (deviceNameNorm.includes(productZhNorm) || productZhNorm.includes(deviceNameNorm))) score = Math.max(score, 80)
  if (productEnNorm && (deviceNameNorm.includes(productEnNorm) || productEnNorm.includes(deviceNameNorm))) score = Math.max(score, 70)

  const mergedNameNorm = normalizeText(`${normalizedProduct.code}${normalizedProduct.zh}${normalizedProduct.en}`)
  if (mergedNameNorm && deviceNameNorm.includes(mergedNameNorm)) score = Math.max(score, 90)
  return score
}

function findMatchedTemplateByProduct(deviceName: string) {
  let bestMatch: SimulatedWellReportTemplateDetail | null = null
  let bestScore = 0

  templateLibrary.value.forEach((template) => {
    const products = Array.isArray(template.test_products) ? template.test_products : []
    products.forEach((product) => {
      const score = getTemplateMatchScore(deviceName, product)
      if (score > bestScore) {
        bestScore = score
        bestMatch = template
      }
    })
  })

  return bestScore > 0 ? bestMatch : null
}

function findMatchedTemplateByCode(templateCodeValue: string) {
  const normalized = normalizeCode(templateCodeValue)
  if (!normalized) return null
  return (
    templateLibrary.value.find(
      (item) =>
        normalizeCode(item.report_no) === normalized ||
        normalizeCode(item.report_name).includes(normalized)
    ) || null
  )
}

async function loadTemplate(device: ReportOperationDevice) {
  selectedTemplate.value = null
  templateMessage.value = ''

  templateLoading.value = true
  try {
    await ensureTemplateCatalog()

    const matchByProduct = findMatchedTemplateByProduct(device.deviceName)
    if (matchByProduct) {
      selectedTemplate.value = matchByProduct
      return
    }

    const matchByCode = findMatchedTemplateByCode(device.template)
    if (matchByCode) {
      selectedTemplate.value = matchByCode
      templateMessage.value = '未按测试产品匹配到模板，已按模板编号回退匹配。'
      return
    }

    templateMessage.value = '未找到与当前测试产品对应的报告模板，将使用基础报告表单。'
  } finally {
    templateLoading.value = false
  }
}

async function openCreateFlow() {
  editingReport.value = null
  mode.value = 'select-operation'
  resetSelection()
  await Promise.all([fetchOperations(), fetchReports()])
}

async function openCreateFlowForWorkNo(workNo: string) {
  const normalizedWorkNo = String(workNo || '').trim()
  if (!normalizedWorkNo) return
  if (autoStartedWorkNo.value === normalizedWorkNo && mode.value === 'add-report') return

  editingReport.value = null
  reportNextStepVisible.value = false
  mode.value = 'select-operation'
  resetSelection()
  await Promise.all([fetchOperations(), fetchReports()])

  const work =
    selectableOperations.value.find((item) => String(item.work_no || '').trim() === normalizedWorkNo) ||
    operations.value.find((item) => String(item.work_no || '').trim() === normalizedWorkNo)

  if (!work) {
    autoStartedWorkNo.value = ''
    ElMessage.warning('未找到刚保存的下井作业，请从列表中选择')
    return
  }

  pickOperation(work)
  const firstDevice = selectedOperationDevices.value[0]
  if (!firstDevice) {
    autoStartedWorkNo.value = ''
    ElMessage.warning('该下井作业暂无可填写报告的测试设备')
    return
  }

  autoStartedWorkNo.value = normalizedWorkNo
  await pickDevice(firstDevice)
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
  editingReport.value = null
  selectedDevice.value = device
  // 选择工单后将工单号设置为曲线图编号前缀
  curveChartNoPrefix.value = device.orderId + "-"
  resetReportForm()
  await loadTemplate(device)
  mode.value = 'add-report'
}

function buildEditFallbackTemplate(meta: ReportMeta): SimulatedWellReportTemplateDetail {
  return {
    id: -Date.now(),
    report_no: String(meta.template_code || meta.template_name || ''),
    report_name: String(meta.template_name || meta.report_name || meta.template_code || '井下测试综合报告'),
    test_products: [],
    match_instruments: [],
    test_items: [],
    evaluation_standards: [],
    updated_at: '',
  }
}

async function openEditReport(report: SimulatedWellReportItem & { meta: ReportMeta }) {
  const meta = report.meta || getReportMeta(report)
  editingReport.value = { ...report, meta }
  mode.value = 'add-report'

  selectedOperation.value = {
    id: -report.id,
    work_no: String(report.task_number || meta.downhole_work_no || meta.work_no || ''),
    well_name: String(meta.well_name || ''),
    env_text: String(meta.env_text || ''),
    interval_text: String(meta.interval_text || ''),
    device_count: 1,
    devices: [],
  } as unknown as SimulatedWellDownholeWorkItem
  selectedDevice.value = {
    id: `edit-${report.id}`,
    orderId: '',
    customer: '',
    deviceName: String(meta.device_name || '-'),
    sn: String(meta.device_sn || meta.device_number || meta.sn || ''),
    template: String(meta.template_code || meta.template_name || ''),
  }

  operationDate.value = report.test_date || new Date().toISOString().slice(0, 10)
  conclusion.value = meta.conclusion === 'unqualified' ? 'unqualified' : 'qualified'
  note.value = String(meta.note || '')
  curveChartNo.value = String(meta.curve_chart_no || '')
  curveFiles.value = []
  reportFiles.value = []
  assignReactiveMap(testItemValues, meta.test_items)
  assignReactiveMap(evaluationValues, meta.evaluation_standards)

  selectedTemplate.value = null
  templateMessage.value = ''
  templateLoading.value = true

  /*
   * 编辑时由于没有工单编号，所以要在曲线图中截取曲线图前缀
   */
  if (report.meta.curve_chart_no.indexOf("-") > 0) {
    curveChartNoPrefix.value = report.meta.curve_chart_no.substring(0, report.meta.curve_chart_no.indexOf("-") + 1)
  }
  try {
    await ensureTemplateCatalog()
    selectedTemplate.value =
      findMatchedTemplateByCode(String(meta.template_code || selectedDevice.value.template)) ||
      findMatchedTemplateByProduct(String(meta.device_name || '')) ||
      buildEditFallbackTemplate(meta)
  } finally {
    templateLoading.value = false
  }
}

async function deleteReport(row: SimulatedWellReportItem & { meta: ReportMeta }) {
  try {
    await ElMessageBox.confirm(
      `确认删除报告 ${row.report_no}？删除后不可恢复。`,
      '删除测试报告',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '删除确认失败')
    }
    return
  }

  const res = await deleteSimulatedWellReport(row.id, getAuthHeaders())
  if (!res.success) {
    ElMessage.error(res.error || '删除测试报告失败')
    return
  }
  if (res.data?.code !== 0) {
    ElMessage.error(res.data?.msg || '删除测试报告失败')
    return
  }

  ElMessage.success('测试报告已删除')
  await Promise.all([fetchReports(), fetchOperations()])
}

function handleFileChange(event: Event) {
  const files = Array.from((event.target as HTMLInputElement)?.files || [])
  reportFiles.value = files
}

function handleCurveFileChange(event: Event) {
  curveFiles.value = Array.from((event.target as HTMLInputElement)?.files || [])
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
    const editing = editingReport.value
    const remainingBeforeSave = editing ? 0 : Math.max(0, selectedOperationDevices.value.length - 1)
    const reportNo = editing?.report_no || buildReportNo()
    const reportJson = {
      report_name: reportTitle.value,
      template_code: templateCode.value,
      template_name: selectedTemplate.value?.report_name || '',
      downhole_work_no: selectedOperation.value.work_no,
      well_name: selectedOperation.value.well_name,
      env_text: selectedOperation.value.env_text,
      interval_text: selectedOperation.value.interval_text,
      device_name: selectedDevice.value.deviceName,
      device_sn: selectedDevice.value.sn,
      conclusion: conclusion.value,
      test_items: collectMeta(testItemValues),
      evaluation_standards: collectMeta(evaluationValues),
      curve_chart_no: curveChartNo.value.trim(),
      curve_chart_files: curveFiles.value.map((file) => file.name),
      report_files: reportFiles.value.map((file) => file.name),
      pdf_files: reportFiles.value.map((file) => file.name),
      note: note.value.trim()
    }
    const payload = {
      report_no: reportNo,
      task_number: selectedOperation.value.work_no,
      test_date: operationDate.value,
      tester: getCurrentUserName(),
      status: editing?.status ?? 0,
      report_json: reportJson,
      order_numbers: [selectedOperation.value.work_no],
      client_submit_id: editing?.client_submit_id || `${reportNo}-${Date.now()}`,
      remark: JSON.stringify(reportJson)
    }
    const uploadFiles = [
      ...curveFiles.value.map((file) => ({ fieldName: 'curve_chart', fileName: file.name, blob: file })),
      ...reportFiles.value.map((file) => ({ fieldName: 'report_file', fileName: file.name, blob: file })),
    ]

    if (editing && uploadFiles.length) {
      ElMessage.warning('编辑模式暂不替换已上传附件，本次仅保存报告字段')
    }
    const res = editing
      ? await updateSimulatedWellReport(editing.id, payload, getAuthHeaders())
      : uploadFiles.length
        ? await createSimulatedWellReportWithFiles(payload, uploadFiles, getAuthHeaders())
        : await createSimulatedWellReport(payload, getAuthHeaders())
    if (!res.success) {
      ElMessage.error(res.error || '保存测试报告失败')
      return
    }
    if (res.data?.code !== 0) {
      ElMessage.error(res.data?.msg || '保存测试报告失败')
      return
    }

    if (!editing && selectedOperation.value.id) {
      await updateSimulatedWellDownholeWork(
        selectedOperation.value.id,
        { report_count: Number(selectedOperation.value.report_count || 0) + 1 },
        getAuthHeaders()
      )
    }

    ElMessage.success(editing ? '测试报告已更新' : '测试报告已保存')
    await Promise.all([fetchReports(), fetchOperations()])
    if (remainingBeforeSave > 0) {
      reportNextStepRemaining.value = remainingBeforeSave
      reportNextStepVisible.value = true
      resetReportForm()
      return
    }
    mode.value = 'list'
    resetSelection()
  } finally {
    saving.value = false
  }
}

function continueReportFill() {
  reportNextStepVisible.value = false
  selectedDevice.value = null
  selectedTemplate.value = null
  templateMessage.value = ''
  mode.value = 'select-operation'
}

function finishDownholeOperation() {
  reportNextStepVisible.value = false
  mode.value = 'list'
  resetSelection()
}

function openPreview(report: SimulatedWellReportItem & { meta: ReportMeta }) {
  previewReport.value = report
}

function closePreview() {
  previewReport.value = null
  previewAttachment.value = null
}

function openAttachment(attachment: ReportAttachment) {
  const url = resolveFileUrl(attachment.file_url)
  if (!url) {
    ElMessage.warning('未找到附件地址')
    return
  }
  const title = attachment.name || attachment.file_name || '附件'
  if (isImageAttachment(attachment)) {
    previewAttachment.value = { title, url, isImage: true }
    return
  }
  window.open(url, '_blank')
}

function batchDownload() {
  ElMessage.info('批量下载流程待接入')
}

// 曲线图编号前缀
const curveChartNoPrefix = ref<string>('')
/**
 * 计算曲线图编号
 * 现在的逻辑：使用工单号为前缀，手动输入后缀编号，自动拼接成曲线图编号存入数据库
 */
const curveChartNoModelValue = computed<string>({
  get() {
    // 如果 fullValue 以当前前缀开头，就把前缀裁掉给输入框显示
    if (curveChartNoPrefix.value.length > 0 && curveChartNo.value.startsWith(curveChartNoPrefix.value)) {
      return curveChartNo.value.slice(curveChartNoPrefix.value.length)
    }
  // 否则原样返回（比如前缀变了，旧值对不上的情况）
  return curveChartNo.value
  },
  set(newValue) {
    // 用户输入或修改时，自动拼接前缀再赋给 fullValue
    curveChartNo.value = selectedDevice.value != null ? curveChartNoPrefix.value + newValue : newValue
  }
})

onMounted(async () => {
  await fetchReports()
})

watch(
  () => [props.autoCreateReport, props.autoWorkNo],
  ([autoCreate, workNo]) => {
    if (!autoCreate || !workNo) return
    void openCreateFlowForWorkNo(String(workNo))
  },
  { immediate: true }
)
</script>

<template>
  <div class="report-view">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:file-document-outline" /></div>
        <div>
          <h1 class="header-title">{{ mode === 'select-operation' ? '报告准备 Report Preparation' : '测试报告' }}</h1>
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
      <!-- 驳回编辑时显示驳回原因 -->
      <div class="reject-message" v-if="mode === 'add-report' && editingReport?.status === 2">
        <Icon icon="mdi:alert-circle-outline" />
        <span>审核驳回消息：{{editingReport.meta.rawRemark}}</span>
      </div>
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
          <table class="data-table report-list-table">
            <colgroup>
              <col class="col-report-id" />
              <col class="col-report-name" />
              <col class="col-operation" />
              <col class="col-device" />
              <col class="col-operator" />
              <col class="col-status" />
              <col class="col-created" />
              <col class="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>报告ID</th>
                <th>报告名称</th>
                <th>下井作业</th>
                <th>测试设备</th>
                <th>操作工程师</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportRows" :key="row.id" class="report-list-row">
                <td>
                  <div class="cell-primary wrap-id">{{ row.report_no }}</div>
                </td>
                <td>
                  <div class="report-name-cell" :title="row.reportName">{{ row.reportName }}</div>
                </td>
                <td>
                  <div class="cell-primary">{{ row.task_number || '-' }}</div>
                  <div v-if="row.meta?.well_name" class="cell-secondary">{{ row.meta.well_name }}</div>
                </td>
                <td>
                  <div class="cell-primary clamp-two" :title="row.deviceName">{{ row.deviceName }}</div>
                  <div v-if="row.meta?.device_sn" class="cell-secondary">{{ row.meta.device_sn }}</div>
                </td>
                <td>
                  <div class="cell-primary compact-text">{{ row.operatorName }}</div>
                </td>
                <td><span :class="['status-badge', row.statusClass]">{{ row.statusLabel }}</span></td>
                <td>
                  <div class="cell-primary date-cell">{{ formatDateTime(row.submit_time).slice(0, 10) }}</div>
                  <div class="cell-secondary">{{ formatDateTime(row.submit_time).slice(11) }}</div>
                </td>
                <td class="actions-cell">
                  <div class="action-buttons">
                    <button class="action-btn action-btn-view" @click="openPreview(row)">
                      <Icon icon="mdi:eye-outline" />
                      <span>查看</span>
                    </button>
                    <button class="action-btn action-btn-edit" @click="openEditReport(row)">
                      <Icon icon="mdi:pencil-outline" />
                      <span>编辑</span>
                    </button>
                    <button class="action-btn action-btn-danger" @click="deleteReport(row)">
                      <Icon icon="mdi:trash-can-outline" />
                      <span>删除</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <template v-else-if="mode === 'select-operation'">
        <div class="downhole-card">
          <div class="downhole-card-title">
            {{ props.autoCreateReport ? '当前下井作业' : '步骤 1：选择下井作业' }}
            <span class="english-sub">{{ props.autoCreateReport ? 'Current Downhole Work' : 'Select Downhole Work' }}</span>
          </div>
          <p class="section-desc">
            {{
              props.autoCreateReport
                ? '仅显示本次保存的下井作业，并从其测试设备中选择本次要创建报告的对象。'
                : '请选择一个已保存的下井作业，再从其测试设备中选择本次要创建报告的对象。'
            }}
          </p>

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
              <div class="info-label">备注</div>
              <textarea v-model="note" class="form-input textarea" rows="2" placeholder="补充说明或备注" />
            </div>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">测试曲线图 <span class="english-sub">Test Curve Chart</span></div>
          <div class="upload-grid">
            <div class="upload-box">
              <div class="upload-title">曲线图编号 Curve Chart No.</div>
              <!-- 曲线图编号更改为：工单号-xx（xx是输入框手动输入的） -->
              <div class="line-graph-code">
                  <span v-if="curveChartNoPrefix">{{curveChartNoPrefix}}</span>
                  <input v-model="curveChartNoModelValue" class="form-input" placeholder="请输入曲线图编号" />
              </div>
            </div>
            <div class="upload-box">
              <div class="upload-title">上传测试曲线图</div>
              <input type="file" accept=".jpg,.jpeg,.png,.bmp,.tif,.tiff,.pdf" multiple @change="handleCurveFileChange" />
              <div class="file-list">
                <div v-for="file in curveFiles" :key="file.name" class="file-row">{{ file.name }}</div>
                <div v-if="!curveFiles.length" class="tiny-hint">支持 JPG、PNG、BMP、TIFF、PDF，可多选</div>
              </div>
            </div>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">上传测试文件 <span class="english-sub">Upload Files</span></div>
          <div class="upload-grid">
            <div class="upload-box">
              <div class="upload-title">测试报告文件</div>
              <input type="file" multiple @change="handleFileChange" />
              <div class="file-list">
                <div v-for="file in reportFiles" :key="file.name" class="file-row">{{ file.name }}</div>
                <div v-if="!reportFiles.length" class="tiny-hint">支持所有文件格式（PDF、LAS、CSV、Word 等），可多选</div>
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

        <div v-if="reportNextStepVisible" class="report-next-step-bar">
          <div class="report-saved-check">✓</div>
          <div class="report-saved-title">测试报告已保存</div>
          <div class="report-saved-actions">
            <button class="primary-btn" @click="continueReportFill">继续填写下一组报告 →</button>
            <button class="week-cal-nav" @click="finishDownholeOperation">跳过，完成下井作业</button>
          </div>
          <div class="report-saved-sub">还有 {{ reportNextStepRemaining }} 组报告待填写</div>
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
          <div class="attachment-section">
            <div class="downhole-card-title">报告附件 <span class="english-sub">Attachments</span></div>
            <div v-if="!getReportAttachments(previewReport).length" class="tiny-hint">暂无上传附件</div>
            <div v-else class="attachment-list">
              <div v-for="attachment in getReportAttachments(previewReport)" :key="`${attachment.field}-${attachment.file_name || attachment.name}`" class="attachment-row">
                <div class="attachment-main">
                  <span class="attachment-badge">{{ isImageAttachment(attachment) ? '图片' : '文件' }}</span>
                  <span class="attachment-name" :title="attachment.name || attachment.file_name">{{ attachment.name || attachment.file_name }}</span>
                </div>
                <button class="action-btn action-btn-view" @click="openAttachment(attachment)">
                  {{ isImageAttachment(attachment) ? '预览' : '打开' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="previewAttachment" class="attachment-preview-mask" @click.self="previewAttachment = null">
      <div class="attachment-preview-card">
        <div class="attachment-preview-header">
          <span>{{ previewAttachment.title }}</span>
          <button class="week-cal-nav" @click="previewAttachment = null">关闭</button>
        </div>
        <img v-if="previewAttachment.isImage" :src="previewAttachment.url" class="attachment-preview-image" />
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

.reject-message {
  position: sticky;
  top: 0;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 5px;
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  font-size: 13px;
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.reject-message svg,
.reject-message .svg-icon {
  flex-shrink: 0;
  font-size: 16px;
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

.report-list-table {
  min-width: 1160px;
  table-layout: fixed;
}

.report-list-table .col-report-id { width: 13%; }
.report-list-table .col-report-name { width: 31%; }
.report-list-table .col-operation { width: 10%; }
.report-list-table .col-device { width: 14%; }
.report-list-table .col-operator { width: 7%; }
.report-list-table .col-status { width: 7%; }
.report-list-table .col-created { width: 10%; }
.report-list-table .col-actions { width: 8%; }

.data-table th,
.data-table td {
  border-bottom: 1px solid var(--color-border);
  padding: 12px 10px;
  text-align: left;
  vertical-align: top;
  font-size: 13px;
}

.data-table th {
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
}

.report-list-row td {
  height: 70px;
}

.cell-primary {
  min-width: 0;
  color: var(--color-text-primary);
  font-weight: 500;
  line-height: 1.45;
  word-break: break-word;
}

.cell-secondary {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
  word-break: break-word;
}

.wrap-id {
  overflow-wrap: anywhere;
}

.report-name-cell,
.clamp-two {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-primary);
  font-weight: 500;
  line-height: 1.45;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.compact-text {
  word-break: keep-all;
}

.date-cell {
  white-space: nowrap;
}

.actions-cell {
  vertical-align: middle !important;
}

.action-buttons {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 58px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: rgba(59, 130, 246, 0.12);
  color: var(--color-accent-blue);
}

.action-btn-view {
  background: rgba(59, 130, 246, 0.12);
}

.action-btn-edit {
  border-color: rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
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

.report-next-step-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 26px 16px;
  border-radius: 8px;
  background: #f0fdf4;
  color: #166534;
}

.report-saved-check {
  font-size: 32px;
  line-height: 1;
}

.report-saved-title {
  font-size: 16px;
  font-weight: 700;
}

.report-saved-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.report-saved-sub {
  color: #64748b;
  font-size: 13px;
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

.attachment-section {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--color-border, #dce6ee);
  border-radius: 14px;
  background: #f8fafc;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.attachment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.attachment-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.attachment-badge {
  flex: 0 0 auto;
  padding: 4px 9px;
  border-radius: 999px;
  background: #eaf3ff;
  color: #0b78d0;
  font-size: 12px;
  font-weight: 700;
}

.attachment-name {
  min-width: 0;
  overflow: hidden;
  color: #1f2937;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.55);
}

.attachment-preview-card {
  width: min(900px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
}

.attachment-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 700;
}

.attachment-preview-image {
  display: block;
  width: 100%;
  height: min(72vh, 680px);
  object-fit: contain;
  background: #f8fafc;
}

.line-graph-code {
  display: flex;
  align-items: center;
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

  .attachment-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
