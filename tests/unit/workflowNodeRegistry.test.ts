import { describe, expect, it } from 'vitest'
import { getWorkflowNodeSpec, listWorkflowNodeSpecs, summarizeNode, validateNodeConfig } from '@/lib/workflows/nodeRegistry'
import type { WorkflowNode, WorkflowNodeType } from '@/lib/workflows/types'

const builtIns: WorkflowNodeType[] = ['script', 'api', 'remote', 'condition', 'transform', 'delay', 'approval', 'parallel', 'join', 'notification', 'agent']

describe('workflow node registry', () => {
  it('defines every built-in node once with discoverable metadata', () => {
    const specs = listWorkflowNodeSpecs()
    expect(specs.map((spec) => spec.type)).toEqual(expect.arrayContaining(builtIns))
    expect(new Set(specs.map((spec) => spec.type)).size).toBe(specs.length)
    for (const type of builtIns) {
      expect(getWorkflowNodeSpec(type)).toMatchObject({ type, label: expect.any(String), keywords: expect.any(Array) })
    }
  })

  it('defines condition branches and typed required fields', () => {
    expect(getWorkflowNodeSpec('condition').outputs.map((port) => port.id)).toEqual(['true', 'false'])
    expect(getWorkflowNodeSpec('script').fields).toContainEqual(expect.objectContaining({ key: 'scriptId', kind: 'resource', required: true }))
    expect(getWorkflowNodeSpec('delay').fields).toContainEqual(expect.objectContaining({ key: 'durationMs', kind: 'number' }))
    expect(getWorkflowNodeSpec('agent').category).toBe('agents')
  })

  it('returns a safe searchable fallback for plugin nodes', () => {
    const spec = getWorkflowNodeSpec('plugin:demo:lint')
    expect(spec).toMatchObject({ type: 'plugin:demo:lint', category: 'plugins', label: 'lint' })
    expect(spec.keywords).toEqual(expect.arrayContaining(['demo', 'lint', 'plugin']))
  })

  it('validates required and numeric configuration', () => {
    expect(validateNodeConfig({ id: 's', type: 'script', name: 'Build', config: {} })).toContainEqual(expect.objectContaining({ code: 'required_config', field: 'scriptId' }))
    expect(validateNodeConfig({ id: 'd', type: 'delay', name: 'Wait', config: { durationMs: 0 } })).toContainEqual(expect.objectContaining({ code: 'invalid_config', field: 'durationMs' }))
    expect(validateNodeConfig({ id: 'd', type: 'delay', name: 'Wait', config: { durationMs: 500 } })).toEqual([])
  })

  it('never includes secret-like values in summaries', () => {
    const node: WorkflowNode = { id: 'api', type: 'api', name: 'Deploy', config: { requestId: 'production', token: 'plain-secret', password: 'also-secret' } }
    expect(summarizeNode(node)).toBe('Request: production')
    expect(summarizeNode(node)).not.toContain('plain-secret')
    expect(summarizeNode(node)).not.toContain('also-secret')
  })
})
