import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { parseWorkflowDefinition } from './schema'
import type { WorkflowDefinition } from './types'

type Database = PrismaClient

export function createWorkflowRepository(database: Database) {
  return {
    async createDraft(input: { name: string; description?: string; definition: WorkflowDefinition }) {
      const definition = parseWorkflowDefinition(input.definition)
      return database.workflow.create({
        data: { name: input.name, description: input.description ?? '', draftDefinition: JSON.stringify(definition) },
      })
    },

    async updateDraft(id: string, definitionInput: WorkflowDefinition) {
      const definition = parseWorkflowDefinition(definitionInput)
      return database.workflow.update({
        where: { id },
        data: { name: definition.name, description: definition.description ?? '', draftDefinition: JSON.stringify(definition) },
      })
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

    async reconcileInterruptedRuns() {
      const finishedAt = new Date()
      await database.workflowNodeRun.updateMany({ where: { status: 'running' }, data: { status: 'interrupted', finishedAt } })
      return database.workflowRun.updateMany({ where: { status: 'running' }, data: { status: 'interrupted', finishedAt } })
    },
  }
}

export type WorkflowRepository = ReturnType<typeof createWorkflowRepository>
