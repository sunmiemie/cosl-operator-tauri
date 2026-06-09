import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const reportPanel = readFileSync(resolve(root, 'src/views/high-temp-pressure/components/ReportPanel.vue'), 'utf8')

const layoutMatch = reportPanel.match(/\.report-layout\s*\{([\s\S]*?)\}/)
assert.ok(layoutMatch, 'ReportPanel should define report-layout styles')
assert.match(
  layoutMatch[1],
  /grid-template-columns:\s*minmax\(420px,\s*0\.8fr\)\s+minmax\(0,\s*1\.2fr\)/,
  'report layout should give the report form more horizontal space than the file list'
)

const mediaMatch = reportPanel.match(/@media\s*\(max-width:\s*1100px\)\s*\{([\s\S]*?)\n\}/)
assert.ok(mediaMatch, 'ReportPanel should collapse the report layout on narrower screens')
assert.match(
  mediaMatch[1],
  /\.report-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
  'report layout should collapse to one column below 1100px'
)

console.log('high-temp-pressure report layout assertions passed')
