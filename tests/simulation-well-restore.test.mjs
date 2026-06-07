import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const indexContent = readFileSync(resolve(root, 'src/views/simulation-well/index.vue'), 'utf8')
const reportContent = readFileSync(resolve(root, 'src/views/simulation-well/test-report.vue'), 'utf8')
const packageContent = readFileSync(resolve(root, 'src/views/simulation-well/equipment-package.vue'), 'utf8')
const simInstrumentApiPath = resolve(root, 'src/services/sim-instrument-api.ts')

assert.ok(
  existsSync(simInstrumentApiPath),
  'simulation-well should keep sim-instrument-api for internal instrument selection'
)

assert.match(
  indexContent,
  /v\s*===\s*'active-test'/,
  'simulation-well should keep the active-test view after starting a downhole operation'
)

assert.match(
  indexContent,
  /auto-create-report="route\.query\.autoCreate === '1'"/,
  'simulation-well should pass the auto-create report flag into the test report view'
)

assert.match(
  reportContent,
  /autoCreateReport\?:\s*boolean/,
  'test-report should accept autoCreateReport for the post-downhole report flow'
)

assert.match(
  reportContent,
  /reportNextStepVisible/,
  'test-report should keep the next-report prompt when several device reports remain'
)

assert.match(
  packageContent,
  /class="template-select"/,
  'equipment-package should allow selecting a test report template per device'
)

assert.match(
  packageContent,
  /testEnvironment:\s*\{\s*wellDepth:\s*wellDepth\.value,\s*wellTemperature:\s*wellTemperature\.value,\s*wellPressure:\s*wellPressure\.value\s*\}/,
  'equipment-package should save well temperature and well pressure with the downhole environment'
)

assert.match(
  packageContent,
  /<span class="input-label">井温：<\/span>[\s\S]*?<span class="input-unit">°C<\/span>/,
  'equipment-package should display the well temperature input'
)

assert.match(
  packageContent,
  /<span class="input-label">井压：<\/span>[\s\S]*?<span class="input-unit">MPa<\/span>/,
  'equipment-package should display the well pressure input'
)

console.log('simulation-well restore assertions passed')
