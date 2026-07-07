import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const rust = readFileSync(resolve(root, 'src-tauri/src/high_temp_pressure_video.rs'), 'utf8')
const testing = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureTesting.ts'), 'utf8')

assert.match(
  rust,
  /current_dir\.join\("\.venv-video"\)\.join\("Scripts"\)\.join\("python\.exe"\)/,
  'high-temp-pressure video backend should prefer the Windows .venv-video Python'
)

assert.match(
  rust,
  /current_dir\.join\("\.\."\)\.join\("\.venv-video"\)\.join\("Scripts"\)\.join\("python\.exe"\)/,
  'high-temp-pressure video backend should find parent Windows .venv-video Python'
)

assert.match(
  rust,
  /\.args\(\["-c", "import av, cv2, numpy"\]\)/,
  'high-temp-pressure dependency preflight should check PyAV, OpenCV and NumPy'
)

assert.match(
  rust,
  /缺少高温高压井视频识别依赖/,
  'high-temp-pressure dependency preflight should return a readable dependency message'
)

const startVideoStart = testing.indexOf('async function startVideoCollection')
const selectVideoStart = testing.indexOf('async function selectVideoFile', startVideoStart)
assert.ok(startVideoStart >= 0 && selectVideoStart > startVideoStart, 'startVideoCollection should have a stable boundary')
const startVideoBody = testing.slice(startVideoStart, selectVideoStart)

assert.doesNotMatch(
  startVideoBody,
  /getConfigItem\('flojoyPythonPath'\)/,
  'high-temp-pressure video OCR should not reuse the Flojoy Python path'
)

assert.match(
  startVideoBody,
  /pythonPath:\s*null/,
  'high-temp-pressure video OCR should let the backend resolve the video Python'
)

console.log('high-temp-pressure video dependency assertions passed')
