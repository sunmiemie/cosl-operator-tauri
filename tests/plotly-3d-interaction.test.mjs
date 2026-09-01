import assert from 'node:assert/strict'
import test from 'node:test'
import { is3DPlot } from '../src/components/plotly/formatPlotlyData.ts'
test('混合图和完整三维类型均保留缩略图旋转交互', () => {
  for (const type of ['surface', 'scatter3d', 'mesh3d', 'cone', 'streamtube', 'isosurface', 'volume']) {
    assert.equal(is3DPlot([{ type: 'scatter' }, { type }]), true, type)
  }
})
test('二维图和空图不误启用三维交互', () => {
  assert.equal(is3DPlot([]), false)
  assert.equal(is3DPlot([{ type: 'heatmap' }, { type: 'scattergl' }]), false)
})
