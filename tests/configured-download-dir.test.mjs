import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const config = readFileSync(resolve(root, 'src/composables/useConfig.ts'), 'utf8')
const settings = readFileSync(resolve(root, 'src/views/settings/index.vue'), 'utf8')
const htp = readFileSync(resolve(root, 'src/views/high-temp-pressure/composables/useHighTempPressureTesting.ts'), 'utf8')
const vibration = readFileSync(resolve(root, 'src/views/vibration/composables/useVibrationTesting.ts'), 'utf8')

assert.match(config, /downloadDir:\s*string/, 'AppConfig should include a downloadDir setting')
assert.match(config, /store\.get<string>\('downloadDir'\)/, 'downloadDir should be loaded from the settings store')
assert.match(config, /store\.set\('downloadDir',\s*defaultConfig\.downloadDir\)/, 'downloadDir should be initialized in the store')
assert.match(config, /downloadDir:\s*downloadDir \?\? defaultConfig\.downloadDir/, 'downloadDir should be merged into runtime config')

assert.match(settings, /const downloadDir = ref\(''\)/, 'settings page should track downloadDir')
assert.match(settings, /config\.value\.downloadDir/, 'settings page should load downloadDir')
assert.match(settings, /setConfigItem\('downloadDir'/, 'settings page should save downloadDir')
assert.match(settings, /selectDownloadDir/, 'settings page should provide a download directory picker')
assert.match(settings, /下载文件保存目录|下载文件地址|下载目录/, 'settings page should label the new download path setting')

assert.match(htp, /getConfiguredDownloadDir/, 'high-temp-pressure export should read configured download dir')
assert.match(htp, /targetDir:\s*configuredDownloadDir/, 'high-temp-pressure export should use configured download dir')
assert.doesNotMatch(
  htp,
  /open\(\{\s*title:\s*['"`][\s\S]*?保存目录[\s\S]*?directory:\s*true[\s\S]*?\}\)/,
  'high-temp-pressure should not prompt for a save directory during finalize'
)

assert.match(vibration, /getConfiguredDownloadDir/, 'vibration export should read configured download dir')
assert.match(vibration, /targetDir:\s*configuredDownloadDir/, 'vibration export should use configured download dir')
assert.doesNotMatch(
  vibration,
  /open\(\{\s*title:\s*['"`][\s\S]*?保存目录[\s\S]*?directory:\s*true[\s\S]*?\}\)/,
  'vibration should not prompt for a save directory during finalize'
)

console.log('configured download directory assertions passed')
