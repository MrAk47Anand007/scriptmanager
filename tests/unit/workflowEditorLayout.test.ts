import { describe, expect, it } from 'vitest'
import { layoutWorkflowNodes, normalizeEditorMetadata } from '@/lib/workflows/editorLayout'
import type { WorkflowDefinition } from '@/lib/workflows/types'

const workflow = (): WorkflowDefinition => ({
  schemaVersion: 1,
  name: 'Release flow',
  nodes: [
    { id: 'start', type: 'parallel', name: 'Start', config: {} },
    { id: 'build', type: 'script', name: 'Build', config: { scriptId: 'build' } },
    { id: 'approve', type: 'approval', name: 'Approve', config: { prompt: 'Ship?' } },
  ],
  edges: [
    { id: 'one', source: 'start', target: 'build' },
    { id: 'two', source: 'build', target: 'approve' },
  ],
})

describe('workflow editor layout', () => {
  it('generates deterministic left-to-right positions and a default viewport', () => {
    const first = normalizeEditorMetadata(workflow())
    const second = normalizeEditorMetadata(workflow())

    expect(first).toEqual(second)
    expect(first.positions.start.x).toBeLessThan(first.positions.build.x)
    expect(first.positions.build.x).toBeLessThan(first.positions.approve.x)
    expect(first.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('preserves saved positions while filling metadata for newly added nodes', () => {
    const definition = workflow()
    definition.editor = {
      positions: { start: { x: 42, y: 84 } },
      viewport: { x: 10, y: 20, zoom: 0.8 },
    }

    const metadata = normalizeEditorMetadata(definition)

    expect(metadata.positions.start).toEqual({ x: 42, y: 84 })
    expect(metadata.positions.build).toEqual(layoutWorkflowNodes(definition).build)
    expect(metadata.viewport).toEqual({ x: 10, y: 20, zoom: 0.8 })
  })

  it('falls back to stable rows for cyclic legacy graphs', () => {
    const definition = workflow()
    definition.edges.push({ id: 'cycle', source: 'approve', target: 'start' })

    expect(layoutWorkflowNodes(definition)).toEqual({
      start: { x: 0, y: 0 },
      build: { x: 280, y: 0 },
      approve: { x: 560, y: 0 },
    })
  })
})
