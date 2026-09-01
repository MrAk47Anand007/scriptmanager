import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { parseWorkflowDefinition } from './schema'
import type { WorkflowDefinition } from './types'

type Database = PrismaClient

export function createWorkflowRepository(database: Database) {
  const workflowWhere = (id: string, workspaceId?: string) => workspaceId ? { id, workspaceId } : { id }
  const workflowRelation = (workspaceId?: string) => workspaceId ? { workspaceId } : undefined

  return {
    listWorkflows(workspaceId = 'default') {
      return database.workflow.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { versions: true, runs: true } } } })
    },

    getWorkflow(id: string, workspaceId?: string) {
      return database.workflow.findFirst({ where: workflowWhere(id, workspaceId), include: { versions: { orderBy: { version: 'desc' } }, triggers: true } })
    },

    async createDraft(input: { name: string; description?: string; definition: WorkflowDefinition; projectId?: string | null; workspaceId?: string }) {
      const definition = parseWorkflowDefinition(input.definition)
      const workspaceId = input.workspaceId ?? 'default'
      if (input.projectId) {
        const project = await database.project.findFirst({ where: { id: input.projectId, workspaceId } })
        if (!project?.repositoryRoot) throw new Error('Selected project is not connected to a repository')
      }
      return database.workflow.create({
        data: { name: input.name, description: input.description ?? '', draftDefinition: JSON.stringify(definition), projectId: input.projectId, workspaceId },
      })
    },

    async updateDraft(id: string, definitionInput: WorkflowDefinition, workspaceId?: string) {
      const definition = parseWorkflowDefinition(definitionInput)
      const existing = await database.workflow.findFirst({ where: workflowWhere(id, workspaceId), select: { id: true } })
      if (!existing) throw new Error('Workflow not found')
      return database.workflow.update({
        where: { id },
        data: { name: definition.name, description: definition.description ?? '', draftDefinition: JSON.stringify(definition) },
      })
    },

    async setProject(id: string, projectId: string | null, workspaceId?: string) {
      if (projectId) {
        const project = await database.project.findFirst({ where: { id: projectId, workspaceId: workspaceId ?? undefined } })
        if (!project?.repositoryRoot) throw new Error('Selected project is not connected to a repository')
      }
      const existing = await database.workflow.findFirst({ where: workflowWhere(id, workspaceId), select: { id: true } })
      if (!existing) throw new Error('Workflow not found')
      return database.workflow.update({ where: { id }, data: { projectId } })
    },

    async deleteWorkflow(id: string, workspaceId?: string) {
      const result = await database.workflow.deleteMany({ where: workflowWhere(id, workspaceId) })
      if (!result.count) throw new Error('Workflow not found')
      return { id }
    },

    async publish(id: string, workspaceId?: string) {
      return database.$transaction(async (tx) => {
        const workflow = await tx.workflow.findFirst({ where: workflowWhere(id, workspaceId) })
        if (!workflow) throw new Error('Workflow not found')
        const definition = parseWorkflowDefinition(JSON.parse(workflow.draftDefinition))
        const version = (workflow.publishedVersion ?? 0) + 1
        const published = await tx.workflowVersion.create({
          data: { workflowId: id, version, definitionJson: JSON.stringify(definition) },
        })
        await tx.workflow.update({ where: { id }, data: { publishedVersion: version } })
        return published
      })
    },

    async enqueueRun(input: {
      workflowId: string
      versionId: string
      triggerType: string
      actorId: string
      idempotencyKey?: string
      payload?: unknown
      workspaceId?: string
    }) {
      const createRun = (tx: Prisma.TransactionClient) => (async () => {
        const version = await tx.workflowVersion.findFirst({
          where: { id: input.versionId, workflowId: input.workflowId, workflow: workflowRelation(input.workspaceId) },
        })
        if (!version) throw new Error('Workflow version not found')
        const definition = parseWorkflowDefinition(JSON.parse(version.definitionJson))
        const run = await tx.workflowRun.create({
          data: {
            workflowId: input.workflowId,
            versionId: input.versionId,
            triggerType: input.triggerType,
            actorId: input.actorId,
            idempotencyKey: input.idempotencyKey,
            correlationId: `corr_${randomUUID()}`,
            inputJson: JSON.stringify(input.payload ?? {}),
          },
        })
        await tx.workflowNodeRun.createMany({
          data: definition.nodes.map((node) => ({ runId: run.id, nodeId: node.id, nodeType: node.type })),
        })
        return run
      })()

      if (!input.idempotencyKey) return database.$transaction(createRun)
      try {
        return await database.$transaction(async (tx) => {
          const existing = await tx.workflowRun.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
          if (existing) return existing
          return createRun(tx)
        })
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          const existing = await database.workflowRun.findUnique({ where: { idempotencyKey: input.idempotencyKey! } })
          if (existing) return existing
        }
        throw error
      }
    },

    async claimNextRun(workerId: string, options: { supportsAgentNodes?: boolean } = {}) {
      return database.$transaction(async (tx) => {
        const candidates = await tx.workflowRun.findMany({ where: { status: 'queued' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50, include: { version: true } })
        const candidate = options.supportsAgentNodes === false
          ? candidates.find((item) => {
            try { return !parseWorkflowDefinition(JSON.parse(item.version.definitionJson)).nodes.some((node) => node.type === 'agent') } catch { return true }
          })
          : candidates[0]
        if (!candidate) return null
        const claimedAt = new Date()
        const claimed = await tx.workflowRun.updateMany({
          where: { id: candidate.id, status: 'queued' },
          data: { status: 'running', workerId, claimedAt, startedAt: claimedAt },
        })
        if (claimed.count !== 1) return null
        return tx.workflowRun.findUnique({ where: { id: candidate.id }, include: { version: true, nodeRuns: true, workflow: { select: { workspaceId: true } } } })
      })
    },

    async startNode(runId: string, nodeId: string, attempt: number, input: unknown) {
      return database.workflowNodeRun.update({
        where: { runId_nodeId: { runId, nodeId } },
        data: { status: 'running', attempt, inputJson: JSON.stringify(input), outputJson: null, errorJson: null, selectedPort: null, startedAt: new Date(), finishedAt: null },
      })
    },

    async finishNode(runId: string, nodeId: string, attempt: number, status: string, output?: unknown, error?: unknown, selectedPort?: 'true' | 'false') {
      return database.workflowNodeRun.update({
        where: { runId_nodeId: { runId, nodeId } },
        data: {
          status, attempt,
          outputJson: output === undefined ? undefined : JSON.stringify(output),
          errorJson: error === undefined ? undefined : JSON.stringify(error),
          selectedPort,
          finishedAt: new Date(),
        },
      })
    },

    async requestCancellation(runId: string, workspaceId?: string) {
      if (workspaceId) {
        const run = await database.workflowRun.findFirst({ where: { id: runId, workflow: { workspaceId } }, select: { id: true } })
        if (!run) throw new Error('Workflow run not found')
      }
      return database.workflowRun.update({ where: { id: runId }, data: { cancelRequestedAt: new Date() } })
    },

    async getRun(runId: string, workspaceId?: string) {
      const run = await database.workflowRun.findFirst({ where: { id: runId, workflow: workspaceId ? { workspaceId } : undefined }, include: { version: true, nodeRuns: true } })
      if (!run) throw new Error('Workflow run not found')
      return run
    },

    listRuns(workflowId: string, workspaceId?: string) {
      return database.workflowRun.findMany({ where: { workflowId, workflow: workflowRelation(workspaceId) }, orderBy: { createdAt: 'desc' }, include: { nodeRuns: true }, take: 50 })
    },

    async retryNode(runId: string, nodeId: string, workspaceId?: string) {
      return database.$transaction(async (tx) => {
        if (workspaceId) {
          const run = await tx.workflowRun.findFirst({ where: { id: runId, workflow: { workspaceId } }, select: { id: true } })
          if (!run) throw new Error('Workflow run not found')
        }
        const node = await tx.workflowNodeRun.findUniqueOrThrow({ where: { runId_nodeId: { runId, nodeId } } })
        if (!['failed', 'interrupted'].includes(node.status)) throw new Error(`Cannot retry node with status: ${node.status}`)
        await tx.workflowNodeRun.update({ where: { id: node.id }, data: { status: 'pending', errorJson: null, finishedAt: null } })
        return tx.workflowRun.update({ where: { id: runId }, data: { status: 'queued', workerId: null, claimedAt: null, finishedAt: null, errorJson: null, cancelRequestedAt: null } })
      })
    },

    async approveNode(runId: string, nodeId: string, actorId: string) {
      return database.$transaction(async (tx) => {
        const node = await tx.workflowNodeRun.findUniqueOrThrow({ where: { runId_nodeId: { runId, nodeId } } })
        if (node.status !== 'waiting_approval') throw new Error(`Cannot approve node with status: ${node.status}`)
        await tx.workflowNodeRun.update({ where: { id: node.id }, data: { status: 'succeeded', outputJson: JSON.stringify({ approved: true, actorId }), finishedAt: new Date() } })
        return tx.workflowRun.update({ where: { id: runId }, data: { status: 'queued', workerId: null, claimedAt: null, finishedAt: null } })
      })
    },

    async setRunStatus(runId: string, status: string, output?: unknown, error?: unknown) {
      const terminal = ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(status)
      return database.workflowRun.update({
        where: { id: runId },
        data: {
          status,
          outputJson: output === undefined ? undefined : JSON.stringify(output),
          errorJson: error === undefined ? undefined : JSON.stringify(error),
          finishedAt: terminal ? new Date() : undefined,
        },
      })
    },

    async reconcileInterruptedRuns() {
      const finishedAt = new Date()
      await database.workflowNodeRun.updateMany({ where: { status: 'running' }, data: { status: 'interrupted', finishedAt } })
      return database.workflowRun.updateMany({ where: { status: 'running' }, data: { status: 'interrupted', finishedAt } })
    },
  }
}

export type WorkflowRepository = ReturnType<typeof createWorkflowRepository>
