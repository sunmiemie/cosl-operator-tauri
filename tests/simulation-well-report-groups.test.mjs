import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupReportDevices } from '../src/views/simulation-well/report-groups.ts'

const device = (id, orderDbId, templateId, extra = {}) => ({
  id: String(id), orderDbId, templateId, deviceDbId: id, orderId: `ORDER-${orderDbId}`,
  customer: '', deviceName: `Tool ${id}`, sn: `SN-${id}`, template: templateId ? `T-${templateId}` : '',
  orderType: 0, ...extra,
})

test('同工单同模板合并，名称和 SN 保持配对及原始顺序', () => {
  const groups = groupReportDevices([device(1, 10, 100), device(2, 10, 100), device(3, 10, 200)])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].members.map((item) => [item.deviceName, item.sn]), [['Tool 1', 'SN-1'], ['Tool 2', 'SN-2']])
  assert.equal(groups[0].sn, 'SN-1、SN-2')
})

test('不同工单同模板分开，无模板研究院和失效模板逐台保留', () => {
  const groups = groupReportDevices([
    device(1, 10, 100), device(2, 20, 100),
    device(3, 10, undefined, { orderType: 1 }), device(4, 10, undefined, { orderType: 1 }),
    device(5, 10, 100, { templateError: 'invalid' }), device(6, 10, 100, { templateError: 'invalid' }),
  ])
  assert.equal(groups.length, 6)
})

test('历史报告覆盖部分产品后，只合并剩余产品', () => {
  const devices = [device(1, 10, 100), device(2, 10, 100), device(3, 10, 100)]
  const covered = new Set([2])
  const groups = groupReportDevices(devices.filter((item) => !covered.has(item.deviceDbId)))
  assert.deepEqual(groups[0].members.map((item) => item.deviceDbId), [1, 3])
})

test('研究院无模板时，相同 SN 和旧卡片 ID 也不能将不同产品合并', () => {
  const first = device(1, 10, undefined, { id: 'work-same-sn', sn: 'SAME-SN', orderType: 1 })
  const second = device(2, 20, undefined, { id: 'work-same-sn', sn: 'SAME-SN', orderType: 1 })
  assert.equal(groupReportDevices([first, second]).length, 2)
})
