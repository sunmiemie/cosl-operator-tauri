import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const schedule = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureSchedule.ts'), 'utf8')

assert.match(
  schedule,
  /orderStatusByInstrumentId/,
  'refreshWorkOrders should track each instrument parent order status'
)

assert.match(
  schedule,
  /orderStatusByInstrumentId\.get\(instrumentId\)\s*===\s*2/,
  'stale local running instruments should only be preserved while the parent order is still testing'
)

assert.match(
  schedule,
  /const\s+order\s*=\s*getOrderByInstrumentId\(instrumentId\)[\s\S]*?order\?\.statusCode\s*===\s*2[\s\S]*?instrument\?\.status\s*===\s*1/,
  'isInstrumentRunning should require the backend order status to still be testing'
)

console.log('high-temp-pressure running state refresh assertions passed')
