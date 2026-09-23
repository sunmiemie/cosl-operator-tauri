import assert from 'node:assert/strict'
import test from 'node:test'

import { buildHighTempPressureExportFolderName } from '../src/views/high-temp-pressure/utils/exportFolder.ts'

test('单工单目录使用结束时间和真实工单号', () => {
  const completedAt = new Date(2026, 8, 23, 14, 32, 5)
  assert.equal(
    buildHighTempPressureExportFolderName({
      orderNumbers: ['TASK-001'],
      completedAtMs: completedAt.getTime(),
    }),
    '20260923-143205_TASK-001_高温高压井测试数据'
  )
})

test('多工单目录去重并保持首个工单号', () => {
  const completedAt = new Date(2026, 8, 23, 14, 32, 5)
  assert.equal(
    buildHighTempPressureExportFolderName({
      orderNumbers: [' TASK-001 ', 'TASK-001', 'TASK-002'],
      completedAtMs: completedAt.getTime(),
    }),
    '20260923-143205_TASK-001_等2个工单_高温高压井测试数据'
  )
})

test('目录生成拒绝无效结束时间', () => {
  assert.throws(
    () => buildHighTempPressureExportFolderName({ orderNumbers: ['TASK-001'], completedAtMs: Number.NaN }),
    /测试结束时间无效/
  )
})
