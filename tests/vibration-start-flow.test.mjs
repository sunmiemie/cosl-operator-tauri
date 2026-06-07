import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const content = readFileSync(resolve(root, 'src/views/vibration/index.vue'), 'utf8')

function sliceBetween(startMarker, endMarker, label) {
  const start = content.indexOf(startMarker)
  assert.notEqual(start, -1, `${label} should be present`)
  const end = content.indexOf(endMarker, start)
  assert.notEqual(end, -1, `${label} should have a following boundary`)
  return content.slice(start, end)
}

const confirmStart = content.indexOf('async function confirmInstrumentSelection()')
assert.notEqual(confirmStart, -1, 'confirmInstrumentSelection should be present')

const localStartFunctionStart = content.indexOf('function beginSelectedVibrationExperiment', confirmStart)
const handleStartupStart = content.indexOf('function handleStartupCheckComplete', confirmStart)
const confirmEnd = localStartFunctionStart === -1 ? handleStartupStart : localStartFunctionStart
assert.notEqual(confirmEnd, -1, 'confirmInstrumentSelection should have a following function boundary')

const confirmBody = content.slice(confirmStart, confirmEnd)

assert.match(
  confirmBody,
  /beginSelectedVibrationExperiment\(selected,\s*selectedInstruments\)/,
  'confirmInstrumentSelection should enter the local startup flow immediately'
)
assert.match(
  confirmBody,
  /void syncVibrationSchedulePush\(selected,\s*selectedInstruments\)/,
  'confirmInstrumentSelection should trigger only schedule push in the background'
)
assert.doesNotMatch(
  confirmBody,
  /await\s+(?:initAuth|resolveVibrationSchedulePayload|pushEngineerAssistantSchedules|changeVibrationTableOrderStatus)\b/,
  'confirmInstrumentSelection should not await slow network operations before showing the startup check'
)

const localStartMatch = content.match(/function beginSelectedVibrationExperiment[\s\S]*?\n\}/)
assert.ok(localStartMatch, 'beginSelectedVibrationExperiment should be present')
assert.match(
  localStartMatch[0],
  /showStartupCheck\.value\s*=\s*true/,
  'the local startup flow should show the startup checklist'
)

const schedulePushBody = sliceBetween(
  'async function syncVibrationSchedulePush',
  'async function startSelectedVibrationOrder',
  'syncVibrationSchedulePush'
)
assert.match(
  schedulePushBody,
  /await\s+pushEngineerAssistantSchedules/,
  'schedule push synchronization should still push third-party schedule data'
)
assert.doesNotMatch(
  schedulePushBody,
  /changeVibrationTableOrderStatus/,
  'background schedule push should not change the order to running'
)

const startOrderBody = sliceBetween(
  'async function startSelectedVibrationOrder',
  'function handleStartupCheckComplete',
  'startSelectedVibrationOrder'
)
assert.match(
  startOrderBody,
  /await\s+changeVibrationTableOrderStatus/,
  'final start should synchronize the vibration order status'
)
assert.match(
  startOrderBody,
  /return\s+true/,
  'final start should report successful status synchronization'
)

const finalConfirmBody = sliceBetween(
  'async function confirmStartVibration',
  'function convertToFormal',
  'confirmStartVibration'
)
assert.match(
  finalConfirmBody,
  /const\s+started\s*=\s*await\s+startSelectedVibrationOrder\(\)/,
  'confirmStartVibration should wait for order status synchronization'
)
assert.match(
  finalConfirmBody,
  /if\s+\(!started\)\s+return/,
  'confirmStartVibration should stop when order status synchronization fails'
)
assert.ok(
  finalConfirmBody.indexOf('await startSelectedVibrationOrder()') < finalConfirmBody.indexOf("stage.value = 'calibration'"),
  'confirmStartVibration should enter calibration only after order status synchronization'
)

const abortBody = (() => {
  const testingContent = readFileSync(resolve(root, 'src/views/vibration/composables/useVibrationTesting.ts'), 'utf8')
  const start = testingContent.indexOf('function confirmAbort()')
  assert.notEqual(start, -1, 'confirmAbort should be present')
  const end = testingContent.indexOf('function getOscCanvas()', start)
  assert.notEqual(end, -1, 'confirmAbort should have a following boundary')
  return testingContent.slice(start, end)
})()
assert.match(
  abortBody,
  /options\.onFinishToDashboard\(1,\s*\{\s*resetRunningInstruments:\s*true\s*\}\)/,
  'aborting a vibration test should reset running instruments so the order returns to pending schedule'
)

const dashboardFinishHandler = sliceBetween(
  'onFinishToDashboard: (finalStatus = 5',
  'const report = useVibrationReport',
  'vibration testing onFinishToDashboard handler'
)
assert.match(
  dashboardFinishHandler,
  /backToDashboard\(finalStatus,\s*options\)/,
  'vibration page should forward dashboard return options to backToDashboard'
)

console.log('vibration start flow assertions passed')
