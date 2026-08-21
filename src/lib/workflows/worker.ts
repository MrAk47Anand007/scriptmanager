import type { WorkflowAdapters } from './adapters'
import { planWorkflow } from './graph'
import { resolveMappings } from './mappings'
import { executeWorkflowNode } from './nodeExecutors'
import { calculateRetryDelay, normalizeExecutionPolicy, nextFailureAction } from './policy'
import type { WorkflowRepository } from './repository'
import { parseWorkflowDefinition } from './schema'
import { createApprovalService } from '@/lib/approvals/service'
import { prisma } from '@/lib/db'

type ClaimedRun = NonNullable<Awaited<ReturnType<WorkflowRepository['claimNextRun']>>>

const CANCEL_POLL_INTERVAL_MS = 500
const RETRY_CANCEL_POLL_MS = 200
const MAX_PREVIEW_LENGTH = 2_000

function errorValue(error: unknown) {
  return { message: error instanceof Error ? error.message : String(error) }
}

export function approvalRisk(value: unknown): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'high' ? value : 'medium'
}

export function approvalTimeoutHours(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return Math.min(value, 168)
  return 24
}

export function redactPreview(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 497)}...` : value
  if (!value || typeof value !== 'object') return value
  if (depth > 4) return '[depth]'
  if (Array.isArray(value)) return value.map((item) => redactPreview(item, depth + 1))
  const record = value as Record<string, unknown>
  if (typeof record.secretRef === 'string') return { secretRef: '[redacted]' }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, redactPreview(item, depth + 1)]))
}

export async function runClaimedWorkflow(run: ClaimedRun, repository: WorkflowRepository, adapters: WorkflowAdapters): Promise<void> {
  const definition = parseWorkflowDefinition(JSON.parse(run.version.definitionJson))
  const trigger = JSON.parse(run.inputJson) as unknown
  const outputs: Record<string, unknown> = {}
  const selectedPorts: Record<string, 'true' | 'false' | undefined> = {}
  const statuses: Record<string, string> = {}
  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]))
  for (const nodeRun of run.nodeRuns) {
    statuses[nodeRun.nodeId] = nodeRun.status
    if (nodeRun.status === 'succeeded') {
      if (nodeRun.outputJson) outputs[nodeRun.nodeId] = JSON.parse(nodeRun.outputJson)
      if (nodeRun.selectedPort) selectedPorts[nodeRun.nodeId] = nodeRun.selectedPort as 'true' | 'false'
    }
  }

  try {
    for (const layer of planWorkflow(definition)) {
      for (const nodeId of layer) {
        const state = await repository.getRun(run.id)
        const persistedNode = state.nodeRuns.find((item) => item.nodeId === nodeId)
        if (persistedNode?.status === 'succeeded') continue
        if (state.cancelRequestedAt) {
          await repository.setRunStatus(run.id, 'cancelled')
          return
        }
        const node = nodeById.get(nodeId)!
        const incoming = definition.edges.filter((edge) => edge.target === nodeId)
        const activeIncoming = incoming.filter((edge) => !edge.sourcePort || selectedPorts[edge.source] === edge.sourcePort)
        const deadSources = new Set(['skipped', 'failed'])
        if ((incoming.length && activeIncoming.length === 0) || activeIncoming.some((edge) => deadSources.has(statuses[edge.source] ?? ''))) {
          await repository.finishNode(run.id, nodeId, 0, 'skipped')
          statuses[nodeId] = 'skipped'
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
          const cancelWatcher = setInterval(() => {
            void repository.getRun(run.id)
              .then((state) => { if (state.cancelRequestedAt) controller.abort() })
              .catch(() => { })
          }, CANCEL_POLL_INTERVAL_MS)
          try {
            const result = await executeWorkflowNode(executableNode, input, adapters, controller.signal)
            clearTimeout(timeout)
            clearInterval(cancelWatcher)
            outputs[nodeId] = result.output
            selectedPorts[nodeId] = result.selectedPort
            statuses[nodeId] = result.status
            await repository.finishNode(run.id, nodeId, attempt, result.status, result.output, undefined, result.selectedPort)
            if (result.status === 'waiting_approval') {
              await repository.setRunStatus(run.id, 'waiting_approval')
              const existing = await prisma.approvalRequest.findFirst({ where: { runId: run.id, nodeId, status: 'pending' } })
              if (!existing) await createApprovalService(prisma).create({
                actorType: 'user', actorId: run.actorId, workspaceId: run.workflow.workspaceId ?? 'default', runId: run.id, nodeId,
                capability: 'workflow.continue',
                operation: node.type === 'agent' ? `[agent] ${String(node.config.prompt)} (requires ScriptManager Desktop)` : String(node.config.prompt),
                resource: `workflow:${run.workflowId}`,
                risk: approvalRisk(node.config.risk),
                reason: node.type === 'agent' ? 'Workflow agent node paused for desktop host' : 'Workflow approval node',
                preview: redactPreview(result.output),
                correlationId: run.correlationId,
                expiresAt: new Date(Date.now() + approvalTimeoutHours(node.config.approvalTimeoutHours) * 60 * 60 * 1000),
              })
              return
            }
            break
          } catch (error) {
            clearTimeout(timeout)
            clearInterval(cancelWatcher)
            const latestState = await repository.getRun(run.id).catch(() => null)
            if (latestState?.cancelRequestedAt) {
              await repository.finishNode(run.id, nodeId, attempt, 'cancelled', undefined, { message: 'Workflow run cancelled' }).catch(() => { })
              await repository.setRunStatus(run.id, 'cancelled')
              return
            }
            const failure = controller.signal.aborted
              ? { message: `Workflow node timed out after ${policy.timeoutMs} ms` }
              : errorValue(error)
            const action = nextFailureAction(policy, attempt)
            if (action !== 'retry') {
              await repository.finishNode(run.id, nodeId, attempt, 'failed', undefined, failure)
              statuses[nodeId] = 'failed'
              if (action === 'stop') {
                await repository.setRunStatus(run.id, 'failed', undefined, failure)
                return
              }
              break
            }
            let cancelledDuringDelay = false
            const remaining = calculateRetryDelay(policy.retry, attempt)
            for (let waited = 0; waited < remaining; waited += RETRY_CANCEL_POLL_MS) {
              await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_CANCEL_POLL_MS, remaining - waited)))
              const during = await repository.getRun(run.id).catch(() => null)
              if (during?.cancelRequestedAt) { cancelledDuringDelay = true; break }
            }
            if (cancelledDuringDelay) {
              await repository.finishNode(run.id, nodeId, attempt, 'cancelled', undefined, { message: 'Workflow run cancelled' }).catch(() => { })
              await repository.setRunStatus(run.id, 'cancelled')
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
