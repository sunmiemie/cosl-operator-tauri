import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(
  join(process.cwd(), 'src/views/halt-hass-test/index.vue'),
  'utf8',
)

assert.match(
  source,
  /v-if="!scannerConnected && !isMockHaltHassOrder\(currentOrder\)"/,
  'the demo entry should only appear when no scanner is connected and a real order is active',
)

assert.match(
  source,
  /@click="handleStartScheduledTest\(MOCK_HALT_HASS_ORDER\)"/,
  'the demo entry should switch to the isolated mock order instead of starting the real order',
)

assert.match(source, /无扫码枪，进入演示流程/, 'the demo entry should have a clear label')

assert.match(
  source,
  /无扫码枪演示/,
  'the schedule page should expose the demo flow without requiring a real order to be scheduled',
)

console.log('HALT-HASS scanner-free demo entry checks passed')
