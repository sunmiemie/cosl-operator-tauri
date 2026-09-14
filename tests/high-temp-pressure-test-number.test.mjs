import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

const read = (p) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8')
function extract(source, names) {
  const ast = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true)
  return ts.transpileModule(ast.statements.filter(n =>
    (ts.isFunctionDeclaration(n) && names.includes(n.name?.text)) ||
    (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => names.includes(d.name.getText(ast))))
  ).map(n => n.getText(ast)).join('\n').replace(/export /g, ''), {}).outputText
}
const helper = extract(read('src/views/high-temp-pressure/utils/orderNumber.ts'), ['displayOrderNumber'])
const displayOrderNumber = new Function(helper + ';return displayOrderNumber')()
const schedule = read('src/views/high-temp-pressure/composables/useHighTempPressureSchedule.ts')
const mapper = extract(schedule, ['normalizeEquipmentId', 'getStatusText', 'formatDisplayValue', 'formatHoldTime', 'normalizeInstrumentItems', 'mapHighTempPressureOrder'])
const mapOrder = new Function('http', mapper + ';return mapHighTempPressureOrder')({ getBaseUrl: () => '' })

test('新增展示单号，内部编号、缓存ID和仪器标识保持原样', () => {
  const old = mapOrder({ id: 1, task_number: 'INTERNAL-1' })
  const current = mapOrder({ id: 1, task_number: 'INTERNAL-1', test_number: ' TEST-1 ' })
  assert.equal(displayOrderNumber(current), 'TEST-1')
  assert.equal(displayOrderNumber(old), 'INTERNAL-1')
  assert.equal(displayOrderNumber(null), '-')
  for (const key of ['id', 'no', 'entrustNo', 'receivingNo']) assert.equal(current[key], old[key])
  assert.deepEqual(current.items, old.items)
  assert.equal(displayOrderNumber(JSON.parse(JSON.stringify(current))), 'TEST-1')
})

test('报告页面展示采用新编号，上传编号和曲线导出仍使用原编号', () => {
  const source = read('src/views/high-temp-pressure/components/ReportPanel.vue')
  const script = source.split('<script setup lang="ts">')[1].split('</script>')[0]
  const code = extract(script, ['orderNos', 'displayOrderNos', 'activeOrderNo'])
  const order = { no: 'INTERNAL-1', testNumber: 'TEST-1' }
  const state = new Function('computed', 'reportSelections', 'activeReportOrder', 'displayOrderNumber', code + ';return {orderNos,displayOrderNos,activeOrderNo}')(
    get => ({ get value() { return get() } }), { value: [{ order }] }, { value: order }, displayOrderNumber)
  assert.equal(state.orderNos.value, 'INTERNAL-1')
  assert.equal(state.displayOrderNos.value, 'TEST-1')
  assert.equal(state.activeOrderNo.value, 'TEST-1')
  assert.match(source, /task_number: orderNos.value/)
  assert.match(source, /order_no: selection.order.no/)
  assert.match(source, /:order-numbers="orderNos"/)
  assert.match(source, /:display-order-numbers="displayOrderNos"/)
  const curve = read('src/views/high-temp-pressure/components/ReportCurveEditor.vue')
  assert.match(curve, /text: `任务单编号：\$\{props.orderNumbers/)
  assert.match(curve, /测试单号：\{\{ displayOrderNumbers/)
})

test('服务端及缓存待提交报告显示新编号，兼容旧接口', () => {
  const script = read('src/views/high-temp-pressure/components/ReportListPanel.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
  const code = extract(script, ['uniqueText', 'serverOrderNumbers', 'pendingOrderNos'])
  const api = new Function('displayOrderNumber', code + ';return {serverOrderNumbers,pendingOrderNos}')(displayOrderNumber)
  assert.equal(api.serverOrderNumbers({ task_number: 'OLD', display_order_numbers: ['TEST-1', 'TEST-2'] }), 'TEST-1、TEST-2')
  assert.equal(api.serverOrderNumbers({ task_number: 'OLD' }), 'OLD')
  assert.equal(api.pendingOrderNos({ selections: [{ order: { no: 'OLD', testNumber: 'TEST-1' } }] }), 'TEST-1')
})
