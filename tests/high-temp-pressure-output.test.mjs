import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const rust = readFileSync(resolve(root, 'src-tauri/src/high_temp_pressure_video.rs'), 'utf8')
const testing = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureTesting.ts'), 'utf8')

assert.match(
  rust,
  /copy_high_temp_pressure_report_output\(&source,\s*&final_target\)\?/,
  'high-temp-pressure export should use a whitelist copier for finished test output'
)

assert.doesNotMatch(
  rust,
  /copy_dir_recursive\(&source,\s*&final_target\)\?/,
  'high-temp-pressure export should not copy the whole capture directory'
)

assert.match(
  rust,
  /video_readings_0\.5s\.json/,
  'high-temp-pressure export should keep video_readings_0.5s.json'
)

const copierStart = rust.indexOf('fn copy_high_temp_pressure_report_output')
const sanitizeStart = rust.indexOf('fn sanitize_folder_name', copierStart)
assert.ok(copierStart >= 0 && sanitizeStart > copierStart, 'high-temp-pressure whitelist copier should be before sanitize_folder_name')
const copierBody = rust.slice(copierStart, sanitizeStart)

for (const legacyName of [
  'experiment_summary.json',
  'video_readings.csv',
  'capture_progress.json',
  'latest_frame.jpg',
  '高温高压测试结果曲线.png',
]) {
  assert.doesNotMatch(
    copierBody,
    new RegExp(`join\\("${legacyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\)`),
    `high-temp-pressure export should not copy ${legacyName}`
  )
}

const finalizeStart = testing.indexOf('async function finalizeVideoCapture')
const endTestStart = testing.indexOf('function endTest', finalizeStart)
assert.ok(finalizeStart >= 0 && endTestStart > finalizeStart, 'finalizeVideoCapture should have a following endTest boundary')
const finalizeBody = testing.slice(finalizeStart, endTestStart)

assert.doesNotMatch(
  finalizeBody,
  /exportCurveChartImage|write_high_temp_pressure_curve_chart/,
  'finishing a high-temp-pressure test should not generate curve chart output'
)

const ensureCurveStart = testing.indexOf('async function ensureCurveChartImage')
const syncResultStart = testing.indexOf('async function syncCaptureResultFromOutputDir', ensureCurveStart)
assert.ok(ensureCurveStart >= 0 && syncResultStart > ensureCurveStart, 'ensureCurveChartImage should have a following syncCaptureResultFromOutputDir boundary')
const ensureCurveBody = testing.slice(ensureCurveStart, syncResultStart)

assert.doesNotMatch(
  ensureCurveBody,
  /exportedCaptureDir\.value/,
  'on-demand curve generation should not write into the exported finished-test output directory'
)

assert.match(
  ensureCurveBody,
  /const\s+outputDir\s*=\s*captureOutputDir\.value/,
  'on-demand curve generation may use the internal capture directory for report upload previews'
)

console.log('high-temp-pressure output assertions passed')
