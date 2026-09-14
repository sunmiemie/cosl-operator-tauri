import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

const read = (path) => readFileSync(resolve(import.meta.dirname, '..', path), 'utf8')
function extract(source, names) {
  const ast = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true)
  return ts.transpileModule(ast.statements.filter((node) =>
    (ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => names.includes(d.name.getText(ast))))
  ).map((node) => node.getText(ast)).join('\n'), {}).outputText
}

const schedule = read('src/views/high-temp-pressure/composables/useHighTempPressureSchedule.ts')
const mapperCode = extract(schedule, ['normalizeEquipmentId', 'getStatusText', 'formatDisplayValue', 'formatHoldTime', 'normalizeInstrumentItems', 'mapHighTempPressureOrder'])
const mapOrder = new Function('http', mapperCode + '\nreturn mapHighTempPressureOrder')({ getBaseUrl: () => '' })

test('客户端仪器类型继承主单，在线要求与三新独立', () => {
  const order = mapOrder({
    id: 1, test_type: '高压测试', test_container: '480容器', online_test: false,
    sanxin_is_sanxin: true, instruments: [{ id: 2, instrument_name: '仪器', instrument_sn: 'SN-1', test_type: '3' }],
  })
  assert.equal(order.testType, '高压测试')
  assert.equal(order.items[0].testType, '高压测试')
  assert.equal(order.testContainer, '480容器')
  assert.equal(order.onlineTest, false)
  assert.equal(order.sanxinIsSanxin, true)
  assert.equal(mapOrder({ id: 2 }).onlineTest, null)
})

const panel = read('src/views/high-temp-pressure/components/ReportPanel.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
const reportCode = extract(panel, ['createDefaultPaperReportChecks', 'clonePaperReportChecks', 'cloneReportUnitDraft', 'currentReportUnitDraft', 'syncCurrentReportUnit', 'applyReportUnitDraft', 'openReportForEditing', 'restoreInitialDraft'])
function reportHarness() {
  const ref = (value) => ({ value })
  const index = ref(0)
  const rows = [false, true].map((onlineTest, i) => ({ key: `row${i}`, selection: { order: { onlineTest } }, state: { result: 'pass', observation: '' } }))
  const context = {
    props: { initialDraft: null }, activeReportIndex: index,
    instrumentRows: ref(rows), reportSelections: ref(rows.map((row) => row.selection)),
    activeReportRow: { get value() { return rows[index.value] } },
    activeReportKey: { get value() { return rows[index.value].key } },
    reportUnitDraftMap: ref({}), instrumentResultMap: ref({}),
    paperReportChecks: ref({ onlineTest: false }),
    observation: ref(''), operatorName: ref(''), confirmChecks: ref([true, true, true, true]),
    testerSignature: ref(null), reportStage: ref('editing'), reviewConfirmed: ref(false), curveRanges: ref([]),
  }
  const api = new Function(...Object.keys(context), reportCode + '\nreturn {createDefaultPaperReportChecks,openReportForEditing,restoreInitialDraft}')(...Object.values(context))
  return { ...context, ...api }
}

test('新报告带入否，跨工单继承时采用目标工单的在线要求', () => {
  const state = reportHarness()
  state.paperReportChecks.value = state.createDefaultPaperReportChecks(false)
  assert.equal(state.paperReportChecks.value.onlineTest, false)
  state.openReportForEditing(1, true)
  assert.equal(state.paperReportChecks.value.onlineTest, true)
  state.paperReportChecks.value.onlineTest = false
  state.openReportForEditing(0)
  state.openReportForEditing(1)
  assert.equal(state.paperReportChecks.value.onlineTest, false) // 人工修改保留。
})

test('恢复报告草稿时不覆盖已保存的在线选项', () => {
  const state = reportHarness()
  state.paperReportChecks.value = state.createDefaultPaperReportChecks(false)
  state.props.initialDraft = { paperReportChecks: { onlineTest: true } }
  state.restoreInitialDraft()
  assert.equal(state.paperReportChecks.value.onlineTest, true)
  assert.equal(state.createDefaultPaperReportChecks(null).onlineTest, true) // 旧缓存沿用原默认值。
})

test('工单详情和测试页面不把三新显示为在线要求', () => {
  const testing = read('src/views/high-temp-pressure/components/TestingPanel.vue')
  const detail = read('src/views/high-temp-pressure/components/WorkOrderDetailModal.vue')
  assert.match(testing, /在线测试<\/div><div class="info-val">\{\{ currentOrder\.onlineTest/)
  assert.doesNotMatch(testing, /currentInstrument\?\.testType \|\| currentOrder\.testType/)
  assert.match(detail, /order\.testContainer/)
  assert.match(detail, /order\.onlineTest/)
})
