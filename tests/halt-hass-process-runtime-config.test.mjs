import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const types = readFileSync(join(root, 'src/views/process-halt-hass/types.ts'), 'utf8')
const processComposable = readFileSync(
  join(root, 'src/views/process-halt-hass/composables/useHaltHassProcess.ts'),
  'utf8',
)
const page = readFileSync(join(root, 'src/views/process-halt-hass/index.vue'), 'utf8')

assert.doesNotMatch(types, /durationHours\?: number/, '工艺元数据不得保存工作台试验时长')
assert.match(processComposable, /isRuntimeConfigComplete/, '保存前应统一校验运行配置')
assert.match(page, /试验时长由工作台 MQTT 状态控制；温度、振动曲线在客户端开始测试时选择/, '工艺页应明确运行参数来源')
assert.doesNotMatch(page, /上传曲线文件|curve-file-card|请填写试验时长/, '工艺页不得再编辑工作台时长和曲线文件')

console.log('halt-hass process runtime config text checks passed')
