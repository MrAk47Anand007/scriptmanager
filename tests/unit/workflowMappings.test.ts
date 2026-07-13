import { describe, expect, it } from 'vitest'
import { resolveMappings, WorkflowMappingError } from '@/lib/workflows/mappings'

const context = {
  trigger: { body: { name: 'Ada' } },
  variables: { region: 'ap-south-1' },
  nodes: { build: { output: { artifact: 'app.zip' }, exitCode: 0 } },
}

describe('workflow mappings', () => {
  it('resolves trigger, workflow variable, and node output references recursively', () => {
    expect(resolveMappings({ name: '$trigger.body.name', region: '$variables.region', files: ['$nodes.build.output.artifact'] }, context)).toEqual({
      name: 'Ada', region: 'ap-south-1', files: ['app.zip'],
    })
  })

  it('preserves secret references as opaque values', () => {
    expect(resolveMappings({ token: { secretRef: 'secret-1' } }, context)).toEqual({ token: { secretRef: 'secret-1' } })
  })

  it('rejects missing paths and prototype traversal', () => {
    expect(() => resolveMappings({ value: '$trigger.missing' }, context)).toThrow(WorkflowMappingError)
    expect(() => resolveMappings({ value: '$trigger.__proto__.polluted' }, context)).toThrow('unsafe')
  })
})
