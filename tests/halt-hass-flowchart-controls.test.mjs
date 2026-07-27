import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const testFlow = readFileSync(
  join(root, 'src/views/halt-hass-test/composables/useHaltHassTest.ts'),
  'utf8',
)
const page = readFileSync(join(root, 'src/views/halt-hass-test/index.vue'), 'utf8')
const runner = readFileSync(
  join(root, 'src/views/halt-hass-test/components/FlowchartRunner.vue'),
  'utf8',
)

assert.match(
  testFlow,
  /function startFlowchartTest\(\): void \{[\s\S]*?isFlowchartRunning\.value = false[\s\S]*?flowchartStartTime\.value = null[\s\S]*?\n  \}/,
  'entering the flowchart screen must not mark an unstarted run as active',
)

assert.match(
  testFlow,
  /function beginFlowchartRun\(\): void \{[\s\S]*?isFlowchartRunning\.value = true[\s\S]*?flowchartStartTime\.value = new Date\(\)[\s\S]*?\n  \}/,
  'running state and timing should begin only after the run command',
)

assert.match(
  page,
  /async function handleRunFlowchart\(\)[\s\S]*?beginFlowchartRun\(\)[\s\S]*?isMockHaltHassOrder/,
  'both real and demo executions should enter the running state from the run command',
)

assert.match(
  page,
  /async function handleStopFlowchart\(\)[\s\S]*?isMockHaltHassOrder\(currentOrder\.value\)[\s\S]*?mockFlowchartRunToken\+\+[\s\S]*?stopFlowchart\(\)/,
  'the stop command should cancel the local demo execution without requiring a Flojoy job id',
)

assert.match(
  runner,
  /props\.isRunning && props\.currentNodeId === nodeId/,
  'a stopped run must not leave the latest node displayed as running',
)

console.log('HALT-HASS flowchart control checks passed')
