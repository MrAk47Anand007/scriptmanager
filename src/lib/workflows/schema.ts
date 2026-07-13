import type { WorkflowDefinition, WorkflowNode, WorkflowNodeType } from './types'

export class WorkflowSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowSchemaError'
  }
}

const nodeTypes = new Set<WorkflowNodeType>(['script', 'api', 'remote', 'condition', 'transform', 'delay', 'approval', 'parallel', 'join', 'notification', 'agent'])

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkflowSchemaError(`${path} must be an object`)
  return value as Record<string, unknown>
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new WorkflowSchemaError(`${path} must be a non-empty string`)
  return value
}

function validateNodeConfig(type: WorkflowNodeType, config: Record<string, unknown>, path: string) {
  const required: Partial<Record<WorkflowNodeType, string[]>> = {
    script: ['scriptId'], api: ['requestId'], remote: ['scriptId', 'profileId'],
    condition: ['left', 'operator'], transform: ['mappings'], approval: ['prompt'],
    notification: ['channel', 'message'], agent: ['profileId', 'prompt'],
  }
  for (const key of required[type] ?? []) {
    if (!(key in config)) throw new WorkflowSchemaError(`${path}.${key} is required`)
  }
  if (type === 'delay' && (!Number.isInteger(config.durationMs) || (config.durationMs as number) < 0)) {
    throw new WorkflowSchemaError(`${path}.durationMs must be a non-negative integer`)
  }
}

function parseNode(value: unknown, index: number): WorkflowNode {
  const input = object(value, `nodes[${index}]`)
  const type = text(input.type, `nodes[${index}].type`) as WorkflowNodeType
  if (!nodeTypes.has(type)) throw new WorkflowSchemaError(`nodes[${index}].type is unsupported`)
  const config = object(input.config, `nodes[${index}].config`)
  validateNodeConfig(type, config, `nodes[${index}].config`)
  return JSON.parse(JSON.stringify(input)) as WorkflowNode
}

export function parseWorkflowDefinition(value: unknown): WorkflowDefinition {
  const input = object(value, 'workflow')
  if (input.schemaVersion !== 1) throw new WorkflowSchemaError('schemaVersion must be 1')
  text(input.name, 'name')
  if (!Array.isArray(input.nodes)) throw new WorkflowSchemaError('nodes must be an array')
  if (!Array.isArray(input.edges)) throw new WorkflowSchemaError('edges must be an array')
  input.nodes.forEach(parseNode)
  input.edges.forEach((value, index) => {
    const edge = object(value, `edges[${index}]`)
    text(edge.id, `edges[${index}].id`)
    text(edge.source, `edges[${index}].source`)
    text(edge.target, `edges[${index}].target`)
    if (edge.sourcePort !== undefined && edge.sourcePort !== 'true' && edge.sourcePort !== 'false') throw new WorkflowSchemaError(`edges[${index}].sourcePort is invalid`)
  })
  return JSON.parse(JSON.stringify(input)) as WorkflowDefinition
}
