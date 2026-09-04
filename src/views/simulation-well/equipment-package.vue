<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/composables/useAuth'
import {
  getSimulatedWellReportTemplateDetail,
  listSimulatedWellReportTemplates,
  type SimulatedWellReportTemplateDetail,
} from '@/services/simulated-well-report-template-api'
import {
  listSimInstruments,
  type SimInstrumentListItem,
} from '@/services/sim-instrument-api'
import {
  parseSimulatedWellEnvironment,
  parseSimulatedWellInterval,
} from '@/services/simulated-well-downhole-api'

const props = defineProps<{
  todayScheduledOrders: any[]
  downholeDevices: any[]
  initialWork?: any
  mode?: 'create' | 'edit'
}>()

const emit = defineEmits(['back', 'save'])
const { initAuth, getAuthHeaders } = useAuth()

type TemplateInstrument = {
  code: string
  zh: string
  en: string
  internalInstrumentId?: number | string
  internalInstrumentSn?: string
  internalInstrumentName?: string
  externalInstrumentModel?: string
  modelNumber?: string
  usedCount?: number
  remainCount?: number
}

type ResolvedTemplateMeta = {
  templateCode: string
  templateName: string
  supportTools: TemplateInstrument[]
}

type ResolvedDeviceRow = {
  id: string
  deviceDbId?: number
  stateKey: string
  name: string
  sn: string
  code: string
  template: string
  templateName: string
  persistedTemplate: string
  supportTools: TemplateInstrument[]
  selectedSupportTools?: TemplateInstrument[]
}

const templateLoading = ref(false)
const templateLoadMessage = ref('')
const templateDetails = ref<SimulatedWellReportTemplateDetail[]>([])
const selectedTemplateMap = ref<Record<string, string>>({})
const selectedSupportToolMap = ref<Record<string, boolean>>({})
const selectedInternalInstrumentMap = ref<Record<string, string>>({})
const externalInstrumentModelMap = ref<Record<string, string>>({})
const internalInstrumentOptionsMap = ref<Record<string, SimInstrumentListItem[]>>({})
const internalInstrumentLoadingMap = ref<Record<string, boolean>>({})
const internalInstrumentMessageMap = ref<Record<string, string>>({})
const researchInstrumentMap = ref<Record<string, TemplateInstrument[]>>({})
const instrumentPickerVisible = ref(false)
const instrumentPickerLoading = ref(false)
const instrumentPickerTableRef = ref<any>(null)
const instrumentPickerRows = ref<SimInstrumentListItem[]>([])
const instrumentPickerTotal = ref(0)
const instrumentPickerPage = ref(1)
const instrumentPickerPageSize = ref(10)
const instrumentPickerSn = ref('')
const instrumentPickerName = ref('')
const instrumentPickerTarget = ref<{ orderId: string; device: ResolvedDeviceRow } | null>(null)
const instrumentPickerDraft = ref<Record<number, SimInstrumentListItem>>({})
const syncingInstrumentPickerSelection = ref(false)

function normalizeOrderType(value: unknown): 0 | 1 {
  return Number(value) === 1 ? 1 : 0
}

function sameStringMap(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key])
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

function templateKey(template: { report_no?: string; report_name?: string }) {
  return `${normalizeCode(template.report_no)}::${normalizeText(template.report_name)}`
}

function parseTemplateStringItem(value: unknown): TemplateInstrument {
  const text = cleanTemplateText(value)
  if (!text) return { code: '', zh: '', en: '' }

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

  if (code) {
    const rest = text.slice(text.indexOf(code) + code.length).trim()
    const englishStart = rest.search(/[A-Za-z]/)
    if (englishStart >= 0) {
      return {
        code,
        zh: rest.slice(0, englishStart).trim(),
        en: rest.slice(englishStart).trim(),
      }
    }
    return { code, zh: rest, en: '' }
  }

  return { code: '', zh: text, en: '' }
}

function normalizeInstrument(item: any): TemplateInstrument {
  if (typeof item === 'string') {
    return parseTemplateStringItem(item)
  }
  return {
    code: cleanTemplateText(item?.templateInstrumentCode || item?.code || ''),
    zh: cleanTemplateText(item?.templateInstrumentName || item?.zh || item?.nameCN || item?.name || ''),
    en: cleanTemplateText(item?.en || item?.nameEN || ''),
    internalInstrumentId: item?.internalInstrumentId,
    internalInstrumentSn: item?.internalInstrumentSn,
    internalInstrumentName: item?.internalInstrumentName,
    externalInstrumentModel: cleanTemplateText(item?.externalInstrumentModel || item?.externalModel || ''),
    modelNumber: item?.modelNumber,
    usedCount: item?.usedCount,
    remainCount: item?.remainCount,
  }
}

function mergeInstrumentLists(...lists: any[][]): TemplateInstrument[] {
  const map = new Map<string, TemplateInstrument>()
  lists.forEach((list) => {
    ;(Array.isArray(list) ? list : []).forEach((item) => {
      const normalized = normalizeInstrument(item)
      const key = `${normalizeCode(normalized.code)}::${normalizeText(normalized.zh)}::${normalizeText(normalized.en)}`
      if (!key || key === '::::') return
      const prev = map.get(key)
      map.set(key, {
        code: normalized.code || prev?.code || '',
        zh: normalized.zh || prev?.zh || '',
        en: normalized.en || prev?.en || '',
        internalInstrumentId: normalized.internalInstrumentId ?? prev?.internalInstrumentId,
        internalInstrumentSn: normalized.internalInstrumentSn || prev?.internalInstrumentSn,
        internalInstrumentName: normalized.internalInstrumentName || prev?.internalInstrumentName,
        externalInstrumentModel: normalized.externalInstrumentModel || prev?.externalInstrumentModel,
        modelNumber: normalized.modelNumber ?? prev?.modelNumber,
        usedCount: normalized.usedCount ?? prev?.usedCount,
        remainCount: normalized.remainCount ?? prev?.remainCount,
      })
    })
  })
  return Array.from(map.values())
}

function getSourceToolList(device: any, keys: string[]) {
  for (const key of keys) {
    const value = device?.[key]
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed
      } catch {}
    }
  }
  return []
}

function isSameInstrument(a: TemplateInstrument, b: TemplateInstrument) {
  return (
    normalizeCode(a.code) === normalizeCode(b.code) &&
    normalizeText(a.zh || a.en || a.code) === normalizeText(b.zh || b.en || b.code)
  )
}

const templateLibrary = computed<SimulatedWellReportTemplateDetail[]>(() => {
  const map = new Map<string, SimulatedWellReportTemplateDetail>()
  templateDetails.value.forEach((item) =>
    map.set(templateKey(item), {
      ...item,
      test_products: mergeInstrumentLists(item.test_products as any[]),
      match_instruments: mergeInstrumentLists(item.match_instruments as any[]),
    }),
  )
  return Array.from(map.values())
})

