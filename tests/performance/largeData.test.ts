import { describe, expect, it } from 'vitest'
import { planWorkflow } from '@/lib/workflows/graph'
import { redactExecutionValue } from '@/lib/execution/events'

describe('large-data release budgets', () => {
  it('plans and redacts 2,000 records within a bounded budget', () => {
    const nodes = Array.from({ length: 2_000 }, (_, index) => ({ id: `node-${index}`, type: 'transform', name: `Node ${index}`, config: { expression: '{}' } }))
    const edges = nodes.slice(1).map((node, index) => ({ id: `edge-${index}`, source: nodes[index].id, target: node.id }))
    const startedAt = performance.now()
    const layers = planWorkflow({ version: 1, nodes, edges } as never)
    const redacted = redactExecutionValue(nodes.map((node) => ({ ...node, token: 'secret' }))) as Array<{ token: string }>
    expect(layers).toHaveLength(2_000)
    expect(redacted[1_999].token).toBe('[REDACTED]')
    expect(performance.now() - startedAt).toBeLessThan(2_000)
  })
})
