import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const downhole = readFileSync(resolve(root, 'src/views/simulation-well/downhole-work.vue'), 'utf8')
const equipment = readFileSync(resolve(root, 'src/views/simulation-well/equipment-package.vue'), 'utf8')
const api = readFileSync(resolve(root, 'src/services/simulated-well-downhole-api.ts'), 'utf8')
const page = readFileSync(resolve(root, 'src/views/simulation-well/index.vue'), 'utf8')

assert.match(downhole, /const normalizeArray = <T = any>/, 'edit adapter should accept JSON-array history fields')
assert.match(downhole, /orderType: normalizeOrderType\(/, 'edit adapter should preserve order type')
assert.match(downhole, /orderDbId: device\?\.orderDbId \?\? device\?\.order_db_id/, 'edit adapter should preserve order database ID')
assert.match(downhole, /deviceDbId: device\?\.deviceDbId \?\? device\?\.device_db_id/, 'edit adapter should preserve device database ID')
assert.match(downhole, /allSupportingTools = normalizeArray/, 'edit adapter should restore legacy flattened supporting tools')

assert.match(api, /export function parseSimulatedWellEnvironment/, 'environment parser should be shared by the edit form')
assert.match(api, /export function parseSimulatedWellInterval/, 'interval parser should be shared by the edit form')
assert.match(api, /orderDbId\?: number \| string/, 'device payload should expose order database ID compatibility')
assert.match(api, /deviceDbId\?: number \| string/, 'device payload should expose device database ID compatibility')

const savedTemplateIndex = equipment.indexOf("findTemplateByCode(fallbackTemplate || '')")
const productTemplateIndex = equipment.indexOf('findMatchedTemplate(deviceName)')
assert.ok(savedTemplateIndex >= 0 && savedTemplateIndex < productTemplateIndex, 'saved template should win over product auto-matching')
assert.match(equipment, /function restoreSavedTemplateSelections\(/, 'edit mode should restore persisted templates after the library loads')
assert.match(equipment, /orderType === 1 && !savedTemplate && next\[stateKey\] === undefined/, 'research manual mode should initialize an explicit empty template selection')
assert.match(equipment, /next\[stateKey\] = ''/, 'research manual mode should select the no-template option instead of leaving the select blank')
assert.match(equipment, /if \(order\.orderType === 1 && !device\.template\) next\[key\] = ''/, 'scheduled research products should explicitly select the no-template option')
assert.match(equipment, /normalizeCode\(device\.template\)/, 'tool state keys should include the active template')
assert.match(equipment, /function handleTemplateChange\(/, 'template changes should explicitly clear product tool state')
assert.match(equipment, /@change="handleTemplateChange\(order\.id, device\)"/, 'template selector should clear stale state on user changes')
assert.match(equipment, /selectedInternalInstrumentMap\.value = pruneStateMap/, 'stale internal instrument selections should be removed')
assert.match(equipment, /savedInstrument && !rows\.some/, 'historical selected instruments should remain visible if inventory filtering excludes them')

assert.match(equipment, /parseSimulatedWellEnvironment\(work\.env_text/, 'edit form should restore all environment fields through the shared parser')
assert.match(equipment, /parseSimulatedWellInterval\(work\.interval_text/, 'edit form should restore all interval fields through the shared parser')
assert.match(equipment, /work\.test_type \?\? work\.testType/, 'edit form should restore test type from either API case')
assert.match(equipment, /work\.repair_order_number \?\? work\.repairOrderNumber/, 'edit form should restore repair order number from either API case')

assert.match(page, /template: normalizeOrderType\(order\.orderType\) === 1\s*\? ''/, 'scheduled research products should start without a template')
assert.match(page, /template: orderType === 1 \? '' : String\(item\.template \|\| 'DEFAULT_DOWNHOLE_REPORT'\)/, 'route-restored research products should keep the empty template')
assert.match(page, /template: device\.orderType === 1 \? '' : \(device\.template \|\| device\.sn \|\| 'DEFAULT_DOWNHOLE_REPORT'\)/, 'start-order snapshot should retain research manual mode')

assert.match(downhole, /defineEmits<[\s\S]*'edit-saved': \[workNo: string\]/, 'downhole work should expose a typed edit-saved event')
assert.match(downhole, /buildSimulatedWellDownholeWorkPayload\(payload, \{\s*status: 1,[\s\S]*emit\('edit-saved', res\.data\?\.data\?\.work_no \|\| editedWorkNo\)/, 'editing downhole work should mark it running and emit its final work number')
assert.match(page, /async function enterMonitoringFlow\(workNo: string\)[\s\S]*await startMonitorAndNavigate\(workNo\)[\s\S]*view: 'active-test'/, 'saved downhole work should share monitoring and fallback navigation')
assert.match(page, /const workNo = res\.data\.data\?\.work_no \|\| ''[\s\S]*await enterMonitoringFlow\(workNo\)/, 'saving new downhole work should enter the shared monitoring flow')
assert.match(page, /async function handleEditedDownholeSaved\(workNo: string\)[\s\S]*activeTestOperation\.value = null[\s\S]*await enterMonitoringFlow\(workNo\)/, 'editing should clear stale active-test context before monitoring')
assert.match(page, /@edit-saved="handleEditedDownholeSaved"/, 'saving edited downhole work should enter the shared monitoring flow')

console.log('simulation well downhole edit restore assertions passed')