function getTemplateMatchScore(deviceName: string, product: any) {
  const normalizedProduct = normalizeInstrument(product)
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

function findMatchedTemplate(deviceName: string): SimulatedWellReportTemplateDetail | null {
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

function findTemplateByCode(templateCodeValue: string): SimulatedWellReportTemplateDetail | null {
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

function resolveTemplateMeta(deviceName: string, fallbackTemplate?: string, explicitTemplate?: string): ResolvedTemplateMeta {
  const matchedTemplate =
    findTemplateByCode(explicitTemplate || '') ||
    findTemplateByCode(fallbackTemplate || '') ||
    findMatchedTemplate(deviceName)
  if (!matchedTemplate) {
    return {
      templateCode: '',
      templateName: '',
      supportTools: [],
    }
  }

  return {
    templateCode: matchedTemplate.report_no || fallbackTemplate || 'DEFAULT_DOWNHOLE_REPORT',
    templateName: matchedTemplate.report_name || '',
    supportTools: mergeInstrumentLists(matchedTemplate.match_instruments as any[]),
  }
}

async function loadTemplateLibrary() {
  if (templateLoading.value) return
  templateLoading.value = true
  templateLoadMessage.value = ''
  try {
    await initAuth()
    const catalogRes = await listSimulatedWellReportTemplates(
      { currentPage: 1, pageSize: 500 },
      getAuthHeaders(),
    )

    if (!catalogRes.success || catalogRes.data?.code !== 0) {
      templateDetails.value = []
      templateLoadMessage.value = '数据库模板获取失败，当前仅展示数据库模板。'
      return
    }

    const catalog = catalogRes.data.data?.list || []
    const detailResults = await Promise.allSettled(
      catalog.map((item) => getSimulatedWellReportTemplateDetail(item.id, getAuthHeaders())),
    )

    templateDetails.value = detailResults
      .map((result) => (result.status === 'fulfilled' ? result.value : null))
      .filter((res): res is NonNullable<typeof res> => !!res && res.success && res.data?.code === 0)
      .map((res) => res.data!.data)

    if (!templateDetails.value.length) {
      templateLoadMessage.value = '数据库模板详情为空，暂无可选模板。'
    }
  } catch {
    templateDetails.value = []
    templateLoadMessage.value = '数据库模板加载失败，暂无可选模板。'
  } finally {
    templateLoading.value = false
  }
}

// 辅助：生成设备唯一标识
const getDevKey = (orderId: string, device: any, index: number) => {
  return `${orderId}_${device.code || device.sn || 'SN-' + (index + 1)}`
}

const getDeviceStateKey = (orderId: string, device: any, index: number) => {
  return String(device?.id || `${orderId}_${device?.sn || device?.code || index + 1}`)
}

const orderMetaMap = computed(() => {
  const map = new Map<string, any>()
  props.todayScheduledOrders.forEach((order: any) => {
    if (order?.id) map.set(order.id, order)
  })
  return map
})

const startedOrderDevices = computed(() => {
  const grouped = new Map<string, any>()
  props.downholeDevices.forEach((device: any, index: number) => {
    const orderId = device?.orderId
    if (!orderId) return
    const orderMeta = orderMetaMap.value.get(orderId)
    if (!grouped.has(orderId)) {
      grouped.set(orderId, {
        id: orderId,
        orderDbId: device?.orderDbId || orderMeta?.dbId,
        customer: device?.customer || orderMeta?.customer || '-',
        orderType: normalizeOrderType(device?.orderType ?? device?.order_type ?? orderMeta?.orderType ?? orderMeta?.order_type),
        deviceList: []
      })
    }
    const orderType = grouped.get(orderId).orderType
    const deviceStateKey = getDeviceStateKey(orderId, device, index)
    const persistedTemplate = cleanTemplateText(device?.template || device?.templateName || device?.template_name)
    // 研究院工单默认不关联模板；操作人主动选择后，该产品使用完整模板报告流程。
    const selectedTemplate = selectedTemplateMap.value[deviceStateKey]
    const selectedResearchTemplate = orderType === 1 ? findTemplateByCode(selectedTemplate || '') : null
    const resolvedTemplate = orderType === 1
      ? (selectedResearchTemplate
          ? {
              templateCode: selectedResearchTemplate.report_no || '',
              templateName: selectedResearchTemplate.report_name || '',
              supportTools: mergeInstrumentLists(selectedResearchTemplate.match_instruments as any[]),
            }
          : { templateCode: '', templateName: '', supportTools: [] })
      : resolveTemplateMeta(
          device?.deviceName || device?.name || '',
          device?.template || 'CBMT61XA_REPORT',
          selectedTemplate,
        )
    const sourceAvailableTools = getSourceToolList(
      device,
      ['availableSupportingTools', 'available_supporting_tools', 'supportTools', 'support_tools'],
    )
    const isResearchTemplateMode = orderType === 1 && !!resolvedTemplate.templateCode
    const persistedTemplateCode = findTemplateByCode(persistedTemplate)?.report_no || persistedTemplate
    const restoresPersistedTemplate = isResearchTemplateMode
      && normalizeCode(persistedTemplateCode) === normalizeCode(resolvedTemplate.templateCode)
    const availableTools = orderType === 1
      ? (isResearchTemplateMode
          ? mergeInstrumentLists(
              restoresPersistedTemplate ? sourceAvailableTools : [],
              resolvedTemplate.supportTools,
            )
          : [])
      : mergeInstrumentLists(sourceAvailableTools, resolvedTemplate.supportTools)
    const selectedToolSource = getSourceToolList(
      device,
      ['selectedSupportingTools', 'selected_supporting_tools', 'supportingTools', 'supporting_tools'],
    )
    const selectedTools = orderType === 1
      ? (isResearchTemplateMode
          ? mergeInstrumentLists(restoresPersistedTemplate ? selectedToolSource : [])
          : normalizeResearchSelectedTools(selectedToolSource))
      : mergeInstrumentLists(selectedToolSource)
    grouped.get(orderId).deviceList.push({
      id: device?.id || `${orderId}_${device?.sn || index + 1}`,
      deviceDbId: device?.deviceDbId || device?.dbId,
      stateKey: deviceStateKey,
      name: device?.deviceName || device?.name || '-',
      sn: device?.sn || device?.code || '',
      code: device?.code || device?.sn || '',
      template: resolvedTemplate.templateCode,
      templateName: resolvedTemplate.templateName,
      persistedTemplate,
      supportTools: availableTools,
      selectedSupportTools: selectedTools,
    })
  })
  return Array.from(grouped.values())
})

const startedOrderIds = computed(() => startedOrderDevices.value.map((order: any) => order.id))

function usesTemplateToolMode(order: any, device: ResolvedDeviceRow) {
  return order.orderType !== 1 || !!device.template
}

const shouldShowTestInformation = computed(() =>
  startedOrderDevices.value.some(
    (order: any) => order.orderType !== 1 || (order.deviceList || []).some((device: ResolvedDeviceRow) => !!device.template),
  ),
)

function simInstrumentToTool(item: SimInstrumentListItem): TemplateInstrument {
  return {
    code: item.model_number || '',
    zh: item.name || '',
    en: '',
    internalInstrumentId: item.id,
    internalInstrumentSn: item.sn,
    internalInstrumentName: item.name,
    modelNumber: item.model_number,
    usedCount: item.used_count,
    remainCount: item.remain_count,
  }
}

function toolToSimInstrument(tool: TemplateInstrument): SimInstrumentListItem | null {
  const id = Number(tool.internalInstrumentId)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    id,
    sn: tool.internalInstrumentSn || '',
    name: tool.internalInstrumentName || tool.zh || tool.code || '',
    model_number: tool.modelNumber || tool.code || '',
    used_count: Number(tool.usedCount ?? 0),
    remain_count: Number(tool.remainCount ?? 0),
    status: '',
  }
}

function getResearchInstruments(device: ResolvedDeviceRow) {
  return researchInstrumentMap.value[device.stateKey] || []
}

function normalizeResearchSelectedTools(tools: TemplateInstrument[]) {
  const result: TemplateInstrument[] = []
  const seen = new Set<string>()
  ;(tools || []).forEach((item) => {
    const tool = normalizeInstrument(item)
    const key = tool.internalInstrumentId !== undefined && tool.internalInstrumentId !== null
      ? `id:${tool.internalInstrumentId}`
      : `sn:${tool.internalInstrumentSn || ''}`
    if (key === 'sn:' || seen.has(key)) return
    seen.add(key)
    result.push(tool)
  })
  return result
}

watch(
  startedOrderDevices,
  (orders) => {
    const next = { ...researchInstrumentMap.value }
    const validKeys = new Set<string>()
    orders.forEach((order: any) => {
      if (order.orderType !== 1) return
      ;(order.deviceList || []).forEach((device: ResolvedDeviceRow) => {
        validKeys.add(device.stateKey)
        if (next[device.stateKey] === undefined) {
          next[device.stateKey] = device.template || device.persistedTemplate
            ? []
            : normalizeResearchSelectedTools(device.selectedSupportTools || [])
        }
      })
    })
    Object.keys(next).forEach((key) => {
      if (!validKeys.has(key)) delete next[key]
    })
    researchInstrumentMap.value = next
  },
  { immediate: true, deep: true },
)

function instrumentStatusTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === '正常') return 'success'
  if (status === '即将到期') return 'warning'
  if (status === '已到期') return 'danger'
  return 'info'
}

