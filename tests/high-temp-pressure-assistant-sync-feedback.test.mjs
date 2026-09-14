import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(resolve(import.meta.dirname, '../src/views/high-temp-pressure/composables/useHighTempPressureSchedule.ts'), 'utf8')
const start = source.indexOf('const assistantSync = resp.data.data?.assistantSync')
const end = source.indexOf('return true', start)
assert.ok(start >= 0 && end > start)
// 直接执行保存后的反馈分支；不启动桌面设备、网络或测试流程。
const feedback = new Function('resp', 'schedule', 'ElMessage', ts.transpileModule(source.slice(start, end), {}).outputText)

for (const [name, schedule, assistantSync, expected] of [
  ['入队成功显示处理中', true, { success: true, queued: true }, [['info', '排程已保存，小助手同步处理中']]],
  ['同步失败显示具体原因', true, { success: false, list: [{ reason: 'external_status_not_allowed' }] }, [['warning', '排期已保存，但第三方排期同步失败：external_status_not_allowed']]],
  ['取消排程不显示推送提示', false, { success: true, queued: true }, []],
]) {
  test(name, () => {
    const messages = []
    feedback({ data: { data: { assistantSync } } }, schedule, {
      info: (text) => messages.push(['info', text]),
      warning: (text) => messages.push(['warning', text]),
    })
    assert.deepEqual(messages, expected)
  })
}
