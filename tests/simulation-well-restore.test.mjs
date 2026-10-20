import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const indexContent = readFileSync(resolve(root, 'src/views/simulation-well/index.vue'), 'utf8')
const reportContent = readFileSync(resolve(root, 'src/views/simulation-well/test-report.vue'), 'utf8')
const packageContent = readFileSync(resolve(root, 'src/views/simulation-well/equipment-package.vue'), 'utf8')
const downholeContent = readFileSync(resolve(root, 'src/views/simulation-well/downhole-work.vue'), 'utf8')
const downholeApiContent = readFileSync(resolve(root, 'src/services/simulated-well-downhole-api.ts'), 'utf8')
const simInstrumentApiPath = resolve(root, 'src/services/sim-instrument-api.ts')

assert.ok(
  existsSync(simInstrumentApiPath),
  'simulation-well should keep sim-instrument-api for internal instrument selection'
)

assert.match(
  indexContent,
  /v\s*===\s*'active-test'/,
  'simulation-well should keep the active-test view after starting a downhole operation'
)

assert.match(
  indexContent,
  /auto-create-report="route\.query\.autoCreate === '1'"/,
  'simulation-well should pass the auto-create report flag into the test report view'
)

assert.match(
  reportContent,
  /autoCreateReport\?:\s*boolean/,
  'test-report should accept autoCreateReport for the post-downhole report flow'
)

assert.match(
  reportContent,
  /reportNextStepVisible/,
  'test-report should keep the next-report prompt when several device reports remain'
)

assert.match(
  reportContent,
  /template_id:\s*usesTemplateReport\.value \? selectedTemplate\.value\?\.id : null/,
  'test-report should submit the selected persisted template ID for each template-based report'
)

assert.match(
  reportContent,
  /未关联有效报告模板，请先在管理端配置模板后再提交/,
  'test-report should prevent a new report from being submitted without a persisted template'
)

assert.match(
  reportContent,
  /meta\.template_snapshot\s*\?\s*buildEditFallbackTemplate\(meta\)/,
  'test-report should use the frozen template snapshot when editing an existing report'
)

assert.match(
  packageContent,
  /class="template-select"/,
  'equipment-package should allow selecting a test report template per device'
)

assert.match(
  packageContent,
  /testEnvironment:\s*\{\s*wellDepth:\s*wellDepth\.value,\s*wellTemperature:\s*wellTemperature\.value,\s*wellbore:\s*wellbore\.value,\s*mudResistivity:\s*mudResistivity\.value\s*\}/,
  'equipment-package should save depth, temperature, wellbore and mud resistivity with the downhole environment'
)

assert.match(
  packageContent,
  /<span class="input-label">井温：<\/span>[\s\S]*?<span class="input-unit">℃<\/span>/,
  'equipment-package should display the well temperature input'
)

for (const helper of ['formatSimulatedWellEnvironment', 'formatSimulatedWellInterval', 'stripSimulatedWellUnit']) {
  assert.match(
    downholeApiContent,
    new RegExp(`export function ${helper}`),
    `downhole API helpers should expose ${helper} for consistent unit display`
  )
}

