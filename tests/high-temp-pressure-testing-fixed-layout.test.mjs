import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const panel = readFileSync(resolve(root, 'src/views/high-temp-pressure/components/TestingPanel.vue'), 'utf8')
const page = readFileSync(resolve(root, 'src/views/high-temp-pressure/index.vue'), 'utf8')
const testing = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureTesting.ts'), 'utf8')

assert.match(
  panel,
  /<div class="testing-scroll-region">[\s\S]*?<div class="ocr-capture-card">/,
  'TestingPanel should wrap the complete testing dashboard in its viewport region'
)

assert.match(
  panel,
  /\.panel\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*hidden;[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
  'TestingPanel panel should be a fixed-height column instead of the scrolling element'
)

assert.match(
  panel,
  /\.ocr-capture-card\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
  'desktop testing card should fill the available height with a flexible column layout'
)

assert.match(
  panel,
  /\.testing-scroll-region\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?overflow:\s*hidden;/,
  'desktop testing viewport should avoid page-level scrolling'
)

assert.match(
  panel,
  /\.overview-zone\s*\{[\s\S]*?flex:\s*0\s+0\s+auto;[\s\S]*?min-height:\s*0;/,
  'overview should use compact content height instead of a percentage or forced minimum'
)

assert.match(
  panel,
  /\.overview-metric\s*\{[\s\S]*?min-height:\s*52px;[\s\S]*?padding:\s*6px\s+8px;/,
  'overview metric cards should use the approved balanced compact size'
)

assert.match(
  panel,
  /\.control-action\s*\{[\s\S]*?min-height:\s*46px;[\s\S]*?padding:\s*6px\s+9px;/,
  'test controls should use the approved compact height'
)

assert.match(
  panel,
  /\.monitoring-board\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?min-height:\s*0;/,
  'monitoring board should consume all remaining viewport height'
)

assert.match(
  panel,
  /\.monitoring-chart-body\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?\.monitoring-chart\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/,
  'chart container should not force the page taller than the viewport'
)

assert.match(
  panel,
  /\.compact-order-body\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/,
  'long current-order content should scroll inside its own card'
)

assert.match(
  panel,
  /@media \(min-width:\s*1101px\) and \(max-height:\s*820px\)[\s\S]*?\.testing-scroll-region\s*\{[\s\S]*?overflow-y:\s*auto;/,
  'short desktop windows should fall back to safe internal scrolling'
)

assert.match(
  page,
  /'is-testing-panel':\s*testing\.currentPanel\.value\s*===\s*'testing'/,
  'only the live testing panel should enable the compact page header'
)

assert.match(
  testing,
  /new ResizeObserver\([\s\S]*?chartInst\?\.resize\(\)[\s\S]*?chartResizeObserver\.observe\(el\)/,
  'ECharts should resize when its flexible container changes size'
)

console.log('high-temp-pressure testing fixed layout assertions passed')
