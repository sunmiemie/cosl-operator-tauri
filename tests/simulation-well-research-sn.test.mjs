import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const source = readFileSync(resolve(root, 'src/views/simulation-well/equipment-package.vue'), 'utf8')
const normalize = source.slice(source.indexOf('function normalizeInstrument('), source.indexOf('function mergeInstrumentLists('))
const helpers = source.slice(source.indexOf('function simInstrumentToTool('), source.indexOf('\nwatch(', source.indexOf('function normalizeResearchSelectedTools(')))
const picker = source.slice(source.indexOf('function confirmInstrumentPicker()'), source.indexOf('const selectedSupportingOrders'))
const context = {
  cleanTemplateText: value => String(value).trim(),
  researchInstrumentMap: { value: {} }, instrumentPickerDraft: { value: {} },
  instrumentPickerTarget: { value: { device: { stateKey: 'device' } } },
  instrumentPickerVisible: { value: true },
}
vm.createContext(context)
vm.runInContext(ts.transpile(normalize + helpers + picker), context)
const run = code => vm.runInContext(code, context)
context.first = { id: 1, sn: 'INT-1', name: '仪器1', model_number: 'M', used_count: 3, remain_count: 7, status: '正常' }
context.second = { ...context.first, id: 2, sn: 'INT-2', name: '仪器2' }
context.instrumentPickerDraft.value = { 1: context.first, 2: context.second }
run('confirmInstrumentPicker()')
let [first, second] = context.researchInstrumentMap.value.device
assert.equal(first.internalInstrumentSn, 'INT-1')
context.tool = first
first.externalInstrumentModel = ' EXT-1 '
run('applyResearchInstrumentSn(tool)')
for (const key of ['internalInstrumentId', 'internalInstrumentSn', 'internalInstrumentName', 'usedCount', 'remainCount']) assert.equal(first[key], undefined)
assert.equal(second.internalInstrumentSn, 'INT-2', '切换只影响单台仪器')
const saved = JSON.parse(JSON.stringify(run('buildResearchTool(tool)')))
assert.equal(saved.externalInstrumentModel, 'EXT-1')
assert.equal(saved.sourceInstrument.sn, 'INT-1')
assert.equal(saved.internalInstrumentId, undefined)
context.saved = saved
context.tool = run('normalizeResearchSelectedTools([saved])[0]')
assert.equal(context.tool.externalInstrumentModel, 'EXT-1')
context.tool.externalInstrumentModel = '   '
run('applyResearchInstrumentSn(tool)')
assert.equal(context.tool.internalInstrumentSn, 'INT-1')
assert.equal(context.tool.usedCount, 3)
context.tool.externalInstrumentModel = 'EXT-1'
run('applyResearchInstrumentSn(tool)')
context.researchInstrumentMap.value.device = [context.tool, second]
run('confirmInstrumentPicker()')
assert.equal(context.researchInstrumentMap.value.device[0].externalInstrumentModel, 'EXT-1', '重新确认保留外部SN')
context.third = { ...context.first, id: 3, sn: 'INT-3' }
context.instrumentPickerDraft.value = { 1: context.first, 3: context.third }
run('confirmInstrumentPicker()')
assert.equal(context.researchInstrumentMap.value.device.length, 2)
assert.equal(context.researchInstrumentMap.value.device[1].internalInstrumentSn, 'INT-3')
run("removeResearchInstrument({stateKey:'device'}, researchInstrumentMap.value.device[0])")
assert.equal(context.researchInstrumentMap.value.device[0].internalInstrumentSn, 'INT-3')

context.legacy = [{ code: 'M', externalInstrumentModel: 'EXT' }, { code: 'M', externalInstrumentModel: 'EXT' }]
const legacy = run('normalizeResearchSelectedTools(legacy)')
assert.equal(legacy.length, 2, '无来源外部记录不会丢失或合并')
assert.notEqual(legacy[0].researchToolKey, legacy[1].researchToolKey)
context.tool = legacy[0]
context.tool.externalInstrumentModel = ''
run('applyResearchInstrumentSn(tool)')
assert.equal(context.tool.internalInstrumentSn, undefined, '无来源不能恢复未知内部SN')
context.dual = { internalInstrumentId: 1, internalInstrumentSn: 'OLD', externalInstrumentModel: 'EXT', usedCount: 3 }
const dual = run('normalizeResearchSelectedTools([dual])[0]')
assert.equal(dual.internalInstrumentSn, undefined)
assert.equal(dual.sourceInstrument.sn, 'OLD')

const start = source.indexOf('  for (const order of researchManualOrders.value) {', source.indexOf('function saveDownholeOperation()'))
const guard = source.slice(start, source.indexOf('  const payload = {', start))
context.researchManualOrders = { value: [{ deviceList: [{ stateKey: 'device', name: '产品' }] }] }
context.ElMessage = { warning: message => { context.warning = message } }
for (const [internal, external, expected] of [['INT', '', true], ['', 'EXT', true], ['', '', false], ['', '  ', false], ['INT', 'EXT', false]]) {
  context.researchInstrumentMap.value.device = [{ internalInstrumentSn: internal, externalInstrumentModel: external }]
  assert.equal(run('(function(){' + guard + ';return true})()') === true, expected)
}
const readback = readFileSync(resolve(root, 'src/views/simulation-well/downhole-work.vue'), 'utf8')
assert.match(readback, /sourceInstrument: item\?\.sourceInstrument/)
const panelStart = source.indexOf('class="tool-internal-panel research-sn-panel"')
assert.ok(panelStart >= 0)
const panel = source.slice(panelStart, panelStart + 1100)
assert.match(panel, /内部仪器SN号/)
assert.doesNotMatch(panel, /v-model="tool\.internalInstrumentSn"/)
assert.match(source, /getResearchInstruments\(device\)\.map\(buildResearchTool\)/)
assert.match(source, /\.\.\.buildResearchTool\(tool\)/)
console.log('PASS: research SN defaults, switching, roundtrip, picker retention, removal, legacy data and save validation')
