import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPlotlyData } from '../src/components/plotly/formatPlotlyData.ts'
test('主题不覆盖代表测量数据的数值颜色和显式线条颜色', () => {
  const source = [{ type: 'scatter', marker: { color: [0, 10, 20], colorscale: 'Viridis' }, line: { color: '#ff0000' } }]
  const formatted = formatPlotlyData(source, 'dark')
  assert.deepEqual(formatted[0].marker.color, [0, 10, 20])
  assert.equal(formatted[0].line.color, '#ff0000')
  assert.equal(formatted[0].marker.colorscale, 'Viridis')
  assert.notEqual(formatted[0], source[0])
})
test('未配置颜色时使用主题色，数值零不被当作缺省值', () => {
  assert.equal(formatPlotlyData([{ type: 'scatter' }], 'light')[0].line.color, '#7b61ff')
  assert.equal(formatPlotlyData([{ type: 'scatter', marker: { color: 0 } }], 'dark')[0].marker.color, 0)
})
