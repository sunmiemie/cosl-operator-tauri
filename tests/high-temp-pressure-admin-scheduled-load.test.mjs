import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const schedule = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureSchedule.ts'), 'utf8')

const refreshStart = schedule.indexOf('async function refreshWorkOrders()')
const calBaseStart = schedule.indexOf('const calBase = ref', refreshStart)
assert.ok(refreshStart >= 0 && calBaseStart > refreshStart, 'refreshWorkOrders block should be present')
const refreshBlock = schedule.slice(refreshStart, calBaseStart)

assert.doesNotMatch(
  refreshBlock,
  /for\s*\(\s*const\s+status\s+of\s+VISIBLE_ORDER_STATUSES\s*\)/,
  'test client should not fetch high-temp-pressure orders by status-only pages because admin scheduled orders may use other statuses',
)

assert.match(
  refreshBlock,
  /listHighTempPressureOrders\(\s*\{\s*page,\s*pageSize\s*\}/,
  'refreshWorkOrders should load the same unfiltered high-temp-pressure list shape as the admin schedule page',
)

assert.match(
  schedule,
  /function\s+shouldKeepLoadedWorkOrder\(order:\s*WorkOrder\)/,
  'loaded orders should be filtered locally after schedule fields are mapped',
)

assert.match(
  schedule,
  /const\s+isVisibleStatus\s*=[\s\S]*VISIBLE_ORDER_STATUSES\.includes\(order\.statusCode\)[\s\S]*return\s+isVisibleStatus\s*\|\|\s*hasRestorableBackendSchedule\(order\)/,
  'local filtering should keep normal visible statuses and also any order with backend schedule fields',
)

console.log('high-temp-pressure admin scheduled load assertions passed')
