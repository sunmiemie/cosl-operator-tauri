import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const panel = readFileSync(resolve(root, 'src/views/high-temp-pressure/components/TestingPanel.vue'), 'utf8')

assert.match(
  panel,
  /<div class="testing-scroll-region">[\s\S]*?<div class="video-capture-card">/,
  'TestingPanel should wrap the chart/content area in a dedicated scroll region'
)

assert.match(
  panel,
  /\.panel\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*hidden;[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
  'TestingPanel panel should be a fixed-height column instead of the scrolling element'
)

assert.match(
  panel,
  /\.ocr-bar\s*\{[\s\S]*?flex:\s*0\s+0\s+auto;/,
  'top black OCR/status area should stay fixed in the panel layout'
)

assert.match(
  panel,
  /\.testing-scroll-region\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?overflow-y:\s*auto;/,
  'middle chart/content area should be the vertical scroll container'
)

assert.match(
  panel,
  /\.test-controls\s*\{[\s\S]*?flex:\s*0\s+0\s+auto;/,
  'bottom three controls should stay fixed in the panel layout'
)

assert.match(
  panel,
  /\.test-controls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(160px,\s*210px\)\);[\s\S]*?justify-content:\s*center;/,
  'bottom controls should use compact fixed columns instead of filling the whole width'
)

assert.match(
  panel,
  /\.control-action\s*\{[\s\S]*?min-height:\s*58px;[\s\S]*?padding:\s*10px\s+12px;/,
  'bottom control buttons should be visually smaller'
)

console.log('high-temp-pressure testing fixed layout assertions passed')
