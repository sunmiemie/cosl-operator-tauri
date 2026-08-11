import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const reportView = readFileSync(resolve(root, 'src/views/simulation-well/test-report.vue'), 'utf8')
const reportApi = readFileSync(resolve(root, 'src/services/simulated-well-report-api.ts'), 'utf8')

assert.match(reportView, /report_json: reportJson/, 'report content should be sent through report_json')
assert.doesNotMatch(
  reportView,
  /remark:\s*JSON\.stringify\(reportJson\)/,
  'report content must not be duplicated into remark'
)
assert.doesNotMatch(reportView, /function safeParseRemark/, 'client must not parse remark as legacy report JSON')
assert.match(reportView, /const meta = getReportMeta\(report\)/, 'report matching should read report_json metadata')
assert.match(reportView, /status: 0/, 'edited rejected reports should be resubmitted for review')
assert.match(reportView, /上传测试原始文件/, 'curve upload should be presented as original file upload')
assert.match(reportView, /测试原始文件/, 'curve attachment section should be presented as original files')
assert.match(reportView, /fieldName: 'curve_chart'/, 'original file upload must preserve the existing curve_chart field')
assert.match(reportView, /return type\.startsWith\('curve'\) \? '原始文件'/, 'saved curve attachments should be presented as original files')
const conclusionCardStart = reportView.indexOf('测试结论 <span class="english-sub">Test Conclusion</span>')
const operatorCardStart = reportView.indexOf('操作人员信息 <span class="english-sub">Operator Information</span>')
const rawFileCardStart = reportView.indexOf('测试原始文件 <span class="english-sub">Test Raw File</span>')
assert.ok(conclusionCardStart >= 0 && operatorCardStart > conclusionCardStart, 'report form should contain conclusion and operator cards in order')
const conclusionCard = reportView.slice(conclusionCardStart, operatorCardStart)
const operatorCard = reportView.slice(operatorCardStart, rawFileCardStart)
assert.match(conclusionCard, /<div class="info-label">描述（中文）<\/div>[\s\S]*?v-model="note"/, 'Chinese description input should be inside the conclusion card')
assert.match(conclusionCard, /<div class="info-label">描述（英文）<\/div>[\s\S]*?v-model="noteEn"/, 'English description input should be inside the conclusion card')
assert.doesNotMatch(operatorCard, /v-model="note(?:En)?"/, 'operator information card should not contain description inputs')
assert.match(reportView, /const noteEn = ref\(''\)/, 'report form should keep English description state')
assert.match(reportView, /noteEn\.value = ''/, 'report form reset should clear the English description')
assert.match(reportView, /noteEn\.value = String\(meta\.note_en \|\| ''\)/, 'report editing should restore the English description')
assert.match(reportView, /note: description,[\s\S]*?note_en: descriptionEn/, 'report payload should preserve Chinese and English description fields')
assert.doesNotMatch(reportView, /请同时填写中文描述和英文描述/, 'Chinese and English descriptions should be independently optional')
assert.doesNotMatch(reportView, /Boolean\(description\)\s*!==\s*Boolean\(descriptionEn\)/, 'report saving should not enforce paired descriptions')
assert.match(reportView, /previewReport\.meta\.note_en/, 'report preview should display the English description')
assert.match(reportView, /editingReport\.remark \|\| '-'\s*}}/, 'rejection message should render the review remark directly')
assert.match(reportView, /v-if="row\.status !== 1"/, 'approved reports should not expose the edit action')
assert.match(reportView, /const previewTemplateSnapshot = computed/, 'preview should read the frozen template snapshot')
assert.match(reportView, /const previewTestItemRows = computed/, 'preview should build read-only test item rows')
assert.match(reportView, /const previewEvaluationRows = computed/, 'preview should build read-only evaluation rows')
assert.match(reportView, /buildReadonlyReportRows\([\s\S]*?'depth-group'/, 'preview should format depth-group fields')
assert.match(reportView, /'range-radio'/, 'preview should format range-radio fields')
assert.match(reportView, /'multi-input-row'/, 'preview should format multi-input-row fields')
assert.match(reportView, /'sampling-group'/, 'preview should format sampling-group fields')
assert.match(reportView, /'card-group'/, 'preview should format card-group fields')
assert.match(reportView, /normal: '正常'/, 'preview should localize normal values')
assert.match(reportView, /unqualified: '不符合'/, 'preview should localize unqualified values')
assert.match(reportView, /当前模板未配置测试项目/, 'preview should explain missing test item definitions')
assert.match(reportView, /暂无可用项目定义/, 'preview should explain missing template snapshots')
const createPayloadDefinition = reportApi.slice(
  reportApi.indexOf('export interface CreateSimulatedWellReportPayload'),
  reportApi.indexOf('export interface SimulatedWellReportMutationResponse')
)
assert.doesNotMatch(createPayloadDefinition, /\bremark\?:/, 'report create payload must not expose remark')

console.log('simulated well report storage assertions passed')
