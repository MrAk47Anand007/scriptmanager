import type { ValidationIssue, WorkflowDefinition } from './types'

export function validateWorkflowGraph(definition: WorkflowDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const nodes = new Map<string, WorkflowDefinition['nodes'][number]>()
  const nodeIds = new Set<string>()
  for (const [index, node] of definition.nodes.entries()) {
    if (nodeIds.has(node.id)) issues.push({ code: 'duplicate_node_id', message: `Duplicate node id: ${node.id}`, path: `nodes[${index}].id` })
    nodeIds.add(node.id)
    if (!nodes.has(node.id)) nodes.set(node.id, node)
  }
  const edgeIds = new Set<string>()
  for (const [index, edge] of definition.edges.entries()) {
    if (edgeIds.has(edge.id)) issues.push({ code: 'duplicate_edge_id', message: `Duplicate edge id: ${edge.id}`, path: `edges[${index}].id` })
    edgeIds.add(edge.id)
    if (!nodes.has(edge.source)) issues.push({ code: 'missing_source', message: `Missing source node: ${edge.source}`, path: `edges[${index}].source` })
    if (!nodes.has(edge.target)) issues.push({ code: 'missing_target', message: `Missing target node: ${edge.target}`, path: `edges[${index}].target` })
    if (edge.sourcePort && nodes.get(edge.source)?.type !== 'condition') issues.push({ code: 'invalid_source_port', message: 'Only condition nodes may use true/false output ports', path: `edges[${index}].sourcePort` })
  }
  if (!issues.some((issue) => ['duplicate_node_id', 'missing_source', 'missing_target'].includes(issue.code))) {
    const indegree = new Map(definition.nodes.map((node) => [node.id, 0]))
    const outgoing = new Map(definition.nodes.map((node) => [node.id, [] as string[]]))
    for (const edge of definition.edges) {
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
      outgoing.get(edge.source)?.push(edge.target)
    }
    const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id)
    let visited = 0
    while (queue.length) {
      const id = queue.shift()!
      visited++
      for (const target of outgoing.get(id) ?? []) {
        const count = (indegree.get(target) ?? 0) - 1
        indegree.set(target, count)
        if (count === 0) queue.push(target)
      }
    }
    if (visited !== definition.nodes.length) issues.push({ code: 'cycle', message: 'Workflow graph contains a cycle' })
  }
  return issues
}

export function planWorkflow(definition: WorkflowDefinition): string[][] {
  const issues = validateWorkflowGraph(definition)
  if (issues.length) throw new Error(`Cannot plan invalid workflow: ${issues.map((issue) => issue.code).join(', ')}`)
  const indegree = new Map(definition.nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(definition.nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of definition.edges) {
    indegree.set(edge.target, indegree.get(edge.target)! + 1)
    outgoing.get(edge.source)!.push(edge.target)
  }
  let ready = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id).sort()
  const layers: string[][] = []
  while (ready.length) {
    layers.push(ready)
    const next: string[] = []
    for (const id of ready) {
      for (const target of outgoing.get(id)!.sort()) {
        const count = indegree.get(target)! - 1
        indegree.set(target, count)
        if (count === 0) next.push(target)
      }
    }
    ready = next.sort()
  }
  return layers
}
