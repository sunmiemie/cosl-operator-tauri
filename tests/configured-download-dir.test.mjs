import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const config = readFileSync(resolve(root, 'src/composables/useConfig.ts'), 'utf8')
const settings = readFileSync(resolve(root, 'src/views/settings/index.vue'), 'utf8')
const htp = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureTesting.ts'), 'utf8')
const vibration = readFileSync(resolve(root, 'src/views/vibration/composables/useVibrationTesting.ts'), 'utf8')

assert.match(config, /downloadDir:\s*string/, 'AppConfig should include a downloadDir setting')
assert.match(config, /highTempPressureDownloadDir:\s*string/, 'AppConfig should include a high-temp-pressure download dir setting')
assert.match(config, /vibrationDownloadDir:\s*string/, 'AppConfig should include a vibration download dir setting')
assert.match(config, /store\.get<string>\('downloadDir'\)/, 'downloadDir should be loaded from the settings store')
assert.match(config, /store\.get<string>\('highTempPressureDownloadDir'\)/, 'high-temp-pressure download dir should be loaded from the settings store')
assert.match(config, /store\.get<string>\('vibrationDownloadDir'\)/, 'vibration download dir should be loaded from the settings store')
assert.match(config, /store\.set\('downloadDir',\s*defaultConfig\.downloadDir\)/, 'downloadDir should be initialized in the store')
assert.match(config, /store\.set\('highTempPressureDownloadDir',\s*downloadDir \?\? defaultConfig\.highTempPressureDownloadDir\)/, 'high-temp-pressure download dir should be initialized from legacy downloadDir when available')
assert.match(config, /store\.set\('vibrationDownloadDir',\s*downloadDir \?\? defaultConfig\.vibrationDownloadDir\)/, 'vibration download dir should be initialized from legacy downloadDir when available')
assert.match(config, /downloadDir:\s*downloadDir \?\? defaultConfig\.downloadDir/, 'downloadDir should be merged into runtime config')
assert.match(config, /highTempPressureDownloadDir:\s*highTempPressureDownloadDir \?\? downloadDir \?\? defaultConfig\.highTempPressureDownloadDir/, 'high-temp-pressure download dir should use legacy downloadDir only during config merge fallback')
assert.match(config, /vibrationDownloadDir:\s*vibrationDownloadDir \?\? downloadDir \?\? defaultConfig\.vibrationDownloadDir/, 'vibration download dir should use legacy downloadDir only during config merge fallback')

assert.match(settings, /const highTempPressureDownloadDir = ref\(''\)/, 'settings page should track high-temp-pressure download dir')
assert.match(settings, /const vibrationDownloadDir = ref\(''\)/, 'settings page should track vibration download dir')
assert.match(settings, /config\.value\.highTempPressureDownloadDir \?\? ''/, 'settings page should load high-temp-pressure download dir directly')
assert.match(settings, /config\.value\.vibrationDownloadDir \?\? ''/, 'settings page should load vibration download dir directly')
assert.match(settings, /setConfigItem\('highTempPressureDownloadDir'/, 'settings page should save high-temp-pressure download dir')
assert.match(settings, /setConfigItem\('vibrationDownloadDir'/, 'settings page should save vibration download dir')
assert.match(settings, /selectModuleDownloadDir/, 'settings page should provide per-module download directory pickers')
assert.match(settings, /高温高压井下载文件保存目录/, 'settings page should label high-temp-pressure download dir')
assert.match(settings, /振动台下载文件保存目录/, 'settings page should label vibration download dir')

assert.match(htp, /getConfiguredDownloadDir/, 'high-temp-pressure export should read configured download dir')
assert.match(htp, /getConfigItem\('highTempPressureDownloadDir'\)/, 'high-temp-pressure export should read its own dir')
assert.doesNotMatch(htp, /getConfigItem\('downloadDir'\)/, 'high-temp-pressure export should not read the legacy shared dir at runtime')
assert.match(htp, /targetDir:\s*configuredDownloadDir/, 'high-temp-pressure export should use configured download dir')
assert.doesNotMatch(
  htp,
  /open\(\{\s*title:\s*['"`][\s\S]*?保存目录[\s\S]*?directory:\s*true[\s\S]*?\}\)/,
  'high-temp-pressure should not prompt for a save directory during finalize'
)

assert.match(vibration, /getConfiguredDownloadDir/, 'vibration export should read configured download dir')
assert.match(vibration, /getConfigItem\('vibrationDownloadDir'\)/, 'vibration export should read its own dir')
assert.doesNotMatch(vibration, /getConfigItem\('downloadDir'\)/, 'vibration export should not read the legacy shared dir at runtime')
assert.match(vibration, /targetDir:\s*configuredDownloadDir/, 'vibration export should use configured download dir')
assert.doesNotMatch(
  vibration,
  /open\(\{\s*title:\s*['"`][\s\S]*?保存目录[\s\S]*?directory:\s*true[\s\S]*?\}\)/,
  'vibration should not prompt for a save directory during finalize'
)

console.log('configured download directory assertions passed')
