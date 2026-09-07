import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPlotlyData, isMatrixData } from '../src/components/plotly/formatPlotlyData.ts'
test('省略表头的矩阵使用矩阵布局和主题文字颜色', () => {
  const data = [{ type: 'table', cells: { values: Array.from({ length: 6 }, () => Array(30).fill(1)) } }]
  assert.equal(isMatrixData(data), true)
  const result = formatPlotlyData(data, 'dark', true)[0]
  assert.equal(result.cells.values.length, 4)
  assert.equal(result.cells.values[0].length, 4)
  assert.equal(result.cells.font.color, '#f8f9fa')
  assert.equal(data[0].cells.values[0].length, 30)
})
test('带表头表格保留二十行，非表格不会误判矩阵', () => {
  const data = [{ type: 'table', header: { values: ['a'] }, cells: { values: [Array(30).fill(1)] } }]
  assert.equal(isMatrixData(data), false)
  assert.equal(formatPlotlyData(data, 'light', true)[0].cells.values[0].length, 20)
  assert.equal(isMatrixData([{ type: 'scatter', header: { values: [] } }]), false)
  assert.equal(isMatrixData([]), false)
})
