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
const executionLogPanel = readFileSync(
  join(root, 'src/views/halt-hass-test/components/FlojoyExecutionLogPanel.vue'),
  'utf8',
)
const flojoySocket = readFileSync(join(root, 'src/composables/useFlojoySocket.ts'), 'utf8')

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
  /async function handleRunFlowchart\(\)[\s\S]*?beginFlowchartRun\(\)[\s\S]*?const jobId = uuidv4\(\)[\s\S]*?await runFlowchart/,
  'the real workflow should enter the running state before submitting the Flojoy job',
)

assert.match(
  page,
  /async function handleStopFlowchart\(\)[\s\S]*?if \(currentJobId\.value\)[\s\S]*?await cancelFlowchartRun\(currentJobId\.value\)[\s\S]*?stopFlowchart\(\)/,
  'the stop command should cancel the active Flojoy job before clearing the running state',
)

assert.doesNotMatch(
  page,
  /mock-halt-hass|MOCK_HALT_HASS|isMockHaltHass|HH-DEMO|演示工单|演示模式/,
  'the production HALT-HASS page must not retain demo-order shortcuts',
)

assert.match(
  runner,
  /props\.isRunning && props\.currentNodeId === nodeId/,
  'a stopped run must not leave the latest node displayed as running',
)

assert.match(
  runner,
  /class="test-flow-workspace"[\s\S]*?<FlojoyExecutionLogPanel[\s\S]*?persistent[\s\S]*?layout="rail"/,
  'the test flow should keep a persistent execution log rail beside the node list',
)

assert.match(
  executionLogPanel,
  /v-if="persistent \|\| expanded"[\s\S]*?v-if="!persistent"[\s\S]*?title="收起执行日志"/,
  'persistent log panels must stay visible and omit the collapse action',
)

assert.match(
  flojoySocket,
  /Object\.keys\(res\.FAILED_NODES\)\.length > 0[\s\S]*?\.\.\.failedBlocks\.value[\s\S]*?\.\.\.res\.FAILED_NODES/,
  'a later empty Flojoy status frame must not clear failures from the current run',
)

assert.match(
  flojoySocket,
  /\/ws\/logs\/[\s\S]*execution_log_batch[\s\S]*queueExecutionLogs/,
  'execution logs must use an isolated websocket and enter the buffered renderer',
)

assert.match(
  flojoySocket,
  /executionLogFlushInterval\s*=\s*250[\s\S]*executionLogs\.value = next/,
  'live execution logs must update Vue state in bounded batches',
)

assert.match(
  page,
  /const hasRecordedNodeError = nodeResults\.value\.some[\s\S]*?hasRecordedNodeError \|\| Object\.keys\(failedBlocks\.value\)\.length > 0[\s\S]*?if \(hasError\)[\s\S]*?return[\s\S]*?advanceToCycleFlow\(\)/,
  'the test flow must retain durable node errors and may enter the cycle flow only after success',
)

console.log('HALT-HASS flowchart control checks passed')
