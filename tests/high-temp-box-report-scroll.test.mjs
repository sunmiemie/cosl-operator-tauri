import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const file = resolve(root, 'src/views/high-temp-box/components/HighTempBoxTestFlow.vue')
const source = readFileSync(file, 'utf8')

assert.match(
  source,
  /<div class="test-content" :class="\{ 'is-report-content': currentStep === 'report' \}">/,
  'report step should switch the content area into report layout mode',
)

assert.match(
  source,
  /\.test-content\.is-report-content\{overflow:hidden\}/,
  'report layout mode should hide outer scrolling so the report document owns the scrollbar',
)

assert.match(
  source,
  /\.report-panel\{[^}]*height:100%;[^}]*min-height:0;[^}]*overflow:hidden[^}]*\}/,
  'report panel should fill available height and clip only its own layout shell',
)

assert.match(
  source,
  /\.report-document\{[^}]*flex:1 1 auto;[^}]*min-height:0;[^}]*overflow-x:hidden;[^}]*overflow-y:auto;[^}]*scrollbar-gutter:stable[^}]*\}/,
  'report document should be the scrollable region',
)

assert.match(
  source,
  /\.report-panel \.action-bar\{[^}]*flex:0 0 auto;[^}]*border-top:1px solid var\(--color-border\)[^}]*\}/,
  'report actions should stay outside the scrollable report document',
)

console.log('high-temp-box report scroll layout checks passed')