assert.match(
  downholeContent,
  /formatSimulatedWellEnvironment\(\(row as any\)\.env_text/,
  'downhole work list should display environment values with units'
)
assert.match(
  downholeContent,
  /formatSimulatedWellInterval\(\(row as any\)\.interval_text/,
  'downhole work list should display interval values with units'
)
assert.match(
  packageContent,
  /wellTemperature\.value = environment\.wellTemperature/,
  'editing a work should refill temperature through the shared environment parser'
)

assert.match(
  packageContent,
  /<span class="input-label">井眼：<\/span>[\s\S]*?<span class="input-unit">inch<\/span>/,
  'equipment-package should display the wellbore input'
)

assert.match(
  packageContent,
  /restoreOptionValue\(work\.well_name, wellNameOptions, selectedWellName, customWellName\)/,
  'equipment-package should restore custom well names through the other option'
)

assert.match(
  packageContent,
  /restoreOptionValue\(work\.testing_device, testingDeviceOptions, selectedTestingDevice, customTestingDevice\)/,
  'equipment-package should restore custom testing devices through the other option'
)

for (const field of ['customWellNameEn', 'customTestingDeviceEn', 'customTestObjectiveEn']) {
  assert.match(
    packageContent,
    new RegExp(`const ${field} = ref\\(''\\)`),
    `equipment-package should keep editable English state for ${field}`
  )
}

for (const placeholder of [
  'Please enter the well name in English',
  'Please enter the testing device in English',
  'Please enter the test objective in English',
]) {
  assert.ok(
    packageContent.includes(placeholder),
    `equipment-package should render the bilingual custom input: ${placeholder}`
  )
}

assert.match(
  packageContent,
  /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/,
  'custom Chinese and English inputs should have equal widths on the same row'
)

for (const field of ['wellNameEn', 'testingDeviceEn', 'testObjectiveEn']) {
  assert.match(
    packageContent,
    new RegExp(`${field}:[^\\r\\n]*custom`),
    `equipment-package payload should include ${field}`
  )
}

for (const field of ['well_name_en', 'testing_device_en', 'test_objective_en']) {
  assert.match(
    downholeApiContent,
    new RegExp(`${field}\\?: string`),
    `downhole API type should include ${field}`
  )
  assert.match(
    downholeApiContent,
    new RegExp(`${field}:`),
    `shared downhole payload should include ${field}`
  )
}

assert.match(
  packageContent,
  /repairOrderNumber\.value = work\.repair_order_number \|\| ''/,
  'equipment-package should restore the repair order number'
)

for (const field of ['testing_device', 'test_objective', 'test_type', 'test_count', 'repair_order_number']) {
  assert.match(downholeApiContent, new RegExp(`${field}\\?: string`), `downhole API type should include ${field}`)
  assert.match(downholeApiContent, new RegExp(`${field}:`), `shared downhole payload should include ${field}`)
}

assert.match(
  downholeApiContent,
  /export function buildSimulatedWellDownholeWorkPayload/,
  'downhole API should expose one shared payload builder'
)

assert.match(
  downholeContent,
  /buildSimulatedWellDownholeWorkPayload\(payload, \{/,
  'downhole work list should use the shared payload builder'
)

assert.match(
  indexContent,
  /buildSimulatedWellDownholeWorkPayload\(payload, \{\s*status: 1,/,
  'normal testing flow should use the shared payload builder with running status'
)

assert.match(
  reportContent,
  /testing_device: selectedOperation\.value\.testing_device \|\| ''/,
  'test reports should snapshot the testing device'
)

assert.match(
  reportContent,
  /repair_order_number: selectedOperation\.value\.repair_order_number \|\| ''/,
  'test reports should snapshot the repair order number'
)

assert.match(
  reportContent,
  /normalizeCode\(item\.report_no\) === normalized \|\|\s*normalizeCode\(item\.report_name\) === normalized/,
  'report template lookup should only accept exact normalized codes or names'
)

const codeMatchIndex = reportContent.indexOf('const matchByCode = findMatchedTemplateByCode(device.template)')
const productMatchIndex = reportContent.indexOf('const matchByProduct = findMatchedTemplateByProduct(device.deviceName)')
assert.ok(codeMatchIndex >= 0 && codeMatchIndex < productMatchIndex,
  'report template loading should prefer the saved template code over product matching')

assert.match(
  reportContent,
  /已保存的关联模板不存在，已按测试产品自动匹配。/,
  'report template loading should retain a product-match fallback for deleted templates'
)

console.log('simulation-well restore assertions passed')

assert.match(packageContent, /<span class="input-label">泥浆电阻率：<\/span>[\s\S]*?<span class="input-unit">Ω\.m<\/span>/)
assert.doesNotMatch(packageContent, /wellPressure|井压：/)
