import type { WorkflowAdapters } from './adapters'
import type { ConditionOperator, WorkflowNode } from './types'

export type WorkflowNodeResult = {
  status: 'succeeded' | 'waiting_approval'
  output: unknown
  selectedPort?: 'true' | 'false'
}

export class UnsupportedWorkflowNodeError extends Error {}

function compare(left: unknown, operator: ConditionOperator, right: unknown): boolean {
  switch (operator) {
    case 'equals': return left === right
    case 'not_equals': return left !== right
    case 'truthy': return Boolean(left)
    case 'falsy': return !left
    case 'greater_than': return typeof left === 'number' && typeof right === 'number' && left > right
    case 'less_than': return typeof left === 'number' && typeof right === 'number' && left < right
  }
}

function delay(durationMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Workflow node cancelled'))
    const timer = setTimeout(resolve, durationMs)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('Workflow node cancelled'))
    }, { once: true })
  })
}

export async function executeWorkflowNode(node: WorkflowNode, input: unknown, adapters: WorkflowAdapters, signal?: AbortSignal): Promise<WorkflowNodeResult> {
  let output: unknown
  switch (node.type) {
    case 'script': output = await adapters.runScript(node.config, input, signal); break
    case 'api': output = await adapters.runApiRequest(node.config, input, signal); break
    case 'remote': output = await adapters.runRemoteCommand(node.config, input, signal); break
    case 'notification': output = await adapters.sendNotification(node.config, input, signal); break
    case 'condition': {
      const result = compare(node.config.left, node.config.operator as ConditionOperator, node.config.right)
      return { status: 'succeeded', output: { result }, selectedPort: result ? 'true' : 'false' }
    }
    case 'transform': output = node.config.mappings ?? {}; break
    case 'delay': await delay(node.config.durationMs as number, signal); output = input; break
    case 'approval': return { status: 'waiting_approval', output: { prompt: node.config.prompt, input } }
    case 'parallel':
    case 'join': output = input; break
    case 'agent': throw new UnsupportedWorkflowNodeError('Agent workflow nodes require the Phase 6 ACP runtime')
    default: throw new UnsupportedWorkflowNodeError(`Unsupported workflow node: ${(node as WorkflowNode).type}`)
  }
  return { status: 'succeeded', output }
}
