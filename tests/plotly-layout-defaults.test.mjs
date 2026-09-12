import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlotLayout, mergeLayouts, DEFAULT_MARGIN } from '../src/components/plotly/plotlyLayout.ts'
test('单张图修改边距不会污染其他图和全局默认配置', () => {
  const first = createPlotLayout('dark')
  first.margin.l = 999
  assert.equal(createPlotLayout('light').margin.l, 32)
  assert.equal(DEFAULT_MARGIN.l, 32)
})
test('字体大小覆盖保留主题文字色且不修改调用方布局', () => {
  const base = createPlotLayout('dark')
  const override = { font: { size: 20 }, margin: { t: 80 }, xaxis: { title: { text: 'Time' } } }
  const result = mergeLayouts(base, override)
  assert.equal(result.font.size, 20)
  assert.equal(result.font.color, '#99f5ff')
  assert.equal(result.margin.l, 32)
  assert.equal(result.margin.t, 80)
  assert.equal(result.xaxis.gridcolor, '#333333')
  assert.deepEqual(override.font, { size: 20 })
})
