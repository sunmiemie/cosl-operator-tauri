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
assert.match(reportPanel, /report-process-title/, 'report panel should include the report processing title')
assert.match(reportPanel, /report-process-desc/, 'report panel should explain the report source')
assert.match(reportPanel, /report-process-list/, 'report panel should include process steps')
assert.match(reportPanel, /process-report/, 'report panel should emit report processing')
assert.doesNotMatch(reportPanel, /selectedReportFileName/, 'report panel should not use the old local selected report state')
assert.match(reportPanel, /selectedThirdPartyReportName/, 'report panel should show selected third-party report state')
assert.match(reportPanel, /select-third-party-report/, 'report panel should emit third-party report selection')
assert.match(reportPanel, /clear-third-party-report/, 'report panel should allow clearing the selected third-party report')

assert.match(report, /processReport/, 'report state should expose the report processing action')
assert.match(report, /from '@tauri-apps\/plugin-dialog'/, 'report processing should use the Tauri file picker')
assert.match(report, /from '@tauri-apps\/plugin-fs'/, 'report processing should read the selected third-party report file')
assert.match(report, /extensions:\s*\['doc',\s*'docx'\]/, 'report picker should accept Word reports')
assert.match(report, /selectedThirdPartyReportName/, 'report state should expose selected third-party report file name')

assert.match(checks, /shutdownChecks/, 'shutdown check state should be defined')
assert.match(checks, /shutdownPostChecks\.map\(\(text,\s*idx\) => \(\{ id:\s*idx \+ 1,\s*text,\s*checked:\s*false \}\)\)/, 'shutdown checks should be generated unchecked')

const shutdownPanel = sliceBetween(
  flow,
  `<div v-else class="modal-overlay">`,
  `v-if="currentWorkOrder"`,
  'vibration shutdown panel'
)
assert.match(shutdownPanel, /shutdown-check-modal/, 'shutdown modal should render the shutdown check modal')
assert.match(shutdownPanel, /shutdownChecks\.every\(i => i\.checked\)/, 'shutdown completion should require all checks')
assert.match(shutdownPanel, /finish-shutdown/, 'shutdown modal should finish through the expected event')

console.log('vibration report and shutdown flow assertions passed')
