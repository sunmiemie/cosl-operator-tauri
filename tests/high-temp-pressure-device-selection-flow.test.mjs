import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const panel = readFileSync(resolve(root, 'src/views/high-temp-pressure/components/TestingPanel.vue'), 'utf8')
const page = readFileSync(resolve(root, 'src/views/high-temp-pressure/index.vue'), 'utf8')
const testing = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureTesting.ts'), 'utf8')

assert.match(
  panel,
  /class="control-action control-action-reconnect"\s+:disabled="startSubmitting"\s+@click="openDeviceModal"/,
  'capture-device selection must be available before backend test startup'
)
assert.doesNotMatch(
  panel,
  /control-action-reconnect"\s+:disabled="!testStarted/,
  'capture-device selection must not depend on testStarted'
)
assert.match(
  panel,
  /const handleTestStart[\s\S]*if \(!props\.testStarted\) emit\('start-test'\)[\s\S]*else emit\('resume'\)/,
  'a selected device must not bypass backend test startup'
)
assert.match(
  panel,
  /点击“测试开始”时才会使用该设备/,
  'the selector should explain that choosing a device does not start collection'
)
assert.match(
  testing,
  /async function selectOcrDevice\(deviceIndex: number\)[\s\S]*ocrDeviceIndex\.value = device\.index[\s\S]*ocrDeviceName\.value = device\.name/,
  'the selected device must be stored in the active test session'
)
assert.match(
  page,
  /async function handleBeginTest\(\)[\s\S]*ocrDeviceIndex\.value === null[\s\S]*startHighTempPressureOrder[\s\S]*testing\.connectOcrDevice\(\)/,
  'test start must require a selected device and connect it only after backend startup'
)

console.log('high-temp-pressure capture-device selection flow assertions passed')
