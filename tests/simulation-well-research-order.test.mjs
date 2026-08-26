import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const api = readFileSync(resolve(root, 'src/services/simulated-well-api.ts'), 'utf8')
const schedule = readFileSync(resolve(root, 'src/views/simulation-well/composables/useSimulationWellScheduleV2.ts'), 'utf8')
const page = readFileSync(resolve(root, 'src/views/simulation-well/index.vue'), 'utf8')
const equipment = readFileSync(resolve(root, 'src/views/simulation-well/equipment-package.vue'), 'utf8')
const report = readFileSync(resolve(root, 'src/views/simulation-well/test-report.vue'), 'utf8')
const instrumentApi = readFileSync(resolve(root, 'src/services/sim-instrument-api.ts'), 'utf8')

assert.match(api, /order_type\?: 0 \| 1/, 'order API should expose the research order type')
assert.match(schedule, /orderType: normalizeOrderType\(dto\.order_type\)/, 'schedule should preserve the order type')
assert.match(page, /selectedOrderTypes\.has\(0\) && selectedOrderTypes\.has\(1\)/, 'mixed order types must be blocked')
assert.match(page, /研究院工单和非研究院工单不能同时进行测试/, 'mixed selection should explain the restriction')

assert.match(equipment, /const isResearchOrder = computed/, 'equipment page should derive research mode')
assert.match(equipment, /orderType === 1\s*\? \{ templateCode: '', templateName: '', supportTools: \[\] \}/, 'research devices must skip template matching')
assert.match(equipment, /v-if="!isResearchOrder">关联模板/, 'research product table should hide the template column')
assert.match(equipment, /openInstrumentPicker\(order\.id, device\)/, 'research products should open their own instrument picker')
assert.match(equipment, /const researchInstrumentMap = ref<Record<string, TemplateInstrument\[\]>>/, 'research instrument selection should be stored per product')
assert.match(equipment, /Object\.values\(instrumentPickerDraft\.value\)\.map\(simInstrumentToTool\)/, 'confirmed instruments should be mapped to the saved tool structure')
assert.match(equipment, /label="SN号"[\s\S]*label="仪器名称"[\s\S]*label="状态"[\s\S]*label="型号"[\s\S]*label="使用次数"[\s\S]*label="剩余可用次数"/, 'instrument picker should expose the required six data columns')
assert.match(equipment, /v-if="!isResearchOrder" class="form-section-container">\s*<div class="form-section-header">测试目的/, 'research form should hide test objective')
assert.match(equipment, /testObjective: isResearchOrder\.value \? ''/, 'research payload should clear test objective')
assert.match(equipment, /supportingTools: isResearchOrder\.value \? flattenedResearchSupportingTools\.value/, 'research payload should save selected supporting tools')
assert.match(instrumentApi, /params\.currentPage \?\? params\.page/, 'instrument API should support currentPage while retaining page compatibility')
assert.match(instrumentApi, /query\.currentPage = String\(currentPage\)/, 'instrument API should send the backend pagination key')

assert.match(report, /const isResearchReport = computed/, 'report page should derive research mode')
assert.match(report, /if \(device\.orderType === 1\) return/, 'research reports must skip template loading')
assert.match(report, /if \(!isResearchReport\.value && \(!selectedTemplate\.value/, 'research reports must bypass template validation')
assert.match(report, /order_type: selectedDevice\.value\.orderType/, 'report metadata should persist order type')
assert.match(report, /conclusion: isResearchReport\.value \? ''/, 'research payload should clear conclusion')
assert.match(report, /v-if="!isResearchReport" class="downhole-card">\s*<div class="downhole-card-title">测试项目/, 'research reports should hide test items')
assert.match(report, /v-if="!isPreviewResearchReport" class="report-data-section">/, 'research report previews should hide template data')
assert.match(report, /const isResearch = normalizeOrderType\(meta\.order_type\) === 1/, 'report list should identify research reports')
assert.match(report, /reportName: isResearch \? '' : \(meta\.report_name \|\| meta\.template_code \|\| report\.report_no\)/, 'research report list names should stay empty')
assert.match(report, /v-if="!isPreviewResearchReport" class="info-item">\s*<div class="info-label">报告名称<\/div>/, 'research report previews should hide report name')

console.log('simulation well research order assertions passed')
