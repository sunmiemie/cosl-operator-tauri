import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/services/simulated-well-downhole-api.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText
const module = { exports: {} }
vm.runInNewContext(output, { module, exports: module.exports, require: () => ({}) })
const { parseSimulatedWellEnvironment: parse, formatSimulatedWellEnvironment: format,
  buildSimulatedWellDownholeWorkPayload: build } = module.exports
const plain = (value) => JSON.parse(JSON.stringify(value))

test('环境保存、回填与报告展示保留四项，新增单位不重复', () => {
  const environment = { wellDepth: '1000m', wellTemperature: '180°C', wellbore: '8.5 inch', mudResistivity: '0.25 Ω.m', wellPressure: '15' }
  const payload = build({ testEnvironment: environment }, { status: 0 })
  assert.equal(payload.env_text, '井深:1000 井温:180 井眼:8.5 泥浆电阻率:0.25')
  assert.doesNotMatch(payload.env_text, /井压/)
  assert.deepEqual(plain(parse(payload.env_text)), { wellDepth: '1000', wellTemperature: '180', wellbore: '8.5', mudResistivity: '0.25' })
  assert.equal(format(payload.env_text), '井深: 1000m / 井温: 180℃ / 井眼: 8.5inch / 泥浆电阻率: 0.25Ω.m')
  assert.equal(format(format(payload.env_text)), format(payload.env_text))
  assert.equal(build({ testEnvironment: parse(payload.env_text) }, { status: 1 }).env_text, payload.env_text)
})

test('零值与空值正确保存，中文冒号和已有单位可回填', () => {
  const payload = build({ testEnvironment: { wellDepth: 0, wellTemperature: 0, wellbore: 0, mudResistivity: 0 } }, { status: 0 })
  assert.equal(payload.env_text, '井深:0 井温:0 井眼:0 泥浆电阻率:0')
  assert.equal(format({ wellbore: 0, mudResistivity: 0 }), '井眼: 0inch / 泥浆电阻率: 0Ω.m')
  assert.deepEqual(plain(parse('井眼：8.5 inch / 泥浆电阻率：0.25 Ω.m')), { wellDepth: '', wellTemperature: '', wellbore: '8.5', mudResistivity: '0.25' })
  assert.equal(build({ testEnvironment: { wellbore: '', mudResistivity: null } }, { status: 0 }).env_text, '')
  assert.equal(format(''), '-')
  assert.deepEqual(plain(parse(undefined)), { wellDepth: '', wellTemperature: '', wellbore: '', mudResistivity: '' })
})
import { parse as parseSfc, compileScript } from '@vue/compiler-sfc'
import * as vue from 'vue'
import { groupSupportingDevices, supportingGroupKey } from '../src/views/simulation-well/supporting-groups.ts'

function editor(props, localStorage) {
  const path = new URL('../src/views/simulation-well/equipment-package.vue', import.meta.url)
  const { descriptor } = parseSfc(readFileSync(path, 'utf8'), { filename: path.pathname })
  const { content } = compileScript(descriptor, { id: 'environment-test' })
  const output = ts.transpileModule(content, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText
  const mocks = {
    vue: { ...vue, onMounted() {} }, '@iconify/vue': { Icon: {} },
    'element-plus': { ElMessage: { warning() {}, error() {} } },
    '@/composables/useAuth': { useAuth: () => ({ initAuth: async () => {}, getAuthHeaders: () => ({}) }) },
    '@/services/simulated-well-report-template-api': {},
    '@/services/sim-instrument-api': {},
    '@/services/simulated-well-downhole-api': module.exports,
    './supporting-groups': { groupSupportingDevices, supportingGroupKey },
  }
  const compiled = { exports: {} }
  vm.runInNewContext(output, { module: compiled, exports: compiled.exports, localStorage,
    require: (name) => { assert.ok(name in mocks, name); return mocks[name] }, console })
  const scope = vue.effectScope()
  const state = scope.run(() => compiled.exports.default.setup(vue.reactive({
    todayScheduledOrders: [], downholeDevices: [], mode: 'create', ...props,
  }), { expose() {}, emit() {} }))
  return { state, stop: () => scope.stop() }
}

test('当天缓存保存与恢复新项，旧缓存井压不再读取或写入', () => {
  const cache = new Map()
  const storage = { getItem: (key) => cache.get(key), setItem: (key, value) => cache.set(key, value) }
  const first = editor({}, storage)
  try {
    first.state.wellbore.value = '8.5'
    first.state.mudResistivity.value = '0'
    first.state.saveTodayTestEnvironment()
    const key = 'simwell.todayTestEnvironment'
    const saved = JSON.parse(cache.get(key))
    assert.equal(saved.wellbore, '8.5')
    assert.equal(saved.mudResistivity, '0')
    assert.ok(!('wellPressure' in saved))
    cache.set(key, JSON.stringify({ ...saved, wellPressure: '15' }))
    const reopened = editor({}, storage)
    try {
      reopened.state.loadTodayTestEnvironment()
      assert.equal(reopened.state.wellbore.value, '8.5')
      assert.equal(reopened.state.mudResistivity.value, '0')
      assert.ok(!('wellPressure' in reopened.state))
      reopened.state.saveTodayTestEnvironment()
      assert.ok(!('wellPressure' in JSON.parse(cache.get(key))))
    } finally { reopened.stop() }
  } finally { first.stop() }
})

test('编辑回填从原环境描述恢复井眼与泥浆电阻率', () => {
  const edited = editor({ mode: 'edit', initialWork: { env_text: '井深:1000 井温:180 井眼:8.5inch 泥浆电阻率:0.25Ω.m' } }, {})
  try {
    assert.equal(edited.state.wellbore.value, '8.5')
    assert.equal(edited.state.mudResistivity.value, '0.25')
  } finally { edited.stop() }
})
