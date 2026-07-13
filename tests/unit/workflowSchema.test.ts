import { describe, expect, it } from 'vitest'
import { parseWorkflowDefinition, WorkflowSchemaError } from '@/lib/workflows/schema'

const definition = {
  schemaVersion: 1,
  name: 'Deploy flow',
  nodes: [
    { id: 'start', type: 'script', name: 'Build', config: { scriptId: 'script-1' } },
    { id: 'check', type: 'condition', name: 'Check', config: { left: '$nodes.start.exitCode', operator: 'equals', right: 0 } },
    { id: 'join', type: 'join', name: 'Join', config: {} },
  ],
  edges: [
    { id: 'edge-1', source: 'start', target: 'check' },
    { id: 'edge-2', source: 'check', sourcePort: 'true', target: 'join' },
  ],
}

describe('workflow schema', () => {
  it('parses a versioned workflow definition without mutating it', () => {
    const parsed = parseWorkflowDefinition(definition)
    expect(parsed).toEqual(definition)
    expect(parsed).not.toBe(definition)
  })

  it.each([
    ['script', { scriptId: 'script-1' }],
    ['api', { requestId: 'request-1' }],
    ['remote', { scriptId: 'script-1', profileId: 'profile-1' }],
    ['condition', { left: '$trigger.ok', operator: 'truthy' }],
    ['transform', { mappings: { name: '$trigger.name' } }],
    ['delay', { durationMs: 1000 }],
    ['approval', { prompt: 'Deploy?' }],
    ['parallel', {}],
    ['join', {}],
    ['notification', { channel: 'desktop', message: 'Finished' }],
    ['agent', { profileId: 'agent-1', prompt: 'Review' }],
  ])('accepts the %s node', (type, config) => {
    expect(() => parseWorkflowDefinition({ ...definition, nodes: [{ id: 'node', type, name: type, config }], edges: [] })).not.toThrow()
  })

  it('rejects unsupported schema versions and invalid node configuration', () => {
    expect(() => parseWorkflowDefinition({ ...definition, schemaVersion: 2 })).toThrow(WorkflowSchemaError)
    expect(() => parseWorkflowDefinition({ ...definition, nodes: [{ id: 'bad', type: 'delay', name: 'Wait', config: { durationMs: -1 } }] })).toThrow('durationMs')
  })
})
