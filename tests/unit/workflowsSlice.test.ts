import { describe, expect, it } from 'vitest'
import reducer, {
  addNode, connectNodes, duplicateSelection, moveNodes, redoWorkflowEdit, removeEdges, removeNodes,
  saveWorkflow, selectNodes, selectWorkflow, setValidation, setViewport, undoWorkflowEdit, updateNodeConfig,
} from '@/features/workflows/workflowsSlice'

const selected = () => selectWorkflow({
  id: 'w', name: 'Flow', publishedVersion: null,
  definition: {
    schemaVersion: 1, name: 'Flow',
    nodes: [
      { id: 'a', type: 'condition', name: 'A', config: { left: '$trigger.ok', operator: 'truthy' } },
      { id: 'b', type: 'join', name: 'B', config: {} },
    ],
    edges: [{ id: 'ab', source: 'a', sourcePort: 'true', target: 'b' }],
  },
})

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

  it('normalizes positions, moves nodes, and supports bounded undo and redo', () => {
    let state = reducer(undefined, selected())
    const original = state.active!.definition.editor!.positions.a
    state = reducer(state, moveNodes([{ id: 'a', position: { x: 40, y: 80 } }]))
    expect(state.active!.definition.editor!.positions.a).toEqual({ x: 40, y: 80 })
    expect(state.history.past).toHaveLength(1)
    state = reducer(state, undoWorkflowEdit())
    expect(state.active!.definition.editor!.positions.a).toEqual(original)
    state = reducer(state, redoWorkflowEdit())
    expect(state.active!.definition.editor!.positions.a).toEqual({ x: 40, y: 80 })
  })

  it('duplicates selected connected nodes with fresh identifiers and preserved ports', () => {
    let state = reducer(undefined, selected())
    state = reducer(state, selectNodes(['a', 'b']))
    state = reducer(state, duplicateSelection())
    const duplicated = state.active!.definition.nodes.filter((node) => !['a', 'b'].includes(node.id))
    expect(duplicated).toHaveLength(2)
    const duplicateEdge = state.active!.definition.edges.find((edge) => edge.id !== 'ab')
    expect(duplicateEdge).toMatchObject({ sourcePort: 'true' })
    expect(duplicated.map((node) => node.id)).toEqual(expect.arrayContaining([duplicateEdge!.source, duplicateEdge!.target]))
  })

  it('removes graph selections and rejects duplicate or self connections', () => {
    let state = reducer(undefined, selected())
    state = reducer(state, connectNodes({ source: 'a', sourcePort: 'true', target: 'b' }))
    state = reducer(state, connectNodes({ source: 'a', target: 'a' }))
    expect(state.active!.definition.edges).toHaveLength(1)
    state = reducer(state, removeEdges(['ab']))
    expect(state.active!.definition.edges).toEqual([])
    state = reducer(state, removeNodes(['a']))
    expect(state.active!.definition.nodes.map((node) => node.id)).toEqual(['b'])
  })

  it('stores viewport outside undo history and keeps dirty state on save failure', () => {
    let state = reducer(undefined, selected())
    state = reducer(state, moveNodes([{ id: 'a', position: { x: 20, y: 20 } }]))
    state = reducer(state, setViewport({ x: 10, y: 15, zoom: 0.75 }))
    expect(state.history.past).toHaveLength(1)
    expect(state.viewport).toEqual({ x: 10, y: 15, zoom: 0.75 })
    state = reducer(state, { type: saveWorkflow.pending.type })
    expect(state.saveStatus).toBe('saving')
    state = reducer(state, { type: saveWorkflow.rejected.type, error: { message: 'offline' } })
    expect(state).toMatchObject({ dirty: true, saveStatus: 'failed', requestError: { operation: 'save', message: 'offline' } })
  })
})
