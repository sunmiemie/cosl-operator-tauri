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

test('目录生成拒绝有限但超出 Date 范围的时间', () => {
  for (const completedAtMs of [Number.MAX_VALUE, 8.64e15 + 1, -8.64e15 - 1]) {
    assert.throws(
      () => buildHighTempPressureExportFolderName({ orderNumbers: ['TASK-001'], completedAtMs }),
      /测试结束时间无效/
    )
  }
})

test('工单号中的路径分隔符和 Windows 非法字符不会进入目录名', () => {
  const name = buildHighTempPressureExportFolderName({
    orderNumbers: ['../TASK/2026\\A:<B>?*|"\u0000'],
    completedAtMs: new Date(2026, 8, 23).getTime(),
  })
  assert.doesNotMatch(name, /[<>:"/\\|?*\u0000-\u001f]/)
  assert.match(name, /TASK-2026-A/)
})

test('超长 Unicode 工单号保留完整字符且目录长度受限', () => {
  const name = buildHighTempPressureExportFolderName({
    orderNumbers: ['🔧'.repeat(300)], completedAtMs: new Date(2026, 8, 23).getTime(),
  })
  assert.ok(name.length < 255)
  assert.ok(name.includes('🔧'.repeat(80)))
})
