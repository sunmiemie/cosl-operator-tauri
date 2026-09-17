import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(resolve(import.meta.dirname, '../src/views/simulation-well/test-report.vue'), 'utf8')
const helper = source.slice(source.indexOf('function getMissingTemplateReportField()'), source.indexOf('async function saveReport()'))
const context = {
  selectedTemplate: { value: {} }, testItemValues: {}, evaluationValues: {}, transferDataValues: {},
  conclusion: { value: 'qualified' },
  COMPOUND_TYPES: ['single-input', 'depth-group', 'range-radio', 'multi-input-row', 'sampling-group', 'card-group'],
  fieldKey: (prefix, index, suffix = '') => `${prefix}_${index}${suffix ? `_${suffix}` : ''}`,
  getFieldType: field => typeof field === 'string' ? 'radio' : field.type || 'radio',
  getFieldLabel: (field, fallback) => typeof field === 'string' ? field : field.nameCN || field.label || fallback,
  getTransferColumns: field => field.columns || [],
}
vm.createContext(context)
vm.runInContext(ts.transpile(helper), context)
const check = () => vm.runInContext('getMissingTemplateReportField()', context)

// 每个复合控件都包含多个子项，逐一移除验证不存在遗漏。
const testFields = [
  '基本检查', { type: 'text' }, { type: 'number' }, { type: 'textarea' },
  { type: 'single-input' }, { type: 'range-radio' },
  { type: 'depth-group', pointCount: 2, withJudgment: true },
  { type: 'multi-input-row', rowCount: 2, columns: [{ label: '甲' }, { label: '乙' }] },
  { type: 'sampling-group', pointCount: 2, items: ['甲', '乙'] },
  { type: 'card-group', cards: [{ title: '甲', fields: ['值1', '值2'] }, { title: '乙', fields: ['值3'] }] },
  { type: 'depth-group', pointCount: 1, withJudgment: false },
]
context.selectedTemplate.value = {
  test_items: testFields,
  evaluation_standards: ['评价', { type: 'single-input' }, { type: 'text' }, { type: 'number' }, { type: 'textarea' }, { type: 'depth-group' }],
  transfer_data_records: [{ type: 'single-row-multi-column', columns: ['列1', '列2'] }],
}
Object.assign(context.testItemValues, {
  test_0: 'normal', test_1: '内容', test_2: 0, test_3: '描述',
  test_4: '值', test_4_result: 'abnormal', test_5_from: 0, test_5_to: 10, test_5_result: 'normal',
  test_6_p1: 0, test_6_p1_result: 'normal', test_6_p2: 10, test_6_p2_result: 'abnormal',
  test_7_r1c0: 0, test_7_r1c1: 1, test_7_r2c0: 2, test_7_r2c1: 3,
  test_8_p1i0: 'normal', test_8_p1i1: 'abnormal', test_8_p2i0: 'normal', test_8_p2i1: 'normal',
  test_9_c0f0: 0, test_9_c0f1: 1, test_9_c1f0: 2, test_10_p1: 0,
})
Object.assign(context.evaluationValues, { eval_0: 'qualified', eval_1: '值', eval_1_result: 'unqualified', eval_2: '文', eval_3: 0, eval_4: '描述', eval_5: 'qualified' })
Object.assign(context.transferDataValues, { transfer_0_c0: '值', transfer_0_c1: 0 })
assert.equal(check(), '', '完整报告及数值零允许保存')
let missingCases = 0
for (const values of [context.testItemValues, context.evaluationValues, context.transferDataValues]) {
  for (const key of Object.keys(values)) {
    const original = values[key]
    for (const missing of [undefined, null, '', '   ']) {
      values[key] = missing
      assert.ok(check(), `${key} 缺失应阻止保存`)
      missingCases++
    }
    values[key] = original
  }
}
context.testItemValues.test_0 = 'invalid'
assert.match(check(), /请选择.*基本检查/)
context.testItemValues.test_0 = 'normal'
context.testItemValues.test_7_r2c1 = ''
assert.match(check(), /测试项目.*第2点.*乙/)
context.testItemValues.test_7_r2c1 = 3
context.conclusion.value = ''
assert.equal(check(), '请选择测试结论')
context.conclusion.value = 'qualified'
context.selectedTemplate.value = { test_items: [], evaluation_standards: [], transfer_data_records: [] }
assert.equal(check(), '', '空区域和旧值不产生必填项')

// 执行真实保存入口：校验失败须在认证、上传或新增/更新请求之前返回。
const save = source.slice(source.indexOf('async function saveReport()'), source.indexOf('\nasync function ', source.indexOf('async function saveReport()') + 1))
const saveContext = {
  ...context, usesTemplateReport: { value: true }, selectedOperation: { value: {} }, selectedDevice: { value: {} },
  selectedTemplate: { value: { id: 1, test_items: ['待选项'] } }, testItemValues: {},
  editingReport: { value: null }, ElMessage: { warning: message => { saveContext.warning = message } },
  initAuth: () => { throw new Error('不应进入认证或上传保存流程') },
}
vm.createContext(saveContext)
vm.runInContext(ts.transpile(helper + '\n' + save), saveContext)
for (const editing of [null, { id: 1 }]) {
  saveContext.editingReport.value = editing
  saveContext.warning = ''
  await vm.runInContext('saveReport()', saveContext)
  assert.match(saveContext.warning, /请选择.*待选项/)
}
saveContext.usesTemplateReport.value = false
saveContext.props = {}
saveContext.operatorSignaturePreviewUrl = { value: '' }
await vm.runInContext('saveReport()', saveContext)
assert.equal(saveContext.warning, '请上传操作人的电子签名', '无模板报告沿用原校验')
console.log(`PASS: ${missingCases} missing-value cases, compound fields, conclusions, and create/edit save guards`)
