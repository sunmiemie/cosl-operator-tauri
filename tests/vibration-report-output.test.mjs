import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const rust = readFileSync(resolve(root, 'src-tauri/src/vibration_video.rs'), 'utf8')
const report = readFileSync(resolve(root, 'src/views/vibration/composables/useVibrationReport.ts'), 'utf8')
const flow = readFileSync(resolve(root, 'src/views/vibration/components/VibrationFlow.vue'), 'utf8')
const types = readFileSync(resolve(root, 'src/views/vibration/types.ts'), 'utf8')

assert.match(
  rust,
  /copy_vibration_report_output\(&source,\s*&final_target\)\?/,
  'vibration export should use a whitelist copier for report output'
)
assert.doesNotMatch(
  rust,
  /copy_dir_recursive\(&source,\s*&final_target\)\?/,
  'vibration export should not copy the whole capture directory'
)
assert.match(
  rust,
  /top_readings_0\.5s\.json/,
  'vibration report export should keep top_readings_0.5s.json'
)
assert.match(
  rust,
  /chart_screenshots/,
  'vibration report export should keep chart_screenshots'
)

for (const legacyName of [
  'experiment_summary.json',
  'experiment_data.csv',
  'capture_progress.json',
  '振动测试数据.csv',
  '图像采集结果.png',
  '测试报告.docx',
]) {
  assert.match(
    rust,
    new RegExp(`remove_legacy_vibration_report_file[\\s\\S]*${legacyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    `vibration report cleanup should remove legacy output ${legacyName}`
  )
}

assert.match(
  types,
  /export type ReportFileId = 'screenshots' \| 'json'/,
  'vibration report file ids should describe the two kept artifacts'
)
assert.match(report, /chart_screenshots/, 'vibration report UI state should include chart_screenshots')
assert.match(report, /top_readings_0\.5s\.json/, 'vibration report UI state should include top_readings_0.5s.json')
assert.doesNotMatch(report, /write_vibration_report_files/, 'frontend should not generate extra report files')
assert.doesNotMatch(report, /buildImageBytes/, 'frontend should not generate an extra capture image')
assert.doesNotMatch(report, /markFileDone\('csv'\)|markFileDone\('png'\)|markFileDone\('doc'\)/, 'frontend should not track legacy csv/png/doc outputs')
assert.match(flow, /v-for="file in reportFiles"/, 'report modal should render the kept output list dynamically')
assert.doesNotMatch(flow, /reportFiles\[2\]/, 'report modal should not assume a third report file')

console.log('vibration report output assertions passed')
