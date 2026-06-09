import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const index = readFileSync(resolve(root, 'src/views/vibration/index.vue'), 'utf8')
const flow = readFileSync(resolve(root, 'src/views/vibration/components/VibrationFlow.vue'), 'utf8')
const report = readFileSync(resolve(root, 'src/views/vibration/composables/useVibrationReport.ts'), 'utf8')
const checks = readFileSync(resolve(root, 'src/views/vibration/composables/useVibrationChecks.ts'), 'utf8')

function sliceBetween(content, startMarker, endMarker, label) {
  const start = content.indexOf(startMarker)
  assert.notEqual(start, -1, `${label} should be present`)
  const end = content.indexOf(endMarker, start)
  assert.notEqual(end, -1, `${label} should have a following boundary`)
  return content.slice(start, end)
}

const finishToReportBody = sliceBetween(
  index,
  'onFinishToReport: (exportDir: string) => {',
  'onFinishToDashboard:',
  'vibration onFinishToReport handler'
)
assert.match(finishToReportBody, /stage\.value\s*=\s*'report'/, 'finishing a vibration test should show report processing')
assert.match(finishToReportBody, /report\.resetReportFiles\(\)/, 'entering report processing should reset report state')
assert.match(finishToReportBody, /report\.setExportDir\(exportDir\)/, 'entering report processing should keep the export folder')
assert.doesNotMatch(finishToReportBody, /report\.startFileGen\(\)/, 'report processing should not auto-skip the report UI')

const reportPanel = sliceBetween(
  flow,
  `stage === 'report'`,
  `v-else class="modal-overlay"`,
  'vibration report panel'
)
for (const label of [
  '测试报告处理',
  '报告文件来源：共享文件夹自动获取',
  '自动处理流程',
  '开始处理并上传报告',
]) {
  assert.match(reportPanel, new RegExp(label), `report panel should include "${label}"`)
}
assert.match(reportPanel, /process-report/, 'report panel should emit report processing')
assert.doesNotMatch(reportPanel, /生成测试报告/, 'report panel should not require manual report generation')
assert.doesNotMatch(reportPanel, /选择报告文件/, 'report panel should not require local report file selection')
assert.doesNotMatch(reportPanel, /selectedReportFileName/, 'report panel should not show local selected report file state')
assert.doesNotMatch(reportPanel, /select-report-file/, 'report panel should not emit report file selection')

assert.match(report, /processReport/, 'report state should expose the report processing action')
assert.doesNotMatch(report, /from '@tauri-apps\/plugin-dialog'/, 'report processing should not use the Tauri file picker')
assert.doesNotMatch(report, /from '@tauri-apps\/plugin-fs'/, 'report processing should not read a manually selected report file')
assert.doesNotMatch(report, /extensions:\s*\['docx',\s*'doc'\]/, 'report picker should be removed')
assert.doesNotMatch(report, /selectedReportFileName/, 'report state should not expose a local selected report file name')

for (const label of [
  '确认各处电源，关闭电源总开关',
  '设备外观检查并整理试验现场',
]) {
  assert.match(checks, new RegExp(label), `shutdown check item should include "${label}"`)
}

const shutdownPanel = sliceBetween(
  flow,
  `<div v-else class="modal-overlay">`,
  `v-if="currentWorkOrder"`,
  'vibration shutdown panel'
)
assert.match(shutdownPanel, /关机检查/, 'shutdown modal should use the correct title')
assert.match(shutdownPanel, /shutdownChecks\.every\(i => i\.checked\)/, 'shutdown completion should require all checks')
assert.match(shutdownPanel, /完成并返回看板/, 'shutdown modal should return to dashboard after completion')

console.log('vibration report and shutdown flow assertions passed')
