import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { groupSupportingDevices, supportingGroupKey } from '../src/views/simulation-well/supporting-groups.ts'

const require = createRequire(import.meta.url)
const instrument = { id: 11, sn: 'INTERNAL-11', name: 'Support', model_number: 'SUPPORT', remain_count: 30, used_count: 0 }
const templates = [1, 2].map((id) => ({ id, report_no: `T-${id}`, report_name: `Template ${id}`,
  test_products: [], match_instruments: [{ code: `SUPPORT-${id}`, zh: '配接仪器' }] }))
const input = (id, orderId = 'ORDER-1', template = 'T-1', orderType = 0) => ({
  id: `device-${id}`, deviceDbId: id, orderId, orderDbId: orderId === 'ORDER-1' ? 1 : 2,
  deviceName: `Tool ${id}`, sn: `SN-${id}`, template, orderType,
})

function evaluate(source, mocks) {
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports,
    require: (name) => name in mocks ? mocks[name] : require(name), console,
    setTimeout, clearTimeout, URL, Blob,
  })
  return module.exports
}

async function editor(devices) {
  const path = new URL('../src/views/simulation-well/equipment-package.vue', import.meta.url)
  const { descriptor } = parse(readFileSync(path, 'utf8'), { filename: path.pathname })
  const { content } = compileScript(descriptor, { id: 'shared-tools-test' })
  const mocks = {
    vue: { ...vue, onMounted: () => {} }, '@iconify/vue': { Icon: {} },
    'element-plus': { ElMessage: { warning() {}, error() {} } },
    '@/composables/useAuth': { useAuth: () => ({ initAuth: async () => {}, getAuthHeaders: () => ({}) }) },
    '@/services/simulated-well-report-template-api': {},
    '@/services/sim-instrument-api': { listSimInstruments: async () => ({ success: true, data: { code: 0, data: { list: [instrument] } } }) },
    '@/services/simulated-well-downhole-api': { parseSimulatedWellEnvironment: () => ({}), parseSimulatedWellInterval: () => ({}) },
    './supporting-groups': { groupSupportingDevices, supportingGroupKey },
  }
  const component = evaluate(content, mocks).default
  const scope = vue.effectScope()
  const state = scope.run(() => component.setup(vue.reactive({
    todayScheduledOrders: [], downholeDevices: devices, mode: 'edit',
  }), { expose() {}, emit() {} }))
  state.templateDetails.value = templates
  await vue.nextTick()
  return { state, stop: () => scope.stop() }
}

test('同工单同模板只创建一套控件状态，保存每台产品与汇总一致，重新打开可恢复', async () => {
  const first = await editor([input(1), input(2)])
  try {
    const state = first.state
    const order = state.selectedSupportingOrders.value[0]
    assert.equal(order.deviceList.length, 1)
    const group = order.deviceList[0]
    assert.equal(group.members.length, 2)
    const tool = group.supportTools[0]
    state.toggleSupportTool(order.id, group, tool, true)
    await vue.nextTick()
    const key = state.getSupportToolKey(order.id, group, tool)
    state.externalInstrumentModelMap.value[key] = 'EXTERNAL-1'
    state.handleExternalInstrumentInput(key)
    const saved = state.resolvedDownholeDevices.value
    assert.equal(saved.length, 2)
    assert.deepEqual(JSON.parse(JSON.stringify(saved[0].selectedSupportingTools)), JSON.parse(JSON.stringify(saved[1].selectedSupportingTools)))
    assert.equal(saved[1].selectedSupportingTools[0].externalInstrumentModel, 'EXTERNAL-1')
    assert.equal(state.flattenedAllSupportingTools.value.length, 1)
    const reopened = await editor(JSON.parse(JSON.stringify(saved)))
    try {
      assert.equal(reopened.state.selectedSupportingOrders.value[0].deviceList.length, 1)
      assert.equal(reopened.state.resolvedDownholeDevices.value[1].selectedSupportingTools[0].externalInstrumentModel, 'EXTERNAL-1')
      reopened.state.selectedTemplateMap.value['device-1'] = 'T-2'
      await vue.nextTick()
      const newGroup = reopened.state.selectedSupportingOrders.value[0].deviceList.find((group) => group.template === 'T-2')
      assert.deepEqual(Array.from(newGroup.supportTools, (tool) => tool.code), ['SUPPORT-2'])
      assert.equal(reopened.state.resolvedDownholeDevices.value[0].selectedSupportingTools.length, 0)
    } finally { reopened.stop() }
  } finally { first.stop() }
})

test('单台切换模板保留原组选择，加入已有组采用同套配置，内部外部 SN 互斥', async () => {
  const { state, stop } = await editor([input(1), input(2)])
  try {
    const order = state.selectedSupportingOrders.value[0]
    const original = order.deviceList[0]
    const key = state.getSupportToolKey(order.id, original, original.supportTools[0])
    state.toggleSupportTool(order.id, original, original.supportTools[0], true)
    state.externalInstrumentModelMap.value[key] = 'EXTERNAL-1'
    state.selectedTemplateMap.value['device-1'] = 'T-2'
    state.handleTemplateChange(order.id, original.members[0])
    await vue.nextTick()
    assert.equal(state.selectedSupportingOrders.value[0].deviceList.length, 2)
    assert.equal(state.resolvedDownholeDevices.value[1].selectedSupportingTools[0].externalInstrumentModel, 'EXTERNAL-1')
    assert.equal(state.resolvedDownholeDevices.value[0].selectedSupportingTools.length, 0)
    state.selectedTemplateMap.value['device-1'] = 'T-1'
    await vue.nextTick()
    assert.equal(state.selectedSupportingOrders.value[0].deviceList.length, 1)
    assert.equal(state.resolvedDownholeDevices.value[0].selectedSupportingTools[0].externalInstrumentModel, 'EXTERNAL-1')
    state.selectedInternalInstrumentMap.value[key] = '11'
    state.handleInternalInstrumentChange(key)
    assert.equal(state.externalInstrumentModelMap.value[key], '')
    state.externalInstrumentModelMap.value[key] = 'EXTERNAL-2'
    state.handleExternalInstrumentInput(key)
    assert.equal(state.selectedInternalInstrumentMap.value[key], '')
  } finally { stop() }
})

test('不同工单、不同模板分别配置，无模板研究院产品保持逐台配接', async () => {
  const devices = [input(1), input(2, 'ORDER-1', 'T-2'), input(3, 'ORDER-2'),
    input(4, 'ORDER-1', '', 1), input(5, 'ORDER-1', '', 1)]
  assert.equal(groupSupportingDevices(devices).length, 5)
  const { state, stop } = await editor(devices.slice(0, 3))
  try {
    assert.equal(state.selectedSupportingOrders.value[0].deviceList.length, 2)
    assert.equal(state.selectedSupportingOrders.value[1].deviceList.length, 1)
  } finally { stop() }
  const manual = await editor(devices.slice(3))
  try {
    assert.equal(manual.state.selectedSupportingOrders.value.length, 0)
    assert.equal(manual.state.researchManualOrders.value[0].deviceList.length, 2)
  } finally { manual.stop() }
})
