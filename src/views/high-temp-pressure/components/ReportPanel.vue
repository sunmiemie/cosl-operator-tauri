<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ScheduledSelection } from '../types'
import { formatRuntimeHours } from '../utils/runtime'
import type {
  HighTempPressureReportDraft,
  HighTempPressureReportUnitDraft,
} from '../utils/pendingReport'
import ReportCurveEditor, {
  type HighTempPressureCurveExport,
  type HighTempPressureCurveRangeDraft,
} from './ReportCurveEditor.vue'
import { useAuth } from '@/composables/useAuth'
import {
  createHighTempPressureReportWithFiles,
  type HighTempPressureReportResult,
} from '@/services/high-temp-pressure-report-api'
import type { EquipmentReportUploadFile } from '@/services/equipment-report-api'
import {
  getSignatureDisplayName,
  loadCurrentUserReportSignature,
  type CurrentUserReportSignature,
} from '@/services/signature-api'
import {
  getHighTempPressureOrder,
  listHighTempPressureOrders,
  type HighTempPressureOrderDTO,
  type HighTempPressureOrderInstrumentDTO,
} from '@/services/high-temp-pressure-api'
import { fetchScheduleHostDevicePsiIds } from '@/services/schedule-host-device-api'

const props = defineProps<{
  currentSelected: ScheduledSelection | null
  selectedScheduledOrders: ScheduledSelection[]
  csvCount: number
  exportedCaptureDir: string
  runtimeSeconds?: number
  clientSubmitId?: string
  initialDraft?: HighTempPressureReportDraft
}>()
const emit = defineEmits<{
  'report-submitted': []
  'report-draft-change': [draft: HighTempPressureReportDraft]
  'shutdown-complete': []
}>()

type FileStatus = 'pending' | 'generating' | 'done'
type FileKey = 'json' | 'curve' | 'report'
type InstrumentResultState = {
  result: HighTempPressureReportResult
  observation: string
}
type ReportStage = 'editing' | 'review'
type PaperReportChecks = HighTempPressureReportDraft['paperReportChecks']

const { initAuth, getAuthHeaders } = useAuth()

const fileStatuses = ref<Record<FileKey, FileStatus>>({
  json: 'pending',
  curve: 'pending',
  report: 'pending',
})
const instrumentResultMap = ref<Record<string, InstrumentResultState>>({})
const observation = ref('')
const operatorName = ref('')
const testerSignature = ref<CurrentUserReportSignature | null>(null)
const testerSignatureLoading = ref(false)
const testerSignatureError = ref('')
const testerSignaturePreviewUrl = ref('')
const confirmChecks = ref([false, false, false, false])
const createDefaultPaperReportChecks = (): PaperReportChecks => ({
  onlineTest: false,
  otherRequirements: '无',
  testingProtectiveCapProvider: 'applicant',
  testingPlugProvider: 'applicant',
  noDistorted: true,
  noLeakage: true,
  curveStatus: 'normal',
  otherDescriptions: '无',
  testingCurveCopies: 1,
  otherCopies: 5,
})
const paperReportChecks = ref<PaperReportChecks>(createDefaultPaperReportChecks())
const reportUnitDraftMap = ref<Record<string, HighTempPressureReportUnitDraft>>({})
const activeReportIndex = ref(0)
const reportStage = ref<ReportStage>('editing')
const reviewConfirmed = ref(false)
const showFileSaveModal = ref(false)
const uploadCompleted = ref(false)
const uploadSubmitting = ref(false)
const submittedReportNo = ref('')
const clientSubmitId = ref('')
const shutdownChecks = ref([false, false, false, false, false])
const shiftHours = ref('')
const runtimeHours = computed(() => formatRuntimeHours(props.runtimeSeconds ?? 0))
const totalHours = computed(() => runtimeHours.value)
const taskSummary = ref('')
const curveEditor = ref<{ exportCurveFiles: () => Promise<HighTempPressureCurveExport[]> } | null>(null)
const curveReady = ref(false)
const preparedCurves = ref<HighTempPressureCurveExport[]>([])
const curveRanges = ref<HighTempPressureCurveRangeDraft[]>(
  props.initialDraft?.curveRanges?.length
    ? props.initialDraft.curveRanges.map((range) => ({ ...range }))
    : [{
        id: 'full-range',
        title: '全程曲线',
        startMs: props.initialDraft?.curveRange?.startMs ?? null,
        endMs: props.initialDraft?.curveRange?.endMs ?? null,
      }]
)

const reportSelections = computed(() => {
  return props.selectedScheduledOrders.length ? props.selectedScheduledOrders : props.currentSelected ? [props.currentSelected] : []
})

const primaryOrder = computed(() => reportSelections.value[0]?.order ?? null)
const selectionSignature = computed(() => reportSelections.value.map((item) => `${item.order.dbId ?? item.order.id}:${item.instrument.id}:${item.instrument.sn}`).join('|'))
const orderNos = computed(() => Array.from(new Set(reportSelections.value.map((item) => item.order.no))).join(' / ') || '-')
const instruments = computed(() => reportSelections.value.map((item) => `${item.instrument.label} ${item.instrument.sn}`).join(', ') || '-')
const canGenerateReport = computed(() => fileStatuses.value.json === 'done' && curveReady.value)
const savePath = computed(() => props.exportedCaptureDir || '未获取到保存目录，请先完成 OCR 识别结果保存')
const savedFiles = computed(() => [
  { icon: '🗂', name: 'ocr_readings_0.5s.json', usage: '仅本机保留' },
  ...curveRanges.value.map((range, index) => ({
    icon: '📈',
    name: `高温高压测试结果曲线-${String(index + 1).padStart(2, '0')}.png`,
    usage: `${range.title || `曲线${index + 1}`} · 独立打印附件`,
  })),
  { icon: '📄', name: '设备级高温高压测试报告.pdf', usage: '仅报告正文，服务端按设备生成' },
])
const shutdownItems = [
  '确定配电柜总电源开关关闭',
  '确保卸压阀处于开启状态',
  '确认高压管线及接头无泄漏、无异常',
  '确认测试台及周边环境已清理完毕',
  '填写并保存本次设备运转结束记录',
]
const shutdownReady = computed(() => shutdownChecks.value.every(Boolean) && !!shiftHours.value && !!taskSummary.value.trim())
const instrumentRows = computed(() => reportSelections.value.map((selection) => {
  const key = getInstrumentKey(selection)
  const state = instrumentResultMap.value[key] || { result: 'pass' as HighTempPressureReportResult, observation: '' }
  return { key, selection, state }
}))
const activeReportRow = computed(() => instrumentRows.value[activeReportIndex.value] ?? null)
const activeReportSelection = computed(() => activeReportRow.value?.selection ?? null)
const activeReportOrder = computed(() => activeReportSelection.value?.order ?? primaryOrder.value)
const activeReportKey = computed(() => activeReportRow.value?.key || '')
const completedReportCount = computed(() => instrumentRows.value.filter((row) => reportUnitDraftMap.value[row.key]?.completed).length)
const allReportsCompleted = computed(() => instrumentRows.value.length > 0 && completedReportCount.value === instrumentRows.value.length)
const activeApplicantName = computed(() => activeReportOrder.value?.applicant || '-')
const activeInstrumentText = computed(() => {
  const selection = activeReportSelection.value
  return selection ? `${selection.instrument.label} ${selection.instrument.sn}`.trim() : '-'
})
const activeOrderNo = computed(() => activeReportOrder.value?.no || '-')
const overallResult = computed<HighTempPressureReportResult>(() => {
  const results = instrumentRows.value.map((row) => reportUnitDraftMap.value[row.key]?.result || row.state.result)
  if (results.includes('fail')) return 'fail'
  if (!results.length || results.includes('pending')) return 'pending'
  return 'pass'
})

