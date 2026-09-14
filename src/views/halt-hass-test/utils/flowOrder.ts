export interface FlowOrderNode {
  id: string
}

export interface FlowOrderEdge {
  source: string
  target: string
}

/**
 * 按流程连线依赖生成稳定的页面执行顺序。
 *
 * Flojoy 运行时依据 edges 调度节点，工艺编辑器保存的 nodes 数组则主要反映
 * 编辑/创建先后，两者不保证一致。同一依赖层内继续沿用 nodes 的原始顺序，
 * 以便页面顺序稳定，并与单工作线程的待执行队列保持一致。
 *
 * 若工艺包含环路或不完整连线，无法参与拓扑排序的节点会按原始顺序附在末尾，
 * 确保页面不丢节点；流程合法性仍由 Flojoy 运行器负责校验。
 */
export function sortFlowNodesByExecutionOrder<T extends FlowOrderNode>(
  nodes: readonly T[],
  edges: readonly FlowOrderEdge[],
): T[] {
  if (nodes.length < 2) return [...nodes]

  const sourceOrder = new Map(nodes.map((node, index) => [node.id, index]))
  const indegree = new Map(nodes.map(node => [node.id, 0]))
  const successors = new Map(nodes.map(node => [node.id, [] as string[]]))

  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue
    successors.get(edge.source)?.push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const compareBySourceOrder = (left: string, right: string) =>
    (sourceOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (sourceOrder.get(right) ?? Number.MAX_SAFE_INTEGER)

  const ready = nodes
    .filter(node => indegree.get(node.id) === 0)
    .map(node => node.id)
    .sort(compareBySourceOrder)
  const orderedIds: string[] = []

  while (ready.length > 0) {
    const nodeId = ready.shift()!
    orderedIds.push(nodeId)

    const targets = [...(successors.get(nodeId) ?? [])].sort(compareBySourceOrder)
    for (const targetId of targets) {
      const nextIndegree = (indegree.get(targetId) ?? 0) - 1
      indegree.set(targetId, nextIndegree)
      if (nextIndegree === 0) {
        ready.push(targetId)
        ready.sort(compareBySourceOrder)
      }
    }
  }

  const orderedIdSet = new Set(orderedIds)
  const unresolvedIds = nodes
    .map(node => node.id)
    .filter(nodeId => !orderedIdSet.has(nodeId))
  const nodeById = new Map(nodes.map(node => [node.id, node]))

  return [...orderedIds, ...unresolvedIds]
    .map(nodeId => nodeById.get(nodeId))
    .filter((node): node is T => Boolean(node))
}
