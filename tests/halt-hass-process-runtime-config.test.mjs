import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const types = readFileSync(join(root, 'src/views/process-halt-hass/types.ts'), 'utf8')
const api = readFileSync(join(root, 'src/services/halt-hass-api.ts'), 'utf8')
const processComposable = readFileSync(
  join(root, 'src/views/process-halt-hass/composables/useHaltHassProcess.ts'),
  'utf8',
)
const page = readFileSync(join(root, 'src/views/process-halt-hass/index.vue'), 'utf8')

assert.match(types, /durationHours\?: number/, '工艺元数据应保存试验时长')
assert.match(types, /curveFile\?: HaltHassCurveFile/, '工艺元数据应保存曲线文件引用')
assert.match(api, /\/test\/halt-hass\/curve\/upload\//, '应提供 HALT-HASS 曲线上传接口')
assert.match(api, /postFormData/, '曲线文件应通过 multipart 上传')
assert.match(processComposable, /isRuntimeConfigComplete/, '保存前应统一校验运行配置')
assert.match(page, /step="0\.01"/, '时长输入应允许两位小数')
assert.match(page, /上传曲线文件/, '页面应提供曲线文件上传入口')
assert.match(page, /curve-file-card/, '页面应展示已上传文件状态')
assert.match(page, /请填写试验时长/, '页面应给出时长必填提示')
assert.match(page, /请上传 HALT-HASS 曲线文件/, '页面应给出曲线文件必填提示')

console.log('halt-hass process runtime config text checks passed')
