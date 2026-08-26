<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useAuth } from '@/composables/useAuth'
import {
  createSimulatedWellReport,
  createSimulatedWellReportWithLargeFiles,
  cancelSimulatedWellLargeUpload,
  deleteSimulatedWellReport,
  getSimulatedWellReportDetail,
  listSimulatedWellReports,
  updateSimulatedWellReport,
  updateSimulatedWellReportWithSignature,
  type SimulatedWellReportItem,
  type SimulatedWellLocalUploadFile
} from '@/services/simulated-well-report-api'
import { getMySignature, getSignatureImage } from '@/services/signature-api'
import { http } from '@/services/http'
import {
  getSimulatedWellReportTemplateDetail,
  listSimulatedWellReportTemplates,
  type SimulatedWellReportTemplateDetail,
  type SimulatedWellReportTemplateListItem
} from '@/services/simulated-well-report-template-api'
import {
  formatSimulatedWellEnvironment,
  formatSimulatedWellInterval,
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
  local_path?: string
  content_type?: string
  size?: number
}
type ReportOperationDevice = {
  id: string
  orderId: string
  orderDbId?: number
  deviceDbId?: number
  customer: string
  deviceName: string
  sn: string
  template: string
  orderType: 0 | 1
}
type LocalUploadFile = Omit<SimulatedWellLocalUploadFile, 'kind'>
type UploadProgressEvent = {
  uploadId: string
  fileName: string
  fileUploaded: number
  fileTotal: number
  uploaded: number
  total: number
  bytesPerSecond: number
}
const COMPOUND_TYPES = ['single-input', 'depth-group', 'range-radio', 'multi-input-row', 'sampling-group', 'card-group']
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
const openingAttachment = ref<ReportAttachment | null>(null)

const operationDate = ref(new Date().toISOString().slice(0, 10))
const conclusion = ref<'qualified' | 'unqualified'>('qualified')
const note = ref('')
const noteEn = ref('')
const curveChartNo = ref('')
const curveFiles = ref<LocalUploadFile[]>([])
const reportFiles = ref<LocalUploadFile[]>([])
const operatorSignatureFile = ref<LocalUploadFile | null>(null)
const operatorSignaturePreviewUrl = ref('')
const operatorSignatureObjectUrl = ref('')
const operatorSignatureSource = ref<'saved' | 'report' | 'local' | ''>('')
const operatorSignatureLoading = ref(false)
const activeUploadId = ref('')
const uploadPhase = ref<'idle' | 'uploading' | 'saving'>('idle')
const uploadCancelRequested = ref(false)
const uploadProgress = reactive({ fileName: '', uploaded: 0, total: 0, speed: 0 })
let uploadProgressUnlisten: (() => void) | null = null
const reportNextStepVisible = ref(false)
const reportNextStepRemaining = ref(0)
const autoStartedWorkNo = ref('')
const testItemValues = reactive<Record<string, any>>({})
const evaluationValues = reactive<Record<string, any>>({})
const transferDataValues = reactive<Record<string, any>>({})

const { initAuth, getAuthHeaders, userInfo } = useAuth()

function normalizeOrderType(value: unknown): 0 | 1 {
  return Number(value) === 1 ? 1 : 0
}

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

function getReportMeta(report: SimulatedWellReportItem): ReportMeta {
  return report.report_json && typeof report.report_json === 'object' ? { ...report.report_json } : {}
}

function getReportAttachments(report: SimulatedWellReportItem | null | undefined): ReportAttachment[] {
  return Array.isArray(report?.attachments) ? report!.attachments as ReportAttachment[] : []
}

function isCurveAttachment(attachment: ReportAttachment) {
  const type = String(attachment.type || '').toLowerCase()
  const field = String(attachment.field || '').toLowerCase()
  return type.startsWith('curve') || field.startsWith('curve')
}

function curveAttachments(report: SimulatedWellReportItem | null | undefined) {
  return getReportAttachments(report).filter(isCurveAttachment)
}

function otherAttachments(report: SimulatedWellReportItem | null | undefined) {
  return getReportAttachments(report).filter((attachment) => !isCurveAttachment(attachment))
}

function attachmentTitle(attachment: ReportAttachment) {
  return String(attachment.name || attachment.file_name || attachment.type || attachment.field || '附件')
}

function attachmentPath(attachment: ReportAttachment) {
  return String(attachment.file_url || attachment.local_path || '').trim() || '-'
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

function attachmentDisplayType(attachment: ReportAttachment) {
  const type = String(attachment.type || attachment.field || '').toLowerCase()
  return type.startsWith('curve') ? '原始文件' : type.includes('report') ? '报告文件' : '附件'
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 19)
}

function getCurrentUserName() {
  return userInfo.value?.nickName || userInfo.value?.username || '当前操作人'
}

const operatorSignatureSourceText = computed(() => {
  if (operatorSignatureSource.value === 'saved') return '已读取个人签名'
  if (operatorSignatureSource.value === 'report') return '报告已保存签名'
  if (operatorSignatureSource.value === 'local') return '已选择本次报告签名'
  return '未设置电子签名'
})

function revokeOperatorSignatureObjectUrl() {
  if (operatorSignatureObjectUrl.value) {
    URL.revokeObjectURL(operatorSignatureObjectUrl.value)
    operatorSignatureObjectUrl.value = ''
  }
}

function clearOperatorSignature() {
  revokeOperatorSignatureObjectUrl()
  operatorSignatureFile.value = null
  operatorSignaturePreviewUrl.value = ''
  operatorSignatureSource.value = ''
}

async function loadCurrentUserSignature() {
  clearOperatorSignature()
  operatorSignatureLoading.value = true
  try {
    await initAuth()
    const infoRes = await getMySignature(getAuthHeaders())
    const info = infoRes.data?.data
    if (!infoRes.success || infoRes.data?.code !== 0 || !info?.hasSignature) return

    const imageRes = await getSignatureImage(info.userId, getAuthHeaders())
    if (!imageRes.success || !imageRes.data) return
    const blob = new Blob([imageRes.data], { type: info.mimeType || 'image/png' })
    const objectUrl = URL.createObjectURL(blob)
    operatorSignatureObjectUrl.value = objectUrl
    operatorSignaturePreviewUrl.value = objectUrl
    operatorSignatureSource.value = 'saved'
  } catch (error) {
    console.warn('读取当前操作人电子签名失败', error)
  } finally {
    operatorSignatureLoading.value = false
  }
}

