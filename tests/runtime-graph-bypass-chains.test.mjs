import assert from 'node:assert/strict'
import test from 'node:test'
import { externalizeHassRuntimeGraph } from '../src/services/hass-hardware-binding.ts'
const ordinary = id => ({ id, data: { func: 'CUSTOM' } })
const managed = (id, func) => ({ id, data: { func } })
const edge = (source, target, extra = {}) => ({ id: source + target, source, target, ...extra })
test('连续客户端托管节点移除后保留两端依赖，节点顺序不影响结果', () => {
  const a = ordinary('a'), b = ordinary('b'), start = managed('start', 'START_EDM'), stop = managed('stop', 'STOP_EDM')
  const edges = [edge('a', 'start', { sourceHandle: 'output' }), edge('start', 'stop'), edge('stop', 'b', { targetHandle: 'input' })]
  for (const nodes of [[a, start, stop, b], [a, stop, start, b]]) {
    const result = externalizeHassRuntimeGraph(nodes, edges)
    assert.deepEqual(result.nodes.map(n => n.id), ['a', 'b'])
    assert.equal(result.edges.length, 1)
    assert.deepEqual([result.edges[0].source, result.edges[0].target, result.edges[0].sourceHandle, result.edges[0].targetHandle], ['a', 'b', 'output', 'input'])
  }
  assert.equal(edges.length, 3)
})
test('不同端口旁路边保留唯一标识，自环不会留下已移除节点', () => {
  const result = externalizeHassRuntimeGraph([ordinary('a'), managed('m', 'START_EDM'), ordinary('b')],
    [edge('a', 'm', { sourceHandle: 'one' }), edge('a', 'm', { sourceHandle: 'two' }), edge('m', 'm'), edge('m', 'b')])
  assert.equal(result.edges.length, 2)
  assert.equal(new Set(result.edges.map(e => e.id)).size, 2)
  assert.ok(result.edges.every(e => e.source === 'a' && e.target === 'b'))
})
