import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const page = readFileSync(resolve(root, 'src/views/high-temp-pressure/index.vue'), 'utf8')
const testing = readFileSync(
  resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureTesting.ts'),
  'utf8'
)

const productSelectionStart = page.indexOf('async function confirmProductSelection()')
const startupCheckStart = page.indexOf('function handleStartupCheckComplete()', productSelectionStart)
assert.ok(productSelectionStart >= 0 && startupCheckStart > productSelectionStart)
const productSelectionBody = page.slice(productSelectionStart, startupCheckStart)

assert.match(
  productSelectionBody,
  /selectedSelections\.map\(\(selection\)\s*=>\s*String\(selection\.order\.testType\s*\|\|\s*''\)\.trim\(\)\)/,
  'selected test types should be normalized before comparison'
)

assert.match(
  productSelectionBody,
  /if\s*\(selectedTestTypes\.size\s*>\s*1\)\s*\{[\s\S]*?同一次实验请选择相同测试类型的设备[\s\S]*?return/,
  'mixed test types should keep the product picker open and stop the start flow'
)

assert.match(
  page,
  /await testing\.confirmStart\(String\(selections\[0\]\?\.order\.testType\s*\|\|\s*''\)\.trim\(\)\)/,
  'the selected test type should be passed into the testing session initializer'
)

assert.match(
  testing,
  /function applyDefaultChartSeriesVisibility\(testType\?: string\)\s*\{[\s\S]*?String\(testType\s*\|\|\s*''\)\.trim\(\)\s*===\s*'高压测试'[\s\S]*?upperTemp\s*=\s*!pressureOnly[\s\S]*?lowerTemp\s*=\s*!pressureOnly[\s\S]*?pressure\s*=\s*true/,
  'pure high-pressure tests should default to pressure only while other types show all curves'
)

assert.match(
  testing,
  /async function confirmStart\(testType\?: string\)\s*\{[\s\S]*?await resetTestSession\(\)[\s\S]*?applyDefaultChartSeriesVisibility\(testType\)[\s\S]*?switchPanel\('testing'\)/,
  'every new testing session should reapply the test-type defaults'
)

assert.match(
  testing,
  /function toggleChartSeries\(key:[\s\S]*?chartSeriesVisibility\[key\]\s*=\s*!chartSeriesVisibility\[key\]/,
  'users should still be able to toggle individual temperature curves during the test'
)

console.log('high-temp-pressure chart default visibility assertions passed')
