import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { parseWorkflowDefinition } from './schema'
import type { WorkflowDefinition } from './types'

type Database = PrismaClient

export function createWorkflowRepository(database: Database) {
  return {
    listWorkflows() {
      return database.workflow.findMany({ orderBy: { updatedAt: 'desc' }, include: { _count: { select: { versions: true, runs: true } } } })
    },

    getWorkflow(id: string) {
      return database.workflow.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' } }, triggers: true } })
    },

    async createDraft(input: { name: string; description?: string; definition: WorkflowDefinition; projectId?: string | null }) {
      const definition = parseWorkflowDefinition(input.definition)
      if (input.projectId) {
        const project = await database.project.findUnique({ where: { id: input.projectId } })
        if (!project?.repositoryRoot) throw new Error('Selected project is not connected to a repository')
      }
      return database.workflow.create({
        data: { name: input.name, description: input.description ?? '', draftDefinition: JSON.stringify(definition), projectId: input.projectId },
      })
    },

    async updateDraft(id: string, definitionInput: WorkflowDefinition) {
      const definition = parseWorkflowDefinition(definitionInput)
      return database.workflow.update({
        where: { id },
        data: { name: definition.name, description: definition.description ?? '', draftDefinition: JSON.stringify(definition) },
      })
    },

    async setProject(id: string, projectId: string | null) {
      if (projectId) {
        const project = await database.project.findUnique({ where: { id: projectId } })
        if (!project?.repositoryRoot) throw new Error('Selected project is not connected to a repository')
      }
      return database.workflow.update({ where: { id }, data: { projectId } })
    },

    deleteWorkflow(id: string) {
      return database.workflow.delete({ where: { id } })
    },

    async publish(id: string) {
      return database.$transaction(async (tx) => {
        const workflow = await tx.workflow.findUniqueOrThrow({ where: { id } })
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
    }) {
      if (input.idempotencyKey) {
        const existing = await database.workflowRun.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
        if (existing) return existing
      }
      const version = await database.workflowVersion.findFirstOrThrow({ where: { id: input.versionId, workflowId: input.workflowId } })
      const definition = parseWorkflowDefinition(JSON.parse(version.definitionJson))
      return database.$transaction(async (tx) => {
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
      })
    },

    async claimNextRun(workerId: string) {
      return database.$transaction(async (tx) => {
        const candidate = await tx.workflowRun.findFirst({ where: { status: 'queued' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
        if (!candidate) return null
        const claimedAt = new Date()
        const claimed = await tx.workflowRun.updateMany({
          where: { id: candidate.id, status: 'queued' },
          data: { status: 'running', workerId, claimedAt, startedAt: claimedAt },
        })
        if (claimed.count !== 1) return null
        return tx.workflowRun.findUnique({ where: { id: candidate.id }, include: { version: true, nodeRuns: true } })
      })
    },

    async startNode(runId: string, nodeId: string, attempt: number, input: unknown) {
      return database.workflowNodeRun.update({
        where: { runId_nodeId: { runId, nodeId } },
        data: { status: 'running', attempt, inputJson: JSON.stringify(input), outputJson: null, errorJson: null, startedAt: new Date(), finishedAt: null },
      })
    },

    async finishNode(runId: string, nodeId: string, attempt: number, status: string, output?: unknown, error?: unknown) {
      return database.workflowNodeRun.update({
        where: { runId_nodeId: { runId, nodeId } },
        data: {
          status, attempt,
          outputJson: output === undefined ? undefined : JSON.stringify(output),
          errorJson: error === undefined ? undefined : JSON.stringify(error),
          finishedAt: new Date(),
        },
      })
    },

    async requestCancellation(runId: string) {
      return database.workflowRun.update({ where: { id: runId }, data: { cancelRequestedAt: new Date() } })
    },

    async getRun(runId: string) {
      return database.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { version: true, nodeRuns: true } })
    },

    listRuns(workflowId: string) {
      return database.workflowRun.findMany({ where: { workflowId }, orderBy: { createdAt: 'desc' }, include: { nodeRuns: true }, take: 50 })
    },

    async retryNode(runId: string, nodeId: string) {
      return database.$transaction(async (tx) => {
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
