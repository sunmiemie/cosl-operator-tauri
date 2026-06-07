import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const css = readFileSync(resolve(root, 'src/views/vibration/components/vibration.shared.css'), 'utf8')

const scheduledMatch = css.match(/\.status-pill\.status-scheduled\s*\{([\s\S]*?)\}/)
assert.ok(scheduledMatch, 'vibration scheduled status style should be present')

const scheduledStyle = scheduledMatch[1]
assert.match(
  scheduledStyle,
  /color:\s*#2563eb|color:\s*var\(--color-accent-blue\)/,
  'scheduled status text should use the blue style'
)
assert.match(
  scheduledStyle,
  /background:\s*rgba\(59,\s*130,\s*246,\s*0\.12\)/,
  'scheduled status background should match the blue status background'
)
assert.match(
  scheduledStyle,
  /border:\s*1px solid rgba\(59,\s*130,\s*246,\s*0\.22\)/,
  'scheduled status border should match the blue status border'
)
assert.doesNotMatch(
  scheduledStyle,
  /#d97706|245,\s*158,\s*11/,
  'scheduled status should not use the orange pending color'
)

console.log('vibration scheduled status color assertions passed')
