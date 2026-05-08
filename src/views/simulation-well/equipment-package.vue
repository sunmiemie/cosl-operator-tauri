<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useAuth } from '@/composables/useAuth'
import {
  getSimulatedWellReportTemplateDetail,
  listSimulatedWellReportTemplates,
  type SimulatedWellReportTemplateDetail,
} from '@/services/simulated-well-report-template-api'
import extractedFields from './extracted_fields.json'

const props = defineProps<{
  todayScheduledOrders: any[]
  downholeDevices: any[]
}>()

const emit = defineEmits(['back', 'save'])
const { initAuth, getAuthHeaders } = useAuth()

type TemplateInstrument = {
  code: string
  zh: string
  en: string
}

type ResolvedTemplateMeta = {
  templateCode: string
  templateName: string
  supportTools: TemplateInstrument[]
}

type ResolvedDeviceRow = {
  id: string
  name: string
  sn: string
  code: string
  template: string
  templateName: string
  supportTools: TemplateInstrument[]
}

const templateLoading = ref(false)
const templateLoadMessage = ref('')
const templateDetails = ref<SimulatedWellReportTemplateDetail[]>([])
const selectedSupportToolMap = ref<Record<string, boolean>>({})

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
    code: cleanTemplateText(item?.code || ''),
    zh: cleanTemplateText(item?.zh || item?.nameCN || item?.name || ''),
    en: cleanTemplateText(item?.en || item?.nameEN || ''),
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
      })
    })
  })
  return Array.from(map.values())
}

const fallbackTemplateDetails = computed<SimulatedWellReportTemplateDetail[]>(() => {
  return ((extractedFields as any[]) || []).map((item, index) => ({
    id: -(index + 1),
    report_no: String(item?.tableRefNo || item?.fileName || `LOCAL_TEMPLATE_${index + 1}`),
    report_name: String(item?.fileName || item?.tableRefNo || `本地模板${index + 1}`).replace(/\.docx$/i, ''),
    test_products: Array.isArray(item?.testProducts) ? item.testProducts : [],
    match_instruments: Array.isArray(item?.supportingTools) ? item.supportingTools : [],
    test_items: Array.isArray(item?.testItems) ? item.testItems : [],
    evaluation_standards: Array.isArray(item?.evaluations) ? item.evaluations : [],
    updated_at: '',
  }))
})

const templateLibrary = computed<SimulatedWellReportTemplateDetail[]>(() => {
  const map = new Map<string, SimulatedWellReportTemplateDetail>()
  templateDetails.value.forEach((item) =>
    map.set(templateKey(item), {
      ...item,
      test_products: mergeInstrumentLists(item.test_products as any[]),
      match_instruments: mergeInstrumentLists(item.match_instruments as any[]),
    }),
  )
  fallbackTemplateDetails.value.forEach((item) => {
    const key = templateKey(item)
    if (!map.has(key)) {
      map.set(key, {
        ...item,
        test_products: mergeInstrumentLists(item.test_products as any[]),
        match_instruments: mergeInstrumentLists(item.match_instruments as any[]),
      })
      return
    }
    const existing = map.get(key)!
    map.set(key, {
      ...existing,
      report_name: existing.report_name || item.report_name,
      test_products: mergeInstrumentLists(existing.test_products as any[], item.test_products as any[]),
      match_instruments: mergeInstrumentLists(existing.match_instruments as any[], item.match_instruments as any[]),
    })
  })
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

function resolveTemplateMeta(deviceName: string, fallbackTemplate?: string): ResolvedTemplateMeta {
  const matchedTemplate = findMatchedTemplate(deviceName)
  if (!matchedTemplate) {
    return {
      templateCode: fallbackTemplate || 'DEFAULT_DOWNHOLE_REPORT',
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
      templateLoadMessage.value = '后台模板获取失败，已使用本地模板信息匹配。'
      return
    }

    const catalog = catalogRes.data.data?.list || []
    const detailResults = await Promise.allSettled(
      catalog.map((item) => getSimulatedWellReportTemplateDetail(item.id, getAuthHeaders())),
    )

    templateDetails.value = detailResults
      .map((result) => (result.status === 'fulfilled' ? result.value : null))
      .filter((res): res is NonNullable<typeof res> => !!res && res.success && res.data?.code === 0)
      .map((res) => res.data.data)

    if (!templateDetails.value.length) {
      templateLoadMessage.value = '后台模板详情为空，已使用本地模板信息匹配。'
    }
  } catch {
    templateLoadMessage.value = '模板加载失败，已使用本地模板信息匹配。'
  } finally {
    templateLoading.value = false
  }
}

// 辅助：生成设备唯一标识
const getDevKey = (orderId: string, device: any, index: number) => {
  return `${orderId}_${device.code || device.sn || 'SN-' + (index + 1)}`
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
        customer: device?.customer || orderMeta?.customer || '-',
        deviceList: []
      })
    }
    const resolvedTemplate = resolveTemplateMeta(
      device?.deviceName || device?.name || '',
      device?.template || 'CBMT61XA_REPORT',
    )
    grouped.get(orderId).deviceList.push({
      id: device?.id || `${orderId}_${device?.sn || index + 1}`,
      name: device?.deviceName || device?.name || '-',
      sn: device?.sn || device?.code || '',
      code: device?.code || device?.sn || '',
      template: resolvedTemplate.templateCode,
      templateName: resolvedTemplate.templateName,
      supportTools: resolvedTemplate.supportTools,
    })
  })
  return Array.from(grouped.values())
})

