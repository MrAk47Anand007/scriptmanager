import type { WorkflowAdapters } from './adapters'
import { planWorkflow } from './graph'
import { resolveMappings } from './mappings'
import { executeWorkflowNode } from './nodeExecutors'
import { normalizeExecutionPolicy, nextFailureAction } from './policy'
import type { WorkflowRepository } from './repository'
import { parseWorkflowDefinition } from './schema'
import { createApprovalService } from '@/lib/approvals/service'
import { prisma } from '@/lib/db'

type ClaimedRun = NonNullable<Awaited<ReturnType<WorkflowRepository['claimNextRun']>>>

function errorValue(error: unknown) {
  return { message: error instanceof Error ? error.message : String(error) }
}

export async function runClaimedWorkflow(run: ClaimedRun, repository: WorkflowRepository, adapters: WorkflowAdapters): Promise<void> {
  const definition = parseWorkflowDefinition(JSON.parse(run.version.definitionJson))
  const trigger = JSON.parse(run.inputJson) as unknown
  const outputs: Record<string, unknown> = {}
  const selectedPorts: Record<string, 'true' | 'false' | undefined> = {}
  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]))
  for (const nodeRun of run.nodeRuns) {
    if (nodeRun.status === 'succeeded' && nodeRun.outputJson) outputs[nodeRun.nodeId] = JSON.parse(nodeRun.outputJson)
  }

  try {
    for (const layer of planWorkflow(definition)) {
      for (const nodeId of layer) {
        const persistedNode = (await repository.getRun(run.id)).nodeRuns.find((item) => item.nodeId === nodeId)
        if (persistedNode?.status === 'succeeded') continue
        const latest = await repository.getRun(run.id)
        if (latest.cancelRequestedAt) {
          await repository.setRunStatus(run.id, 'cancelled')
          return
        }
        const node = nodeById.get(nodeId)!
        const incoming = definition.edges.filter((edge) => edge.target === nodeId)
        const activeIncoming = incoming.filter((edge) => !edge.sourcePort || selectedPorts[edge.source] === edge.sourcePort)
        if (incoming.length && activeIncoming.length === 0) {
          await repository.finishNode(run.id, nodeId, 0, 'skipped')
          continue
        }
        const parentOutputs = Object.fromEntries(activeIncoming.map((edge) => [edge.source, outputs[edge.source]]))
        const baseInput = incoming.length ? { nodes: parentOutputs } : trigger
        const mappingContext = { trigger, variables: definition.variables ?? {}, nodes: outputs }
        const input = node.config.inputs === undefined ? baseInput : resolveMappings(node.config.inputs, mappingContext)
        const executableNode = node.type === 'transform'
          ? { ...node, config: { ...node.config, mappings: resolveMappings(node.config.mappings, mappingContext) as Record<string, unknown> } }
          : node.type === 'condition'
            ? { ...node, config: { ...node.config, left: resolveMappings(node.config.left, mappingContext), right: resolveMappings(node.config.right, mappingContext) } }
          : node
        const policy = normalizeExecutionPolicy({ timeoutMs: node.timeoutMs, retry: node.retry, failureAction: node.failurePolicy?.action })
        let attempt = 0
        while (attempt < policy.retry.maxAttempts) {
          attempt++
          await repository.startNode(run.id, nodeId, attempt, input)
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), policy.timeoutMs)
          try {
            const result = await executeWorkflowNode(executableNode, input, adapters, controller.signal)
            clearTimeout(timeout)
            outputs[nodeId] = result.output
            selectedPorts[nodeId] = result.selectedPort
            await repository.finishNode(run.id, nodeId, attempt, result.status, result.output)
            if (result.status === 'waiting_approval') {
              await repository.setRunStatus(run.id, 'waiting_approval')
              const existing = await prisma.approvalRequest.findFirst({ where: { runId: run.id, nodeId, status: 'pending' } })
              if (!existing) await createApprovalService(prisma).create({
                actorType: 'user', actorId: run.actorId, workspaceId: 'default', runId: run.id, nodeId,
                capability: 'workflow.continue', operation: String(node.config.prompt), resource: `workflow:${run.workflowId}`,
                risk: 'medium', reason: 'Workflow approval node', preview: result.output,
                correlationId: run.correlationId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              })
              return
            }
            break
          } catch (error) {
            clearTimeout(timeout)
            const action = nextFailureAction(policy, attempt)
            if (action === 'retry') continue
            await repository.finishNode(run.id, nodeId, attempt, 'failed', undefined, errorValue(error))
            if (action === 'stop') {
              await repository.setRunStatus(run.id, 'failed', undefined, errorValue(error))
              return
            }
          }
        }
      }
    }
    await repository.setRunStatus(run.id, 'succeeded', outputs)
  } catch (error) {
    await repository.setRunStatus(run.id, 'failed', undefined, errorValue(error))
  }
}