async function syncInstrumentPickerTableSelection() {
  syncingInstrumentPickerSelection.value = true
  await nextTick()
  const table = instrumentPickerTableRef.value
  if (!table) {
    syncingInstrumentPickerSelection.value = false
    return
  }
  table.clearSelection()
  instrumentPickerRows.value.forEach((row) => {
    if (instrumentPickerDraft.value[row.id]) table.toggleRowSelection(row, true)
  })
  await nextTick()
  syncingInstrumentPickerSelection.value = false
}

async function loadInstrumentPickerRows() {
  instrumentPickerLoading.value = true
  try {
    await initAuth()
    const res = await listSimInstruments(
      {
        currentPage: instrumentPickerPage.value,
        pageSize: instrumentPickerPageSize.value,
        sn: instrumentPickerSn.value.trim() || undefined,
        name: instrumentPickerName.value.trim() || undefined,
      },
      getAuthHeaders(),
    )
    if (!res.success || res.data?.code !== 0) {
      throw new Error(res.error || res.data?.msg || '仪器列表加载失败')
    }
    syncingInstrumentPickerSelection.value = true
    instrumentPickerRows.value = res.data.data?.list || []
    instrumentPickerTotal.value = Number(res.data.data?.total || 0)
    instrumentPickerPage.value = Number(res.data.data?.currentPage || instrumentPickerPage.value)
    await syncInstrumentPickerTableSelection()
  } catch (error: any) {
    syncingInstrumentPickerSelection.value = true
    instrumentPickerRows.value = []
    instrumentPickerTotal.value = 0
    ElMessage.error(error?.message || '仪器列表加载失败')
    await nextTick()
    syncingInstrumentPickerSelection.value = false
  } finally {
    instrumentPickerLoading.value = false
  }
}

function openInstrumentPicker(orderId: string, device: ResolvedDeviceRow) {
  instrumentPickerTarget.value = { orderId, device }
  instrumentPickerDraft.value = {}
  getResearchInstruments(device).forEach((tool) => {
    const item = toolToSimInstrument(tool)
    if (item) instrumentPickerDraft.value[item.id] = item
  })
  instrumentPickerSn.value = ''
  instrumentPickerName.value = ''
  instrumentPickerPage.value = 1
  instrumentPickerVisible.value = true
  void loadInstrumentPickerRows()
}

function handleInstrumentPickerSelectionChange(rows: SimInstrumentListItem[]) {
  if (syncingInstrumentPickerSelection.value) return
  const next = { ...instrumentPickerDraft.value }
  instrumentPickerRows.value.forEach((row) => delete next[row.id])
  rows.forEach((row) => { next[row.id] = row })
  instrumentPickerDraft.value = next
}

function searchInstrumentPicker() {
  instrumentPickerPage.value = 1
  void loadInstrumentPickerRows()
}

function resetInstrumentPickerSearch() {
  instrumentPickerSn.value = ''
  instrumentPickerName.value = ''
  instrumentPickerPage.value = 1
  void loadInstrumentPickerRows()
}

function changeInstrumentPickerPage(page: number) {
  instrumentPickerPage.value = page
  void loadInstrumentPickerRows()
}

function confirmInstrumentPicker() {
  const target = instrumentPickerTarget.value
  if (!target) return
  researchInstrumentMap.value = {
    ...researchInstrumentMap.value,
    [target.device.stateKey]: Object.values(instrumentPickerDraft.value).map(simInstrumentToTool),
  }
  instrumentPickerVisible.value = false
}

function removeResearchInstrument(device: ResolvedDeviceRow, tool: TemplateInstrument) {
  researchInstrumentMap.value = {
    ...researchInstrumentMap.value,
    [device.stateKey]: getResearchInstruments(device).filter(
      (item) => String(item.internalInstrumentId) !== String(tool.internalInstrumentId),
    ),
  }
}

const selectedSupportingOrders = computed(() =>
  startedOrderDevices.value
    .map((order: any) => ({
      ...order,
      deviceList: (order.deviceList || []).filter(
        (device: ResolvedDeviceRow) => usesTemplateToolMode(order, device) && device.supportTools?.length,
      ),
    }))
    .filter((order: any) => order.deviceList.length),
)

const researchManualOrders = computed(() =>
  startedOrderDevices.value
    .filter((order: any) => order.orderType === 1)
    .map((order: any) => ({
      ...order,
      deviceList: (order.deviceList || []).filter((device: ResolvedDeviceRow) => !device.template),
    }))
    .filter((order: any) => order.deviceList.length),
)

/** 编辑历史下井作业时，优先恢复数据库中仍有效的已保存模板。 */
function restoreSavedTemplateSelections() {
  if (props.mode !== 'edit' || !templateLibrary.value.length) return
  const next = { ...selectedTemplateMap.value }
  props.downholeDevices.forEach((device: any, index: number) => {
    const orderId = String(device?.orderId || device?.order_id || '')
    if (!orderId) return
    const savedTemplate = cleanTemplateText(device?.template || device?.templateName || device?.template_name)
    const stateKey = getDeviceStateKey(orderId, device, index)
    const orderMeta = orderMetaMap.value.get(orderId)
    const orderType = normalizeOrderType(device?.orderType ?? device?.order_type ?? orderMeta?.orderType ?? orderMeta?.order_type)
    // 研究院工单的空模板是有效的手工配接状态，需要与“未初始化”区分。
    if (orderType === 1 && !savedTemplate && next[stateKey] === undefined) {
      next[stateKey] = ''
      return
    }
    if (savedTemplate && next[stateKey] === undefined && findTemplateByCode(savedTemplate)) {
      next[stateKey] = savedTemplate
    }
  })
  if (!sameStringMap(selectedTemplateMap.value, next)) selectedTemplateMap.value = next
}

watch(templateLibrary, restoreSavedTemplateSelections, { immediate: true })

watch(
  startedOrderDevices,
  (orders) => {
    const next: Record<string, string> = { ...selectedTemplateMap.value }
    const validKeys = new Set<string>()
    orders.forEach((order: any) => {
      ;(order.deviceList || []).forEach((device: ResolvedDeviceRow, index: number) => {
        const key = getDeviceStateKey(order.id, device, index)
        validKeys.add(key)
        if (next[key] && !findTemplateByCode(next[key])) {
          next[key] = device.template || ''
        }
        if (next[key] === undefined) {
          // 新建和编辑共用：研究院空模板需要显式匹配“未选择模板”选项。
          if (order.orderType === 1 && !device.template) next[key] = ''
          else if (device.template) next[key] = device.template
        }
      })
    })
    Object.keys(next).forEach((key) => {
      if (!validKeys.has(key)) delete next[key]
    })
    if (!sameStringMap(selectedTemplateMap.value, next)) {
      selectedTemplateMap.value = next
    }
  },
  { immediate: true, deep: true },
)

function getSupportToolKey(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument) {
  return [
    orderId,
    device.id,
    normalizeCode(device.template),
    normalizeCode(tool.code),
    normalizeText(tool.zh || tool.en || tool.code),
  ].join('::')
}

function clearDeviceToolState(orderId: string, device: ResolvedDeviceRow) {
  const prefix = `${orderId}::${device.id}::`
  const withoutDevice = <T>(map: Record<string, T>) =>
    Object.fromEntries(Object.entries(map).filter(([key]) => !key.startsWith(prefix))) as Record<string, T>

  selectedSupportToolMap.value = withoutDevice(selectedSupportToolMap.value)
  selectedInternalInstrumentMap.value = withoutDevice(selectedInternalInstrumentMap.value)
  externalInstrumentModelMap.value = withoutDevice(externalInstrumentModelMap.value)
  internalInstrumentOptionsMap.value = withoutDevice(internalInstrumentOptionsMap.value)
  internalInstrumentLoadingMap.value = withoutDevice(internalInstrumentLoadingMap.value)
  internalInstrumentMessageMap.value = withoutDevice(internalInstrumentMessageMap.value)
  researchInstrumentMap.value = {
    ...researchInstrumentMap.value,
    [device.stateKey]: [],
  }
}

function handleTemplateChange(orderId: string, device: ResolvedDeviceRow) {
  clearDeviceToolState(orderId, device)
}

function getSelectedToolSnapshot(device: ResolvedDeviceRow, tool: TemplateInstrument) {
  return ((device as any).selectedSupportTools || []).find((selected: TemplateInstrument) => isSameInstrument(selected, tool))
}