const startedOrderIds = computed(() => startedOrderDevices.value.map((order: any) => order.id))
const selectedSupportingOrders = computed(() =>
  startedOrderDevices.value
    .map((order: any) => ({
      ...order,
      deviceList: (order.deviceList || []).filter((device: ResolvedDeviceRow) => device.supportTools?.length),
    }))
    .filter((order: any) => order.deviceList.length),
)

function getSupportToolKey(orderId: string, device: ResolvedDeviceRow, tool: TemplateInstrument) {
  return [
    orderId,
    device.id,
    normalizeCode(tool.code),
    normalizeText(tool.zh || tool.en || tool.code),
  ].join('::')
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
          if (next[key] === undefined) next[key] = false
        })
      })
    })

    Object.keys(next).forEach((key) => {
      if (!validKeys.has(key)) delete next[key]
    })

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
}

const resolvedDownholeDevices = computed(() =>
  startedOrderDevices.value.flatMap((order: any) =>
    (order.deviceList || []).map((device: ResolvedDeviceRow) => ({
      orderId: order.id,
      customer: order.customer,
      deviceName: device.name,
      sn: device.sn,
      code: device.code,
      template: device.template,
      templateName: device.templateName,
      supportingTools: device.supportTools,
    })),
  ),
)

const flattenedSupportingTools = computed(() =>
  selectedSupportingOrders.value.flatMap((order: any) =>
    (order.deviceList || []).flatMap((device: ResolvedDeviceRow) =>
      (device.supportTools || [])
        .filter((tool) => isToolSelected(order.id, device, tool))
        .map((tool) => ({
          ...tool,
          orderId: order.id,
          sourceDeviceName: device.name,
          template: device.template,
        })),
    ),
  ),
)

// --- 表单状态 ---
const selectedWellName = ref('')
const customWellName = ref('') // 联动：试验井名-其他

const selectedTestingDevice = ref('')
const customTestingDevice = ref('') // 联动：测试设备-其他

const selectedTestObjective = ref('')
const customTestObjective = ref('') // 联动：测试目的-其他

const selectedTestType = ref('first_test')
const testCount = ref('2')
const repairOrderNumber = ref('')

const wellDepth = ref('')
const wellTemperature = ref('')
const wellPressure = ref('')

const mainIntervalFrom = ref('')
const mainIntervalTo = ref('')
const repeatIntervalFrom = ref('')
const repeatIntervalTo = ref('')

