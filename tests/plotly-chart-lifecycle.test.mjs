import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/components/plotly/PlotlyChart.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]
assert.ok(script, '应读取实际组件的 script setup')
// 只替换组件依赖；生命周期及异步逻辑仍执行仓库中的实际代码。
const executable = stripTypeScriptTypes(script.replace(/^import .* from .*\r?\n/gm, ''), { mode: 'strip' })

function createHarness({ responsive = true, parent = true, pendingPlot = false } = {}) {
  const mounted = []
  const beforeUnmount = []
  const unmounted = []
  const watchers = []
  const observers = []
  const calls = { newPlot: [], purge: [], resize: [], react: [], listeners: [], errors: [] }
  let releasePlot
  let signalPlotStarted
  const plotStarted = new Promise(resolve => { signalPlotStarted = resolve })
  const plotReady = pendingPlot ? new Promise(resolve => { releasePlot = resolve }) : Promise.resolve()
  const element = {
    parentElement: parent ? { name: 'chart-parent' } : null,
    hasPlotResources: false,
    on(name, handler) { calls.listeners.push({ name, handler }) },
  }
  let context
  context = vm.createContext({
    console: { error: (...args) => calls.errors.push(args) },
    ref: value => ({ value }),
    computed: getter => ({ get value() { return getter() } }),
    watch: (_source, callback) => watchers.push(callback),
    onMounted: callback => mounted.push(callback),
    onBeforeUnmount: callback => beforeUnmount.push(callback),
    onUnmounted: callback => unmounted.push(callback),
    nextTick: () => Promise.resolve(),
    defineProps: () => ({ data: [{ x: [0, 1], y: [1, 2] }], responsive }),
    withDefaults: (props, defaults) => ({ ...defaults, ...props }),
    defineEmits: () => () => {},
    defineExpose: () => {},
    createPlotLayout: () => ({}),
    createThumbnailLayout: () => ({}),
    mergeLayouts: (base, override) => ({ ...base, ...override }),
    formatPlotlyData: data => data,
    isMatrixData: () => false,
    is3DPlot: () => false,
    MATRIX_SIZE: { width: 160, height: 160 },
    Plotly: {
      async newPlot(node) {
        calls.newPlot.push(node)
        signalPlotStarted()
        await plotReady
        node.hasPlotResources = true
        return node
      },
      purge(node) {
        calls.purge.push({ node, refAtPurge: context.component.chartRef.value })
        node.hasPlotResources = false
      },
      react: async node => { calls.react.push(node) },
      Plots: { resize: async node => { calls.resize.push(node) } },
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback
        this.observed = []
        this.disconnectCount = 0
        observers.push(this)
      }
      observe(node) { this.observed.push(node) }
      disconnect() { this.disconnectCount++ }
    },
  })
  vm.runInContext(`${executable}\nglobalThis.component = { chartRef, isInitialized, resize, updateChart }`, context)
  context.component.chartRef.value = element
  return {
    element, calls, observers, plotStarted, component: context.component,
    mount: () => Promise.all(mounted.map(callback => callback())),
    releasePlot: () => releasePlot?.(),
    // Vue 在 beforeUnmount 后移除模板 ref，再运行 unmounted。
    unmount() {
      beforeUnmount.forEach(callback => callback())
      context.component.chartRef.value = null
      unmounted.forEach(callback => callback())
    },
    runQueuedWatchers: () => Promise.all(watchers.map(callback => callback())),
  }
}

test('图表挂载后观察父容器，无父容器时观察图表自身', async () => {
  for (const parent of [true, false]) {
    const harness = createHarness({ parent })
    await harness.mount()
    assert.equal(harness.observers.length, 1)
    assert.equal(harness.observers[0].observed[0], harness.element.parentElement || harness.element)
    assert.equal(harness.calls.listeners.length, 5)
    harness.observers[0].callback()
    assert.deepEqual(harness.calls.resize, [harness.element])
    harness.unmount()
  }
})

test('卸载时断开观察器，并在模板引用清空前释放图表', async () => {
  const harness = createHarness()
  await harness.mount()
  const observer = harness.observers[0]
  harness.unmount()

  assert.equal(observer.disconnectCount, 1)
  assert.equal(harness.calls.purge.length, 1)
  assert.equal(harness.calls.purge[0].node, harness.element)
  assert.equal(harness.calls.purge[0].refAtPurge, harness.element)
  assert.equal(harness.element.hasPlotResources, false)
  assert.equal(harness.component.isInitialized.value, false)
})

test('卸载后已排队的尺寸和数据回调不会恢复图表', async () => {
  const harness = createHarness()
  await harness.mount()
  const observer = harness.observers[0]
  harness.unmount()
  observer.callback()
  await harness.component.resize()
  await harness.component.updateChart()
  await harness.runQueuedWatchers()

  assert.equal(harness.calls.newPlot.length, 1)
  assert.equal(harness.calls.resize.length, 0)
  assert.equal(harness.calls.react.length, 0)
  assert.equal(harness.component.isInitialized.value, false)
})

test('异步绘图在卸载后完成时释放迟到资源且不注册监听或观察器', async () => {
  const harness = createHarness({ pendingPlot: true })
  const mounted = harness.mount()
  await harness.plotStarted
  assert.equal(harness.calls.newPlot.length, 1)
  harness.unmount()
  harness.releasePlot()
  await mounted
  await harness.runQueuedWatchers()

  assert.equal(harness.element.hasPlotResources, false)
  assert.ok(harness.calls.purge.some(call => call.node === harness.element))
  assert.equal(harness.calls.listeners.length, 0)
  assert.equal(harness.observers.length, 0)
  assert.equal(harness.calls.newPlot.length, 1)
  assert.equal(harness.component.isInitialized.value, false)
  assert.equal(harness.calls.errors.length, 0)
})

test('禁用响应式尺寸时不创建观察器，仍正常释放图表', async () => {
  const harness = createHarness({ responsive: false })
  await harness.mount()
  assert.equal(harness.observers.length, 0)
  harness.unmount()
  assert.equal(harness.calls.purge.length, 1)
  assert.equal(harness.element.hasPlotResources, false)
})
