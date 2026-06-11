import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const content = readFileSync(resolve(root, 'src/composables/useFlojoyBackend.ts'), 'utf8')

const startMarker = 'async function start(): Promise<boolean>'
const startIndex = content.indexOf(startMarker)
assert.notEqual(startIndex, -1, 'Flojoy backend start() should be present')

const stopIndex = content.indexOf('async function stop(): Promise<boolean>', startIndex)
assert.notEqual(stopIndex, -1, 'start() should have a following stop section boundary')

const startBody = content.slice(startIndex, stopIndex)
const initIndex = startBody.indexOf('await init()')
const invokeIndex = startBody.indexOf("invoke<string>('start_flojoy_backend')")

assert.notEqual(initIndex, -1, 'start() should wait for Flojoy initialization before starting')
assert.notEqual(invokeIndex, -1, 'start() should invoke the Tauri start command')
assert.ok(
  initIndex < invokeIndex,
  'start() should configure Python through init() before invoking start_flojoy_backend'
)
assert.match(
  startBody,
  /if\s*\(\s*!pythonPath\.value\s*\)/,
  'start() should fail early when no Python interpreter is configured after init'
)

console.log('flojoy backend start initialization assertions passed')
