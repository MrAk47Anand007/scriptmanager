import { describe, expect, it } from 'vitest'
import { planWorkflow, validateWorkflowGraph } from '@/lib/workflows/graph'
import type { WorkflowDefinition } from '@/lib/workflows/types'

const base = (overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
  schemaVersion: 1,
  name: 'Parallel flow',
  nodes: [
    { id: 'start', type: 'parallel', name: 'Start', config: {} },
    { id: 'a', type: 'delay', name: 'A', config: { durationMs: 1 } },
    { id: 'b', type: 'delay', name: 'B', config: { durationMs: 1 } },
    { id: 'join', type: 'join', name: 'Join', config: {} },
  ],
  edges: [
    { id: '1', source: 'start', target: 'a' },
    { id: '2', source: 'start', target: 'b' },
    { id: '3', source: 'a', target: 'join' },
    { id: '4', source: 'b', target: 'join' },
  ],
  ...overrides,
})

describe('workflow graph', () => {
  it('returns deterministic topological execution layers', () => {
    expect(planWorkflow(base())).toEqual([['start'], ['a', 'b'], ['join']])
  })

  it('reports duplicate nodes, dangling edges, and duplicate edge identifiers', () => {
    const input = base({
      nodes: [...base().nodes, { id: 'a', type: 'parallel', name: 'Duplicate', config: {} }],
      edges: [...base().edges, { id: '1', source: 'missing', target: 'join' }],
    })
    expect(validateWorkflowGraph(input).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'duplicate_node_id', 'duplicate_edge_id', 'missing_source',
    ]))
  })

  it('rejects cycles', () => {
    const input = base({ edges: [...base().edges, { id: '5', source: 'join', target: 'start' }] })
    expect(validateWorkflowGraph(input)).toContainEqual(expect.objectContaining({ code: 'cycle' }))
    expect(() => planWorkflow(input)).toThrow('cycle')
  })

  it('only permits condition output ports', () => {
    const input = base({ edges: [{ id: 'bad', source: 'a', sourcePort: 'true', target: 'join' }] })
    expect(validateWorkflowGraph(input)).toContainEqual(expect.objectContaining({ code: 'invalid_source_port' }))
  })
})