function getInternalSelectValue(tool: TemplateInstrument | undefined) {
  const id = tool?.internalInstrumentId
  if (id !== undefined && id !== null && String(id).trim() !== '') return String(id)
  const sn = tool?.internalInstrumentSn
  return sn ? `sn:${sn}` : ''
}

function getSelectedInternalInstrument(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument) {
  const key = getSupportToolKey(orderId, device, tool)
  const value = selectedInternalInstrumentMap.value[key]
  const options = internalInstrumentOptionsMap.value[key] || []
  if (!value) return null
  if (value.startsWith('sn:')) {
    const sn = value.slice(3)
    return options.find((item) => item.sn === sn) || null
  }
  return options.find((item) => String(item.id) === String(value)) || null
}

function getInternalInstrumentOptions(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument) {
  return internalInstrumentOptionsMap.value[getSupportToolKey(orderId, device, tool)] || []
}

function getSelectedRemainText(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument) {
  const selected = getSelectedInternalInstrument(orderId, device, tool)
  if (selected) return `剩余可用次数：${selected.remain_count} 次`
  const options = getInternalInstrumentOptions(orderId, device, tool)
  if (options.length) {
    const maxRemain = Math.max(...options.map((item) => Number(item.remain_count ?? 0)))
    return `可选 ${options.length} 台，最高剩余 ${maxRemain} 次`
  }
  if (tool.remainCount !== undefined && tool.remainCount !== null) {
    return `剩余可用次数：${tool.remainCount} 次`
  }
  return ''
}

function getExternalInstrumentModel(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument) {
  const key = getSupportToolKey(orderId, device, tool)
  return externalInstrumentModelMap.value[key] ?? tool.externalInstrumentModel ?? ''
}

function buildStructuredTool(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument) {
  const selectedInstrument = getSelectedInternalInstrument(orderId, device, tool)
  return {
    ...tool,
    code: tool.code,
    zh: tool.zh,
    en: tool.en,
    templateInstrumentCode: tool.code,
    templateInstrumentName: tool.zh || tool.en || tool.code,
    internalInstrumentId: selectedInstrument?.id ?? tool.internalInstrumentId,
    internalInstrumentSn: selectedInstrument?.sn ?? tool.internalInstrumentSn,
    internalInstrumentName: selectedInstrument?.name ?? tool.internalInstrumentName,
    externalInstrumentModel: getExternalInstrumentModel(orderId, device, tool).trim(),
    modelNumber: selectedInstrument?.model_number ?? tool.modelNumber ?? tool.code,
    usedCount: selectedInstrument?.used_count ?? tool.usedCount,
    remainCount: selectedInstrument?.remain_count ?? tool.remainCount,
  }
}

async function loadInternalInstrumentOptions(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument) {
  const key = getSupportToolKey(orderId, device, tool)
  if (internalInstrumentLoadingMap.value[key]) return
  internalInstrumentLoadingMap.value = { ...internalInstrumentLoadingMap.value, [key]: true }
  internalInstrumentMessageMap.value = { ...internalInstrumentMessageMap.value, [key]: '' }
  try {
    await initAuth()
    let rows: SimInstrumentListItem[] = []
    if (tool.code) {
      const byModel = await listSimInstruments(
        { page: 1, pageSize: 100, model_number: tool.code },
        getAuthHeaders(),
      )
      if (byModel.success && byModel.data?.code === 0) {
        rows = byModel.data.data?.list || []
      }
    }
    if (!rows.length && (tool.zh || tool.en)) {
      const byName = await listSimInstruments(
        { page: 1, pageSize: 100, name: tool.zh || tool.en },
        getAuthHeaders(),
      )
      if (byName.success && byName.data?.code === 0) {
        rows = byName.data.data?.list || []
      }
    }
    const selectedSnapshot = getSelectedToolSnapshot(device, tool)
    const savedInstrument = selectedSnapshot ? toolToSimInstrument(selectedSnapshot) : null
    const availableRows = savedInstrument && !rows.some((item) =>
      String(item.id) === String(savedInstrument.id) || item.sn === savedInstrument.sn,
    )
      ? [savedInstrument, ...rows]
      : rows
    internalInstrumentOptionsMap.value = { ...internalInstrumentOptionsMap.value, [key]: availableRows }
    const current = selectedInternalInstrumentMap.value[key]
    if (current?.startsWith('sn:')) {
      const matched = availableRows.find((item) => item.sn === current.slice(3))
      if (matched) {
        selectedInternalInstrumentMap.value = {
          ...selectedInternalInstrumentMap.value,
          [key]: String(matched.id),
        }
      }
    }
    if (!availableRows.length) {
      internalInstrumentMessageMap.value = { ...internalInstrumentMessageMap.value, [key]: '未找到可选内部仪器' }
    }
  } finally {
    internalInstrumentLoadingMap.value = { ...internalInstrumentLoadingMap.value, [key]: false }
  }
}

watch(
  selectedSupportingOrders,
  (orders) => {
    const next: Record<string, boolean> = { ...selectedSupportToolMap.value }
    const validKeys = new Set<string>()

    orders.forEach((order: any) => {
      ;(order.deviceList || []).forEach((device: ResolvedDeviceRow) => {
        ;(device.supportTools || []).forEach((tool) => {
          const key = getSupportToolKey(order.id, device, tool)
          validKeys.add(key)
          const selectedSnapshot = getSelectedToolSnapshot(device, tool)
          if (next[key] === undefined) {
            next[key] = !!selectedSnapshot
          }
          if (selectedSnapshot && selectedInternalInstrumentMap.value[key] === undefined) {
            selectedInternalInstrumentMap.value = {
              ...selectedInternalInstrumentMap.value,
              [key]: getInternalSelectValue(selectedSnapshot),
            }
          }
          if (selectedSnapshot && externalInstrumentModelMap.value[key] === undefined) {
            externalInstrumentModelMap.value = {
              ...externalInstrumentModelMap.value,
              [key]: selectedSnapshot.externalInstrumentModel || '',
            }
          }
          if (next[key]) {
            void loadInternalInstrumentOptions(order.id, device, tool)
          }
        })
      })
    })

    Object.keys(next).forEach((key) => {
      if (!validKeys.has(key)) delete next[key]
    })
    const nextExternal = { ...externalInstrumentModelMap.value }
    Object.keys(nextExternal).forEach((key) => {
      if (!validKeys.has(key)) delete nextExternal[key]
    })
    externalInstrumentModelMap.value = nextExternal

    const pruneStateMap = <T>(map: Record<string, T>) => {
      const nextMap = { ...map }
      Object.keys(nextMap).forEach((key) => {
        if (!validKeys.has(key)) delete nextMap[key]
      })
      return nextMap
    }
    selectedInternalInstrumentMap.value = pruneStateMap(selectedInternalInstrumentMap.value)
    internalInstrumentOptionsMap.value = pruneStateMap(internalInstrumentOptionsMap.value)
    internalInstrumentLoadingMap.value = pruneStateMap(internalInstrumentLoadingMap.value)
    internalInstrumentMessageMap.value = pruneStateMap(internalInstrumentMessageMap.value)

    selectedSupportToolMap.value = next
  },
  { immediate: true, deep: true },
)

function isToolSelected(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument) {
  return selectedSupportToolMap.value[getSupportToolKey(orderId, device, tool)] === true
}

function toggleSupportTool(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument, checked: boolean) {
  selectedSupportToolMap.value = {
    ...selectedSupportToolMap.value,
    [getSupportToolKey(orderId, device, tool)]: checked,
  }
  if (checked) void loadInternalInstrumentOptions(orderId, device, tool)
}

const resolvedDownholeDevices = computed(() =>
  startedOrderDevices.value.flatMap((order: any) =>
    (order.deviceList || []).map((device: ResolvedDeviceRow) => {
      const templateToolMode = usesTemplateToolMode(order, device)
      const selectedTools = templateToolMode
        ? (device.supportTools || [])
            .filter((tool) => isToolSelected(order.id, device, tool))
            .map((tool) => buildStructuredTool(order.id, device, tool))
        : getResearchInstruments(device)
      return {
        id: device.id,
        orderId: order.id,
        orderDbId: order.orderDbId,
        deviceDbId: device.deviceDbId,
        customer: order.customer,
        deviceName: device.name,
        name: device.name,
        sn: device.sn,
        code: device.code,
        template: device.template,
        templateName: device.templateName,
        orderType: order.orderType,
        supportingTools: selectedTools,
        selectedSupportingTools: selectedTools,
        availableSupportingTools: templateToolMode ? device.supportTools : [],
      }
    }),
  ),
)