function saveDownholeOperation() {
  const payload = {
    orderIds: startedOrderIds.value,
    devices: resolvedDownholeDevices.value,
    supportingTools: flattenedSupportingTools.value,
    wellName: selectedWellName.value === 'other' ? customWellName.value : selectedWellName.value,
    testingDevice: selectedTestingDevice.value === 'other' ? customTestingDevice.value : selectedTestingDevice.value,
    testObjective: selectedTestObjective.value === 'other' ? customTestObjective.value : selectedTestObjective.value,
    testType: selectedTestType.value,
    testCount: testCount.value,
    repairOrderNumber: repairOrderNumber.value,
    testEnvironment: { wellDepth: wellDepth.value, wellTemperature: wellTemperature.value, wellPressure: wellPressure.value },
    testInterval: { mainFrom: mainIntervalFrom.value, mainTo: mainIntervalTo.value, repeatFrom: repeatIntervalFrom.value, repeatTo: repeatIntervalTo.value }
  }
  emit('save', payload)
}

onMounted(() => {
  void loadTemplateLibrary()
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
        <div v-if="templateLoading" class="hint-text">正在根据测试设备名称匹配测试报告模板...</div>
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
                    <div>{{ device.template || device.code || 'CBMT61XA_REPORT' }}</div>
                    <div v-if="device.templateName" class="cell-subtext">{{ device.templateName }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="downhole-card" v-if="selectedSupportingOrders.length">
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
                    <div>{{ device.template || 'DEFAULT_DOWNHOLE_REPORT' }}</div>
                    <div v-if="device.templateName" class="cell-subtext">{{ device.templateName }}</div>
                  </td>
                  <td>
                    <div class="tool-list">
                      <div class="tool-selector-inline">
                        <label
                          v-for="tool in device.supportTools"
                          :key="`${device.id}_${tool.code || tool.zh || tool.en}`"
                          class="tool-inline-option"
                          :class="{ 'is-selected': isToolSelected(order.id, device, tool) }"
                        >
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
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div v-else class="downhole-card">
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
            <div v-if="selectedWellName === 'other'" class="field-sub-input">
              <input v-model="customWellName" class="form-input full-width" placeholder="请输入自定义井名" />
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
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="3595_trips" /> 3595测井车 3595 Trips</label>
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="3590_trips" /> 3590测井车 3590 Trips</label>
              <label class="rect-radio"><input v-model="selectedTestingDevice" type="radio" value="other" /> 其他 Other</label>
            </div>
            <div v-if="selectedTestingDevice === 'other'" class="field-sub-input">
              <input v-model="customTestingDevice" class="form-input full-width" placeholder="请输入自定义测试设备" />
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试目的 Test Objective</div>
          <div class="form-section-body">
            <div class="field-label">选择测试目的</div>
            <div class="option-grid">
              <label class="rect-radio"><input v-model="selectedTestObjective" type="radio" value="new_product" /> 新产品测试 New product test</label>
              <label class="rect-radio"><input v-model="selectedTestObjective" type="radio" value="first_test" /> 首次测试 First test</label>
              <label class="rect-radio"><input v-model="selectedTestObjective" type="radio" value="other" /> 其他 Other</label>
            </div>
            <div v-if="selectedTestObjective === 'other'" class="field-sub-input">
              <input v-model="customTestObjective" class="form-input full-width" placeholder="请输入自定义测试目的" />
            </div>
          </div>
        </div>

        <div class="form-section-container">
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
              <input v-model="wellDepth" class="form-input" placeholder="井深 m" />
              <input v-model="wellTemperature" class="form-input" placeholder="井温 °C" />
              <input v-model="wellPressure" class="form-input" placeholder="井压 ksi" />
            </div>
          </div>
        </div>

        <div class="form-section-container">
          <div class="form-section-header">测试井段</div>
          <div class="form-section-body">
            <div class="grid-fields-four">
              <input v-model="mainIntervalFrom" class="form-input" placeholder="主测起始深度" />
              <input v-model="mainIntervalTo" class="form-input" placeholder="主测终止深度" />
              <input v-model="repeatIntervalFrom" class="form-input" placeholder="复测起始深度" />
              <input v-model="repeatIntervalTo" class="form-input" placeholder="复测终止深度" />
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="primary-btn" @click="saveDownholeOperation">保存下井作业</button>
        </div>
      </div>
    </div>
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
