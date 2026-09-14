import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const page = readFileSync(resolve(root, 'src/views/high-temp-pressure/index.vue'), 'utf8')

assert.match(
  page,
  /import\s+\{\s*useLayout\s*\}\s+from\s+'@\/composables\/useLayout'/,
  'high-temp-pressure page should use the shared layout controller'
)

assert.match(
  page,
  /watch\(\s*\(\)\s*=>\s*testing\.currentPanel\.value,[\s\S]*?panel\s*===\s*'start'\s*\|\|\s*panel\s*===\s*'testing'[\s\S]*?enterEditMode\(\)[\s\S]*?else\s*\{[\s\S]*?exitEditMode\(\)[\s\S]*?\{\s*immediate:\s*true\s*\}/,
  'start and testing panels should hide the aside while all other panels restore it'
)

assert.match(
  page,
  /onUnmounted\(\(\)\s*=>\s*\{\s*exitEditMode\(\)\s*\}\)/,
  'leaving high-temp-pressure should always restore the aside'
)

assert.match(
  page,
  /const\s+canReturnToScheduleBeforeTest\s*=\s*computed\([\s\S]*?currentPanel\.value\s*===\s*'testing'[\s\S]*?!backendTestStarted\.value[\s\S]*?!testStartSubmitting\.value/,
  'the live test page should allow returning only before backend test startup begins'
)

assert.match(
  page,
  /v-if="[^"]*canReturnToScheduleBeforeTest[^"]*"[\s\S]*?@click="handleHeaderReturnToDashboard"[\s\S]*?返回排程/,
  'the live test page should render the return-to-schedule action before the test starts'
)

const returnHandlerStart = page.indexOf('function returnToDashboard()')
const returnHandlerEnd = page.indexOf('function openPendingReport(', returnHandlerStart)
assert.notEqual(returnHandlerStart, -1, 'returnToDashboard should exist')
assert.notEqual(returnHandlerEnd, -1, 'returnToDashboard should have a following function boundary')
const returnHandler = page.slice(returnHandlerStart, returnHandlerEnd)

assert.match(returnHandler, /testing\.switchPanel\('dashboard'\)/, 'return action should switch back to schedule')
assert.doesNotMatch(
  returnHandler,
  /clearSelectedSchedule|refreshWorkOrders|startHighTempPressureOrder|cancelHighTempPressureOrder/,
  'returning before the test starts should preserve schedule selection and avoid backend state changes'
)

assert.match(
  page,
  /async function handleBeginTest\(\)[\s\S]*?startHighTempPressureOrder[\s\S]*?backendTestStarted\.value\s*=\s*true[\s\S]*?testing\.connectOcrDevice\(\)/,
  'backend order startup and OCR collection should begin only from the live-page test start action'
)

assert.match(
  page,
  /async function handleHeaderReturnToDashboard\(\)[\s\S]*?testing\.resetTestSession\(\)[\s\S]*?returnToDashboard\(\)/,
  'returning from the live test page before startup should reset only the local test session'
)

console.log('high-temp-pressure full-width flow assertions passed')