const flattenedSupportingTools = computed(() =>
  selectedSupportingOrders.value.flatMap((order: any) =>
    (order.deviceList || []).flatMap((device: ResolvedDeviceRow) =>
      (device.supportTools || [])
        .filter((tool) => isToolSelected(order.id, device, tool))
        .map((tool) => ({
          ...buildStructuredTool(order.id, device, tool),
          orderId: order.id,
          sourceDeviceName: device.name,
          template: device.template,
        })),
    ),
  ),
)

const flattenedResearchSupportingTools = computed(() =>
  researchManualOrders.value.flatMap((order: any) =>
    (order.deviceList || []).flatMap((device: ResolvedDeviceRow) =>
      getResearchInstruments(device).map((tool) => ({
        ...tool,
        orderId: order.id,
        sourceDeviceName: device.name,
        template: '',
      })),
    ),
  ),
)

const flattenedAllSupportingTools = computed(() => [
  ...flattenedSupportingTools.value,
  ...flattenedResearchSupportingTools.value,
])

// --- 表单状态 ---
const selectedWellName = ref('')
const customWellName = ref('') // 联动：试验井名-其他
const customWellNameEn = ref('')

const selectedTestingDevice = ref('')
const customTestingDevice = ref('') // 联动：测试设备-其他
const customTestingDeviceEn = ref('')

const selectedTestObjective = ref('')
const customTestObjective = ref('') // 联动：测试目的-其他
const customTestObjectiveEn = ref('')

const selectedTestType = ref('')
const testCount = ref('2')
const repairOrderNumber = ref('')

const wellDepth = ref('')
const wellTemperature = ref('')
const wellPressure = ref('')

const mainIntervalFrom = ref('')
const mainIntervalTo = ref('')
const repeatIntervalFrom = ref('')
const repeatIntervalTo = ref('')
const TODAY_ENV_CACHE_KEY = 'simwell.todayTestEnvironment'

const wellNameOptions = new Set(['cosl1', 'yanjiao1', 'yanjiao2', 'ren91', 'gugu8', 'other'])
const testingDeviceOptions = new Set(['cosl1_skid', 'yanjiao1_skid', 'yanjiao2_skid', 'other'])
const testObjectiveOptions = new Set(['new_product', 'first_test', 'other'])
const wellDeviceDefaults: Record<string, string> = {
  cosl1: 'cosl1_skid',
  yanjiao1: 'yanjiao1_skid',
  yanjiao2: 'yanjiao2_skid',
  ren91: 'other',
  gugu8: 'other',
  other: 'other',
}

function restoreOptionValue(
  value: unknown,
  options: Set<string>,
  selected: { value: string },
  custom: { value: string },
) {
  const text = String(value || '').trim()
  if (!text || options.has(text)) {
    selected.value = text
    custom.value = ''
    return
  }
  selected.value = 'other'
  custom.value = text
}

