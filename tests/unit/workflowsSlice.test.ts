import { describe, expect, it } from 'vitest'
import reducer, { addNode, connectNodes, selectWorkflow, setValidation, updateNodeConfig } from '@/features/workflows/workflowsSlice'

describe('workflows slice', () => {
  it('selects a workflow and edits its draft', () => {
    let state = reducer(undefined, selectWorkflow({ id: 'w', name: 'Flow', publishedVersion: null, definition: { schemaVersion: 1, name: 'Flow', nodes: [], edges: [] } }))
    state = reducer(state, addNode({ type: 'delay', name: 'Wait', config: { durationMs: 100 } }))
    const id = state.active!.definition.nodes[0].id
    state = reducer(state, updateNodeConfig({ nodeId: id, config: { durationMs: 200 } }))
    expect(state.active!.definition.nodes[0].config).toEqual({ durationMs: 200 })
    expect(state.dirty).toBe(true)
  })

  it('connects nodes and stores validation feedback', () => {
    let state = reducer(undefined, selectWorkflow({ id: 'w', name: 'Flow', publishedVersion: null, definition: { schemaVersion: 1, name: 'Flow', nodes: [
      { id: 'a', type: 'parallel', name: 'A', config: {} }, { id: 'b', type: 'join', name: 'B', config: {} },
    ], edges: [] } }))
    state = reducer(state, connectNodes({ source: 'a', target: 'b' }))
    state = reducer(state, setValidation([{ code: 'cycle', message: 'Cycle' }]))
    expect(state.active!.definition.edges).toHaveLength(1)
    expect(state.validation[0].code).toBe('cycle')
  })
})