function validateOperatorSignatureFile(file: LocalUploadFile) {
  const allowedExtension = /\.(png|jpe?g|webp)$/i.test(file.name)
  if (!allowedExtension) {
    return '电子签名仅支持 PNG、JPG、JPEG、WEBP 格式'
  }
  if (!file.size) return '电子签名图片不能为空'
  if (file.size > 5 * 1024 * 1024) return '电子签名图片大小不能超过 5MB'
  return ''
}

async function inspectLocalFiles(paths: string[]) {
  return invoke<LocalUploadFile[]>('get_simulated_well_upload_files', { paths })
}

function contentTypeForName(name: string) {
  if (/\.pdf$/i.test(name)) return 'application/pdf'
  if (/\.png$/i.test(name)) return 'image/png'
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg'
  if (/\.webp$/i.test(name)) return 'image/webp'
  return 'application/octet-stream'
}

async function selectOperatorSignature() {
  const selected = await open({ multiple: false, filters: [{ name: '签名图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
  if (!selected) return
  const [file] = await inspectLocalFiles([selected])
  const error = validateOperatorSignatureFile(file)
  if (error) {
    ElMessage.warning(error)
    return
  }

  revokeOperatorSignatureObjectUrl()
  const bytes = await readFile(file.path)
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: contentTypeForName(file.name) }))
  operatorSignatureObjectUrl.value = objectUrl
  operatorSignaturePreviewUrl.value = objectUrl
  operatorSignatureFile.value = file
  operatorSignatureSource.value = 'local'
}

async function selectCurveFiles() {
  const selected = await open({ multiple: true })
  if (!selected) return
  const paths = Array.isArray(selected) ? selected : [selected]
  const files = await inspectLocalFiles(paths)
  const tooLarge = files.find((file) => file.size > 20 * 1024 ** 3)
  if (tooLarge) {
    ElMessage.warning(`原始文件 ${tooLarge.name} 超过 20 GiB 上限`)
    return
  }
  curveFiles.value = files.map((file) => ({ ...file, contentType: contentTypeForName(file.name) }))
}

async function selectReportFile() {
  const selected = await open({ multiple: false, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (!selected) return
  const [file] = await inspectLocalFiles([selected])
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    ElMessage.error('测试报告文件仅支持 PDF')
    return
  }
  reportFiles.value = [{ ...file, contentType: 'application/pdf' }]
}

function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
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

type ReadonlyReportRow = {
  label: string
  value: string
}

function getTransferColumns(field: any): any[] {
  const normalized = normalizeField(field)
  return normalized && typeof normalized === 'object' && Array.isArray(normalized.columns)
    ? normalized.columns
    : []
}

function getTransferDataLabel(field: any, fieldIndex: number, column: any, columnIndex: number) {
  const label = `${getFieldLabel(field, '')}${getFieldLabel(column, '')}`
  return label || `转样数据${fieldIndex + 1}子字段${columnIndex + 1}`
}

function getTransferDataLabelEn(field: any, column: any) {
  return [getFieldLabelEn(field), getFieldLabelEn(column)].filter(Boolean).join(' ')
}

function buildReadonlyTransferDataRows(fields: unknown, values: unknown): ReadonlyReportRow[] {
  if (!Array.isArray(fields)) return []
  const valueMap = values && typeof values === 'object' ? values as Record<string, unknown> : {}

  return fields.flatMap((field, fieldIndex) => {
    if (getFieldType(field) !== 'single-row-multi-column') return []
    return getTransferColumns(field).map((column, columnIndex) => ({
      label: getTransferDataLabel(field, fieldIndex, column, columnIndex),
      value: displayValueWithUnit(valueMap[fieldKey('transfer', fieldIndex, `c${columnIndex}`)], column?.unit),
    }))
  })
}

function displayReadonlyReportValue(value: unknown, empty = '') {
  if (value === undefined || value === null || value === '') return empty
  const statusText: Record<string, string> = {
    normal: '正常',
    abnormal: '异常',
    qualified: '符合',
    unqualified: '不符合',
  }
  if (typeof value === 'string') return statusText[value] || value
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

function displayRangeRadioResult(value: unknown) {
  if (value === 'abnormal' || value === '异常' || value === '不正常') return '不正常'
  return displayReadonlyReportValue(value)
}

function displayNumberWithUnit(value: unknown, unit: unknown) {
  const numberValue = displayReadonlyReportValue(value)
  if (value === undefined || value === null || value === '') return numberValue
  return `${numberValue}${String(unit || '').trim()}`
}

function displayValueWithUnit(value: unknown, unit: unknown) {
  const text = displayReadonlyReportValue(value)
  if (text === '') return ''
  return `${text}${String(unit || '').trim()}`
}

function positiveFieldCount(value: unknown, fallback: number) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : fallback
}

function buildReadonlyReportRows(fields: unknown, values: unknown, prefix: string, sectionName: string): ReadonlyReportRow[] {
  if (!Array.isArray(fields)) return []
  const valueMap = values && typeof values === 'object' ? values as Record<string, unknown> : {}

  return fields.map((rawField, index) => {
    const field = normalizeField(rawField)
    const definition = typeof field === 'object' && field ? field as Record<string, any> : {}
    const key = fieldKey(prefix, index)
    const label = getFieldLabel(rawField, `${sectionName}${index + 1}`)
    const type = getFieldType(rawField)

    if (!COMPOUND_TYPES.includes(type)) {
      if (type === 'number') return { label, value: displayNumberWithUnit(valueMap[key], definition.unit) }
      return { label, value: displayReadonlyReportValue(valueMap[key]) }
    }

    if (type === 'single-input') {
      const rawInputValue = valueMap[key]
      const inputValue = displayReadonlyReportValue(rawInputValue)
      const unit = String(definition.unit || '').trim()
      return {
        label: `${label}：${inputValue ? `${inputValue}${unit}` : ''}`,
        value: displayReadonlyReportValue(valueMap[fieldKey(prefix, index, 'result')]),
      }
    }

    if (type === 'depth-group') {
      const unit = displayReadonlyReportValue(definition.unit, 'm')
      const points = Array.from({ length: positiveFieldCount(definition.pointCount, 4) }, (_, pointIndex) => {
        const point = pointIndex + 1
        const depth = displayValueWithUnit(valueMap[fieldKey(prefix, index, `p${point}`)], unit)
        const result = valueMap[fieldKey(prefix, index, `p${point}_result`)]
        return `第${point}点：${depth}${result === undefined || result === null || result === '' ? '' : `，${displayReadonlyReportValue(result)}`}`
      })
      return { label, value: points.join('；') }
    }

    if (type === 'range-radio') {
      const start = displayReadonlyReportValue(valueMap[fieldKey(prefix, index, 'from')])
      const end = displayReadonlyReportValue(valueMap[fieldKey(prefix, index, 'to')])
      const unit = String(definition.unit || '').trim()
      return {
        label: `${label}：${start || end ? `${start} ~ ${end}${unit}` : ''}`,
        value: displayRangeRadioResult(valueMap[fieldKey(prefix, index, 'result')]),
      }
    }

    if (type === 'multi-input-row') {
      const columns = Array.isArray(definition.columns) ? definition.columns : []
      const rows = Array.from({ length: positiveFieldCount(definition.rowCount, 2) }, (_, rowIndex) => {
        const values = columns.map((column, columnIndex) =>
          `${getFieldLabel(column, `输入${columnIndex + 1}`)}：${displayReadonlyReportValue(valueMap[fieldKey(prefix, index, `r${rowIndex + 1}c${columnIndex}`)])}`
        )
        return `第${rowIndex + 1}点：${values.join('，')}`
      })
      return { label, value: rows.join('；') }
    }

    if (type === 'sampling-group') {
      const items = Array.isArray(definition.items) ? definition.items : []
      const points = Array.from({ length: positiveFieldCount(definition.pointCount, 2) }, (_, pointIndex) => {
        const values = items.map((item, itemIndex) =>
          `${getFieldLabel(item, `项目${itemIndex + 1}`)}：${displayReadonlyReportValue(valueMap[fieldKey(prefix, index, `p${pointIndex + 1}i${itemIndex}`)])}`
        )
        return `第${pointIndex + 1}点：${values.join('，')}`
      })
      return { label, value: points.join('；') }
    }

    const cards = Array.isArray(definition.cards) ? definition.cards : []
    const cardValues = cards.map((card, cardIndex) => {
      const cardDefinition = card && typeof card === 'object' ? card as Record<string, any> : {}
      const cardFields = Array.isArray(cardDefinition.fields) ? cardDefinition.fields : []
      const values = cardFields.map((item, itemIndex) =>
        `${getFieldLabel(item, `字段${itemIndex + 1}`)}：${displayReadonlyReportValue(valueMap[fieldKey(prefix, index, `c${cardIndex}f${itemIndex}`)])}`
      )
      return `${displayReadonlyReportValue(cardDefinition.title, `卡片${cardIndex + 1}`)}：${values.join('，')}`
    })
    return { label, value: cardValues.join('；') }
  })
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
  noteEn.value = ''
  curveChartNo.value = ''
  curveFiles.value = []
  reportFiles.value = []
  clearOperatorSignature()
  clearReactiveMap(testItemValues)
  clearReactiveMap(evaluationValues)
  clearReactiveMap(transferDataValues)
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
    orderDbId: Number(device?.orderDbId || device?.order_db_id || 0) || undefined,
    deviceDbId: Number(device?.deviceDbId || device?.device_db_id || device?.dbId || 0) || undefined,
    customer: String(device?.customer || ''),
    deviceName: String(device?.deviceName || device?.device_name || device?.name || '-'),
    sn: String(device?.sn || device?.code || device?.device_number || ''),
    template: String(device?.template || ''),
    orderType: normalizeOrderType(device?.orderType ?? device?.order_type ?? work?.order_type)
  }))
}

