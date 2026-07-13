import { describe, expect, it } from 'vitest'
import { workflowTemplates } from '@/lib/workflows/templates'
import { parseWorkflowDefinition } from '@/lib/workflows/schema'
import { planWorkflow, validateWorkflowGraph } from '@/lib/workflows/graph'

describe('workflow phase 2 acceptance contracts', () => {
  it('ships four valid, executable workflow templates', () => {
    expect(Object.keys(workflowTemplates)).toEqual(['scriptPipeline', 'apiToScript', 'approvalDeploy', 'remoteMaintenance'])
    for (const template of Object.values(workflowTemplates)) {
      const definition = parseWorkflowDefinition(template.definition)
      expect(validateWorkflowGraph(definition)).toEqual([])
      expect(planWorkflow(definition).flat()).toHaveLength(definition.nodes.length)
    }
  })
})