const statusText = (status: FileStatus) => {
  if (status === 'done') return '✓ 已生成'
  if (status === 'generating') return '⟳ 生成中...'
  return '待生成'
}

const resultText = (result: HighTempPressureReportResult) => {
  if (result === 'pass') return '合格'
  if (result === 'fail') return '不合格'
  return '待定'
}

const todayText = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const normalizeCopyCount = (value: number, fallback: number, min: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.floor(numeric))
}

const createClientSubmitId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `htp-${crypto.randomUUID()}`
  }
  return `htp-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getInstrumentKey(selection: ScheduledSelection) {
  return `${selection.order.dbId ?? selection.order.id}:${selection.instrument.id}:${selection.instrument.sn}`
}

function normalizeEquipmentId(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function resolveScheduledEquipmentId(
  selection: ScheduledSelection,
  instrument: HighTempPressureOrderInstrumentDTO | undefined,
  psiIdsByName: Record<string, string>
) {
  const directId = normalizeEquipmentId(selection.equipmentId, selection.instrument.equipmentId)
  if (directId) return directId

  const segments = Array.isArray(instrument?.schedule_segments) ? instrument.schedule_segments : []
  const preferredName = String(
    selection.useDevice || selection.instrument.useDevice || selection.order.useDevice || ''
  ).trim()
  const matchingSegments = preferredName
    ? segments.filter((segment) => String(segment?.use_device || segment?.useDevice || '').trim() === preferredName)
    : []
  const candidates = matchingSegments.length ? matchingSegments : segments
  const ids = Array.from(new Set(
    candidates
      .map((segment) => normalizeEquipmentId(segment?.equipment_id, segment?.equipmentId))
      .filter(Boolean)
  ))
  if (ids.length === 1) return ids[0]
  return preferredName ? normalizeEquipmentId(psiIdsByName[preferredName]) : ''
}

function orderIdentityMatches(selection: ScheduledSelection, detail: HighTempPressureOrderDTO) {
  const taskNumber = selection.order.no.trim()
  const tableNo = String(selection.order.tableNo || '').trim()
  return Boolean(
    (taskNumber && detail.task_number?.trim() === taskNumber)
    || (tableNo && detail.table_no?.trim() === tableNo)
  )
}

async function loadCanonicalOrderDetail(selection: ScheduledSelection) {
  const headers = getAuthHeaders()
  const cachedOrderId = selection.order.dbId
  if (typeof cachedOrderId === 'number') {
    const response = await getHighTempPressureOrder(cachedOrderId, headers)
    const detail = response.success && response.data?.code === 0 ? response.data.data : undefined
    if (detail && orderIdentityMatches(selection, detail)) return detail
  }

  const taskNumber = selection.order.no.trim()
  const tableNo = String(selection.order.tableNo || '').trim()
  const response = await listHighTempPressureOrders({ page: 1, pageSize: 50, taskNumber }, headers)
  const rows = response.success && response.data?.code === 0 ? response.data.data?.list || [] : []
  const matched = rows.find((row) =>
    (taskNumber && row.task_number?.trim() === taskNumber)
    || (tableNo && row.table_no?.trim() === tableNo)
  )
  if (matched) {
    const detailResponse = await getHighTempPressureOrder(matched.id, headers)
    if (detailResponse.success && detailResponse.data?.code === 0 && detailResponse.data.data) {
      return detailResponse.data.data
    }
  }

  throw new Error(`缓存工单 ${taskNumber || tableNo || cachedOrderId || '-'} 与当前服务端数据不一致，已停止上传以避免报告关联错误；请恢复或重新下发该工单后再提交`)
}

type ScheduledReportBinding = {
  orderId: number
  instrumentId: number
  equipmentId: string
}

async function loadScheduledReportBindings() {
  const hostResult = await fetchScheduleHostDevicePsiIds('high-temp-pressure', getAuthHeaders())
  const psiIdsByName = hostResult.success ? hostResult.psiIdsByName : {}
  const detailEntries = await Promise.all(reportSelections.value.map(async (selection) => [
    getInstrumentKey(selection),
    await loadCanonicalOrderDetail(selection),
  ] as const))
  const detailsByInstrumentKey = new Map(detailEntries)
  const bindings = new Map<string, ScheduledReportBinding>()
  const unresolved: string[] = []

  reportSelections.value.forEach((selection) => {
    const key = getInstrumentKey(selection)
    const detail = detailsByInstrumentKey.get(key)
    const instrument = detail?.instruments?.find((item) => item.instrument_sn === selection.instrument.sn)
    const equipmentId = resolveScheduledEquipmentId(selection, instrument, psiIdsByName)
    if (detail && typeof instrument?.id === 'number' && equipmentId) {
      bindings.set(key, { orderId: detail.id, instrumentId: instrument.id, equipmentId })
      return
    }
    unresolved.push(`${selection.order.no}/${selection.instrument.sn}`)
  })

  if (unresolved.length) {
    const hostReason = hostResult.success ? '' : `（测试台列表读取失败：${hostResult.error || '未知错误'}）`
    throw new Error(`以下仪器无法确定唯一测试台 psi_id：${unresolved.join('、')}${hostReason}`)
  }
  return bindings
}

function resetReportStateForSelections() {
  clientSubmitId.value = props.clientSubmitId?.trim() || createClientSubmitId()
  submittedReportNo.value = ''
  uploadCompleted.value = false
  const next: Record<string, InstrumentResultState> = {}
  reportSelections.value.forEach((selection) => {
    const key = getInstrumentKey(selection)
    next[key] = instrumentResultMap.value[key] || { result: 'pass', observation: '' }
  })
  instrumentResultMap.value = next
  const validKeys = new Set(reportSelections.value.map(getInstrumentKey))
  reportUnitDraftMap.value = Object.fromEntries(
    Object.entries(reportUnitDraftMap.value).filter(([key]) => validKeys.has(key))
  )
  activeReportIndex.value = 0
  reportStage.value = 'editing'
  reviewConfirmed.value = false
}

function clonePaperReportChecks(value: PaperReportChecks): PaperReportChecks {
  return { ...value }
}

function cloneReportUnitDraft(
  value: HighTempPressureReportUnitDraft,
  completed = value.completed
): HighTempPressureReportUnitDraft {
  const cloned: HighTempPressureReportUnitDraft = {
    ...value,
    confirmChecks: value.confirmChecks.slice(),
    paperReportChecks: clonePaperReportChecks(value.paperReportChecks),
    completed,
  }
  delete cloned.reviewerName
  return cloned
}

function currentReportUnitDraft(completed?: boolean): HighTempPressureReportUnitDraft | null {
  const row = activeReportRow.value
  if (!row) return null
  const previous = reportUnitDraftMap.value[row.key]
  return {
    result: row.state.result,
    instrumentObservation: row.state.observation,
    observation: observation.value,
    operatorName: operatorName.value,
    confirmChecks: confirmChecks.value.slice(),
    paperReportChecks: clonePaperReportChecks(paperReportChecks.value),
    completed: completed ?? previous?.completed ?? false,
  }
}

function syncCurrentReportUnit(completed?: boolean) {
  const key = activeReportKey.value
  const draft = currentReportUnitDraft(completed)
  if (!key || !draft) return
  reportUnitDraftMap.value = {
    ...reportUnitDraftMap.value,
    [key]: draft,
  }
}

function applyReportUnitDraft(draft: HighTempPressureReportUnitDraft) {
  const row = activeReportRow.value
  if (row) {
    instrumentResultMap.value = {
      ...instrumentResultMap.value,
      [row.key]: {
        result: draft.result,
        observation: draft.instrumentObservation,
      },
    }
  }
  observation.value = draft.observation
  operatorName.value = testerSignature.value
    ? getSignatureDisplayName(testerSignature.value.info)
    : draft.operatorName
  confirmChecks.value = draft.confirmChecks.slice()
  paperReportChecks.value = clonePaperReportChecks(draft.paperReportChecks)
}

function openReportForEditing(index: number, inheritCurrent = false) {
  if (index < 0 || index >= instrumentRows.value.length) return
  const source = currentReportUnitDraft(reportUnitDraftMap.value[activeReportKey.value]?.completed)
  syncCurrentReportUnit()
  const targetRow = instrumentRows.value[index]
  let target = reportUnitDraftMap.value[targetRow.key]
  if (!target && inheritCurrent && source) {
    target = cloneReportUnitDraft(source, false)
    reportUnitDraftMap.value = {
      ...reportUnitDraftMap.value,
      [targetRow.key]: target,
    }
  }
  activeReportIndex.value = index
  reportStage.value = 'editing'
  reviewConfirmed.value = false
  if (target) applyReportUnitDraft(target)
}

function canOpenReport(index: number) {
  if (index <= activeReportIndex.value) return true
  const row = instrumentRows.value[index]
  return !!row && !!reportUnitDraftMap.value[row.key]
}

function restoreInitialDraft() {
  const draft = props.initialDraft
  if (!draft) return
  observation.value = draft.observation || ''
  operatorName.value = draft.operatorName || ''
  if (Array.isArray(draft.confirmChecks) && draft.confirmChecks.length === 4) {
    confirmChecks.value = draft.confirmChecks.map(Boolean)
  }
  instrumentResultMap.value = {
    ...instrumentResultMap.value,
    ...(draft.instrumentResultMap || {}),
  }
  paperReportChecks.value = {
    ...paperReportChecks.value,
    ...(draft.paperReportChecks || {}),
  }
  if (Array.isArray(draft.curveRanges) && draft.curveRanges.length) {
    curveRanges.value = draft.curveRanges.map((range) => ({ ...range }))
  } else if (draft.curveRange) {
    curveRanges.value = [{
      id: 'legacy-full-range',
      title: '全程曲线',
      startMs: draft.curveRange.startMs,
      endMs: draft.curveRange.endMs,
    }]
  }
  reportUnitDraftMap.value = Object.fromEntries(
    Object.entries(draft.reportUnitDraftMap || {}).map(([key, value]) => [key, cloneReportUnitDraft(value)])
  )
  activeReportIndex.value = Math.min(
    Math.max(0, Number(draft.activeReportIndex) || 0),
    Math.max(0, reportSelections.value.length - 1)
  )
  reportStage.value = draft.reportStage === 'review' ? 'review' : 'editing'
  reviewConfirmed.value = !!draft.reviewConfirmed
  const restoredUnit = reportUnitDraftMap.value[activeReportKey.value]
  if (restoredUnit) applyReportUnitDraft(restoredUnit)
}

function emitReportDraft() {
  syncCurrentReportUnit()
  emit('report-draft-change', {
    observation: observation.value,
    operatorName: operatorName.value,
    confirmChecks: confirmChecks.value.slice(),
    instrumentResultMap: Object.fromEntries(
      Object.entries(instrumentResultMap.value).map(([key, value]) => [key, { ...value }])
    ),
    paperReportChecks: { ...paperReportChecks.value },
    curveRange: curveRanges.value.length ? {
      startMs: curveRanges.value[0].startMs,
      endMs: curveRanges.value[0].endMs,
    } : undefined,
    curveRanges: curveRanges.value.map((range) => ({ ...range })),
    reportUnitDraftMap: Object.fromEntries(
      Object.entries(reportUnitDraftMap.value).map(([key, value]) => [key, cloneReportUnitDraft(value)])
    ),
    activeReportIndex: activeReportIndex.value,
    reportStage: reportStage.value,
    reviewConfirmed: reviewConfirmed.value,
  })
}

async function refreshTesterSignature(showError = false) {
  testerSignatureLoading.value = true
  testerSignatureError.value = ''
  try {
    const authOk = await initAuth()
    if (!authOk) throw new Error('未登录或登录已失效，无法读取测试人电子签名')
    const signature = await loadCurrentUserReportSignature(getAuthHeaders())
    if (testerSignaturePreviewUrl.value) URL.revokeObjectURL(testerSignaturePreviewUrl.value)
    testerSignature.value = signature
    testerSignaturePreviewUrl.value = URL.createObjectURL(signature.previewBlob)
    operatorName.value = getSignatureDisplayName(signature.info)
    reportUnitDraftMap.value = Object.fromEntries(
      Object.entries(reportUnitDraftMap.value).map(([key, draft]) => [
        key,
        { ...draft, operatorName: operatorName.value },
      ])
    )
    syncCurrentReportUnit()
    return signature
  } catch (error) {
    testerSignature.value = null
    testerSignatureError.value = error instanceof Error ? error.message : '读取测试人电子签名失败'
    if (showError) ElMessage.error(testerSignatureError.value)
    return null
  } finally {
    testerSignatureLoading.value = false
  }
}

onMounted(() => {
  resetReportStateForSelections()
  restoreInitialDraft()
  if (!reportUnitDraftMap.value[activeReportKey.value]) syncCurrentReportUnit(false)
  fileStatuses.value.json = props.exportedCaptureDir.trim() ? 'done' : 'pending'
  void refreshTesterSignature()
})

onBeforeUnmount(() => {
  if (testerSignaturePreviewUrl.value) URL.revokeObjectURL(testerSignaturePreviewUrl.value)
})

watch(selectionSignature, () => {
  if (!uploadCompleted.value) {
    resetReportStateForSelections()
    restoreInitialDraft()
    if (!reportUnitDraftMap.value[activeReportKey.value]) syncCurrentReportUnit(false)
  }
})
watch(() => props.clientSubmitId, (value) => {
  if (value?.trim() && !uploadCompleted.value) clientSubmitId.value = value.trim()
})
watch(
  [observation, operatorName, confirmChecks, instrumentResultMap, paperReportChecks, curveRanges, reviewConfirmed],
  emitReportDraft,
  { deep: true }
)
watch(runtimeHours, (value) => {
  shiftHours.value = value
}, { immediate: true })

function handleCurveReady(ready: boolean) {
  curveReady.value = ready
  if (!ready) {
    preparedCurves.value = []
    fileStatuses.value.curve = 'pending'
  }
}

function handleCurveRangesChange(ranges: HighTempPressureCurveRangeDraft[]) {
  curveRanges.value = ranges.map((range) => ({ ...range }))
  paperReportChecks.value.testingCurveCopies = Math.max(1, ranges.length)
  preparedCurves.value = []
  fileStatuses.value.curve = 'pending'
}

async function prepareCurveFiles() {
  if (!curveEditor.value || !curveReady.value) throw new Error('测试曲线尚未就绪')
  fileStatuses.value.curve = 'generating'
  try {
    preparedCurves.value = await curveEditor.value.exportCurveFiles()
    fileStatuses.value.curve = 'done'
    return preparedCurves.value
  } catch (error) {
    fileStatuses.value.curve = 'pending'
    throw error
  }
}

function validateReportUnit(draft: HighTempPressureReportUnitDraft, reportNumber: number) {
  if (!draft.result) {
    ElMessage.warning(`请选择第 ${reportNumber} 份报告的试验结论`)
    return false
  }
  if (!draft.observation.trim()) {
    ElMessage.warning(`请填写第 ${reportNumber} 份报告的试验观察记录`)
    return false
  }
  if (!draft.operatorName.trim()) {
    ElMessage.warning(`未读取到第 ${reportNumber} 份报告的当前测试人信息`)
    return false
  }
  if (!testerSignature.value) {
    ElMessage.warning(testerSignatureError.value || '请先读取当前测试人的电子签名')
    return false
  }
  if (!draft.confirmChecks.every(Boolean)) {
    ElMessage.warning(`请勾选第 ${reportNumber} 份报告的所有确认项`)
    return false
  }
  return true
}

function completeActiveReport() {
  const draft = currentReportUnitDraft(true)
  if (!draft || !validateReportUnit(draft, activeReportIndex.value + 1)) return
  draft.paperReportChecks.testingCurveCopies = Math.max(1, curveRanges.value.length)
  draft.paperReportChecks.otherCopies = normalizeCopyCount(
    draft.paperReportChecks.otherCopies,
    5,
    0
  )
  reportUnitDraftMap.value = {
    ...reportUnitDraftMap.value,
    [activeReportKey.value]: draft,
  }
  if (activeReportIndex.value < instrumentRows.value.length - 1) {
    openReportForEditing(activeReportIndex.value + 1, true)
    ElMessage.success('本份报告已保存，下一份已继承当前填写信息，可继续修改')
  } else {
    reportStage.value = 'review'
    reviewConfirmed.value = false
    ElMessage.success('全部报告已填写，请逐份审核后提交')
  }
  emitReportDraft()
}

function enterReportReview() {
  const activeDraft = currentReportUnitDraft(reportUnitDraftMap.value[activeReportKey.value]?.completed)
  if (!activeDraft || !validateReportUnit(activeDraft, activeReportIndex.value + 1)) return
  syncCurrentReportUnit()
  if (!allReportsCompleted.value) {
    ElMessage.warning(`还有 ${instrumentRows.value.length - completedReportCount.value} 份报告未填写完成`)
    return
  }
  reportStage.value = 'review'
  reviewConfirmed.value = false
  emitReportDraft()
}

function editReportFromReview(index: number) {
  openReportForEditing(index)
  emitReportDraft()
}

const submitReport = async () => {
  if (!reportSelections.value.length) {
    ElMessage.warning('未找到本次测试的仪器')
    return
  }
  if (!allReportsCompleted.value) {
    ElMessage.warning('请先完成全部报告的逐份填写')
    return
  }
  const invalidIndex = instrumentRows.value.findIndex((row, index) => {
    const draft = reportUnitDraftMap.value[row.key]
    return !draft || !validateReportUnit(draft, index + 1)
  })
  if (invalidIndex >= 0) {
    editReportFromReview(invalidIndex)
    return
  }
  if (!reviewConfirmed.value) {
    ElMessage.warning('请确认全部报告已审核无误')
    return
  }
  if (!curveReady.value) {
    ElMessage.warning('请等待测试曲线读取完成并选择报告范围')
    return
  }
  try {
    await prepareCurveFiles()
    ElMessage.success('全部报告已审核，测试曲线已生成，请确认上传')
    showFileSaveModal.value = true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '测试曲线生成失败')
  }
}

function buildReportUnitJson(
  selection: ScheduledSelection,
  draft: HighTempPressureReportUnitDraft,
  curveExports: HighTempPressureCurveExport[]
) {
  const testingCurveCopies = Math.max(1, curveExports.length)
  const otherCopies = normalizeCopyCount(draft.paperReportChecks.otherCopies, 5, 0)
  const exportedRanges = curveExports.map((item) => item.range)
  return {
    source: 'cosl-operator-tauri',
    module: 'high-temp-pressure',
    capture_dir: props.exportedCaptureDir,
    csv_count: props.csvCount,
    curve_phases: ['升温升压', '保温保压', '降温降压'],
    curve_range: exportedRanges[0] || null,
    curve_ranges: exportedRanges,
    operator_name: draft.operatorName.trim(),
    tester_signature: testerSignature.value ? {
      user_id: testerSignature.value.info.userId,
      signature_id: testerSignature.value.info.signatureId,
      username: testerSignature.value.info.username,
      nickname: testerSignature.value.info.nickname || '',
      mime_type: testerSignature.value.info.mimeType || '',
      sha256: testerSignature.value.info.sha256 || '',
    } : null,
    observation: draft.observation.trim(),
    confirm_checks: draft.confirmChecks,
    paper_report: {
      ref_no: 'WT3-TC/ZZ-21-R01',
      title: 'High Temperature & High Pressure Testing Report',
      testing_organization: 'COSL',
      testing_item_information: {
        name: selection.instrument.label,
        quantity: 1,
        no: selection.instrument.sn,
        order_no: selection.order.no,
      },
      testing_requirements: {
        testing_pressure: selection.order.targetPressure || '',
        testing_temperature: selection.order.targetTemp || '',
        hold_time: selection.order.keepCondition || '',
        online_test: draft.paperReportChecks.onlineTest,
        other_requirements: draft.paperReportChecks.otherRequirements,
      },
      fittings_provided: {
        testing_protective_cap: draft.paperReportChecks.testingProtectiveCapProvider,
        testing_plug: draft.paperReportChecks.testingPlugProvider,
      },
      testing_result: {
        appearance_inspection: {
          no_distorted: draft.paperReportChecks.noDistorted,
          no_obvious_leakage: draft.paperReportChecks.noLeakage,
        },
        testing_curve: draft.paperReportChecks.curveStatus,
        other_descriptions: draft.paperReportChecks.otherDescriptions,
      },
      attachments: {
        testing_curve: {
          copies: testingCurveCopies,
          items: exportedRanges.map((range) => ({
            index: range.index,
            title: range.title,
            range_start: range.start_at,
            range_end: range.end_at,
            point_count: range.point_count,
            visible_series: range.visible_series,
          })),
        },
        others: {
          copies: otherCopies,
        },
      },
    },
    submitted_at: new Date().toISOString(),
  }
}

const finishReportUpload = async () => {
  if (uploadSubmitting.value) return
  // 必须在第一次异步调用前上锁，避免慢请求期间连续点击创建重复报告。
  uploadSubmitting.value = true
  try {
    const authOk = await initAuth()
    if (!authOk) {
      throw new Error('未登录或登录已失效，无法上传报告')
    }
    const currentSignature = await refreshTesterSignature(true)
    if (!currentSignature) return
    const curveExports = preparedCurves.value.length ? preparedCurves.value : await prepareCurveFiles()
    const reportFiles: EquipmentReportUploadFile[] = [
      ...curveExports.map((item) => item.file),
      currentSignature.file,
    ]
    const bindings = await loadScheduledReportBindings()
    const orderIds = Array.from(new Set(Array.from(bindings.values()).map((binding) => binding.orderId)))
    const instrumentResults = instrumentRows.value.map(({ key, selection, state }) => {
      const binding = bindings.get(key)
      if (!binding) throw new Error(`未找到 ${selection.order.no}/${selection.instrument.sn} 的服务端关联信息`)
      const draft = reportUnitDraftMap.value[key]
      if (!draft?.completed) throw new Error(`${selection.order.no}/${selection.instrument.sn} 的报告尚未填写完成`)
      return {
        order_id: binding.orderId,
        order_no: selection.order.no,
        instrument_id: binding.instrumentId,
        instrument_name: selection.instrument.label,
        instrument_sn: selection.instrument.sn,
        equipment_id: binding.equipmentId,
        result: draft.result || state.result,
        result_text: resultText(draft.result || state.result),
        observation: draft.instrumentObservation || draft.observation,
        tester: draft.operatorName.trim(),
        remark: draft.observation.trim(),
        report_json: buildReportUnitJson(selection, draft, curveExports),
        metrics: {
          target_temp: selection.order.targetTemp,
          target_pressure: selection.order.targetPressure,
          keep_condition: selection.order.keepCondition,
        },
        attachments: [],
      }
    })

    const firstRow = instrumentRows.value[0]
    const firstDraft = firstRow ? reportUnitDraftMap.value[firstRow.key] : undefined
    if (!firstDraft) throw new Error('未找到首份报告填写信息')
    const payload = {
      task_number: orderNos.value,
      test_date: todayText(),
      tester: firstDraft.operatorName.trim(),
      status: 0,
      overall_result: overallResult.value,
      order_ids: orderIds,
      order_numbers: Array.from(new Set(reportSelections.value.map((item) => item.order.no).filter(Boolean))),
      instrument_results: instrumentResults,
      report_json: buildReportUnitJson(firstRow.selection, firstDraft, curveExports),
      attachments: [],
      remark: firstDraft.observation.trim(),
      client_submit_id: clientSubmitId.value,
    }
    const res = await createHighTempPressureReportWithFiles(payload, reportFiles, getAuthHeaders())
    if (!res.success || !res.data || res.data.code !== 0) {
      throw new Error(res.data?.msg || res.error || '报告上传失败')
    }
    fileStatuses.value.report = 'done'
    submittedReportNo.value = res.data.data?.report_no || ''
    const assistantSync = res.data.data?.assistantSync
    if (assistantSync && assistantSync.success === false) {
      throw new Error(`报告文件已保存到服务端，但第三方工单上报失败${assistantSync.error ? `：${assistantSync.error}` : '，请重试提交'}`)
    }
    showFileSaveModal.value = false
    uploadCompleted.value = true
    emit('report-submitted')
    const generatedCount = res.data.data && 'reports' in res.data.data
      ? res.data.data.reports.length
      : 1
    ElMessage.success(`已按设备生成 ${generatedCount} 份待审核报告${submittedReportNo.value ? `，首份编号：${submittedReportNo.value}` : ''}`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '报告上传失败，请稍后重试')
  } finally {
    uploadSubmitting.value = false
  }
}

const closeFileSaveModal = () => {
  if (uploadSubmitting.value) return
  showFileSaveModal.value = false
}

const finishShutdown = () => {
  if (!shiftHours.value) {
    ElMessage.warning('请填写本班运转时间')
    return
  }
  if (!taskSummary.value.trim()) {
    ElMessage.warning('请填写主要完成任务')
    return
  }
  if (!shutdownChecks.value.every(Boolean)) {
    ElMessage.warning('请完成全部关机检查项')
    return
  }
  ElMessage.success('设备关机检查完成，本次测试任务全部结束')
  emit('shutdown-complete')
}
</script>

<template>
  <div class="panel report-panel">
    <div class="step-indicator">
      <div class="step done"><div class="step-circle">✓</div><span class="step-label">数据看板</span></div>
      <div class="step-line done"></div>
      <div class="step done"><div class="step-circle">✓</div><span class="step-label">设备检测</span></div>
      <div class="step-line done"></div>
      <div class="step done"><div class="step-circle">✓</div><span class="step-label">启动</span></div>
      <div class="step-line done"></div>
      <div class="step done"><div class="step-circle">✓</div><span class="step-label">正式测试</span></div>
      <div class="step-line done"></div>
      <div class="step" :class="uploadCompleted ? 'done' : 'active'"><div class="step-circle">{{ uploadCompleted ? '✓' : '5' }}</div><span class="step-label">报告生成</span></div>
      <div class="step-line" :class="{ done: uploadCompleted }"></div>
      <div class="step" :class="{ active: uploadCompleted }"><div class="step-circle">6</div><span class="step-label">关机检查</span></div>
    </div>

    <div v-if="!uploadCompleted" class="two-col report-layout">
      <div class="card">
        <div class="card-header"><div class="card-title">📁 测试文件生成进度</div></div>
        <div class="file-gen-list">
          <div class="file-gen-item">
            <div class="file-gen-icon json">🗂</div>
            <div class="file-gen-info"><div class="file-gen-name">ocr_readings_0.5s.json</div><div class="file-gen-desc">OCR 识别采样 JSON · {{ csvCount }} 条</div></div>
            <div class="file-gen-status" :class="fileStatuses.json">{{ statusText(fileStatuses.json) }}</div>
          </div>
          <div class="file-gen-item">
            <div class="file-gen-icon curve">📈</div>
            <div class="file-gen-info"><div class="file-gen-name">高温高压测试结果曲线.png</div><div class="file-gen-desc">报告选定范围 · 正式曲线附件</div></div>
            <div class="file-gen-status" :class="fileStatuses.curve">{{ statusText(fileStatuses.curve) }}</div>
          </div>
          <div class="file-gen-item">
            <div class="file-gen-icon doc">📄</div>
            <div class="file-gen-info"><div class="file-gen-name">高温高压测试报告.pdf</div><div class="file-gen-desc">提交后按设备生成正式多页 PDF</div></div>
            <div class="file-gen-status" :class="fileStatuses.report">{{ statusText(fileStatuses.report) }}</div>
          </div>
        </div>
        <div v-if="exportedCaptureDir" class="report-save-path">OCR 识别结果：{{ exportedCaptureDir }}</div>
      </div>

      <div v-show="reportStage === 'editing'" class="card report-form-card">
        <div class="card-header">
          <div class="card-title">✍ 按份填写测试报告 <span>第 {{ activeReportIndex + 1 }} / {{ instrumentRows.length }} 份</span></div>
        </div>
        <div class="report-copy-toolbar">
          <button
            v-for="(row, index) in instrumentRows"
            :key="`${row.key}-tab`"
            class="report-copy-tab"
            :class="{
              active: index === activeReportIndex,
              completed: reportUnitDraftMap[row.key]?.completed,
            }"
            :disabled="!canOpenReport(index)"
            @click="openReportForEditing(index)"
          >
            <span>{{ reportUnitDraftMap[row.key]?.completed ? '✓' : index + 1 }}</span>
            第 {{ index + 1 }} 份
          </button>
          <div class="report-copy-progress">已完成 {{ completedReportCount }} / {{ instrumentRows.length }} 份</div>
        </div>
        <div class="card-body report-form-body">
          <div class="report-section">
            <div class="report-section-title">基本信息（自动填写）</div>
            <div class="form-row">
              <div class="form-group"><div class="form-label">工单编号</div><input class="form-control report-readonly" :value="activeOrderNo" readonly /></div>
              <div class="form-group"><div class="form-label">测试申请人</div><input class="form-control report-readonly" :value="activeApplicantName" readonly /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><div class="form-label">试验温度</div><input class="form-control report-readonly" :value="activeReportOrder?.targetTemp || '-'" readonly /></div>
              <div class="form-group"><div class="form-label">试验压力</div><input class="form-control report-readonly" :value="activeReportOrder?.targetPressure || '-'" readonly /></div>
            </div>
            <div class="form-group"><div class="form-label">保温保压时间</div><input class="form-control report-readonly" :value="activeReportOrder?.keepCondition || '-'" readonly /></div>
            <div class="form-group"><div class="form-label">试件信息</div><input class="form-control report-readonly" :value="activeInstrumentText" readonly /></div>
          </div>

          <div class="report-section">
            <div class="report-section-title">试验结果 <span>*</span></div>
            <div class="instrument-result-table">
              <div class="instrument-result-head">
                <span>工单</span>
                <span>仪器</span>
                <span>SN</span>
                <span>结论</span>
                <span>单台观察记录</span>
              </div>
              <div v-if="activeReportRow" :key="activeReportRow.key" class="instrument-result-row">
                <span>{{ activeReportRow.selection.order.no }}</span>
                <span>{{ activeReportRow.selection.instrument.label }}</span>
                <span>{{ activeReportRow.selection.instrument.sn || '-' }}</span>
                <select v-model="activeReportRow.state.result" class="form-control result-select">
                  <option value="pass">合格</option>
                  <option value="fail">不合格</option>
                  <option value="pending">待定</option>
                </select>
                <input
                  v-model="activeReportRow.state.observation"
                  class="form-control"
                  placeholder="可填写该仪器异常或补充说明"
                />
              </div>
            </div>
            <div v-if="activeReportRow" class="overall-result">
              本份结论：<b :class="`result-${activeReportRow.state.result}`">{{ resultText(activeReportRow.state.result) }}</b>
            </div>
            <div class="form-group">
              <div class="form-label">试验观察记录 <span class="req">*</span></div>
              <textarea
                v-model="observation"
                class="form-control"
              rows="4"
                placeholder="详细记录测试过程中的观察情况，包括升温升压过程、保温保压阶段、降温降压过程、仪器外观变化、异常情况说明..."
              ></textarea>
            </div>
          </div>

          <div class="report-section">
            <div class="report-section-title">试验要求、配件来源与试验结果 <span>*</span></div>
            <div class="paper-report-grid">
              <label class="paper-check">
                <input v-model="paperReportChecks.onlineTest" type="checkbox" />
                <span>在线测试 Online Test</span>
              </label>
              <div class="paper-field">
                <div class="form-label">外观变形 Appearance</div>
                <div class="paper-radio-row">
                  <label><input v-model="paperReportChecks.noDistorted" type="radio" :value="true" /> 未变形</label>
                  <label><input v-model="paperReportChecks.noDistorted" type="radio" :value="false" /> 变形</label>
                </div>
              </div>
              <div class="paper-field">
                <div class="form-label">明显泄漏 Leakage</div>
                <div class="paper-radio-row">
                  <label><input v-model="paperReportChecks.noLeakage" type="radio" :value="true" /> 无明显泄漏</label>
                  <label><input v-model="paperReportChecks.noLeakage" type="radio" :value="false" /> 有明显泄漏</label>
                </div>
              </div>
              <div class="paper-field">
                <div class="form-label">试压护帽提供方</div>
                <select v-model="paperReportChecks.testingProtectiveCapProvider" class="form-control">
                  <option value="applicant">委托方提供 Provided by Applicant</option>
                  <option value="tester">检测方提供 Provided by Tester</option>
                </select>
              </div>
              <div class="paper-field">
                <div class="form-label">试压堵头提供方</div>
                <select v-model="paperReportChecks.testingPlugProvider" class="form-control">
                  <option value="applicant">委托方提供 Provided by Applicant</option>
                  <option value="tester">检测方提供 Provided by Tester</option>
                </select>
              </div>
              <div class="paper-field">
                <div class="form-label">测试曲线判断</div>
                <select v-model="paperReportChecks.curveStatus" class="form-control">
                  <option value="normal">测试曲线正常 Testing Curve Normal</option>
                  <option value="abnormal">测试曲线异常 Testing Curve Abnormal</option>
                </select>
              </div>
              <div class="paper-field">
                <div class="form-label">测试曲线附件份数</div>
                <input class="form-control report-readonly" :value="curveRanges.length" readonly />
              </div>
              <div class="paper-field">
                <div class="form-label">其他附件份数</div>
                <input v-model.number="paperReportChecks.otherCopies" class="form-control" type="number" min="0" />
              </div>
              <div class="paper-field is-wide">
                <div class="form-label">其他要求</div>
                <input v-model="paperReportChecks.otherRequirements" class="form-control" placeholder="无" />
              </div>
              <div class="paper-field is-wide">
                <div class="form-label">其他描述</div>
                <input v-model="paperReportChecks.otherDescriptions" class="form-control" placeholder="无" />
              </div>
            </div>
          </div>

          <div class="report-section">
            <ReportCurveEditor
              ref="curveEditor"
              :export-dir="exportedCaptureDir"
              :order-numbers="orderNos"
              :instruments="instruments"
              :operator-name="operatorName"
              :initial-ranges="curveRanges"
              @ready="handleCurveReady"
              @ranges-change="handleCurveRangesChange"
            />
          </div>

          <div class="report-section">
            <div class="report-section-title">操作人员信息 <span>*</span></div>
            <div class="form-row">
              <div class="form-group">
                <div class="form-label">测试人（当前登录用户）<span class="req">*</span></div>
                <input :value="operatorName" class="form-control report-readonly" readonly placeholder="正在读取当前测试人" />
              </div>
              <div class="form-group tester-signature-field">
                <div class="form-label">测试人电子签名 <span class="req">*</span></div>
                <div class="tester-signature-box" :class="{ error: testerSignatureError }">
                  <img v-if="testerSignaturePreviewUrl" :src="testerSignaturePreviewUrl" alt="测试人电子签名" />
                  <span v-else>{{ testerSignatureLoading ? '正在读取电子签名…' : (testerSignatureError || '未配置电子签名') }}</span>
                  <button class="btn btn-outline" type="button" :disabled="testerSignatureLoading" @click="refreshTesterSignature(true)">刷新签名</button>
                </div>
                <div class="signature-duty-note">复核人及复核签名由管理端审核时填写。</div>
              </div>
            </div>
          </div>

          <div class="report-section">
            <div class="report-section-title">其他确认项 <span>*</span></div>
            <div class="confirm-checks">
              <label v-for="(label, index) in ['确认测试数据已完整记录', '确认测试仪器已按规范操作', '确认所有安全规程已遵守', '确认测试环境符合要求']" :key="label" class="conf-item">
                <input v-model="confirmChecks[index]" type="checkbox" />
                {{ label }}
              </label>
            </div>
          </div>
        </div>
        <div class="report-actions">
          <button class="btn btn-outline" :disabled="activeReportIndex === 0" @click="openReportForEditing(activeReportIndex - 1)">上一份</button>
          <button v-if="allReportsCompleted" class="btn btn-outline" @click="enterReportReview">查看审核汇总</button>
          <button class="btn btn-success" :disabled="uploadSubmitting" @click="completeActiveReport">
            {{ activeReportIndex < instrumentRows.length - 1 ? '保存并填写下一份' : '完成填写并进入审核' }}
          </button>
        </div>
      </div>

      <div v-if="reportStage === 'review'" class="card report-review-card">
        <div class="card-header">
          <div>
            <div class="card-title">🔎 报告提交前审核</div>
            <div class="report-review-subtitle">共 {{ instrumentRows.length }} 份报告，逐份确认无误后统一提交到服务端</div>
          </div>
          <span class="report-review-count">{{ completedReportCount }} / {{ instrumentRows.length }}</span>
        </div>
        <div class="card-body report-review-body">
          <div
            v-for="(row, index) in instrumentRows"
            :key="`${row.key}-review`"
            class="report-review-item"
          >
            <div class="report-review-index">{{ index + 1 }}</div>
            <div class="report-review-main">
              <div class="report-review-title">{{ row.selection.instrument.label }} · {{ row.selection.instrument.sn || '-' }}</div>
              <div class="report-review-meta">
                <span>工单：{{ row.selection.order.no }}</span>
                <span>结论：{{ resultText(reportUnitDraftMap[row.key]?.result || row.state.result) }}</span>
                <span>测试人：{{ reportUnitDraftMap[row.key]?.operatorName || '-' }}</span>
                <span>复核签名：待管理端审核填写</span>
              </div>
              <div class="report-review-observation">{{ reportUnitDraftMap[row.key]?.observation || '-' }}</div>
            </div>
            <button class="btn btn-outline report-review-edit" @click="editReportFromReview(index)">修改</button>
          </div>
          <label class="report-review-confirm">
            <input v-model="reviewConfirmed" type="checkbox" />
            <span>我已逐份审核以上报告，确认填写内容与对应设备无误</span>
          </label>
        </div>
        <div class="report-actions">
          <button class="btn btn-outline" @click="editReportFromReview(0)">返回修改</button>
          <button class="btn btn-success" :disabled="!canGenerateReport || !reviewConfirmed || uploadSubmitting" @click="submitReport">
            ✓ 审核无误，生成曲线并提交
          </button>
        </div>
      </div>
    </div>

    <div v-else class="card shutdown-card">
      <div class="card-header">
        <div>
          <div class="card-title">🔌 设备运转结束后检查</div>
          <div class="shutdown-subtitle">报告文件已保存并上传，请完成以下检查后结束本次任务。</div>
        </div>
        <span class="shutdown-progress">{{ shutdownChecks.filter(Boolean).length }}/{{ shutdownChecks.length }}</span>
      </div>
      <div class="card-body shutdown-scroll-body">
        <div class="shutdown-success">✅ 报告已提交管理端待审核，请确认设备处于正常关闭状态。</div>
        <div class="shutdown-meta">
          <span>报告编号: {{ submittedReportNo || '-' }}</span>
          <span>检查日期: {{ new Date().toLocaleDateString() }}</span>
          <span>测试人: {{ operatorName || '-' }}</span>
          <span>复核签名: 待管理端审核</span>
        </div>
        <div class="shutdown-check-list">
          <label v-for="(item, index) in shutdownItems" :key="item" class="shutdown-check-item" :class="{ checked: shutdownChecks[index] }">
            <input v-model="shutdownChecks[index]" type="checkbox" />
            <span class="shutdown-check-num">{{ index + 1 }}</span>
            <span>{{ item }}</span>
          </label>
        </div>
        <div class="shutdown-form-grid">
          <div class="form-group">
            <div class="form-label">本班运转时间（小时）<span class="req">*</span></div>
            <input v-model="shiftHours" class="form-control report-readonly" type="number" min="0" step="0.01" readonly />
          </div>
          <div class="form-group">
            <div class="form-label">设备总运转时间（小时）</div>
            <input class="form-control report-readonly" :value="totalHours" readonly />
          </div>
        </div>
        <div class="form-group">
          <div class="form-label">主要完成任务 <span class="req">*</span></div>
          <textarea v-model="taskSummary" class="form-control" rows="3" placeholder="填写本次测试完成情况、设备状态、异常说明等"></textarea>
        </div>
      </div>
      <div class="report-actions">
        <button class="btn btn-success" :disabled="!shutdownReady" @click="finishShutdown">完成关机检查</button>
      </div>
    </div>

    <div v-if="showFileSaveModal" class="modal-overlay report-modal-overlay" @click.self="closeFileSaveModal">
      <div class="modal report-save-modal">
        <div v-if="uploadSubmitting" class="report-submit-lock" role="status" aria-live="assertive">
          <span class="report-submit-spinner" aria-hidden="true"></span>
          <strong>正在生成并上传报告</strong>
          <span>请稍候，完成前不可重复操作</span>
        </div>
        <div class="modal-header modal-header-row">
          <span>📁 保存测试报告文件</span>
          <button class="modal-close-btn" :disabled="uploadSubmitting" @click="closeFileSaveModal">×</button>
        </div>
        <div class="modal-body">
          <div class="save-alert">已按 {{ curveRanges.length }} 个选定范围生成 {{ curveRanges.length }} 张独立曲线附件；正式 PDF 仅包含报告正文，曲线图片单独下载和打印。</div>
          <div class="form-group">
          <div class="form-label">文件保存路径</div>
            <input class="form-control report-readonly" :value="savePath" readonly />
          </div>
          <div class="save-file-title">报告文件清单</div>
          <div class="save-file-list">
            <div v-for="file in savedFiles" :key="file.name" class="save-file-row">
              <span class="save-file-icon">{{ file.icon }}</span>
              <span>{{ file.name }}</span>
              <span class="save-file-badge">{{ file.usage }}</span>
            </div>
          </div>
          <div class="report-save-path">上传时提交全部业务曲线图片和报告填写数据；OCR JSON 仅在本机保留。生成几张曲线即记录为几份待打印曲线附件。</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" :disabled="uploadSubmitting" @click="closeFileSaveModal">稍后保存</button>
          <button class="btn btn-success" :disabled="uploadSubmitting" @click="finishReportUpload">
            {{ uploadSubmitting ? '上传中...' : '确认保存并上传' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
<style scoped>
.report-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.report-layout {
  grid-template-columns: minmax(420px, 0.8fr) minmax(0, 1.2fr);
  align-items: flex-start;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.report-layout > .card {
  min-width: 0;
}

.step-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.step {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  white-space: nowrap;
}

.step-circle {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 700;
}

.step.done,
.step.active {
  color: var(--color-text-primary);
}

.step.done .step-circle {
  background: rgba(16, 185, 129, 0.14);
  color: var(--green-bright);
}

.step.active .step-circle {
  background: var(--color-accent-blue);
  color: #fff;
}

.step-line {
  flex: 1;
  min-width: 16px;
  height: 1px;
  background: var(--color-border);
}

.step-line.done {
  background: rgba(16, 185, 129, 0.35);
}

.file-gen-list {
  display: flex;
  flex-direction: column;
}

.file-gen-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
}

.file-gen-item:last-child {
  border-bottom: 0;
}

.file-gen-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--color-bg-tertiary);
}

.file-gen-info {
  flex: 1;
  min-width: 0;
}

.file-gen-name {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.file-gen-desc {
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.file-gen-status {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
}

.file-gen-status.pending {
  color: var(--color-text-tertiary);
}

.file-gen-status.generating {
  color: var(--orange);
}

.file-gen-status.done {
  color: var(--color-accent-blue);
}

.report-save-path {
  padding: 10px 16px 14px;
  color: var(--color-accent-blue);
  font-size: 12px;
  word-break: break-all;
}

.report-form-card .card-title span {
  margin-left: 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 400;
}

.report-copy-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  overflow-x: auto;
}

.report-copy-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 82px;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  font-size: 12px;
}

.report-copy-tab span {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  font-size: 10px;
  font-weight: 700;
}

.report-copy-tab.active {
  border-color: rgba(37, 99, 235, 0.4);
  background: rgba(37, 99, 235, 0.08);
  color: var(--color-accent-blue);
}

.report-copy-tab.completed span {
  background: rgba(16, 185, 129, 0.14);
  color: var(--green-bright);
}

.report-copy-tab:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.report-copy-progress {
  margin-left: auto;
  color: var(--color-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.report-form-body {
  max-height: 520px;
  overflow-y: auto;
}

.report-section {
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
}

.report-section:last-child {
  margin-bottom: 0;
  border-bottom: 0;
}

.report-section-title {
  margin-bottom: 10px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 700;
}

.report-section-title span,
.req {
  color: var(--red);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  margin-bottom: 5px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.form-control {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 12px;
}

.report-readonly {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.tester-signature-box {
  min-height: 62px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.tester-signature-box.error {
  border-color: rgba(239, 68, 68, 0.45);
  color: var(--red);
}

.tester-signature-box img {
  width: 150px;
  height: 44px;
  object-fit: contain;
  object-position: left center;
  background: #fff;
}

.tester-signature-box > span {
  flex: 1;
  line-height: 1.5;
}

.tester-signature-box .btn {
  flex: 0 0 auto;
  padding: 6px 10px;
}

.signature-duty-note {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.instrument-result-table {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

.instrument-result-head,
.instrument-result-row {
  display: grid;
  grid-template-columns: 1.1fr 1fr 1fr 96px 1.6fr;
  gap: 8px;
  align-items: center;
}

.instrument-result-head {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.instrument-result-row {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-primary);
  font-size: 12px;
}

.result-select {
  min-width: 86px;
}

.overall-result {
  margin-bottom: 12px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.overall-result b {
  margin-left: 4px;
}

.paper-report-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.paper-check,
.paper-field {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
}

.paper-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.5;
}

.paper-check input {
  flex-shrink: 0;
}

.paper-check:has(input:checked) {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.07);
  color: var(--color-text-primary);
}

.paper-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.paper-field.is-wide {
  grid-column: 1 / -1;
}

.paper-field .form-label {
  margin-bottom: 0;
}

.paper-radio-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.paper-radio-row label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

.curve-file-hint {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed rgba(245, 127, 23, 0.42);
  border-radius: 8px;
  background: rgba(245, 127, 23, 0.08);
  color: var(--orange);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.curve-file-hint.ok {
  border-color: rgba(16, 185, 129, 0.36);
  background: rgba(16, 185, 129, 0.08);
  color: var(--green-bright);
}

.result-pass {
  color: var(--green-bright);
}

.result-fail {
  color: var(--red);
}

.result-pending {
  color: var(--orange);
}

.radio-group {
  display: flex;
  gap: 8px;
}

.radio-option {
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 6px 16px;
  font-size: 12px;
}

.radio-option.selected-pass {
  background: rgba(46, 125, 50, 0.1);
  border-color: var(--green-bright);
  color: var(--green-bright);
}

.radio-option.selected-fail {
  background: rgba(198, 40, 40, 0.1);
  border-color: var(--red);
  color: var(--red);
}

.radio-option.selected-pending {
  background: rgba(245, 127, 23, 0.1);
  border-color: var(--orange);
  color: var(--orange);
}

.confirm-checks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conf-item {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.report-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.report-actions .btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.report-modal-overlay {
  position: fixed;
  z-index: 2000;
}

.report-save-modal {
  position: relative;
  width: 460px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
}

.report-review-card {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.report-review-subtitle {
  margin-top: 3px;
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.report-review-count {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.12);
  color: var(--green-bright);
  font-size: 12px;
  font-weight: 700;
}

.report-review-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.report-review-item {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-primary);
}

.report-review-index {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(37, 99, 235, 0.1);
  color: var(--color-accent-blue);
  font-size: 12px;
  font-weight: 700;
}

.report-review-main {
  min-width: 0;
}

.report-review-title {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 700;
}

.report-review-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.report-review-observation {
  margin-top: 6px;
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.report-review-edit {
  min-width: 56px;
}

.report-review-confirm {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(37, 99, 235, 0.24);
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.06);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.5;
}

.report-submit-lock {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  background: rgba(248, 250, 252, 0.94);
  color: var(--color-text-primary);
  text-align: center;
  cursor: wait;
  backdrop-filter: blur(2px);
}

.report-submit-lock > span:last-child {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.report-submit-spinner {
  width: 38px;
  height: 38px;
  border: 4px solid rgba(37, 99, 235, 0.18);
  border-top-color: var(--color-accent-blue);
  border-radius: 50%;
  animation: report-submit-spin 0.8s linear infinite;
}

@keyframes report-submit-spin {
  to { transform: rotate(360deg); }
}

.modal-close-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.modal-close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.modal-close-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.save-alert {
  padding: 10px 12px;
  margin-bottom: 14px;
  border: 1px solid rgba(88, 166, 255, 0.2);
  border-radius: 8px;
  background: rgba(88, 166, 255, 0.08);
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.save-file-title {
  margin: 12px 0 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.save-file-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.save-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 12px;
}

.save-file-icon {
  width: 20px;
  text-align: center;
}

.save-file-badge {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(88, 166, 255, 0.12);
  color: var(--color-accent-blue);
  font-size: 11px;
  font-weight: 700;
}

.shutdown-card {
  margin-top: 14px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.shutdown-scroll-body {
  min-height: 0;
  overflow-y: auto;
  padding-right: 18px;
  scrollbar-gutter: stable;
}

.shutdown-scroll-body::-webkit-scrollbar,
.report-layout::-webkit-scrollbar,
.report-form-body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.shutdown-scroll-body::-webkit-scrollbar-track,
.report-layout::-webkit-scrollbar-track,
.report-form-body::-webkit-scrollbar-track {
  background: transparent;
}

.shutdown-scroll-body::-webkit-scrollbar-thumb,
.report-layout::-webkit-scrollbar-thumb,
.report-form-body::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 999px;
}

.shutdown-subtitle {
  margin-top: 3px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 400;
}

.shutdown-progress {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.shutdown-success {
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px solid rgba(88, 166, 255, 0.18);
  border-radius: 8px;
  background: rgba(88, 166, 255, 0.08);
  color: var(--color-accent-blue);
  font-size: 12px;
  font-weight: 600;
}

.shutdown-meta {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 12px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.shutdown-check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.shutdown-check-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 13px;
}

.shutdown-check-item:hover {
  background: var(--color-bg-hover);
}

.shutdown-check-item.checked {
  border-color: rgba(88, 166, 255, 0.28);
  background: rgba(88, 166, 255, 0.06);
  color: var(--color-text-primary);
}

.shutdown-check-num {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 700;
}

.shutdown-check-item.checked .shutdown-check-num {
  background: rgba(88, 166, 255, 0.15);
  color: var(--color-accent-blue);
}

.shutdown-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.shutdown-card .report-actions {
  box-shadow: 0 -8px 18px rgba(15, 23, 42, 0.04);
}

@media (max-width: 1100px) {
  .report-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .paper-report-grid,
  .shutdown-meta,
  .shutdown-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