const reportRows = computed(() =>
  reports.value
    .map((report) => {
      const meta = getReportMeta(report)
      const isResearch = normalizeOrderType(meta.order_type) === 1
      return {
        ...report,
        meta,
        reportName: isResearch ? '' : (meta.report_name || meta.template_code || report.report_no),
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
    const meta = getReportMeta(report)
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
const isResearchReport = computed(() => selectedDevice.value?.orderType === 1)
const isPreviewResearchReport = computed(() => normalizeOrderType(previewReport.value?.meta?.order_type) === 1)
const usesTemplateReport = computed(() => !isResearchReport.value)
const reportTitle = computed(
  () => usesTemplateReport.value
    ? (selectedTemplate.value?.report_name || selectedDevice.value?.template || '井下测试综合报告')
    : '研究院测试资料'
)
const templateCode = computed(
  () => usesTemplateReport.value ? (selectedTemplate.value?.report_no || selectedDevice.value?.template || '-') : '-'
)
const previewTemplateSnapshot = computed<Record<string, any> | null>(() => {
  const snapshot = previewReport.value?.meta?.template_snapshot
  return snapshot && typeof snapshot === 'object' ? snapshot as Record<string, any> : null
})
const previewTestItemRows = computed(() =>
  buildReadonlyReportRows(
    previewTemplateSnapshot.value?.test_items,
    previewReport.value?.meta?.test_items,
    'test',
    '测试项目'
  )
)
const previewEvaluationRows = computed(() =>
  buildReadonlyReportRows(
    previewTemplateSnapshot.value?.evaluation_standards,
    previewReport.value?.meta?.evaluation_standards,
    'eval',
    '评价标准'
  )
)
const previewTransferDataRows = computed(() =>
  buildReadonlyTransferDataRows(
    previewTemplateSnapshot.value?.transfer_data_records,
    previewReport.value?.meta?.transfer_data_records
  )
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
    transfer_data_records: item.transferDataRecords || [],
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
      transfer_data_records:
        Array.isArray(existing.transfer_data_records) && existing.transfer_data_records.length
          ? existing.transfer_data_records
          : normalizedItem.transfer_data_records,
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
        normalizeCode(item.report_name) === normalized
    ) || null
  )
}

async function loadTemplate(device: ReportOperationDevice) {
  selectedTemplate.value = null
  templateMessage.value = ''

  if (device.orderType === 1) return

  templateLoading.value = true
  try {
    await ensureTemplateCatalog()

    const matchByCode = findMatchedTemplateByCode(device.template)
    if (matchByCode) {
      selectedTemplate.value = matchByCode
      templateMessage.value = '已使用下井作业中保存的关联模板。'
      return
    }

    const matchByProduct = findMatchedTemplateByProduct(device.deviceName)
    if (matchByProduct) {
      selectedTemplate.value = matchByProduct
      if (String(device.template || '').trim()) {
        templateMessage.value = '已保存的关联模板不存在，已按测试产品自动匹配。'
      } else {
        templateMessage.value = '未保存关联模板，已按测试产品自动匹配。'
      }
      return
    }

    templateMessage.value = '未找到与当前测试产品对应的报告模板，无法创建测试报告。'
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
  await Promise.all([loadTemplate(device), loadCurrentUserSignature()])
  mode.value = 'add-report'
}

function buildEditFallbackTemplate(meta: ReportMeta): SimulatedWellReportTemplateDetail {
  const snapshot = meta.template_snapshot && typeof meta.template_snapshot === 'object' ? meta.template_snapshot : {}
  return {
    id: Number(snapshot.id || meta.template_id || -Date.now()),
    report_no: String(snapshot.report_no || meta.template_code || meta.template_name || ''),
    report_name: String(snapshot.report_name || meta.template_name || meta.report_name || meta.template_code || '井下测试综合报告'),
    test_products: Array.isArray(snapshot.test_products) ? snapshot.test_products : [],
    match_instruments: Array.isArray(snapshot.match_instruments) ? snapshot.match_instruments : [],
    test_items: Array.isArray(snapshot.test_items) ? snapshot.test_items : [],
    evaluation_standards: Array.isArray(snapshot.evaluation_standards) ? snapshot.evaluation_standards : [],
    transfer_data_records: Array.isArray(snapshot.transfer_data_records) ? snapshot.transfer_data_records : [],
    updated_at: String(snapshot.updated_at || ''),
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
    testing_device: String(meta.testing_device || ''),
    test_objective: String(meta.test_objective || ''),
    test_type: String(meta.test_type || ''),
    test_count: String(meta.test_count || ''),
    repair_order_number: String(meta.repair_order_number || ''),
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
    orderType: normalizeOrderType(meta.order_type),
  }

  operationDate.value = report.test_date || new Date().toISOString().slice(0, 10)
  conclusion.value = meta.conclusion === 'unqualified' ? 'unqualified' : 'qualified'
  note.value = String(meta.note || '')
  noteEn.value = String(meta.note_en || '')
  curveChartNo.value = String(meta.curve_chart_no || '')
  curveFiles.value = []
  reportFiles.value = []
  clearOperatorSignature()
  if (report.operator_signature_url) {
    operatorSignaturePreviewUrl.value = resolveFileUrl(report.operator_signature_url)
    operatorSignatureSource.value = 'report'
  }
  assignReactiveMap(testItemValues, meta.test_items)
  assignReactiveMap(evaluationValues, meta.evaluation_standards)
  assignReactiveMap(transferDataValues, meta.transfer_data_records)

  selectedTemplate.value = null
  templateMessage.value = ''
  if (selectedDevice.value.orderType === 1) return
  templateLoading.value = true

  /*
   * 编辑时由于没有工单编号，所以要在曲线图中截取曲线图前缀
   */
  if (report.meta.curve_chart_no.indexOf("-") > 0) {
    curveChartNoPrefix.value = report.meta.curve_chart_no.substring(0, report.meta.curve_chart_no.indexOf("-") + 1)
  }
  try {
    await ensureTemplateCatalog()
    selectedTemplate.value = meta.template_snapshot
      ? buildEditFallbackTemplate(meta)
      : findMatchedTemplateByCode(String(meta.template_code || selectedDevice.value.template)) ||
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
  if (!isResearchReport.value && (!selectedTemplate.value || (!editingReport.value && selectedTemplate.value.id <= 0))) {
    ElMessage.warning('当前测试设备未关联有效报告模板，请先在管理端配置模板后再提交')
    return
  }
  const description = isResearchReport.value ? '' : note.value.trim()
  const descriptionEn = isResearchReport.value ? '' : noteEn.value.trim()
  if (!operatorSignaturePreviewUrl.value) {
    ElMessage.warning('请上传操作人的电子签名')
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
      order_type: selectedDevice.value.orderType,
      template_id: isResearchReport.value ? null : selectedTemplate.value?.id,
      template_code: isResearchReport.value ? '' : templateCode.value,
      template_name: isResearchReport.value ? '' : (selectedTemplate.value?.report_name || ''),
      downhole_work_no: selectedOperation.value.work_no,
      well_name: selectedOperation.value.well_name,
      testing_device: selectedOperation.value.testing_device || '',
      test_objective: selectedOperation.value.test_objective || '',
      test_type: selectedOperation.value.test_type || '',
      test_count: selectedOperation.value.test_count || '',
      repair_order_number: selectedOperation.value.repair_order_number || '',
      env_text: selectedOperation.value.env_text,
      interval_text: selectedOperation.value.interval_text,
      device_name: selectedDevice.value.deviceName,
      device_sn: selectedDevice.value.sn,
      conclusion: isResearchReport.value ? '' : conclusion.value,
      test_items: isResearchReport.value ? {} : collectMeta(testItemValues),
      evaluation_standards: isResearchReport.value ? {} : collectMeta(evaluationValues),
      transfer_data_records: isResearchReport.value ? {} : collectMeta(transferDataValues),
      curve_chart_no: curveChartNo.value.trim(),
      curve_chart_files: curveFiles.value.map((file) => file.name),
      report_files: reportFiles.value.map((file) => file.name),
      pdf_files: reportFiles.value.map((file) => file.name),
      note: description,
      note_en: descriptionEn
    }
    if (!editing && (!selectedDevice.value.orderDbId || !selectedDevice.value.deviceDbId)) {
      ElMessage.error('当前测试产品缺少工单关联信息，请重新从排程日历领取')
      return
    }
    const payload = {
      report_no: reportNo,
      task_number: selectedOperation.value.work_no,
      test_date: operationDate.value,
      tester: editing?.tester || getCurrentUserName(),
      status: 0,
      report_json: reportJson,
      order_ids: selectedDevice.value.orderDbId ? [selectedDevice.value.orderDbId] : undefined,
      order_numbers: [selectedDevice.value.orderId],
      instrument_results: selectedDevice.value.orderDbId && selectedDevice.value.deviceDbId
        ? [{
            order_id: selectedDevice.value.orderDbId,
            device_id: selectedDevice.value.deviceDbId,
            instrument_sn: selectedDevice.value.sn,
          }]
        : undefined,
      client_submit_id: editing?.client_submit_id || `${reportNo}-${Date.now()}`,
    }
    const uploadFiles: SimulatedWellLocalUploadFile[] = [
      ...curveFiles.value.map((file) => ({ ...file, kind: 'curve_chart' as const })),
      ...reportFiles.value.map((file) => ({ ...file, kind: 'report_file' as const })),
      ...(operatorSignatureFile.value
        ? [{ ...operatorSignatureFile.value, kind: 'operator_signature' as const }]
        : []),
    ]

    if (editing && (curveFiles.value.length || reportFiles.value.length)) {
      ElMessage.warning('编辑模式暂不替换已上传附件，本次仅保存报告字段')
    }
    let res
    if (editing) {
      if (operatorSignatureFile.value) {
        const signatureBytes = await readFile(operatorSignatureFile.value.path)
        res = await updateSimulatedWellReportWithSignature(
            editing.id,
            payload,
            {
              fieldName: 'operator_signature',
              fileName: operatorSignatureFile.value.name,
              blob: new Blob([signatureBytes], { type: contentTypeForName(operatorSignatureFile.value.name) }),
            },
            getAuthHeaders()
          )
      } else {
        res = await updateSimulatedWellReport(editing.id, payload, getAuthHeaders())
      }
    } else if (uploadFiles.length) {
      uploadCancelRequested.value = false
      Object.assign(uploadProgress, { fileName: '', uploaded: 0, total: uploadFiles.reduce((total, file) => total + file.size, 0), speed: 0 })
      uploadPhase.value = 'uploading'
      res = await createSimulatedWellReportWithLargeFiles(
        payload,
        uploadFiles,
        getAuthHeaders(),
        (uploadId) => { activeUploadId.value = uploadId },
        () => { uploadPhase.value = 'saving' },
      )
    } else {
      res = await createSimulatedWellReport(payload, getAuthHeaders())
    }
    if (!res.success) {
      if (!uploadCancelRequested.value) ElMessage.error(res.error || '保存测试报告失败')
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
    activeUploadId.value = ''
    uploadPhase.value = 'idle'
    uploadCancelRequested.value = false
  }
}

async function cancelCurrentUpload() {
  if (!activeUploadId.value || uploadPhase.value !== 'uploading') return
  uploadCancelRequested.value = true
  const uploadId = activeUploadId.value
  await cancelSimulatedWellLargeUpload(uploadId, getAuthHeaders())
  ElMessage.info('上传已取消，再次提交将从头上传')
}

onBeforeUnmount(() => {
  revokeOperatorSignatureObjectUrl()
  uploadProgressUnlisten?.()
  if (activeUploadId.value && uploadPhase.value === 'uploading') {
    void cancelSimulatedWellLargeUpload(activeUploadId.value, getAuthHeaders())
  }
})

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

async function openPreview(report: SimulatedWellReportItem & { meta: ReportMeta }) {
  let reportDetail = report
  try {
    await initAuth()
    const res = await getSimulatedWellReportDetail(report.id, getAuthHeaders())
    if (!res.success || res.data?.code !== 0 || !res.data.data) {
      ElMessage.warning(res.error || res.data?.msg || '报告详情加载失败，已展示列表缓存数据')
    } else {
      const detail = res.data.data
      reportDetail = { ...detail, meta: getReportMeta(detail) }
    }
  } catch (error) {
    console.error('获取模拟井报告详情失败', error)
    ElMessage.warning('报告详情加载失败，已展示列表缓存数据')
  }
  previewReport.value = reportDetail
}

function closePreview() {
  previewReport.value = null
  previewAttachment.value = null
}

async function openAttachment(attachment: ReportAttachment) {
  const url = resolveFileUrl(attachment.file_url)
  if (!url) {
    ElMessage.warning('附件暂无可访问地址')
    return
  }
  const title = attachmentTitle(attachment)
  if (isImageAttachment(attachment)) {
    previewAttachment.value = { title, url, isImage: true }
    return
  }
  if (!/^https?:\/\//i.test(url)) {
    ElMessage.warning('附件地址无效，无法打开文件')
    return
  }
  openingAttachment.value = attachment
  try {
    await openUrl(url)
  } catch (error) {
    console.error('打开报告附件失败', error)
    const reason = error instanceof Error ? error.message : ''
    ElMessage.error(reason ? `文件打开失败：${reason}` : '文件打开失败')
  } finally {
    openingAttachment.value = null
  }
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
  uploadProgressUnlisten = await listen<UploadProgressEvent>('simulated-well-upload-progress', (event) => {
    if (event.payload.uploadId !== activeUploadId.value) return
    uploadProgress.fileName = event.payload.fileName
    uploadProgress.uploaded = event.payload.uploaded
    uploadProgress.total = event.payload.total
    uploadProgress.speed = event.payload.bytesPerSecond
  })
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
        <span>审核驳回消息：{{ editingReport.remark || '-' }}</span>
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
                    <button v-if="row.status !== 1" class="action-btn action-btn-edit" @click="openEditReport(row)">
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
                  <td>{{ formatSimulatedWellEnvironment(work.env_text) }}</td>
                  <td>{{ formatSimulatedWellInterval(work.interval_text) }}</td>
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
              <div v-if="device.template" class="device-meta">模板：{{ device.template }}</div>
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="downhole-card">
          <div class="section-header-row">
            <div>
              <div class="downhole-card-title">{{ reportTitle }}</div>
              <div v-if="usesTemplateReport" class="section-desc">模板编号：{{ templateCode }}</div>
            </div>
            <div v-if="usesTemplateReport && templateLoading" class="tiny-hint">模板加载中...</div>
          </div>
          <div v-if="usesTemplateReport && templateMessage" class="inline-hint">{{ templateMessage }}</div>

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
              <div class="info-value">{{ formatSimulatedWellEnvironment(selectedOperation?.env_text) }}</div>
            </div>
            <div class="info-item wide">
              <div class="info-label">测试井段</div>
              <div class="info-value">{{ formatSimulatedWellInterval(selectedOperation?.interval_text) }}</div>
            </div>
          </div>
        </div>

        <div v-if="!isResearchReport" class="downhole-card">
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
                  <span v-if="getFieldType(field) === 'number' && field?.unit" class="single-input-unit">{{ field.unit }}</span>
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

              <div v-else-if="getFieldType(field) === 'single-input'" class="compound-card">
                <div class="field-row-title">{{ getFieldLabel(field, `测试项目${index + 1}`) }}</div>
                <div v-if="getFieldLabelEn(field)" class="field-row-sub">{{ getFieldLabelEn(field) }}</div>
                <div class="single-input-row">
                  <div class="single-input-control">
                    <input v-model="testItemValues[fieldKey('test', index)]" type="text" class="form-input" />
                    <span v-if="field?.unit" class="single-input-unit">{{ field.unit }}</span>
                  </div>
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
                  <div class="form-input-div">
                    <input v-model="testItemValues[fieldKey('test', index, 'from')]" type="number" class="form-input" placeholder="起始深度" />
                    <span>{{field.unit}}</span>
                  </div>
                  <span class="range-sep">~</span>
                  <div class="form-input-div">
                    <input v-model="testItemValues[fieldKey('test', index, 'to')]" type="number" class="form-input" placeholder="结束深度" />
                    <span>{{field.unit}}</span>
                  </div>
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

        <div v-if="!isResearchReport" class="downhole-card">
          <div class="downhole-card-title">资料评价标准值 <span class="english-sub">Data Evaluation Standard Value</span></div>
          <div v-if="!(selectedTemplate?.evaluation_standards || []).length" class="empty-state"><p>当前模板未配置评价标准</p></div>
          <div v-else class="field-list">
            <div v-for="(field, index) in selectedTemplate?.evaluation_standards || []" :key="fieldKey('eval', index)" class="field-row-card">
              <div class="field-row-main">
                <div class="field-row-title">{{ getFieldLabel(field, `评价标准${index + 1}`) }}</div>
                <div v-if="getFieldLabelEn(field)" class="field-row-sub">{{ getFieldLabelEn(field) }}</div>
              </div>
              <div v-if="getFieldType(field) === 'single-input'" class="single-input-evaluation">
                <div class="single-input-control">
                  <input v-model="evaluationValues[fieldKey('eval', index)]" type="text" class="form-input" />
                  <span v-if="field?.unit" class="single-input-unit">{{ field.unit }}</span>
                </div>
                <div class="inline-radio-group">
                  <label class="inline-radio">
                    <input v-model="evaluationValues[fieldKey('eval', index, 'result')]" type="radio" :name="fieldKey('eval', index, 'result')" value="qualified" />
                    <span class="radio-label-ok">符合</span>
                  </label>
                  <label class="inline-radio">
                    <input v-model="evaluationValues[fieldKey('eval', index, 'result')]" type="radio" :name="fieldKey('eval', index, 'result')" value="unqualified" />
                    <span class="radio-label-fail">不符合</span>
                  </label>
                </div>
              </div>
              <div v-else-if="getFieldType(field) === 'textarea'" class="field-row-input">
                <textarea v-model="evaluationValues[fieldKey('eval', index)]" class="form-input textarea" rows="2" />
              </div>
              <div v-else-if="getFieldType(field) === 'text' || getFieldType(field) === 'number'" class="field-row-input unit-flex">
                <input
                  v-model="evaluationValues[fieldKey('eval', index)]"
                  class="form-input"
                  :type="getFieldType(field) === 'number' ? 'number' : 'text'"
                />
                <span v-if="getFieldType(field) === 'number' && field?.unit" class="single-input-unit">{{ field.unit }}</span>
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

        <div v-if="!isResearchReport && (selectedTemplate?.transfer_data_records || []).length" class="downhole-card">
          <div class="downhole-card-title">测试完成转样数据记录 <span class="english-sub">Transferred Data Record Finished by Test</span></div>
          <div class="field-list">
            <template v-for="(field, fieldIndex) in selectedTemplate?.transfer_data_records || []" :key="fieldKey('transfer', fieldIndex)">
              <div v-if="getFieldType(field) !== 'single-row-multi-column'" class="field-row-card">
                <div class="tiny-hint">请在管理端完善单行多列配置</div>
              </div>
              <div v-else-if="!getTransferColumns(field).length" class="field-row-card">
                <div class="tiny-hint">请在管理端完善单行多列配置</div>
              </div>
              <template v-else>
                <div
                  v-for="(column, columnIndex) in getTransferColumns(field)"
                  :key="fieldKey('transfer', fieldIndex, `c${columnIndex}`)"
                  class="field-row-card"
                >
                  <div class="field-row-main">
                    <div class="field-row-title">{{ getTransferDataLabel(field, fieldIndex, column, columnIndex) }}</div>
                    <div v-if="getTransferDataLabelEn(field, column)" class="field-row-sub">{{ getTransferDataLabelEn(field, column) }}</div>
                  </div>
                  <div class="field-row-input unit-flex">
                    <input v-model="transferDataValues[fieldKey('transfer', fieldIndex, `c${columnIndex}`)]" type="text" class="form-input" />
                    <span v-if="column?.unit" class="single-input-unit">{{ column.unit }}</span>
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>

        <div v-if="!isResearchReport" class="downhole-card">
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
          <div class="info-grid two-col conclusion-description-grid">
            <div class="info-item">
              <div class="info-label">描述（中文）</div>
              <textarea v-model="note" class="form-input textarea" rows="2" placeholder="请输入中文描述" />
            </div>
            <div class="info-item">
              <div class="info-label">描述（英文）</div>
              <textarea v-model="noteEn" class="form-input textarea" rows="2" placeholder="Please enter the description in English" />
            </div>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">操作人员信息 <span class="english-sub">Operator Information</span></div>
          <div class="info-grid two-col">
            <div class="info-item">
              <div class="info-label">操作工程师</div>
              <div class="info-value">{{ getCurrentUserName() }}</div>
            </div>
            <div class="info-item operator-signature-item">
              <div class="info-label">电子签名 <span class="required-mark">*</span></div>
              <div class="operator-signature-content">
                <div class="operator-signature-preview" :class="{ empty: !operatorSignaturePreviewUrl }">
                  <span v-if="operatorSignatureLoading">签名加载中...</span>
                  <img v-else-if="operatorSignaturePreviewUrl" :src="operatorSignaturePreviewUrl" alt="操作人电子签名" />
                  <span v-else>请上传操作人的电子签名</span>
                </div>
                <div class="operator-signature-actions">
                  <span class="tiny-hint">{{ operatorSignatureSourceText }}</span>
                  <button type="button" class="signature-upload-btn" :disabled="saving" @click="selectOperatorSignature">
                    {{ operatorSignaturePreviewUrl ? '重新上传' : '上传签名' }}
                  </button>
                  <span class="tiny-hint">支持 PNG、JPG、WEBP，最大 5MB；本次上传不会修改个人签名</span>
                </div>
              </div>
            </div>
            <div class="info-item">
              <div class="info-label">操作日期</div>
              <input v-model="operationDate" type="date" class="form-input" disabled/>
            </div>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">测试原始文件 <span class="english-sub">Test Raw File</span></div>
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
              <div class="upload-title">上传测试原始文件</div>
              <button type="button" class="week-cal-nav" :disabled="saving" @click="selectCurveFiles">选择原始文件</button>
              <div class="file-list">
                <div v-for="file in curveFiles" :key="file.path" class="file-row">{{ file.name }} · {{ formatFileSize(file.size) }}</div>
                <div v-if="!curveFiles.length" class="tiny-hint">支持全部文件类型，可多选；单文件最大 20 GiB</div>
              </div>
            </div>
          </div>
        </div>

        <div class="downhole-card">
          <div class="downhole-card-title">上传测试文件 <span class="english-sub">Upload Files</span></div>
          <div class="upload-grid">
            <div class="upload-box">
              <div class="upload-title">测试报告文件</div>
              <button type="button" class="week-cal-nav" :disabled="saving" @click="selectReportFile">选择 PDF</button>
              <div class="file-list">
                <div v-for="file in reportFiles" :key="file.path" class="file-row">{{ file.name }} · {{ formatFileSize(file.size) }}</div>
                <div v-if="!reportFiles.length" class="tiny-hint">仅支持上传一份 PDF 文件</div>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <div v-if="saving && uploadPhase !== 'idle'" class="large-upload-progress">
            <div>{{ uploadPhase === 'saving' ? '文件已上传，正在保存报告…' : `正在上传：${uploadProgress.fileName}` }}</div>
            <div v-if="uploadPhase === 'uploading'" class="tiny-hint">
              {{ formatFileSize(uploadProgress.uploaded) }} / {{ formatFileSize(uploadProgress.total) }}
              · {{ formatFileSize(uploadProgress.speed) }}/s
            </div>
            <progress v-if="uploadPhase === 'uploading'" :value="uploadProgress.uploaded" :max="uploadProgress.total || 1" />
            <button v-if="uploadPhase === 'uploading'" type="button" class="week-cal-nav" @click="cancelCurrentUpload">取消上传</button>
          </div>
          <button class="week-cal-nav" :disabled="saving" @click="backStep">返回</button>
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
            <div v-if="!isPreviewResearchReport" class="info-item">
              <div class="info-label">报告名称</div>
              <div class="info-value">{{ previewReport.meta.report_name || '' }}</div>
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
            <div class="info-item wide">
              <div class="info-label">电子签名</div>
              <div v-if="previewReport.operator_signature_url" class="report-signature-preview">
                <img :src="resolveFileUrl(previewReport.operator_signature_url)" alt="操作人电子签名" />
              </div>
              <div v-else class="info-value">未记录电子签名</div>
            </div>
            <div class="info-item">
              <div class="info-label">测试环境</div>
              <div class="info-value">{{ formatSimulatedWellEnvironment(previewReport.meta.env_text) }}</div>
            </div>
            <div class="info-item wide">
              <div class="info-label">测试井段</div>
              <div class="info-value">{{ formatSimulatedWellInterval(previewReport.meta.interval_text) }}</div>
            </div>
            <div v-if="!isPreviewResearchReport" class="info-item wide">
              <div class="info-label">测试结论</div>
              <div class="info-value">{{ previewReport.meta.conclusion === 'unqualified' ? '所测资料存在不合格项' : '所测资料合格' }}</div>
            </div>
            <div v-if="!isPreviewResearchReport && previewReport.meta.note" class="info-item wide">
              <div class="info-label">描述（中文）</div>
              <div class="info-value">{{ previewReport.meta.note }}</div>
            </div>
            <div v-if="!isPreviewResearchReport && previewReport.meta.note_en" class="info-item wide">
              <div class="info-label">描述（英文）</div>
              <div class="info-value">{{ previewReport.meta.note_en }}</div>
            </div>
          </div>
          <div v-if="!isPreviewResearchReport" class="report-data-section">
            <div class="downhole-card-title">测试项目 <span class="english-sub">Test Item</span></div>
            <div v-if="!previewTemplateSnapshot" class="tiny-hint">暂无可用项目定义</div>
            <div v-else-if="!previewTestItemRows.length" class="tiny-hint">当前模板未配置测试项目</div>
            <div v-else class="readonly-report-list">
              <div v-for="row in previewTestItemRows" :key="row.label" class="readonly-report-row">
                <div class="readonly-report-label">{{ row.label }}</div>
                <div class="readonly-report-value">{{ row.value }}</div>
              </div>
            </div>
          </div>
          <div v-if="!isPreviewResearchReport" class="report-data-section">
            <div class="downhole-card-title">资料评价标准值 <span class="english-sub">Data Evaluation Standard Value</span></div>
            <div v-if="!previewTemplateSnapshot" class="tiny-hint">暂无可用项目定义</div>
            <div v-else-if="!previewEvaluationRows.length" class="tiny-hint">当前模板未配置评价标准</div>
            <div v-else class="readonly-report-list">
              <div v-for="row in previewEvaluationRows" :key="row.label" class="readonly-report-row">
                <div class="readonly-report-label">{{ row.label }}</div>
                <div class="readonly-report-value">{{ row.value }}</div>
              </div>
            </div>
          </div>
          <div v-if="!isPreviewResearchReport && previewTransferDataRows.length" class="report-data-section">
            <div class="downhole-card-title">测试完成转样数据记录 <span class="english-sub">Transferred Data Record Finished by Test</span></div>
            <div class="readonly-report-list">
              <div v-for="row in previewTransferDataRows" :key="row.label" class="readonly-report-row">
                <div class="readonly-report-label">{{ row.label }}</div>
                <div class="readonly-report-value">{{ row.value }}</div>
              </div>
            </div>
          </div>
          <div class="attachment-section">
            <div class="downhole-card-title">报告附件 <span class="english-sub">Attachments</span></div>
            <div v-if="!getReportAttachments(previewReport).length" class="tiny-hint">暂无上传附件</div>
            <div v-else class="attachment-list">
              <div v-if="curveAttachments(previewReport).length" class="attachment-row">
                <div class="attachment-main">
                  <span class="attachment-badge">原始文件</span>
                  <div class="attachment-file-list">
                    <div
                      v-for="(attachment, index) in curveAttachments(previewReport)"
                      :key="`${attachment.field}-${attachment.file_name || attachment.name}-${index}`"
                      class="attachment-file-item"
                    >
                      <div class="attachment-name" :title="attachmentTitle(attachment)">{{ attachmentTitle(attachment) }}</div>
                      <div class="attachment-path" :title="attachmentPath(attachment)">{{ attachmentPath(attachment) }}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div
                v-for="(attachment, index) in otherAttachments(previewReport)"
                :key="`${attachment.field}-${attachment.file_name || attachment.name}-${index}`"
                class="attachment-row"
              >
                <div class="attachment-main">
                  <span class="attachment-badge">{{ attachmentDisplayType(attachment) }}</span>
                  <div class="attachment-file-list">
                    <div class="attachment-name" :title="attachmentTitle(attachment)">{{ attachmentTitle(attachment) }}</div>
                    <div class="attachment-path" :title="attachmentPath(attachment)">{{ attachmentPath(attachment) }}</div>
                  </div>
                </div>
                <button
                  class="action-btn action-btn-view"
                  :disabled="openingAttachment === attachment"
                  @click="openAttachment(attachment)"
                >
                  {{ isImageAttachment(attachment) ? '预览图片' : openingAttachment === attachment ? '打开中...' : '打开文件' }}
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
  .unit-flex {
    display: flex;
    align-items: center;
  }
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

.conclusion-description-grid {
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
  justify-content: space-between;
  .form-input-div {
    width: 40%;
  }
  .form-input {
    width: 90%;
  }
}

.single-input-row,
.single-input-evaluation,
.single-input-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.single-input-row {
  flex-wrap: wrap;
  margin-top: 10px;
}

.single-input-evaluation {
  flex: 1;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.single-input-control {
  flex: 0 1 320px;
}

.single-input-unit {
  flex-shrink: 0;
  min-width: 28px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
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

.large-upload-progress {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
}

.large-upload-progress progress {
  width: 100%;
  height: 10px;
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

.report-data-section {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--color-border, #dce6ee);
  border-radius: 14px;
  background: #f8fafc;
}

.readonly-report-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.readonly-report-row {
  display: grid;
  grid-template-columns: minmax(160px, 32%) 1fr;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}

.readonly-report-label,
.readonly-report-value {
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.readonly-report-label {
  font-weight: 600;
  color: #334155;
  background: #f1f5f9;
}

.readonly-report-value {
  color: #475569;
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
  align-items: flex-start;
  gap: 10px;
}

.attachment-file-list {
  min-width: 0;
  flex: 1;
}

.attachment-file-item + .attachment-file-item {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
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

.attachment-path {
  max-width: 580px;
  margin-top: 3px;
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-row .action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
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

.required-mark {
  color: #dc2626;
}

.operator-signature-content {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.operator-signature-preview,
.report-signature-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 1 240px;
  width: 240px;
  min-height: 96px;
  overflow: hidden;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
}

.operator-signature-preview.empty {
  border-style: dashed;
  color: #94a3b8;
}

.operator-signature-preview img,
.report-signature-preview img {
  display: block;
  width: 100%;
  height: 96px;
  object-fit: contain;
}

.operator-signature-actions {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  min-width: 0;
  gap: 8px;
}

.signature-upload-btn {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #0b78d0;
  border-radius: 8px;
  color: #0b78d0;
  font-weight: 600;
  cursor: pointer;
}

.signature-upload-btn input {
  display: none;
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

  .attachment-row {
    align-items: stretch;
    flex-direction: column;
  }

  .attachment-path {
    max-width: 100%;
  }

  .field-row-input {
    width: 100%;
  }

  .attachment-row {
    align-items: stretch;
    flex-direction: column;
  }

  .operator-signature-content {
    align-items: stretch;
    flex-direction: column;
  }

  .operator-signature-preview,
  .report-signature-preview {
    width: 100%;
  }
}
</style>
