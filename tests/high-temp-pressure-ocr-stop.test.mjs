import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const rust = readFileSync(resolve(root, 'src-tauri/src/high_temp_pressure_ocr.rs'), 'utf8')
const testing = readFileSync(
  resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureTesting.ts'),
  'utf8'
)
const indexPage = readFileSync(resolve(root, 'src/views/high-temp-pressure/index.vue'), 'utf8')

assert.match(
  rust,
  /fn release_high_temp_pressure_ocr_process/,
  'OCR stop/start should share a helper that reaps the global process slot'
)
assert.match(
  rust,
  /\*guard = None;/,
  'stopping OCR must clear the global process slot'
)
assert.match(
  rust,
  /child\.wait\(\)/,
  'forced OCR stop must wait for the process after taskkill'
)
assert.doesNotMatch(
  rust,
  /已有高温高压井 OCR 任务正在运行/,
  'starting OCR should replace a leftover process instead of rejecting the new work order'
)

const stdoutWaitStart = rust.indexOf('let wait_result = match process_handle.lock()')
const stdoutWaitEnd = rust.indexOf('if let Some(status) = wait_result')
assert.ok(stdoutWaitStart >= 0 && stdoutWaitEnd > stdoutWaitStart, 'stdout watcher should inspect process exit without taking the slot')
assert.match(
  rust.slice(stdoutWaitStart, stdoutWaitEnd),
  /try_wait\(\)/,
  'stdout watcher must not wait while holding the OCR process lock'
)
assert.doesNotMatch(
  rust.slice(stdoutWaitStart, stdoutWaitEnd),
  /\.take\(\)/,
  'stdout watcher must not steal the OCR process handle away from stop()'
)

assert.match(
  testing,
  /async function stopOcrStream\(\)/,
  'frontend should have a shared OCR stop helper'
)
assert.match(
  testing,
  /async function resetTestSession\(\)[\s\S]*await stopOcrStream\(\)[\s\S]*resetCaptureState\(\)/,
  'resetting a test session must wait for OCR stop before clearing the capture directory'
)
assert.match(
  testing,
  /async function confirmStart\(testType\?: string\)[\s\S]*await resetTestSession\(\)/,
  'starting a new work order must wait for the previous OCR session to stop'
)
assert.match(
  testing,
  /async function connectOcrDevice\(\)[\s\S]*await stopOcrStream\(\)[\s\S]*await initConfig\(\)/,
  'connecting the capture card must stop any leftover OCR process even if the previous directory was cleared'
)
assert.match(
  testing,
  /function endTest\([\s\S]*captureOutputDir\.value = ''/,
  'finishing a test should drop the live capture directory so the next order does not skip stop'
)

assert.match(
  indexPage,
  /await testing\.confirmStart\([\s\S]*?testType[\s\S]*?\)/,
  'work-order start must wait for the previous OCR session to finish stopping'
)
assert.match(
  indexPage,
  /await testing\.stopTest\(\)/,
  'aborting a test must wait for OCR stop'
)

console.log('high-temp-pressure OCR stop assertions passed')
