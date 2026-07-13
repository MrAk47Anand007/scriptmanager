export type WorkflowNodeType = 'script' | 'api' | 'remote' | 'condition' | 'transform' | 'delay' | 'approval' | 'parallel' | 'join' | 'notification' | 'agent' | `plugin:${string}:${string}`
export type ConditionOperator = 'equals' | 'not_equals' | 'truthy' | 'falsy' | 'greater_than' | 'less_than'

export type WorkflowNode = {
  id: string
  type: WorkflowNodeType
  name: string
  config: Record<string, unknown>
  timeoutMs?: number
  retry?: { maxAttempts: number; delayMs: number; backoff?: 'fixed' | 'exponential' }
  failurePolicy?: { action: 'stop' | 'continue' }
}

export type WorkflowEdge = {
  id: string
  source: string
  target: string
  sourcePort?: 'true' | 'false'
}

export type WorkflowDefinition = {
  schemaVersion: 1
  name: string
  description?: string
  variables?: Record<string, unknown>
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type ValidationIssue = {
  code: 'duplicate_node_id' | 'duplicate_edge_id' | 'missing_source' | 'missing_target' | 'invalid_source_port' | 'cycle'
  message: string
  path?: string
}