function todayText() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function loadTodayTestEnvironment() {
  if (props.mode === 'edit') return
  try {
    const raw = localStorage.getItem(TODAY_ENV_CACHE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (!data || data.date !== todayText()) return
    wellDepth.value = data.wellDepth || wellDepth.value
    wellTemperature.value = data.wellTemperature || wellTemperature.value
    wellPressure.value = data.wellPressure || wellPressure.value
    mainIntervalFrom.value = data.mainIntervalFrom || mainIntervalFrom.value
    mainIntervalTo.value = data.mainIntervalTo || mainIntervalTo.value
    repeatIntervalFrom.value = data.repeatIntervalFrom || repeatIntervalFrom.value
    repeatIntervalTo.value = data.repeatIntervalTo || repeatIntervalTo.value
  } catch {}
}

function saveTodayTestEnvironment() {
  localStorage.setItem(
    TODAY_ENV_CACHE_KEY,
    JSON.stringify({
      date: todayText(),
      wellDepth: wellDepth.value,
      wellTemperature: wellTemperature.value,
      wellPressure: wellPressure.value,
      mainIntervalFrom: mainIntervalFrom.value,
      mainIntervalTo: mainIntervalTo.value,
      repeatIntervalFrom: repeatIntervalFrom.value,
      repeatIntervalTo: repeatIntervalTo.value,
    }),
  )
}

watch(selectedWellName, (value) => {
  if (value !== 'other') {
    customWellName.value = ''
    customWellNameEn.value = ''
  }
})

watch(selectedTestingDevice, (value) => {
  if (value !== 'other') {
    customTestingDevice.value = ''
    customTestingDeviceEn.value = ''
  }
})

watch(selectedTestObjective, (value) => {
  if (value !== 'other') {
    customTestObjective.value = ''
    customTestObjectiveEn.value = ''
  }
})

watch(
  () => props.todayScheduledOrders.map((order: any) => String(order?.wellName || order?.well_name || '').trim()).join('|'),
  () => {
    // 编辑历史下井作业时，始终以已保存的作业数据为准。
    if (props.mode === 'edit' || props.initialWork) return
    const wellNames = Array.from(
      new Set(
        props.todayScheduledOrders
          .map((order: any) => String(order?.wellName || order?.well_name || '').trim())
          .filter(Boolean),
      ),
    )
    // 多井工单或历史工单没有实验井时，由操作人员自行选择。
    if (wellNames.length !== 1) {
      selectedWellName.value = ''
      selectedTestingDevice.value = ''
      return
    }
    const wellName = wellNames[0]
    const testingDevice = wellDeviceDefaults[wellName]
    if (!testingDevice) return
    selectedWellName.value = wellName
    selectedTestingDevice.value = testingDevice
  },
  { immediate: true },
)

watch(
  () => props.initialWork,
  (work) => {
    if (!work) return
    restoreOptionValue(work.well_name ?? work.wellName, wellNameOptions, selectedWellName, customWellName)
    restoreOptionValue(work.testing_device ?? work.testingDevice, testingDeviceOptions, selectedTestingDevice, customTestingDevice)
    restoreOptionValue(work.test_objective ?? work.testObjective, testObjectiveOptions, selectedTestObjective, customTestObjective)
    customWellNameEn.value = selectedWellName.value === 'other' ? String(work.well_name_en || '') : ''
    customTestingDeviceEn.value = selectedTestingDevice.value === 'other' ? String(work.testing_device_en || '') : ''
    customTestObjectiveEn.value = selectedTestObjective.value === 'other' ? String(work.test_objective_en || '') : ''
    if (selectedWellName.value === 'other') customWellNameEn.value = String(work.well_name_en ?? work.wellNameEn ?? '')
    if (selectedTestingDevice.value === 'other') customTestingDeviceEn.value = String(work.testing_device_en ?? work.testingDeviceEn ?? '')
    if (selectedTestObjective.value === 'other') customTestObjectiveEn.value = String(work.test_objective_en ?? work.testObjectiveEn ?? '')
    selectedTestType.value = String(work.test_type ?? work.testType ?? '')
    testCount.value = String(work.test_count ?? work.testCount ?? '2')
    repairOrderNumber.value = String(work.repair_order_number ?? work.repairOrderNumber ?? '')
    const environment = parseSimulatedWellEnvironment(work.env_text ?? work.test_environment ?? work.testEnvironment)
    wellDepth.value = environment.wellDepth
    wellTemperature.value = environment.wellTemperature
    wellPressure.value = environment.wellPressure
    const interval = parseSimulatedWellInterval(work.interval_text ?? work.test_interval ?? work.testInterval)
    mainIntervalFrom.value = interval.mainFrom
    mainIntervalTo.value = interval.mainTo
    repeatIntervalFrom.value = interval.repeatFrom
    repeatIntervalTo.value = interval.repeatTo
  },
  { immediate: true },
)

function saveDownholeOperation() {
  if (shouldShowTestInformation.value && !selectedTestObjective.value) {
    ElMessage.warning('请选择测试目的')
    return
  }
  if (shouldShowTestInformation.value && !selectedTestType.value) {
    ElMessage.warning('请选择测试类型')
    return
  }

  const bilingualCustomFields = [
    { selected: selectedWellName, chinese: customWellName, english: customWellNameEn, label: '实验井名' },
    { selected: selectedTestingDevice, chinese: customTestingDevice, english: customTestingDeviceEn, label: '测试设备' },
    ...(shouldShowTestInformation.value
      ? [{ selected: selectedTestObjective, chinese: customTestObjective, english: customTestObjectiveEn, label: '测试目的' }]
      : []),
  ]
  for (const field of bilingualCustomFields) {
    if (field.selected.value !== 'other') continue
    field.chinese.value = field.chinese.value.trim()
    field.english.value = field.english.value.trim()
    if (!field.chinese.value || !field.english.value) {
      ElMessage.warning(`${field.label}选择其他时，请同时填写中文和英文内容`)
      return
    }
  }

  for (const order of selectedSupportingOrders.value) {
    for (const device of order.deviceList || []) {
      for (const tool of device.supportTools || []) {
        if (!isToolSelected(order.id, device, tool)) continue
        const selected = getSelectedInternalInstrument(order.id, device, tool)
        const key = getSupportToolKey(order.id, device, tool)
        const rawValue = selectedInternalInstrumentMap.value[key]
        if (internalInstrumentLoadingMap.value[key]) {
          ElMessage.warning(`正在加载 ${device.name} / ${tool.zh || tool.code || '配接仪器'} 的内部仪器，请稍后再保存`)
          return
        }
        if (!selected) {
          const actionText = rawValue ? '重新选择可用' : '选择'
          ElMessage.warning(`请${actionText} ${device.name} / ${tool.zh || tool.code || '配接仪器'} 的内部仪器 SN`)
          return
        }
      }
    }
  }
  const payload = {
    orderIds: startedOrderIds.value,
    devices: resolvedDownholeDevices.value,
    supportingTools: flattenedAllSupportingTools.value,
    wellName: selectedWellName.value === 'other' ? customWellName.value : selectedWellName.value,
    wellNameEn: selectedWellName.value === 'other' ? customWellNameEn.value : '',
    testingDevice: selectedTestingDevice.value === 'other' ? customTestingDevice.value : selectedTestingDevice.value,
    testingDeviceEn: selectedTestingDevice.value === 'other' ? customTestingDeviceEn.value : '',
    testObjective: shouldShowTestInformation.value
      ? (selectedTestObjective.value === 'other' ? customTestObjective.value : selectedTestObjective.value)
      : '',
    testObjectiveEn: shouldShowTestInformation.value && selectedTestObjective.value === 'other'
      ? customTestObjectiveEn.value
      : '',
    testType: shouldShowTestInformation.value ? selectedTestType.value : '',
    testCount: shouldShowTestInformation.value ? testCount.value : '',
    repairOrderNumber: shouldShowTestInformation.value ? repairOrderNumber.value : '',
    testEnvironment: { wellDepth: wellDepth.value, wellTemperature: wellTemperature.value, wellPressure: wellPressure.value },
    testInterval: { mainFrom: mainIntervalFrom.value, mainTo: mainIntervalTo.value, repeatFrom: repeatIntervalFrom.value, repeatTo: repeatIntervalTo.value }
  }
  saveTodayTestEnvironment()
  emit('save', payload)
}

onMounted(() => {
  void loadTemplateLibrary()
  loadTodayTestEnvironment()
})
</script>

<template>
  <div class="downhole-view">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon"><Icon icon="mdi:oil" /></div>
        <div>
          <h1 class="header-title">下井作业设备组合</h1>
          <p class="header-subtitle">仅展示已排程并已选择开始试验的测试产品</p>
        </div>
      </div>
      <div class="header-right">
        <button class="week-cal-nav" @click="$emit('back')">返回</button>
      </div>
    </div>

    <div class="downhole-content">
      <div class="downhole-card">
        <div class="downhole-card-title">工单测试产品 <span class="english-sub">Order Test Products</span></div>
        <div v-if="templateLoading" class="hint-text">正在加载测试报告模板...</div>
        <div v-else-if="templateLoadMessage" class="hint-text">{{ templateLoadMessage }}</div>
        <div v-if="!startedOrderDevices.length" class="empty-state"><p>未选择开始实验的测试产品</p></div>
        <div v-for="order in startedOrderDevices" :key="'table-' + order.id" class="order-table-group">
          <div class="table-group-header">
            <span class="group-order-id">{{ order.id }}</span>
            <span class="group-customer">{{ order.customer }}</span>
            <span class="group-count">{{ order.deviceList?.length || 0 }} 个产品</span>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>测试产品</th>
                  <th>仪器编号</th>
                  <th>关联模板</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(device, idx) in order.deviceList" :key="getDevKey(order.id, device, idx)">
                  <td>{{ device.name }}</td>
                  <td>{{ device.sn || device.code || 'SN-' + (idx + 1) }}</td>
                  <td>
                    <select
                      v-model="selectedTemplateMap[device.stateKey]"
                      class="template-select"
                      @change="handleTemplateChange(order.id, device)"
                    >
                      <option v-if="order.orderType === 1" value="">不选择测试报告模板</option>
                      <option
                        v-for="template in templateLibrary"
                        :key="template.report_no"
                        :value="template.report_no"
                      >
                        {{ template.report_no }} - {{ template.report_name }}
                      </option>
                    </select>
                    <div v-if="device.templateName" class="cell-subtext">{{ device.templateName }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="researchManualOrders.length" class="downhole-card">
        <div class="downhole-card-title">配接仪器 <span class="english-sub">Supporting Tools</span></div>
        <div v-for="order in researchManualOrders" :key="'research-support-' + order.id" class="order-table-group">
          <div class="table-group-header">
            <span class="group-order-id">{{ order.id }}</span>
            <span class="group-customer">{{ order.customer }}</span>
            <span class="group-count">按测试产品选择配接仪器</span>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>测试产品</th>
                  <th>配接仪器</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(device, idx) in order.deviceList" :key="getDevKey(order.id, device, idx)">
                  <td>
                    <div>{{ device.name }}</div>
                    <div class="cell-subtext">{{ device.sn || device.code || 'SN-' + (idx + 1) }}</div>
                  </td>
                  <td>
                    <div class="research-tool-actions">
                      <button class="primary-btn" type="button" @click="openInstrumentPicker(order.id, device)">
                        选择仪器
                      </button>
                      <span class="cell-subtext">已选择 {{ getResearchInstruments(device).length }} 台</span>
                    </div>
                    <div v-if="getResearchInstruments(device).length" class="tool-selector-stack research-tool-list">
                      <div
                        v-for="tool in getResearchInstruments(device)"
                        :key="String(tool.internalInstrumentId || tool.internalInstrumentSn)"
                        class="tool-inline-option tool-row-option is-selected"
                      >
                        <div class="research-tool-summary">
                          <span class="tool-inline-text">
                            <span class="tool-option-name">{{ tool.internalInstrumentName || tool.zh || '-' }}</span>
                            <span v-if="tool.modelNumber" class="tool-code">{{ tool.modelNumber }}</span>
                          </span>
                          <button class="research-tool-remove" type="button" @click="removeResearchInstrument(device, tool)">移除</button>
                        </div>
                        <div class="tool-internal-panel research-sn-panel">
                          <div class="internal-label">SN号</div>
                          <div class="research-sn-value">{{ tool.internalInstrumentSn || '-' }}</div>
                          <div class="tool-remain">已用 {{ tool.usedCount ?? 0 }} 次，剩余 {{ tool.remainCount ?? 0 }} 次</div>
                        </div>
                      </div>
                    </div>
                    <div v-else class="cell-subtext">暂未选择配接仪器</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="selectedSupportingOrders.length" class="downhole-card">
        <div class="downhole-card-title">配接仪器 <span class="english-sub">Supporting Tools</span></div>
        <div v-for="order in selectedSupportingOrders" :key="'support-' + order.id" class="order-table-group">
          <div class="table-group-header">
            <span class="group-order-id">{{ order.id }}</span>
            <span class="group-customer">{{ order.customer }}</span>
            <span class="group-count">{{ order.deviceList?.length || 0 }} 个测试产品已匹配</span>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>测试产品</th>
                  <th>报告模板</th>
                  <th>配接仪器</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(device, idx) in order.deviceList" :key="getDevKey(order.id, device, idx)">
                  <td>
                    <div>{{ device.name }}</div>
                    <div class="cell-subtext">{{ device.sn || device.code || 'SN-' + (idx + 1) }}</div>
                  </td>
                  <td>
                    <div>{{ device.template || '-' }}</div>
                    <div v-if="device.templateName" class="cell-subtext">{{ device.templateName }}</div>
                  </td>
                  <td>
                    <div class="tool-list">
                      <div class="tool-selector-stack">
                        <div
                          v-for="tool in device.supportTools"
                          :key="`${device.id}_${tool.code || tool.zh || tool.en}`"
                          class="tool-inline-option tool-row-option"
                          :class="{ 'is-selected': isToolSelected(order.id, device, tool) }"
                        >
                          <label class="tool-check-line">
                            <input
                              type="checkbox"
                              :checked="isToolSelected(order.id, device, tool)"
                              @change="toggleSupportTool(order.id, device, tool, ($event.target as HTMLInputElement).checked)"
                            />
                            <span class="tool-inline-text">
                              <span class="tool-option-name">{{ tool.zh || tool.code || '-' }}</span>
                              <span v-if="tool.code" class="tool-code">{{ tool.code }}</span>
                            </span>
                          </label>
                          <div v-if="isToolSelected(order.id, device, tool)" class="tool-internal-panel">
                            <div class="internal-label">内部仪器编号</div>
                            <select
                              v-model="selectedInternalInstrumentMap[getSupportToolKey(order.id, device, tool)]"
                              class="instrument-select"
                              :disabled="internalInstrumentLoadingMap[getSupportToolKey(order.id, device, tool)]"
                              @click.stop
                              @change.stop
                            >
                              <option value="">-- 请选择 --</option>
                              <option
                                v-for="instrument in getInternalInstrumentOptions(order.id, device, tool)"
                                :key="instrument.id"
                                :value="String(instrument.id)"
                              >
                                {{ instrument.sn }}（已用 {{ instrument.used_count }} 次，剩余 {{ instrument.remain_count }} 次）
                              </option>
                            </select>
                            <div v-if="getSelectedRemainText(order.id, device, tool)" class="tool-remain">
                              {{ getSelectedRemainText(order.id, device, tool) }}
                            </div>
                            <div
                              v-else-if="internalInstrumentMessageMap[getSupportToolKey(order.id, device, tool)]"
                              class="tool-remain is-empty"
                            >
                              {{ internalInstrumentMessageMap[getSupportToolKey(order.id, device, tool)] }}
                            </div>
                            <div class="external-field">
                              <div class="internal-label">外部仪器型号（可选）</div>
                              <input
                                v-model="externalInstrumentModelMap[getSupportToolKey(order.id, device, tool)]"
                                class="external-instrument-input"
                                placeholder="填写外部仪器型号"
                                @click.stop
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div v-if="!researchManualOrders.length && !selectedSupportingOrders.length" class="downhole-card">
        <div class="downhole-card-title">配接仪器 <span class="english-sub">Supporting Tools</span></div>
        <div class="empty-state">
          <p>{{ templateLoading ? '正在匹配测试报告模板...' : '当前测试产品未匹配到配接仪器信息' }}</p>
        </div>
      </div>

      <div class="downhole-card form-card-styled">
        <div class="form-section-container">
          <div class="form-section-header">试验井名 Test well name</div>
          <div class="form-section-body">
            <div class="field-label">选择井名</div>
            <div class="option-grid">
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="cosl1" /> 科索1井 Well COSL 1</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="yanjiao1" /> 燕郊1井 Well Yanjiao 1</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="yanjiao2" /> 燕郊2井 Well Yanjiao 2</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="ren91" /> 任91井 Well Ren 91</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="gugu8" /> 孤古8井 Well Gugu 8</label>
              <label class="rect-radio"><input v-model="selectedWellName" type="radio" value="other" /> 其他 Other</label>
            </div>
            <div v-if="selectedWellName === 'other'" class="field-sub-input bilingual-custom-inputs">
              <input v-model="customWellName" class="form-input" placeholder="请输入自定义井名（中文）" />
              <input v-model="customWellNameEn" class="form-input" placeholder="Please enter the well name in English" />
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试设备 Testing device</div>
          <div class="form-section-body">
            <div class="field-label">选择测试设备</div>
            <div class="option-grid">
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="cosl1_skid" /> 科索1井电橇 Well COSL 1 Electrical Skid</label>
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="yanjiao1_skid" /> 燕郊1井电橇 Well Yanjiao 1 Electrical Skid</label>
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="yanjiao2_skid" /> 燕郊2井电橇 Well Yanjiao 2 Electrical Skid</label>
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="other" /> 其他 Other</label>
            </div>
            <div v-if="selectedTestingDevice === 'other'" class="field-sub-input bilingual-custom-inputs">
              <input v-model="customTestingDevice" class="form-input" placeholder="请输入自定义测试设备（中文）" />
              <input v-model="customTestingDeviceEn" class="form-input" placeholder="Please enter the testing device in English" />
            </div>
          </div>
        </div>

        <div v-if="shouldShowTestInformation" class="form-section-container">
          <div class="form-section-header">测试目的 Test Objective</div>
          <div class="form-section-body">
            <div class="field-label">选择测试目的</div>
            <div class="option-grid">
              <label class="rect-radio"><input v-model="selectedTestObjective" type="radio" value="new_product" /> 新产品测试 New product test</label>
              <label class="rect-radio"><input v-model="selectedTestObjective" type="radio" value="first_test" /> 首次测试 First test</label>
              <label class="rect-radio"><input v-model="selectedTestObjective" type="radio" value="other" /> 其他 Other</label>
            </div>
            <div v-if="selectedTestObjective === 'other'" class="field-sub-input bilingual-custom-inputs">
              <input v-model="customTestObjective" class="form-input" placeholder="请输入自定义测试目的（中文）" />
              <input v-model="customTestObjectiveEn" class="form-input" placeholder="Please enter the test objective in English" />
            </div>
          </div>
        </div>

        <div v-if="shouldShowTestInformation" class="form-section-container">
          <div class="form-section-header">测试类型 Test type</div>
          <div class="form-section-body">
            <div class="field-label">选择测试类型</div>
            <div class="vertical-option-list">
              <label class="rect-radio"><input v-model="selectedTestType" type="radio" value="first_test" /> 首次测试 First test</label>
              <label class="rect-radio"><input v-model="selectedTestType" type="radio" value="nth_test" /> 第___次测试 (设备维修工单编号)</label>
            </div>
            
            <div v-if="selectedTestType === 'nth_test'" class="nth-test-layout">
              <div class="nth-input-group">
                <div class="field-label sub">第几次测试</div>
                <div class="input-with-text">
                  <span>第</span>
                  <input v-model="testCount" class="form-input small-inline" />
                  <span>次测试</span>
                </div>
              </div>
              <div class="repair-input-group">
                <div class="field-label sub">设备维修工单编号</div>
                <input v-model="repairOrderNumber" class="form-input full-width" placeholder="请输入设备维修工单编号" />
              </div>
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试环境</div>
          <div class="form-section-body">
            <div class="grid-fields-four">
              <label class="labeled-input">
                <span class="input-label">井深：</span>
                <input v-model="wellDepth" class="form-input inline-field" />
                <span class="input-unit">m</span>
              </label>
              <label class="labeled-input">
                <span class="input-label">井温：</span>
                <input v-model="wellTemperature" class="form-input inline-field" />
                <span class="input-unit">℃</span>
              </label>
              <label class="labeled-input">
                <span class="input-label">井压：</span>
                <input v-model="wellPressure" class="form-input inline-field" />
                <span class="input-unit">MPa</span>
              </label>
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试井段</div>
          <div class="form-section-body">
            <div class="grid-fields-four">
              <label class="labeled-input">
                <span class="input-label">主测起始深度：</span>
                <input v-model="mainIntervalFrom" class="form-input inline-field" />
                <span class="input-unit">m</span>
              </label>
              <label class="labeled-input">
                <span class="input-label">主测终止深度：</span>
                <input v-model="mainIntervalTo" class="form-input inline-field" />
                <span class="input-unit">m</span>
              </label>
              <label class="labeled-input">
                <span class="input-label">复测起始深度：</span>
                <input v-model="repeatIntervalFrom" class="form-input inline-field" />
                <span class="input-unit">m</span>
              </label>
              <label class="labeled-input">
                <span class="input-label">复测终止深度：</span>
                <input v-model="repeatIntervalTo" class="form-input inline-field" />
                <span class="input-unit">m</span>
              </label>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="primary-btn" @click="saveDownholeOperation">{{ props.mode === 'edit' ? '保存编辑' : '保存下井作业' }}</button>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="instrumentPickerVisible"
      title="选择配接仪器"
      width="980px"
      destroy-on-close
    >
      <div class="instrument-picker-search">
        <el-input
          v-model="instrumentPickerSn"
          clearable
          placeholder="请输入SN号"
          @keyup.enter="searchInstrumentPicker"
        />
        <el-input
          v-model="instrumentPickerName"
          clearable
          placeholder="请输入仪器名称"
          @keyup.enter="searchInstrumentPicker"
        />
        <el-button type="primary" @click="searchInstrumentPicker">查询</el-button>
        <el-button @click="resetInstrumentPickerSearch">重置</el-button>
        <span class="instrument-picker-selected-count">已选择 {{ Object.keys(instrumentPickerDraft).length }} 台</span>
      </div>

      <el-table
        ref="instrumentPickerTableRef"
        v-loading="instrumentPickerLoading"
        :data="instrumentPickerRows"
        row-key="id"
        border
        stripe
        max-height="460"
        @selection-change="handleInstrumentPickerSelectionChange"
      >
        <el-table-column type="selection" width="52" />
        <el-table-column prop="sn" label="SN号" min-width="150" />
        <el-table-column prop="name" label="仪器名称" min-width="160" />
        <el-table-column prop="status" label="状态" min-width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="instrumentStatusTagType(row.status)">{{ row.status || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="model_number" label="型号" min-width="130" />
        <el-table-column prop="used_count" label="使用次数" min-width="100" align="center" />
        <el-table-column prop="remain_count" label="剩余可用次数" min-width="120" align="center" />
      </el-table>

      <div class="instrument-picker-pagination">
        <el-pagination
          size="small"
          background
          layout="prev, pager, next"
          :current-page="instrumentPickerPage"
          :page-size="instrumentPickerPageSize"
          :total="instrumentPickerTotal"
          @current-change="changeInstrumentPickerPage"
        />
      </div>

      <template #footer>
        <el-button @click="instrumentPickerVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmInstrumentPicker">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 样式部分完全展开写 */
.downhole-view {
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

.week-cal-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  transition: all 0.2s;
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

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #3b82f6;
  margin-bottom: 16px;
  padding-bottom: 8px;
}

.downhole-card-title {
  font-size: 15px;
  font-weight: 600;
}

.english-sub {
  font-size: 12px;
  font-weight: normal;
  color: #64748b;
  margin-left: 8px;
}

.selection-badge {
  background: #4ade80;
  color: #fff;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
}

.order-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.order-status-card {
  position: relative;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.order-status-card.is-active {
  background: #f0fdf4;
  border-color: #4ade80;
}

.check-icon-wrapper {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 20px;
  color: #4ade80;
}

.click-hint {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 11px;
  color: #94a3b8;
}

.card-time { font-size: 13px; color: #64748b; display: flex; align-items: center; gap: 4px; }
.card-order-id { font-size: 14px; font-weight: 700; color: #1e293b; }
.card-customer { font-size: 13px; color: #475569; }
.card-task { font-size: 12px; color: #94a3b8; height: 32px; overflow: hidden; }
.card-footer { font-size: 12px; color: #64748b; margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 8px; }

.order-table-group { margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.table-group-header { background: #f1f5f9; padding: 8px 12px; display: flex; gap: 12px; font-size: 13px; }
.group-order-id { font-weight: 700; color: #3b82f6; }
.group-count { margin-left: auto; color: #64748b; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { padding: 10px; background: #3b82f6; color: #fff; text-align: left; }
.data-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; }
.cell-subtext { margin-top: 4px; font-size: 12px; color: #64748b; word-break: break-all; }
.hint-text { margin-top: 8px; font-size: 12px; color: #64748b; }
.tool-list { display: flex; }
.tool-selector-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.tool-selector-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.tool-inline-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s ease;
}
.tool-inline-option:hover {
  border-color: #93c5fd;
  background: #f8fbff;
}
.tool-inline-option.is-selected {
  border-color: #2563eb;
  background: #eff6ff;
}
.tool-inline-option input {
  margin: 0;
}
.tool-row-option {
  align-items: stretch;
  flex-direction: column;
  border-radius: 8px;
  cursor: default;
}
.tool-check-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.tool-inline-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.tool-option-name {
  color: #0f172a;
  font-weight: 500;
}
.tool-code { font-size: 12px; color: #475569; }
.template-select,
.instrument-select,
.external-instrument-input {
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 13px;
}
.instrument-select {
  margin-top: 8px;
}
.external-instrument-input {
  margin-top: 8px;
}
.external-field {
  margin-top: 12px;
}
.tool-internal-panel {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
}
.internal-label {
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}
.tool-remain {
  margin-top: 4px;
  color: #15803d;
  font-size: 12px;
}
.tool-remain.is-empty {
  color: #dc2626;
}

.research-tool-actions,
.research-tool-summary,
.instrument-picker-search,
.instrument-picker-pagination {
  display: flex;
  align-items: center;
}

.research-tool-actions {
  gap: 10px;
}

.research-tool-list {
  margin-top: 10px;
}

.research-tool-summary {
  justify-content: space-between;
  gap: 12px;
}

.research-tool-remove {
  padding: 0;
  border: none;
  background: transparent;
  color: #dc2626;
  cursor: pointer;
  font-size: 12px;
}

.research-sn-panel {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.research-sn-panel .tool-remain {
  margin-top: 0;
}

.research-sn-value {
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 13px;
}

.instrument-picker-search {
  gap: 10px;
  margin-bottom: 14px;
}

.instrument-picker-search .el-input {
  width: 220px;
}

.instrument-picker-selected-count {
  margin-left: auto;
  color: #64748b;
  font-size: 13px;
}

.instrument-picker-pagination {
  justify-content: flex-end;
  margin-top: 14px;
}

/* 底部表单特定样式 */
.form-card-styled {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  gap: 16px;
}

.form-section-container {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.form-section-header {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #1e40af;
  background: #fff;
  border-bottom: 1px solid #3b82f6;
}

.form-section-body {
  padding: 16px;
}

.field-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 10px;
}

.field-label.sub {
  margin-top: 12px;
  margin-bottom: 4px;
}

.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.vertical-option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rect-radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.rect-radio:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.field-sub-input {
  margin-top: 12px;
}

.bilingual-custom-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.bilingual-custom-inputs .form-input {
  width: 100%;
  min-width: 0;
}

.nth-test-layout {
  display: flex;
  gap: 20px;
  margin-top: 12px;
  align-items: flex-end;
}

.nth-input-group { width: 160px; }
.repair-input-group { flex: 1; }

.input-with-text {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.form-input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-primary);
  font-size: 13px;
  outline: none;
}

.form-input:focus {
  border-color: var(--color-primary, #3b82f6);
}

.form-input.full-width { width: 100%; }
.form-input.small-inline { width: 50px; text-align: center; }
.form-input.inline-field {
  min-width: 0;
  flex: 1;
  height: 34px;
  padding: 0 6px;
  border: none;
  border-radius: 0;
  background: transparent;
}

.form-input.inline-field:focus {
  border-color: transparent;
}

.labeled-input {
  min-width: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 13px;
}

.labeled-input:focus-within {
  border-color: var(--color-primary, #3b82f6);
}

.input-label {
  flex: 0 0 auto;
  color: #64748b;
  white-space: nowrap;
}

.input-unit {
  flex: 0 0 auto;
  color: #94a3b8;
  white-space: nowrap;
}

.grid-fields-four {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.form-actions {
  display: flex;
  justify-content: center;
  margin-top: 12px;
  padding-bottom: 20px;
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 14px;
  background: var(--color-primary, #3b82f6);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.empty-state { text-align: center; padding: 20px; color: grey; }
</style>
