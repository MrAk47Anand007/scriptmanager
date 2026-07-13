export type WorkflowMappingContext = {
  trigger: unknown
  variables: Record<string, unknown>
  nodes: Record<string, unknown>
}

export class WorkflowMappingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowMappingError'
  }
}

const blockedSegments = new Set(['__proto__', 'prototype', 'constructor'])

function resolveReference(reference: string, context: WorkflowMappingContext): unknown {
  const segments = reference.slice(1).split('.')
  if (!['trigger', 'variables', 'nodes'].includes(segments[0])) throw new WorkflowMappingError(`Unsupported mapping root: ${segments[0]}`)
  if (segments.some((segment) => blockedSegments.has(segment))) throw new WorkflowMappingError(`Mapping contains unsafe path: ${reference}`)
  let value: unknown = context[segments.shift()! as keyof WorkflowMappingContext]
  for (const segment of segments) {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, segment)) throw new WorkflowMappingError(`Mapping path does not exist: ${reference}`)
    value = (value as Record<string, unknown>)[segment]
  }
  return value
}

export function resolveMappings(value: unknown, context: WorkflowMappingContext): unknown {
  if (typeof value === 'string' && value.startsWith('$')) return resolveReference(value, context)
  if (Array.isArray(value)) return value.map((item) => resolveMappings(item, context))
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof (value as Record<string, unknown>).secretRef === 'string') return { ...value }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveMappings(item, context)]))
  }
  return value
}
