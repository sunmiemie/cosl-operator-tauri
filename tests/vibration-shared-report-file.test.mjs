import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const config = readFileSync(resolve(root, 'src/composables/useConfig.ts'), 'utf8')
const settings = readFileSync(resolve(root, 'src/views/settings/index.vue'), 'utf8')
const index = readFileSync(resolve(root, 'src/views/vibration/index.vue'), 'utf8')
const report = readFileSync(resolve(root, 'src/views/vibration/composables/useVibrationReport.ts'), 'utf8')
const flow = readFileSync(resolve(root, 'src/views/vibration/components/VibrationFlow.vue'), 'utf8')

assert.match(config, /vibrationSharedReportDir:\s*string/, 'config should include a vibration shared report directory')
assert.match(config, /store\.get<string>\('vibrationSharedReportDir'\)/, 'shared report directory should load from store')
assert.match(config, /store\.set\('vibrationSharedReportDir',\s*defaultConfig\.vibrationSharedReportDir\)/, 'shared report directory should initialize in store')
assert.match(config, /vibrationSharedReportDir:\s*vibrationSharedReportDir \?\? defaultConfig\.vibrationSharedReportDir/, 'shared report directory should merge into runtime config')

assert.match(settings, /const vibrationSharedReportDir = ref\(''\)/, 'settings should track shared report directory')
assert.match(settings, /config\.value\.vibrationSharedReportDir \?\? ''/, 'settings should load shared report directory')
assert.match(settings, /type ModuleDownloadDirKey = 'highTempPressureDownloadDir' \| 'vibrationDownloadDir' \| 'vibrationSharedReportDir'/, 'shared report directory should use the module directory saver')
assert.match(settings, /function normalizeModuleDirectoryInput/, 'settings should normalize manually entered module directory paths')
assert.ok(settings.includes(String.raw`replace(/^\\\\\s+/, '\\\\')`), 'settings should remove accidental spaces after a UNC prefix')
assert.match(settings, /setConfigItem\(key,\s*(nextDir|selected)\)/, 'module directory saver should persist the selected key')

assert.match(report, /from '@tauri-apps\/plugin-dialog'/, 'report flow should use the Tauri file picker')
assert.match(report, /from '@tauri-apps\/plugin-fs'/, 'report flow should read the selected third-party report file')
assert.match(report, /selectThirdPartyReport/, 'report state should expose third-party report selection')
assert.match(report, /clearThirdPartyReport/, 'report state should expose third-party report clearing')
assert.match(report, /getThirdPartyReportUploadFile/, 'report upload should be sourced from the selected third-party report')
assert.match(report, /function normalizeSharedReportDir/, 'report picker should normalize the configured shared directory')
assert.match(report, /ensureSharedReportDirAccessible/, 'report picker should verify the configured shared directory before opening')
assert.match(report, /defaultPath:\s*defaultSharedReportDir \|\| undefined/, 'report picker should open the configured shared directory')
assert.match(report, /extensions:\s*\['doc',\s*'docx'\]/, 'report picker should only allow Word report files')
assert.match(report, /fieldName:\s*'report_file'/, 'third-party report should upload as report_file')
assert.match(report, /fileName:\s*selectedThirdPartyReportName\.value/, 'third-party report should keep its original filename')
assert.match(report, /thirdPartyReportReady\.value/, 'report processing should require a selected third-party report')

assert.match(index, /select-third-party-report/, 'vibration page should wire third-party report selection')
assert.match(index, /clear-third-party-report/, 'vibration page should wire third-party report clearing')

assert.match(flow, /selectedThirdPartyReportName/, 'report panel should show selected third-party report state')
assert.match(flow, /select-third-party-report/, 'report panel should emit third-party report selection')
assert.match(flow, /clear-third-party-report/, 'report panel should emit third-party report clearing')
assert.match(flow, /third-party-report/, 'report panel should render the third-party report picker')

console.log('vibration shared report file assertions passed')
